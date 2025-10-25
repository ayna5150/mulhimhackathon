"use strict";
/**
 * SmartShield Backend API Server
 *
 * This is the main entry point for the SmartShield phishing detection backend.
 * It provides APIs for:
 * - Phishing detection and analysis
 * - Chatbot integration with LLM providers
 * - Analytics data collection
 * - User authentication
 * - Admin dashboard data
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const config_1 = require("@/config/config");
const logger_1 = require("@/config/logger");
const database_1 = require("@/config/database");
const redis_1 = require("@/config/redis");
// Import route handlers
const scan_1 = __importDefault(require("@/routes/scan"));
const chat_1 = __importDefault(require("@/routes/chat"));
const analytics_1 = __importDefault(require("@/routes/analytics"));
const auth_1 = __importDefault(require("@/routes/auth"));
const stats_1 = __importDefault(require("@/routes/stats"));
const health_1 = __importDefault(require("@/routes/health"));
// Import middleware
const errorHandler_1 = require("@/middleware/errorHandler");
const requestLogger_1 = require("@/middleware/requestLogger");
const auth_2 = require("@/middleware/auth");
// Load environment variables
dotenv_1.default.config();
class Server {
    constructor() {
        /**
         * Graceful shutdown handler
         */
        this.gracefulShutdown = (signal) => {
            logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
            // Close server
            process.exit(0);
        };
        this.app = (0, express_1.default)();
        this.port = config_1.config.port;
        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }
    /**
     * Initialize middleware for security, logging, and request processing
     */
    initializeMiddlewares() {
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: config_1.config.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        }));
        // Compression middleware
        this.app.use((0, compression_1.default)());
        // Request logging
        this.app.use((0, morgan_1.default)('combined', { stream: { write: (message) => logger_1.logger.info(message.trim()) } }));
        // Rate limiting
        const limiter = (0, express_rate_limit_1.default)({
            windowMs: config_1.config.rateLimitWindow,
            max: config_1.config.rateLimitRequests,
            message: {
                error: 'Too many requests from this IP, please try again later.',
                retryAfter: Math.ceil(config_1.config.rateLimitWindow / 1000)
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);
        // Body parsing
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        // Custom request logging
        this.app.use(requestLogger_1.requestLogger);
    }
    /**
     * Initialize API routes
     */
    initializeRoutes() {
        // Health check endpoint (no auth required)
        this.app.use('/health', health_1.default);
        // API routes with authentication
        this.app.use('/api/scan', auth_2.validateApiKey, scan_1.default);
        this.app.use('/api/chat', auth_2.validateApiKey, chat_1.default);
        this.app.use('/api/analytics', auth_2.validateApiKey, analytics_1.default);
        this.app.use('/api/auth', auth_1.default);
        this.app.use('/api/stats', auth_2.validateApiKey, stats_1.default);
        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                name: 'SmartShield API',
                version: '1.0.0',
                status: 'operational',
                endpoints: {
                    health: '/health',
                    scan: '/api/scan',
                    chat: '/api/chat',
                    analytics: '/api/analytics',
                    auth: '/api/auth',
                    stats: '/api/stats'
                }
            });
        });
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                message: `The requested endpoint ${req.originalUrl} does not exist`,
                availableEndpoints: [
                    '/health',
                    '/api/scan',
                    '/api/chat',
                    '/api/analytics',
                    '/api/auth',
                    '/api/stats'
                ]
            });
        });
    }
    /**
     * Initialize error handling middleware
     */
    initializeErrorHandling() {
        this.app.use(errorHandler_1.errorHandler);
    }
    /**
     * Start the server and connect to external services
     */
    async start() {
        try {
            // Connect to database
            await (0, database_1.connectDatabase)();
            logger_1.logger.info('Database connected successfully');
            // Connect to Redis
            await (0, redis_1.connectRedis)();
            logger_1.logger.info('Redis connected successfully');
            // Start server
            this.app.listen(this.port, () => {
                logger_1.logger.info(`🚀 SmartShield API server running on port ${this.port}`);
                logger_1.logger.info(`📊 Environment: ${config_1.config.nodeEnv}`);
                logger_1.logger.info(`🤖 Model Provider: ${config_1.config.modelProvider}`);
                logger_1.logger.info(`🔒 Privacy Mode: ${config_1.config.privacyMode ? 'enabled' : 'disabled'}`);
            });
            // Graceful shutdown handling
            process.on('SIGTERM', this.gracefulShutdown);
            process.on('SIGINT', this.gracefulShutdown);
        }
        catch (error) {
            logger_1.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }
}
// Create and start server
const server = new Server();
server.start().catch((error) => {
    logger_1.logger.error('Server startup failed:', error);
    process.exit(1);
});
exports.default = server;
//# sourceMappingURL=index.js.map