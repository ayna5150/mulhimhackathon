/**
 * Configuration management for SmartShield backend
 *
 * This module centralizes all configuration settings including:
 * - Server configuration
 * - Database settings
 * - Model provider settings
 * - Security and privacy settings
 * - Detection thresholds
 */
export interface Config {
    port: number;
    nodeEnv: string;
    baseUrl: string;
    databaseUrl: string;
    redisUrl: string;
    useSupabase: boolean;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabaseServiceKey?: string;
    jwtSecret: string;
    modelProvider: 'gemini' | 'openai' | 'local';
    modelName: string;
    geminiApiKey?: string;
    openaiApiKey?: string;
    extensionBackendUrl: string;
    retentionDays: number;
    privacyMode: boolean;
    piiRedaction: boolean;
    sentryDsn?: string;
    corsOrigins: string[];
    lowThreshold: number;
    highThreshold: number;
    reportThreshold: number;
    rateLimitRequests: number;
    rateLimitWindow: number;
    analysisPromptTemplate: string;
    chatPromptTemplate: string;
}
/**
 * Load and validate configuration
 */
export declare const config: Config;
/**
 * Get model provider specific configuration
 */
export declare function getModelConfig(): {
    provider: string;
    apiKey?: string;
    modelName: string;
};
/**
 * Check if debug mode is enabled
 */
export declare function isDebugMode(): boolean;
/**
 * Get detection threshold configuration
 */
export declare function getThresholds(): {
    low: number;
    high: number;
    report: number;
};
//# sourceMappingURL=config.d.ts.map