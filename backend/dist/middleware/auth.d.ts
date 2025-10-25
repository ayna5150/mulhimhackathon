/**
 * Authentication Middleware
 *
 * Provides JWT-based authentication and authorization:
 * - Token validation
 * - API key validation
 * - Role-based access control
 * - Request user context
 */
import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                email: string;
                orgId?: string;
                role: string;
            };
        }
    }
}
/**
 * Validate API key from request headers
 */
export declare function validateApiKey(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Authenticate JWT token
 */
export declare function authenticateToken(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Require specific role(s)
 */
export declare function requireRole(roles: string | string[]): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
/**
 * Require admin role
 */
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Require organization access
 */
export declare function requireOrgAccess(req: Request, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
/**
 * Optional authentication (doesn't fail if no token provided)
 */
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): void;
/**
 * Rate limiting middleware for authenticated users
 */
export declare function rateLimitByUser(req: Request, res: Response, next: NextFunction): void;
/**
 * Generate API key for development/testing
 */
export declare function generateApiKey(): string;
/**
 * Validate organization ID format
 */
export declare function validateOrgId(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Audit log middleware for sensitive operations
 */
export declare function auditLog(operation: string): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map