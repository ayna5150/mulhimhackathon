"use strict";
/**
 * Storage Service for Chrome Extension
 *
 * Provides Chrome storage API abstraction with error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
class StorageService {
    /**
     * Get a value from Chrome storage
     */
    static async get(key) {
        try {
            const result = await chrome.storage.local.get(key);
            return result[key];
        }
        catch (error) {
            console.error('Storage get error:', error);
            return null;
        }
    }
    /**
     * Set a value in Chrome storage
     */
    static async set(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
        }
        catch (error) {
            console.error('Storage set error:', error);
            throw error;
        }
    }
    /**
     * Remove a value from Chrome storage
     */
    static async remove(key) {
        try {
            await chrome.storage.local.remove(key);
        }
        catch (error) {
            console.error('Storage remove error:', error);
            throw error;
        }
    }
    /**
     * Get all storage data
     */
    static async getAll() {
        try {
            return await chrome.storage.local.get();
        }
        catch (error) {
            console.error('Storage getAll error:', error);
            return {};
        }
    }
    /**
     * Clear all storage data
     */
    static async clear() {
        try {
            await chrome.storage.local.clear();
        }
        catch (error) {
            console.error('Storage clear error:', error);
            throw error;
        }
    }
    /**
     * Initialize storage with default values
     */
    static async initialize() {
        try {
            const existing = await this.getAll();
            const defaults = {
                config: {
                    enabled: true,
                    lowThreshold: 0.3,
                    highThreshold: 0.7,
                    reportThreshold: 0.8,
                    privacyMode: true,
                    notifications: true,
                    dataRetentionDays: 30
                },
                stats: {
                    totalScans: 0,
                    threatsDetected: 0,
                    cleanPages: 0
                }
            };
            for (const [key, value] of Object.entries(defaults)) {
                if (!existing[key]) {
                    await this.set(key, value);
                }
            }
        }
        catch (error) {
            console.error('Storage initialization error:', error);
            throw error;
        }
    }
}
exports.StorageService = StorageService;
//# sourceMappingURL=storage.js.map