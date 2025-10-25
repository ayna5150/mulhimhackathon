/**
 * Type Definitions
 *
 * Centralized type definitions for the SmartShield backend:
 * - API request/response types
 * - Database model types
 * - Service interface types
 * - Configuration types
 */
export interface ApiResponse<T = any> {
    data?: T;
    error?: string;
    message?: string;
    correlation_id?: string;
    timestamp?: string;
}
export interface PaginationParams {
    page?: number;
    limit?: number;
    offset?: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}
export interface ScanRequest {
    snapshot_hash?: string;
    sanitized_text: string;
    metadata?: {
        url?: string;
        timestamp?: string;
        domain?: string;
        orgId?: string;
        title?: string;
        userAgent?: string;
    };
}
export interface ScanResponse {
    score: number;
    label: 'clean' | 'suspicious' | 'phishing';
    reasons: string[];
    explain: string;
    confidence: number;
    snapshot_hash: string;
    analysis_type: 'local' | 'hybrid' | 'cloud';
    response_time_ms: number;
    correlation_id: string;
}
export interface ChatRequest {
    snapshot_hash?: string;
    sanitized_text: string;
    question: string;
    session_id?: string;
    metadata?: {
        url?: string;
        domain?: string;
        orgId?: string;
    };
}
export interface ChatResponse {
    answer: string;
    sources: string[];
    model: string;
    provider: string;
    confidence?: number;
    session_id: string;
    snapshot_hash?: string;
    response_time_ms: number;
    correlation_id: string;
}
export interface AnalyticsRequest {
    event: 'scan' | 'warning_shown' | 'user_report' | 'chat_interaction' | 'extension_install' | 'extension_uninstall' | 'settings_change' | 'false_positive_report' | 'true_positive_report';
    orgId?: string;
    timestamp?: string;
    meta?: {
        url?: string;
        domain?: string;
        score?: number;
        label?: string;
        user_action?: string;
        session_id?: string;
        extension_version?: string;
        browser_version?: string;
        os?: string;
        response_time_ms?: number;
        detection_method?: string;
        false_positive?: boolean;
        true_positive?: boolean;
    };
}
export interface AnalyticsResponse {
    ok: boolean;
    event_id: string;
    timestamp: string;
    response_time_ms: number;
    correlation_id: string;
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface LoginResponse {
    token: string;
    user: User;
    expires_in: number;
    response_time_ms: number;
    correlation_id: string;
}
export interface RegisterRequest {
    email: string;
    password: string;
    orgId?: string;
    role?: 'user' | 'admin' | 'viewer';
}
export interface RegisterResponse {
    message: string;
    user: User;
    response_time_ms: number;
    correlation_id: string;
}
export interface User {
    id: number;
    email: string;
    org_id?: string;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
export interface Organization {
    id: number;
    name: string;
    domain?: string;
    settings: Record<string, any>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
export interface ScanResult {
    id: number;
    snapshot_hash: string;
    url?: string;
    domain?: string;
    score: number;
    label: string;
    reasons: string[];
    model_provider: string;
    org_id?: string;
    created_at: string;
}
export interface AnalyticsEvent {
    id: number;
    org_id?: string;
    event_type: string;
    event_data: Record<string, any>;
    metadata: Record<string, any>;
    timestamp: string;
    created_at: string;
}
export interface ChatSession {
    id: number;
    session_id: string;
    snapshot_hash?: string;
    messages: ChatMessage[];
    org_id?: string;
    created_at: string;
    updated_at: string;
}
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}
export interface ModelProvider {
    analyzeText(request: AnalysisRequest): Promise<AnalysisResponse>;
    chat(request: ChatRequest): Promise<ChatResponse>;
}
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
export interface PhishingDetectionResult {
    score: number;
    label: 'clean' | 'suspicious' | 'phishing';
    reasons: string[];
    confidence: number;
    localAnalysis: boolean;
    requiresCloudAnalysis: boolean;
    metadata: {
        urlScore?: number;
        contentScore?: number;
        headerScore?: number;
        socialEngineeringScore?: number;
    };
}
export interface Config {
    port: number;
    nodeEnv: string;
    baseUrl: string;
    databaseUrl: string;
    redisUrl: string;
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
}
export interface StatsRequest {
    orgId?: string;
    from?: string;
    to?: string;
    granularity?: 'hour' | 'day' | 'week' | 'month';
    limit?: number;
}
export interface StatsResponse {
    overview: {
        total_scans: number;
        total_scan_events: number;
        warnings_shown: number;
        user_reports: number;
        chat_interactions: number;
        active_organizations: number;
    };
    detections: {
        total_detections: number;
        avg_score: number;
        phishing_count: number;
        suspicious_count: number;
        clean_count: number;
    };
    recent_activity: Array<{
        period: string;
        event_count: number;
        scans: number;
        warnings: number;
        reports: number;
    }>;
    top_domains: Array<{
        domain: string;
        scan_count: number;
        avg_score: number;
        phishing_count: number;
    }>;
    filters: {
        org_id?: string;
        from?: string;
        to?: string;
        granularity: string;
    };
    generated_at: string;
    correlation_id: string;
}
export interface HealthCheckResponse {
    status: 'healthy' | 'unhealthy' | 'degraded';
    service: string;
    version: string;
    timestamp: string;
    uptime?: number;
    response_time_ms?: number;
    environment?: string;
    correlation_id: string;
    checks?: {
        database?: any;
        redis?: any;
        model_bridge?: any;
        system?: any;
    };
}
export interface ErrorResponse {
    error: string;
    message: string;
    code?: string;
    correlation_id: string;
    details?: any;
    debug?: {
        stack?: string;
        endpoint?: string;
        method?: string;
        timestamp?: string;
    };
}
export interface RequestContext {
    correlationId: string;
    userId?: string;
    orgId?: string;
    ip: string;
    userAgent?: string;
    timestamp: string;
}
export interface CacheEntry<T = any> {
    key: string;
    value: T;
    ttl: number;
    createdAt: number;
}
export interface RateLimitInfo {
    allowed: boolean;
    remaining: number;
    resetTime: number;
}
export interface SessionData {
    userId: string;
    orgId?: string;
    role: string;
    createdAt: number;
    lastAccess: number;
}
export interface ExtensionMessage {
    type: 'scan' | 'chat' | 'analytics' | 'auth';
    payload: any;
    correlationId?: string;
    timestamp?: string;
}
export interface ExtensionResponse {
    success: boolean;
    data?: any;
    error?: string;
    correlationId?: string;
}
export interface ModelConfig {
    provider: string;
    apiKey?: string;
    modelName: string;
}
export interface ModelHealth {
    status: 'healthy' | 'unhealthy';
    provider: string;
    modelName: string;
    lastCheck: string;
    error?: string;
}
export interface SanitizationResult {
    original: string;
    sanitized: string;
    redactedCount: number;
    redactedTypes: string[];
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    sanitized?: any;
}
export declare namespace SmartShieldTypes {
    export type { ApiResponse, PaginationParams, PaginatedResponse };
    export type { ScanRequest, ScanResponse, ChatRequest, ChatResponse };
    export type { AnalyticsRequest, AnalyticsResponse };
    export type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse };
    export type { User, Organization, ScanResult, AnalyticsEvent, ChatSession, ChatMessage };
    export type { ModelProvider, AnalysisRequest, AnalysisResponse, PhishingDetectionResult };
    export type { Config, StatsRequest, StatsResponse, HealthCheckResponse };
    export type { ErrorResponse, RequestContext, CacheEntry, RateLimitInfo, SessionData };
    export type { ExtensionMessage, ExtensionResponse, ModelConfig, ModelHealth };
    export type { SanitizationResult, ValidationResult };
}
//# sourceMappingURL=index.d.ts.map