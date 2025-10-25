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
export declare function requestLogger(req: Request, res: Response, next: NextFunction): void;
/**
 * Performance monitoring middleware
 */
export declare function performanceMonitor(req: Request, res: Response, next: NextFunction): void;
/**
 * Security event logging middleware
 */
export declare function securityLogger(req: Request, res: Response, next: NextFunction): void;
/**
 * Request ID middleware (simpler alternative to correlation ID)
 */
export declare function requestId(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=requestLogger.d.ts.map