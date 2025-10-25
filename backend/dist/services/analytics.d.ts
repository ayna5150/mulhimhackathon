/**
 * Analytics Service for Chrome Extension
 *
 * Handles analytics data collection and transmission
 */
export interface AnalyticsEvent {
    event: string;
    data: Record<string, any>;
    timestamp?: number;
}
export declare class AnalyticsService {
    private static pendingEvents;
    /**
     * Track an analytics event
     */
    static trackEvent(event: string, data?: Record<string, any>): Promise<void>;
    /**
     * Store event locally
     */
    private static storeEvent;
    /**
     * Send event to backend
     */
    private static sendEvent;
    /**
     * Sync pending events
     */
    static syncPendingEvents(): Promise<void>;
    /**
     * Get analytics summary
     */
    static getSummary(): Promise<any>;
}
//# sourceMappingURL=analytics.d.ts.map