"use strict";
/**
 * Analytics Service for Chrome Extension
 *
 * Handles analytics data collection and transmission
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const storage_1 = require("./storage");
class AnalyticsService {
    /**
     * Track an analytics event
     */
    static async trackEvent(event, data = {}) {
        try {
            const analyticsEvent = {
                event,
                data: {
                    ...data,
                    url: window.location?.href || 'unknown',
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                },
                timestamp: Date.now()
            };
            // Store locally first
            await this.storeEvent(analyticsEvent);
            // Try to send to backend
            try {
                await this.sendEvent(analyticsEvent);
            }
            catch (error) {
                console.warn('Failed to send analytics event, will retry later:', error);
                this.pendingEvents.push(analyticsEvent);
            }
        }
        catch (error) {
            console.error('Analytics tracking error:', error);
        }
    }
    /**
     * Store event locally
     */
    static async storeEvent(event) {
        try {
            const events = await storage_1.StorageService.get('analytics_events') || [];
            events.push(event);
            // Keep only last 100 events
            if (events.length > 100) {
                events.splice(0, events.length - 100);
            }
            await storage_1.StorageService.set('analytics_events', events);
        }
        catch (error) {
            console.error('Failed to store analytics event:', error);
        }
    }
    /**
     * Send event to backend
     */
    static async sendEvent(event) {
        try {
            // This would send to the backend API
            // For now, just log the event
            console.log('Analytics event:', event);
            // In a real implementation:
            // await fetch('http://localhost:4000/api/analytics', {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   body: JSON.stringify(event)
            // });
        }
        catch (error) {
            console.error('Failed to send analytics event:', error);
            throw error;
        }
    }
    /**
     * Sync pending events
     */
    static async syncPendingEvents() {
        try {
            const events = [...this.pendingEvents];
            this.pendingEvents = [];
            for (const event of events) {
                try {
                    await this.sendEvent(event);
                }
                catch (error) {
                    console.warn('Failed to sync event, re-queuing:', error);
                    this.pendingEvents.push(event);
                }
            }
        }
        catch (error) {
            console.error('Failed to sync pending events:', error);
        }
    }
    /**
     * Get analytics summary
     */
    static async getSummary() {
        try {
            const events = await storage_1.StorageService.get('analytics_events') || [];
            const summary = {
                totalEvents: events.length,
                eventTypes: {},
                lastEvent: events[events.length - 1]?.timestamp || null
            };
            // Count event types
            events.forEach(event => {
                summary.eventTypes[event.event] = (summary.eventTypes[event.event] || 0) + 1;
            });
            return summary;
        }
        catch (error) {
            console.error('Failed to get analytics summary:', error);
            return null;
        }
    }
}
exports.AnalyticsService = AnalyticsService;
AnalyticsService.pendingEvents = [];
//# sourceMappingURL=analytics.js.map