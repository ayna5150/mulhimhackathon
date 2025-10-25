/**
 * Request Logging Middleware
 * 
 * Provides structured request logging:
 * - Request/response timing
 * - Request correlation IDs
 * - Security event logging
 * - Performance monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { logger, generateCorrelationId } from '@/config/logger';
import { config } from '@/config/config';

// Extend Request interface to include timing and correlation ID
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate correlation ID if not present
  req.correlationId = req.get('X-Correlation-ID') || generateCorrelationId();
  req.startTime = Date.now();

  // Log incoming request
  logRequest(req);

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    logResponse(req, res);
    return originalEnd.call(this, chunk, encoding);
  };

  // Set correlation ID header for client
  res.setHeader('X-Correlation-ID', req.correlationId);

  next();
}

/**
 * Log incoming request
 */
function logRequest(req: Request): void {
  const requestInfo = {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: sanitizeHeaders(req.headers),
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    contentLength: req.get('Content-Length'),
    contentType: req.get('Content-Type')
  };

  // Log at different levels based on endpoint sensitivity
  if (isSensitiveEndpoint(req.path)) {
    logger.info('Sensitive request received', requestInfo);
  } else {
    logger.debug('Request received', requestInfo);
  }
}

/**
 * Log outgoing response
 */
function logResponse(req: Request, res: Response): void {
  const duration = req.startTime ? Date.now() - req.startTime : 0;
  
  const responseInfo = {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    path: req.path,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    contentLength: res.get('Content-Length'),
    contentType: res.get('Content-Type'),
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  };

  // Log at different levels based on status code and endpoint
  if (res.statusCode >= 500) {
    logger.error('Server error response', responseInfo);
  } else if (res.statusCode >= 400) {
    logger.warn('Client error response', responseInfo);
  } else if (isSensitiveEndpoint(req.path)) {
    logger.info('Sensitive response sent', responseInfo);
  } else {
    logger.debug('Response sent', responseInfo);
  }

  // Log performance warnings for slow requests
  if (duration > 5000) { // 5 seconds
    logger.warn('Slow request detected', {
      correlationId: req.correlationId,
      path: req.path,
      method: req.method,
      duration: `${duration}ms`,
      statusCode: res.statusCode
    });
  }
}

/**
 * Check if endpoint is sensitive (contains PII or security-related data)
 */
function isSensitiveEndpoint(path: string): boolean {
  const sensitivePatterns = [
    '/api/auth',
    '/api/analytics',
    '/api/chat',
    '/api/scan'
  ];

  return sensitivePatterns.some(pattern => path.startsWith(pattern));
}

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token'
  ];

  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Performance monitoring middleware
 */
export function performanceMonitor(req: Request, res: Response, next: NextFunction): void {
  if (!req.startTime) {
    req.startTime = Date.now();
  }

  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - req.startTime!;
    
    // Record performance metrics
    recordPerformanceMetrics(req, res, duration);
    
    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Record performance metrics
 */
function recordPerformanceMetrics(req: Request, res: Response, duration: number): void {
  const metrics = {
    endpoint: req.path,
    method: req.method,
    statusCode: res.statusCode,
    duration: duration,
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId
  };

  // Log performance metrics
  logger.info('Performance metrics', metrics);

  // In a real application, you might send these to a metrics service
  // like Prometheus, DataDog, or New Relic
}

/**
 * Security event logging middleware
 */
export function securityLogger(req: Request, res: Response, next: NextFunction): void {
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    // Log security-relevant events
    if (isSecurityEvent(req, res)) {
      logSecurityEvent(req, res);
    }
    
    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Check if this is a security-relevant event
 */
function isSecurityEvent(req: Request, res: Response): boolean {
  // Authentication endpoints
  if (req.path.startsWith('/api/auth')) {
    return true;
  }

  // Failed authentication attempts
  if (res.statusCode === 401 || res.statusCode === 403) {
    return true;
  }

  // Suspicious request patterns
  if (isSuspiciousRequest(req)) {
    return true;
  }

  return false;
}

/**
 * Check for suspicious request patterns
 */
function isSuspiciousRequest(req: Request): boolean {
  const suspiciousPatterns = [
    // SQL injection attempts
    /union.*select/i,
    /drop.*table/i,
    /insert.*into/i,
    
    // XSS attempts
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    
    // Path traversal attempts
    /\.\.\//,
    /\.\.\\/,
    
    // Command injection attempts
    /;\s*(cat|ls|rm|wget|curl)/i,
    /\|\s*(cat|ls|rm|wget|curl)/i
  ];

  const requestString = `${req.method} ${req.url} ${JSON.stringify(req.body)}`;
  
  return suspiciousPatterns.some(pattern => pattern.test(requestString));
}

/**
 * Log security event
 */
function logSecurityEvent(req: Request, res: Response): void {
  const securityEvent = {
    correlationId: req.correlationId,
    timestamp: new Date().toISOString(),
    type: 'security_event',
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    headers: sanitizeHeaders(req.headers),
    body: sanitizeRequestBody(req.body),
    query: req.query
  };

  logger.warn('Security event detected', securityEvent);
}

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Request ID middleware (simpler alternative to correlation ID)
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.get('X-Request-ID') || generateCorrelationId();
  
  req.correlationId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
}
