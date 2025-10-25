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
declare class Server {
    private app;
    private port;
    constructor();
    /**
     * Initialize middleware for security, logging, and request processing
     */
    private initializeMiddlewares;
    /**
     * Initialize API routes
     */
    private initializeRoutes;
    /**
     * Initialize error handling middleware
     */
    private initializeErrorHandling;
    /**
     * Start the server and connect to external services
     */
    start(): Promise<void>;
    /**
     * Graceful shutdown handler
     */
    private gracefulShutdown;
}
declare const server: Server;
export default server;
//# sourceMappingURL=index.d.ts.map