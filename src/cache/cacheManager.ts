import { ChainInput, ExpertOutput } from '../chain/types';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// Cache entry with metadata
interface CacheEntry {
  output: ExpertOutput;
  timestamp: number; // Unix timestamp in milliseconds
  ttl: number; // Time to live in milliseconds
}

// Cache options
export interface CacheOptions {
  enabled?: boolean; // Whether caching is enabled
  ttl?: number; // Default time to live in milliseconds
  maxSize?: number; // Maximum number of entries in the cache
}

// Default cache options
export const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  enabled: true,
  ttl: 1000 * 60 * 60, // 1 hour
  maxSize: 1000, // 1000 entries
};

/**
 * Manages caching of expert results
 */
export class CacheManager {
  private static instance: CacheManager;
  private cache: Map<string, CacheEntry>;
  private options: CacheOptions;

  private constructor(options: CacheOptions = {}) {
    this.cache = new Map<string, CacheEntry>();
    this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
    logger.info('Cache manager initialized', { 
      enabled: this.options.enabled, 
      ttl: this.options.ttl, 
      maxSize: this.options.maxSize 
    });
  }

  /**
   * Get the singleton instance of the cache manager
   */
  public static getInstance(options?: CacheOptions): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(options);
    } else if (options) {
      // Update options if provided
      CacheManager.instance.options = { ...CacheManager.instance.options, ...options };
      logger.info('Cache manager options updated', { 
        enabled: CacheManager.instance.options.enabled, 
        ttl: CacheManager.instance.options.ttl, 
        maxSize: CacheManager.instance.options.maxSize 
      });
    }
    return CacheManager.instance;
  }

  /**
   * Generate a cache key based on expert name, input, and parameters
   */
  public generateCacheKey(expertName: string, input: ChainInput, parameters?: Record<string, any>): string {
    // Create a string representation of the input and parameters
    const inputStr = JSON.stringify(input);
    const parametersStr = parameters ? JSON.stringify(parameters) : '';
    
    // Create a hash of the combined string
    const hash = crypto.createHash('sha256');
    hash.update(`${expertName}:${inputStr}:${parametersStr}`);
    return hash.digest('hex');
  }

  /**
   * Get a value from the cache
   */
  public get(key: string): ExpertOutput | null {
    if (!this.options.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      logger.debug('Cache miss', { key });
      return null;
    }

    // Check if the entry has expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      logger.debug('Cache entry expired', { key, age: now - entry.timestamp, ttl: entry.ttl });
      this.cache.delete(key);
      return null;
    }

    logger.debug('Cache hit', { key });
    return entry.output;
  }

  /**
   * Set a value in the cache
   */
  public set(key: string, value: ExpertOutput, ttl?: number): void {
    if (!this.options.enabled) {
      return;
    }

    // Enforce cache size limit
    if (this.cache.size >= (this.options.maxSize || DEFAULT_CACHE_OPTIONS.maxSize!)) {
      // Remove the oldest entry
      const oldestKey = this.getOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug('Cache eviction (size limit)', { key: oldestKey, cacheSize: this.cache.size });
      }
    }

    // Add the new entry
    this.cache.set(key, {
      output: value,
      timestamp: Date.now(),
      ttl: ttl || this.options.ttl || DEFAULT_CACHE_OPTIONS.ttl!,
    });
    logger.debug('Cache set', { key, cacheSize: this.cache.size });
  }

  /**
   * Clear the entire cache
   */
  public clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get the number of entries in the cache
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  public getStats(): { size: number; options: CacheOptions } {
    return {
      size: this.cache.size,
      options: this.options,
    };
  }

  /**
   * Get the oldest key in the cache
   */
  private getOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}