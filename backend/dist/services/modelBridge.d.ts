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
export interface AnalysisRequest {
    text: string;
    url?: string;
    metadata?: Record<string, any>;
}
export interface AnalysisResponse {
    score: number;
    label: 'suspicious' | 'clean' | 'uncertain';
    reasons: string[];
    explanation: string;
    confidence: number;
    model: string;
    provider: string;
}
export interface ChatRequest {
    context: string;
    question: string;
    sessionId?: string;
}
export interface ChatResponse {
    answer: string;
    sources: string[];
    model: string;
    provider: string;
    confidence?: number;
}
/**
 * Model Bridge class that manages different providers
 */
declare class ModelBridge {
    private providers;
    private fallbackProvider;
    constructor();
    private initializeProviders;
    /**
     * Analyze text for phishing indicators
     */
    analyzeText(request: AnalysisRequest): Promise<AnalysisResponse>;
    /**
     * Chat with the model about flagged content
     */
    chat(request: ChatRequest): Promise<ChatResponse>;
    /**
     * Get available providers
     */
    getAvailableProviders(): string[];
    /**
     * Get current provider info
     */
    getProviderInfo(): {
        primary: string;
        fallback: string;
        available: string[];
    };
}
export declare const modelBridge: ModelBridge;
export { ModelBridge };
//# sourceMappingURL=modelBridge.d.ts.map