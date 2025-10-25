/**
 * Error Handling Middleware
 *
 * Centralized error handling for the application:
 * - Structured error responses
 * - Error logging and monitoring
 * - Security-aware error messages
 * - Request correlation tracking
 */
import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    code?: string;
    isOperational?: boolean;
    correlationId?: string;
}
/**
 * Custom error classes
 */
export declare class ValidationError extends Error {
    details?: any | undefined;
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message: string, details?: any | undefined);
}
export declare class AuthenticationError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message?: string);
}
export declare class AuthorizationError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message?: string);
}
export declare class NotFoundError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message?: string);
}
export declare class ConflictError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message?: string);
}
export declare class RateLimitError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message?: string);
}
export declare class ServiceUnavailableError extends Error {
    statusCode: number;
    code: string;
    isOperational: boolean;
    constructor(message?: string);
}
/**
 * Main error handling middleware
 */
export declare function errorHandler(error: AppError, req: Request, res: Response, next: NextFunction): void;
/**
 * 404 handler for undefined routes
 */
export declare function notFoundHandler(req: Request, res: Response): void;
/**
 * Async error wrapper for route handlers
 */
export declare function asyncHandler(fn: Function): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Validation error handler for Joi
 */
export declare function handleJoiError(error: any): ValidationError;
/**
 * Database error handler
 */
export declare function handleDatabaseError(error: any): AppError;
/**
 * Model API error handler
 */
export declare function handleModelError(error: any): AppError;
/**
 * Global unhandled rejection handler
 */
export declare function setupGlobalErrorHandlers(): void;
//# sourceMappingURL=errorHandler.d.ts.map