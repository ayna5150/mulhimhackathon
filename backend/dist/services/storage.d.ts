/**
 * Storage Service for Chrome Extension
 *
 * Provides Chrome storage API abstraction with error handling
 */
export interface StorageData {
    [key: string]: any;
}
export declare class StorageService {
    /**
     * Get a value from Chrome storage
     */
    static get(key: string): Promise<any>;
    /**
     * Set a value in Chrome storage
     */
    static set(key: string, value: any): Promise<void>;
    /**
     * Remove a value from Chrome storage
     */
    static remove(key: string): Promise<void>;
    /**
     * Get all storage data
     */
    static getAll(): Promise<StorageData>;
    /**
     * Clear all storage data
     */
    static clear(): Promise<void>;
    /**
     * Initialize storage with default values
     */
    static initialize(): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map