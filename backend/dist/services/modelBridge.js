"use strict";
/**
 * Model Bridge Service
 *
 * This service provides a unified interface for different LLM providers:
 * - Google Gemini (default/fallback)
 * - OpenAI GPT models
 * - Local models (for future implementation)
 *
 * Features:
 * - Automatic fallback between providers
 * - Response caching
 * - Rate limiting per provider
 * - Error handling and retries
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelBridge = exports.modelBridge = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@/config/config");
const logger_1 = require("@/config/logger");
const redis_1 = require("@/config/redis");
/**
 * Base class for model providers
 */
class ModelProvider {
    constructor(apiKey, modelName, provider) {
        this.apiKey = apiKey;
        this.modelName = modelName;
        this.provider = provider;
    }
    generateCacheKey(text, operation) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
        return redis_1.cache.generateKey(operation, hash, this.modelName);
    }
}
/**
 * Google Gemini provider implementation
 */
class GeminiProvider extends ModelProvider {
    constructor() {
        super(...arguments);
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    }
    async analyzeText(request) {
        const cacheKey = this.generateCacheKey(request.text, 'analysis');
        // Check cache first
        const cached = await redis_1.cache.get(cacheKey);
        if (cached) {
            logger_1.logger.debug('Using cached Gemini analysis result');
            return cached;
        }
        try {
            const prompt = this.buildAnalysisPrompt(request.text, request.url);
            const response = await axios_1.default.post(`${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`, {
                contents: [{
                        parts: [{ text: prompt }]
                    }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1000
                }
            }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            });
            const result = this.parseAnalysisResponse(response.data);
            // Cache the result for 1 hour
            await redis_1.cache.set(cacheKey, result, 3600);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Gemini analysis error:', error);
            throw new Error(`Gemini analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async chat(request) {
        const cacheKey = this.generateCacheKey(`${request.context}:${request.question}`, 'chat');
        // Check cache first
        const cached = await redis_1.cache.get(cacheKey);
        if (cached) {
            logger_1.logger.debug('Using cached Gemini chat result');
            return cached;
        }
        try {
            const prompt = this.buildChatPrompt(request.context, request.question);
            const response = await axios_1.default.post(`${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`, {
                contents: [{
                        parts: [{ text: prompt }]
                    }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1500
                }
            }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            });
            const result = this.parseChatResponse(response.data);
            // Cache the result for 30 minutes
            await redis_1.cache.set(cacheKey, result, 1800);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Gemini chat error:', error);
            throw new Error(`Gemini chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    buildAnalysisPrompt(text, url) {
        return `You are a cybersecurity expert specializing in phishing detection. Analyze the following content and determine if it's a phishing attempt.

URL: ${url || 'Not provided'}
Content: ${text.substring(0, 2000)} ${text.length > 2000 ? '...[truncated]' : ''}

Please respond with a JSON object containing:
{
  "score": 0.0-1.0 (0 = definitely clean, 1 = definitely phishing),
  "label": "suspicious" | "clean" | "uncertain",
  "reasons": ["reason1", "reason2", ...],
  "explanation": "Brief explanation of the analysis",
  "confidence": 0.0-1.0
}

IMPORTANT CONTEXT:
- .com domains from major companies (Google, Microsoft, Apple, Amazon, etc.) are generally legitimate
- Common file attachments like PDFs, images, documents are normal and should not be flagged
- Only flag executable files (.exe, .scr, .bat, .js, .vbs) or suspicious archives (.zip, .rar) when combined with suspicious context
- Consider the overall context and intent rather than just individual elements

Look for common phishing indicators:
- Urgent language demanding immediate action
- Requests for sensitive information (passwords, SSN, credit cards)
- Suspicious URLs or domains (but NOT legitimate .com domains)
- Poor grammar/spelling
- Threats or consequences for not acting
- Impersonation of legitimate organizations
- Unusual formatting or styling
- Suspicious file attachments with malicious context

Respond with ONLY the JSON object, no additional text.`;
    }
    buildChatPrompt(context, question) {
        return `You are a helpful cybersecurity assistant. A user has flagged content as potentially suspicious and is asking for an explanation.

CONTEXT:
${context}

USER QUESTION: ${question}

Please provide a clear, helpful, and conversational response. Be specific about what you found in the flagged content. If it appears to be phishing, explain the specific indicators and what the user should do. If it appears legitimate, explain why and provide reassurance. 

Keep your response natural and engaging (2-4 sentences). Avoid generic responses - be specific about the content being discussed.`;
    }
    parseAnalysisResponse(data) {
        try {
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) {
                throw new Error('No content in Gemini response');
            }
            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in Gemini response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                score: Math.max(0, Math.min(1, parsed.score || 0)),
                label: parsed.label || 'uncertain',
                reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
                explanation: parsed.explanation || 'Analysis completed',
                confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
                model: this.modelName,
                provider: this.provider
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to parse Gemini analysis response:', error);
            // Return fallback response
            return {
                score: 0.5,
                label: 'uncertain',
                reasons: ['Analysis failed - unable to parse response'],
                explanation: 'Unable to analyze content due to processing error',
                confidence: 0.1,
                model: this.modelName,
                provider: this.provider
            };
        }
    }
    parseChatResponse(data) {
        try {
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) {
                throw new Error('No content in Gemini chat response');
            }
            return {
                answer: content.trim(),
                sources: ['Gemini AI Model'],
                model: this.modelName,
                provider: this.provider,
                confidence: 0.8
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to parse Gemini chat response:', error);
            return {
                answer: 'I apologize, but I encountered an error processing your question. Please try again.',
                sources: [],
                model: this.modelName,
                provider: this.provider,
                confidence: 0.1
            };
        }
    }
}
/**
 * OpenAI provider implementation
 */
class OpenAIProvider extends ModelProvider {
    constructor() {
        super(...arguments);
        this.baseUrl = 'https://api.openai.com/v1';
    }
    async analyzeText(request) {
        const cacheKey = this.generateCacheKey(request.text, 'analysis');
        // Check cache first
        const cached = await redis_1.cache.get(cacheKey);
        if (cached) {
            logger_1.logger.debug('Using cached OpenAI analysis result');
            return cached;
        }
        try {
            const prompt = this.buildAnalysisPrompt(request.text, request.url);
            const response = await axios_1.default.post(`${this.baseUrl}/chat/completions`, {
                model: this.modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 1000
            }, {
                timeout: 30000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const result = this.parseAnalysisResponse(response.data);
            // Cache the result for 1 hour
            await redis_1.cache.set(cacheKey, result, 3600);
            return result;
        }
        catch (error) {
            logger_1.logger.error('OpenAI analysis error:', error);
            throw new Error(`OpenAI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async chat(request) {
        const cacheKey = this.generateCacheKey(`${request.context}:${request.question}`, 'chat');
        // Check cache first
        const cached = await redis_1.cache.get(cacheKey);
        if (cached) {
            logger_1.logger.debug('Using cached OpenAI chat result');
            return cached;
        }
        try {
            const prompt = this.buildChatPrompt(request.context, request.question);
            const response = await axios_1.default.post(`${this.baseUrl}/chat/completions`, {
                model: this.modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 1500
            }, {
                timeout: 30000,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const result = this.parseChatResponse(response.data);
            // Cache the result for 30 minutes
            await redis_1.cache.set(cacheKey, result, 1800);
            return result;
        }
        catch (error) {
            logger_1.logger.error('OpenAI chat error:', error);
            throw new Error(`OpenAI chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    buildAnalysisPrompt(text, url) {
        return `You are a cybersecurity expert specializing in phishing detection. Analyze the following content and determine if it's a phishing attempt.

URL: ${url || 'Not provided'}
Content: ${text.substring(0, 2000)} ${text.length > 2000 ? '...[truncated]' : ''}

Please respond with a JSON object containing:
{
  "score": 0.0-1.0 (0 = definitely clean, 1 = definitely phishing),
  "label": "suspicious" | "clean" | "uncertain",
  "reasons": ["reason1", "reason2", ...],
  "explanation": "Brief explanation of the analysis",
  "confidence": 0.0-1.0
}

IMPORTANT CONTEXT:
- .com domains from major companies (Google, Microsoft, Apple, Amazon, etc.) are generally legitimate
- Common file attachments like PDFs, images, documents are normal and should not be flagged
- Only flag executable files (.exe, .scr, .bat, .js, .vbs) or suspicious archives (.zip, .rar) when combined with suspicious context
- Consider the overall context and intent rather than just individual elements

Look for common phishing indicators:
- Urgent language demanding immediate action
- Requests for sensitive information (passwords, SSN, credit cards)
- Suspicious URLs or domains (but NOT legitimate .com domains)
- Poor grammar/spelling
- Threats or consequences for not acting
- Impersonation of legitimate organizations
- Unusual formatting or styling
- Suspicious file attachments with malicious context

Respond with ONLY the JSON object, no additional text.`;
    }
    buildChatPrompt(context, question) {
        return `You are a helpful cybersecurity assistant. A user has flagged content as potentially suspicious and is asking for an explanation.

CONTEXT:
${context}

USER QUESTION: ${question}

Please provide a clear, helpful, and conversational response. Be specific about what you found in the flagged content. If it appears to be phishing, explain the specific indicators and what the user should do. If it appears legitimate, explain why and provide reassurance. 

Keep your response natural and engaging (2-4 sentences). Avoid generic responses - be specific about the content being discussed.`;
    }
    parseAnalysisResponse(data) {
        try {
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content in OpenAI response');
            }
            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in OpenAI response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                score: Math.max(0, Math.min(1, parsed.score || 0)),
                label: parsed.label || 'uncertain',
                reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
                explanation: parsed.explanation || 'Analysis completed',
                confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
                model: this.modelName,
                provider: this.provider
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to parse OpenAI analysis response:', error);
            // Return fallback response
            return {
                score: 0.5,
                label: 'uncertain',
                reasons: ['Analysis failed - unable to parse response'],
                explanation: 'Unable to analyze content due to processing error',
                confidence: 0.1,
                model: this.modelName,
                provider: this.provider
            };
        }
    }
    parseChatResponse(data) {
        try {
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content in OpenAI chat response');
            }
            return {
                answer: content.trim(),
                sources: ['OpenAI GPT Model'],
                model: this.modelName,
                provider: this.provider,
                confidence: 0.8
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to parse OpenAI chat response:', error);
            return {
                answer: 'I apologize, but I encountered an error processing your question. Please try again.',
                sources: [],
                model: this.modelName,
                provider: this.provider,
                confidence: 0.1
            };
        }
    }
}
/**
 * Local model provider (placeholder for future implementation)
 */
class LocalProvider extends ModelProvider {
    async analyzeText(request) {
        // Placeholder implementation - would integrate with local model
        logger_1.logger.warn('Local model provider not implemented yet, using fallback');
        return {
            score: 0.5,
            label: 'uncertain',
            reasons: ['Local model not available'],
            explanation: 'Local model analysis not implemented',
            confidence: 0.1,
            model: this.modelName,
            provider: this.provider
        };
    }
    async chat(request) {
        // Placeholder implementation
        logger_1.logger.warn('Local model provider not implemented yet, using fallback');
        return {
            answer: 'Local model chat not implemented yet. Please use Gemini or OpenAI provider.',
            sources: [],
            model: this.modelName,
            provider: this.provider,
            confidence: 0.1
        };
    }
}
/**
 * Model Bridge class that manages different providers
 */
class ModelBridge {
    constructor() {
        this.providers = new Map();
        this.initializeProviders();
    }
    initializeProviders() {
        const modelConfig = (0, config_1.getModelConfig)();
        // Initialize primary provider
        switch (modelConfig.provider) {
            case 'gemini':
                if (modelConfig.apiKey) {
                    this.providers.set('primary', new GeminiProvider(modelConfig.apiKey, modelConfig.modelName, 'gemini'));
                }
                break;
            case 'openai':
                if (modelConfig.apiKey) {
                    this.providers.set('primary', new OpenAIProvider(modelConfig.apiKey, modelConfig.modelName, 'openai'));
                }
                break;
            case 'local':
                this.providers.set('primary', new LocalProvider(undefined, modelConfig.modelName, 'local'));
                break;
        }
        // Initialize fallback providers
        if (config_1.config.geminiApiKey && !this.providers.has('primary')) {
            this.providers.set('fallback', new GeminiProvider(config_1.config.geminiApiKey, 'gemini-free', 'gemini'));
        }
        // Set fallback provider
        this.fallbackProvider = this.providers.get('fallback') || this.providers.get('primary') || new LocalProvider(undefined, 'local', 'local');
        logger_1.logger.info(`Model bridge initialized with primary provider: ${modelConfig.provider}`);
    }
    /**
     * Analyze text for phishing indicators
     */
    async analyzeText(request) {
        const primary = this.providers.get('primary');
        try {
            if (primary) {
                return await primary.analyzeText(request);
            }
            else {
                throw new Error('No primary provider available');
            }
        }
        catch (error) {
            logger_1.logger.warn('Primary model provider failed, trying fallback:', error);
            try {
                return await this.fallbackProvider.analyzeText(request);
            }
            catch (fallbackError) {
                logger_1.logger.error('All model providers failed:', fallbackError);
                // Return emergency fallback response
                return {
                    score: 0.5,
                    label: 'uncertain',
                    reasons: ['Model analysis unavailable'],
                    explanation: 'Unable to analyze content - all model providers are unavailable',
                    confidence: 0.1,
                    model: 'fallback',
                    provider: 'fallback'
                };
            }
        }
    }
    /**
     * Chat with the model about flagged content
     */
    async chat(request) {
        const primary = this.providers.get('primary');
        try {
            if (primary) {
                return await primary.chat(request);
            }
            else {
                throw new Error('No primary provider available');
            }
        }
        catch (error) {
            logger_1.logger.warn('Primary model provider failed for chat, trying fallback:', error);
            try {
                return await this.fallbackProvider.chat(request);
            }
            catch (fallbackError) {
                logger_1.logger.error('All model providers failed for chat:', fallbackError);
                // Return emergency fallback response
                return {
                    answer: 'I apologize, but I\'m currently unable to process your question. Please try again later.',
                    sources: [],
                    model: 'fallback',
                    provider: 'fallback',
                    confidence: 0.1
                };
            }
        }
    }
    /**
     * Get available providers
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }
    /**
     * Get current provider info
     */
    getProviderInfo() {
        const primaryProvider = this.providers.get('primary');
        const primary = primaryProvider ? primaryProvider.provider : 'none';
        const fallback = this.fallbackProvider.provider;
        const available = this.providers.size > 0 ? Array.from(this.providers.keys()) : ['none'];
        return { primary, fallback, available };
    }
}
exports.ModelBridge = ModelBridge;
// Export singleton instance
exports.modelBridge = new ModelBridge();
//# sourceMappingURL=modelBridge.js.map