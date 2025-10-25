"use strict";
/**
 * Development server that runs without database dependencies
 * This is a simplified version for development/testing purposes
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express = __importStar(require("express"));
const cors = __importStar(require("cors"));
const helmet = __importStar(require("helmet"));
const compression = __importStar(require("compression"));
const morgan = __importStar(require("morgan"));
const rateLimit = __importStar(require("express-rate-limit"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;
// Security middleware
app.use(helmet({
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
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:4000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
// Compression middleware
app.use(compression());
// Request logging
app.use(morgan('combined'));
// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 900
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: 'development',
        services: {
            database: 'mock',
            redis: 'mock',
            model: 'mock'
        }
    });
});
// Mock API endpoints
app.get('/api/scan', (req, res) => {
    res.json({
        success: true,
        message: 'Mock scan endpoint - database not connected',
        data: {
            url: req.query.url || 'example.com',
            score: 0.5,
            label: 'unknown',
            reasons: ['Mock response - no actual analysis performed']
        }
    });
});
app.post('/api/scan', (req, res) => {
    res.json({
        success: true,
        message: 'Mock scan endpoint - database not connected',
        data: {
            url: req.body.url || 'example.com',
            score: Math.random(),
            label: Math.random() > 0.5 ? 'phishing' : 'safe',
            reasons: ['Mock response - no actual analysis performed']
        }
    });
});
app.get('/api/chat', (req, res) => {
    res.json({
        success: true,
        message: 'Mock chat endpoint - database not connected',
        data: {
            sessionId: 'mock-session-' + Date.now(),
            messages: [
                {
                    role: 'assistant',
                    content: 'This is a mock response. The backend is running in development mode without database connections.'
                }
            ]
        }
    });
});
app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message || req.body.question || 'Hello';
        const sessionId = req.body.sessionId || 'session-' + Date.now();
        // Call OpenAI API
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful cybersecurity assistant. A user is asking about phishing protection and cybersecurity. Provide clear, helpful explanations about threats and security best practices. Keep responses concise but informative (2-3 sentences max).'
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
                max_tokens: 150,
                temperature: 0.7
            })
        });
        if (!openaiResponse.ok) {
            throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }
        const openaiData = await openaiResponse.json();
        const aiResponse = openaiData.choices[0]?.message?.content || 'I apologize, but I cannot process your request at the moment.';
        res.json({
            success: true,
            message: 'Real AI response from OpenAI',
            data: {
                sessionId: sessionId,
                messages: [
                    {
                        role: 'user',
                        content: userMessage
                    },
                    {
                        role: 'assistant',
                        content: aiResponse
                    }
                ]
            }
        });
    }
    catch (error) {
        console.error('Chat API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get AI response',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
app.get('/api/analytics', (req, res) => {
    res.json({
        success: true,
        message: 'Mock analytics endpoint - database not connected',
        data: {
            totalScans: 0,
            phishingDetected: 0,
            safeDetected: 0,
            averageScore: 0,
            recentActivity: []
        }
    });
});
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        message: 'Mock stats endpoint - database not connected',
        data: {
            totalUsers: 0,
            totalScans: 0,
            systemHealth: 'mock',
            uptime: process.uptime()
        }
    });
});
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'SmartShield API (Development Mode)',
        version: '1.0.0',
        status: 'operational',
        mode: 'development',
        note: 'Running without database connections',
        endpoints: {
            health: '/health',
            scan: '/api/scan',
            chat: '/api/chat',
            analytics: '/api/analytics',
            stats: '/api/stats'
        }
    });
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.originalUrl} does not exist`,
        availableEndpoints: [
            '/health',
            '/api/scan',
            '/api/chat',
            '/api/analytics',
            '/api/stats'
        ]
    });
});
// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`🚀 SmartShield API server (Development Mode) running on port ${PORT}`);
    console.log(`📊 Environment: development`);
    console.log(`🔧 Mode: Mock endpoints (no database)`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});
exports.default = app;
//# sourceMappingURL=dev-server.js.map