/**
 * Chat API Routes
 * 
 * Handles chatbot interactions for explaining phishing detections:
 * - POST /api/chat - Send message to chatbot with context
 * - Maintains conversation context
 * - Provides explanations for flagged content
 */

import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

import { modelBridge } from '@/services/modelBridge';
import { query } from '@/config/database';
import { logger, generateCorrelationId } from '@/config/logger';
import { sanitizeText } from '@/utils/sanitization';
import { config } from '@/config/config';

const router = Router();

/**
 * Request validation schema
 */
const chatRequestSchema = Joi.object({
  snapshot_hash: Joi.string().optional(),
  sanitized_text: Joi.string().required().min(1).max(10000),
  question: Joi.string().required().min(1).max(1000),
  session_id: Joi.string().optional(),
  metadata: Joi.object({
    url: Joi.string().uri().optional(),
    domain: Joi.string().optional(),
    orgId: Joi.string().optional()
  }).optional()
});

/**
 * POST /api/chat
 * Send message to chatbot with context
 */
router.post('/', async (req: Request, res: Response) => {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    // Validate request
    const { error, value } = chatRequestSchema.validate(req.body);
    if (error) {
      logger.warn('Invalid chat request', { correlationId, error: error.details[0].message });
      return res.status(400).json({
        error: 'Invalid request',
        message: error.details[0].message,
        correlation_id: correlationId
      });
    }

    const { snapshot_hash, sanitized_text, question, session_id, metadata } = value;

    // Generate session ID if not provided
    const finalSessionId = session_id || uuidv4();

    // Sanitize content for privacy
    const sanitizedContent = config.piiRedaction ? sanitizeText(sanitized_text) : sanitized_text;

    logger.info('Processing chat request', {
      correlationId,
      sessionId: finalSessionId,
      snapshotHash: snapshot_hash,
      questionLength: question.length,
      contentLength: sanitizedContent.length,
      orgId: metadata?.orgId
    });

    // Retrieve or create chat session
    const session = await getOrCreateChatSession(finalSessionId, snapshot_hash, metadata?.orgId);

    // Add user question to session
    await addMessageToSession(finalSessionId, 'user', question);

    // Get context for the chat
    const context = await buildChatContext(snapshot_hash, sanitizedContent, session);

    // Send to model bridge
    const chatResponse = await modelBridge.chat({
      context,
      question,
      sessionId: finalSessionId
    });

    // Add assistant response to session
    await addMessageToSession(finalSessionId, 'assistant', chatResponse.answer);

    // Record analytics event
    recordAnalyticsEvent('chat_interaction', {
      session_id: finalSessionId,
      snapshot_hash: snapshot_hash,
      question_length: question.length,
      answer_length: chatResponse.answer.length,
      model_provider: chatResponse.provider,
      org_id: metadata?.orgId
    }).catch(error => {
      logger.error('Failed to record analytics event', { correlationId, error });
    });

    const responseTime = Date.now() - startTime;

    const response = {
      answer: chatResponse.answer,
      sources: chatResponse.sources,
      model: chatResponse.model,
      provider: chatResponse.provider,
      confidence: chatResponse.confidence || 0.8,
      session_id: finalSessionId,
      snapshot_hash: snapshot_hash,
      response_time_ms: responseTime,
      correlation_id: correlationId
    };

    logger.info('Chat completed', {
      correlationId,
      sessionId: finalSessionId,
      responseTime: `${responseTime}ms`,
      answerLength: chatResponse.answer.length,
      provider: chatResponse.provider
    });

    res.json(response);
    return;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Chat request failed', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: `${responseTime}ms`
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process chat request',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * GET /api/chat/:sessionId
 * Retrieve chat session history
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const correlationId = generateCorrelationId();

  try {
    const result = await query(
      'SELECT * FROM chat_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Chat session not found',
        correlation_id: correlationId
      });
    }

    const session = result.rows[0];
    
    res.json({
      session_id: session.session_id,
      snapshot_hash: session.snapshot_hash,
      messages: session.messages,
      org_id: session.org_id,
      created_at: session.created_at,
      updated_at: session.updated_at,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Failed to retrieve chat session', {
      correlationId,
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve chat session',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * DELETE /api/chat/:sessionId
 * Delete chat session
 */
router.delete('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const correlationId = generateCorrelationId();

  try {
    const result = await query(
      'DELETE FROM chat_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Chat session not found',
        correlation_id: correlationId
      });
    }

    logger.info('Chat session deleted', { correlationId, sessionId });

    res.json({
      message: 'Chat session deleted successfully',
      session_id: sessionId,
      correlation_id: correlationId
    });
    return;

  } catch (error) {
    logger.error('Failed to delete chat session', {
      correlationId,
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete chat session',
      correlation_id: correlationId
    });
    return;
  }
});

/**
 * Get or create chat session
 */
async function getOrCreateChatSession(
  sessionId: string,
  snapshotHash?: string,
  orgId?: string
): Promise<any> {
  try {
    // Try to get existing session
    const existingResult = await query(
      'SELECT * FROM chat_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Create new session
    const newResult = await query(
      'INSERT INTO chat_sessions (session_id, snapshot_hash, messages, org_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [sessionId, snapshotHash, [], orgId]
    );

    return newResult.rows[0];
  } catch (error) {
    logger.error('Failed to get or create chat session', { error });
    throw error;
  }
}

/**
 * Add message to chat session
 */
async function addMessageToSession(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    // Get current messages
    const result = await query(
      'SELECT messages FROM chat_sessions WHERE session_id = $1',
      [sessionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Chat session not found');
    }

    const messages = result.rows[0].messages || [];
    
    // Add new message
    messages.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    // Keep only last 20 messages to prevent session from growing too large
    const trimmedMessages = messages.slice(-20);

    // Update session
    await query(
      'UPDATE chat_sessions SET messages = $1, updated_at = NOW() WHERE session_id = $2',
      [trimmedMessages, sessionId]
    );
  } catch (error) {
    logger.error('Failed to add message to session', { error });
    throw error;
  }
}

/**
 * Build context for chat from snapshot and session history
 */
async function buildChatContext(
  snapshotHash: string | undefined,
  sanitizedContent: string,
  session: any
): Promise<string> {
  let context = '';

  // Add content context
  if (snapshotHash) {
    try {
      // Try to get scan result for additional context
      const scanResult = await query(
        'SELECT score, label, reasons, url, domain FROM scan_results WHERE snapshot_hash = $1 ORDER BY created_at DESC LIMIT 1',
        [snapshotHash]
      );

      if (scanResult.rows.length > 0) {
        const result = scanResult.rows[0];
        context += `FLAGGED CONTEXT:\n`;
        context += `URL: ${result.url || 'Not available'}\n`;
        context += `Domain: ${result.domain || 'Not available'}\n`;
        context += `Risk Score: ${result.score} (${result.label})\n`;
        context += `Detection Reasons: ${result.reasons.join(', ')}\n`;
        context += `Content Preview: ${sanitizedContent.substring(0, 500)}${sanitizedContent.length > 500 ? '...' : ''}\n\n`;
      }
    } catch (error) {
      logger.warn('Failed to retrieve scan context', { error });
    }
  }

  // Add conversation history context
  const messages = session.messages || [];
  if (messages.length > 0) {
    context += 'CONVERSATION HISTORY:\n';
    const recentMessages = messages.slice(-6); // Last 6 messages
    recentMessages.forEach((msg: any) => {
      context += `${msg.role.toUpperCase()}: ${msg.content}\n`;
    });
    context += '\n';
  }

  // Add current content if no snapshot context
  if (!context && sanitizedContent) {
    context += `CONTENT TO ANALYZE:\n${sanitizedContent.substring(0, 1000)}${sanitizedContent.length > 1000 ? '...' : ''}\n\n`;
  }

  return context;
}

/**
 * Record analytics event
 */
async function recordAnalyticsEvent(
  eventType: string,
  eventData: Record<string, any>
): Promise<void> {
  try {
    await query(
      'INSERT INTO analytics (event_type, event_data, metadata, timestamp) VALUES ($1, $2, $3, NOW())',
      [
        eventType,
        eventData,
        {
          service: 'chat-api',
          version: '1.0.0'
        }
      ]
    );
  } catch (error) {
    logger.error('Failed to record analytics event', { error });
    throw error;
  }
}

export default router;
