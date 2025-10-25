/**
 * Configuration Service for Chrome Extension
 *
 * Manages extension configuration and settings
 */
export interface Config {
    enabled: boolean;
    lowThreshold: number;
    highThreshold: number;
    reportThreshold: number;
    privacyMode: boolean;
    notifications: boolean;
    dataRetentionDays: number;
    backendUrl: string;
}
export declare class ConfigService {
    private static defaultConfig;
    /**
     * Get current configuration
     */
    static getConfig(): Promise<Config>;
    /**
     * Update configuration
     */
    static updateConfig(updates: Partial<Config>): Promise<void>;
    /**
     * Set default configuration
     */
    static setDefaults(): Promise<void>;
    /**
     * Reset configuration to defaults
     */
    static resetToDefaults(): Promise<void>;
    /**
     * Validate configuration
     */
    static validateConfig(config: Partial<Config>): string[];
}
//# sourceMappingURL=config.d.ts.map