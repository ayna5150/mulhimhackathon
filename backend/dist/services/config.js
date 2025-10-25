"use strict";
/**
 * Configuration Service for Chrome Extension
 *
 * Manages extension configuration and settings
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const storage_1 = require("./storage");
class ConfigService {
    /**
     * Get current configuration
     */
    static async getConfig() {
        try {
            const config = await storage_1.StorageService.get('config');
            return { ...this.defaultConfig, ...config };
        }
        catch (error) {
            console.error('Failed to get config:', error);
            return this.defaultConfig;
        }
    }
    /**
     * Update configuration
     */
    static async updateConfig(updates) {
        try {
            const currentConfig = await this.getConfig();
            const newConfig = { ...currentConfig, ...updates };
            await storage_1.StorageService.set('config', newConfig);
            console.log('Configuration updated:', newConfig);
        }
        catch (error) {
            console.error('Failed to update config:', error);
            throw error;
        }
    }
    /**
     * Set default configuration
     */
    static async setDefaults() {
        try {
            const existing = await storage_1.StorageService.get('config');
            if (!existing) {
                await storage_1.StorageService.set('config', this.defaultConfig);
            }
        }
        catch (error) {
            console.error('Failed to set default config:', error);
            throw error;
        }
    }
    /**
     * Reset configuration to defaults
     */
    static async resetToDefaults() {
        try {
            await storage_1.StorageService.set('config', this.defaultConfig);
        }
        catch (error) {
            console.error('Failed to reset config:', error);
            throw error;
        }
    }
    /**
     * Validate configuration
     */
    static validateConfig(config) {
        const errors = [];
        if (config.lowThreshold !== undefined) {
            if (config.lowThreshold < 0 || config.lowThreshold > 1) {
                errors.push('Low threshold must be between 0 and 1');
            }
        }
        if (config.highThreshold !== undefined) {
            if (config.highThreshold < 0 || config.highThreshold > 1) {
                errors.push('High threshold must be between 0 and 1');
            }
        }
        if (config.reportThreshold !== undefined) {
            if (config.reportThreshold < 0 || config.reportThreshold > 1) {
                errors.push('Report threshold must be between 0 and 1');
            }
        }
        if (config.dataRetentionDays !== undefined) {
            if (config.dataRetentionDays < 1 || config.dataRetentionDays > 365) {
                errors.push('Data retention days must be between 1 and 365');
            }
        }
        // Validate threshold ordering
        const low = config.lowThreshold ?? this.defaultConfig.lowThreshold;
        const high = config.highThreshold ?? this.defaultConfig.highThreshold;
        const report = config.reportThreshold ?? this.defaultConfig.reportThreshold;
        if (low >= high) {
            errors.push('Low threshold must be less than high threshold');
        }
        if (high >= report) {
            errors.push('High threshold must be less than report threshold');
        }
        return errors;
    }
}
exports.ConfigService = ConfigService;
ConfigService.defaultConfig = {
    enabled: true,
    lowThreshold: 0.3,
    highThreshold: 0.7,
    reportThreshold: 0.8,
    privacyMode: true,
    notifications: true,
    dataRetentionDays: 30,
    backendUrl: 'http://localhost:4000'
};
//# sourceMappingURL=config.js.map