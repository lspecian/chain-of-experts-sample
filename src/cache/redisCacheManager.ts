import Redis, { RedisOptions } from 'ioredis';
import { ChainInput, ExpertOutput } from '../chain/types';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { CacheOptions, DEFAULT_CACHE_OPTIONS } from './cacheManager'; // Re-use options type

// Redis-specific options can be added if needed, extending CacheOptions
export interface RedisCacheOptions extends CacheOptions {
  redisUrl?: string; // e.g., redis://username:password@host:port
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  redisDb?: number;
  keyPrefix?: string; // Prefix for all cache keys in Redis
}

const DEFAULT_REDIS_CACHE_OPTIONS: RedisCacheOptions = {
  ...DEFAULT_CACHE_OPTIONS, // Inherit defaults from in-memory cache
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  redisDb: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'cache:',
  enabled: process.env.REDIS_CACHE_ENABLED === 'true', // Default to true if not set or true
};

/**
 * Manages caching of expert results using Redis
 */
export class RedisCacheManager {
  private static instance: RedisCacheManager;
  private client: Redis;
  private options: RedisCacheOptions;

  private constructor(options: RedisCacheOptions = {}) {
    this.options = { ...DEFAULT_REDIS_CACHE_OPTIONS, ...options };

    const redisConnectionOptions: RedisOptions = {
      host: this.options.redisHost,
      port: this.options.redisPort,
      password: this.options.redisPassword,
      db: this.options.redisDb,
      lazyConnect: true, // Connect on first command
    };

    if (this.options.redisUrl) {
      this.client = new Redis(this.options.redisUrl, { lazyConnect: true });
    } else {
      this.client = new Redis(redisConnectionOptions);
    }

    this.client.on('error', (err: Error) => {
      logger.error('Redis Cache Error', err, { host: this.options.redisHost, port: this.options.redisPort });
      // Potentially disable caching if Redis is down
      // this.options.enabled = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis Cache connected', { host: this.options.redisHost, port: this.options.redisPort, db: this.options.redisDb });
    });
    
    // Attempt to connect
    this.client.connect().catch((err: Error) => {
        logger.error('Failed to connect to Redis initially', err);
    });

    logger.info('Redis Cache Manager initialized', {
      enabled: this.options.enabled,
      ttl: this.options.ttl,
      maxSize: this.options.maxSize, // MaxSize is less relevant for Redis directly, but kept for interface consistency
      redisHost: this.options.redisHost,
      redisPort: this.options.redisPort,
      keyPrefix: this.options.keyPrefix,
    });
  }

  /**
   * Get the singleton instance of the Redis cache manager
   */
  public static getInstance(options?: RedisCacheOptions): RedisCacheManager {
    if (!RedisCacheManager.instance) {
      RedisCacheManager.instance = new RedisCacheManager(options);
    } else if (options) {
      // Note: Re-configuring an existing Redis client instance is complex.
      // For simplicity, we'll log a warning if options are provided after instantiation.
      // A more robust solution might involve creating a new instance or providing a reconfigure method.
      const currentOptions = RedisCacheManager.instance.options;
      const newOptions = { ...currentOptions, ...options };
      
      let changed = false;
      for (const key in newOptions) {
        if (newOptions[key as keyof RedisCacheOptions] !== currentOptions[key as keyof RedisCacheOptions]) {
          changed = true;
          break;
        }
      }

      if (changed) {
         logger.warn('RedisCacheManager already initialized. Re-configuration with new options is not fully supported without restarting or a dedicated reconfigure method. Applying new non-connection options.', { newOptions });
         RedisCacheManager.instance.options = newOptions; // Update non-connection options like ttl, enabled
      }
    }
    return RedisCacheManager.instance;
  }

  private getFullKey(key: string): string {
    return `${this.options.keyPrefix}${key}`;
  }

  /**
   * Generate a cache key based on expert name, input, and parameters
   */
  public generateCacheKey(expertName: string, input: ChainInput, parameters?: Record<string, any>): string {
    const inputStr = JSON.stringify(input);
    const parametersStr = parameters ? JSON.stringify(parameters) : '';
    const hash = crypto.createHash('sha256');
    hash.update(`${expertName}:${inputStr}:${parametersStr}`);
    return hash.digest('hex');
  }

  /**
   * Get a value from the cache
   */
  public async get(key: string): Promise<ExpertOutput | null> {
    if (!this.options.enabled || !this.client || this.client.status !== 'ready') {
      if (this.client && this.client.status !== 'ready') {
        logger.warn('Redis client not ready, skipping cache get.', { key, status: this.client.status });
      }
      return null;
    }

    const fullKey = this.getFullKey(key);
    try {
      const value = await this.client.get(fullKey);
      if (value) {
        logger.debug('Redis Cache hit', { key: fullKey });
        return JSON.parse(value) as ExpertOutput;
      }
      logger.debug('Redis Cache miss', { key: fullKey });
      return null;
    } catch (error) {
      logger.error('Redis Cache GET error', error as Error, { cacheKey: fullKey });
      return null;
    }
  }

  /**
   * Set a value in the cache
   */
  public async set(key: string, value: ExpertOutput, ttl?: number): Promise<void> {
    if (!this.options.enabled || !this.client || this.client.status !== 'ready') {
       if (this.client && this.client.status !== 'ready') {
        logger.warn('Redis client not ready, skipping cache set.', { key, status: this.client.status });
      }
      return;
    }

    const fullKey = this.getFullKey(key);
    const cacheTTL = ttl || this.options.ttl || DEFAULT_REDIS_CACHE_OPTIONS.ttl!; // in milliseconds
    const cacheTTLSeconds = Math.ceil(cacheTTL / 1000); // Redis EXPIRE is in seconds

    try {
      await this.client.set(fullKey, JSON.stringify(value), 'EX', cacheTTLSeconds);
      logger.debug('Redis Cache set', { cacheKey: fullKey, ttlSeconds: cacheTTLSeconds });
    } catch (error) {
      logger.error('Redis Cache SET error', error as Error, { cacheKey: fullKey });
    }
  }

  /**
   * Delete a value from the cache
   */
  public async del(key: string): Promise<void> {
    if (!this.options.enabled || !this.client || this.client.status !== 'ready') {
      return;
    }
    const fullKey = this.getFullKey(key);
    try {
      await this.client.del(fullKey);
      logger.debug('Redis Cache del', { cacheKey: fullKey });
    } catch (error) {
      logger.error('Redis Cache DEL error', error as Error, { cacheKey: fullKey });
    }
  }
  

  /**
   * Clear the entire cache (or keys matching the prefix).
   * Be cautious with FLUSHDB in shared Redis instances.
   * A safer approach for prefixed keys is to scan and delete.
   */
  public async clear(): Promise<void> {
    if (!this.options.enabled || !this.client || this.client.status !== 'ready') {
      return;
    }
    logger.warn('Redis Cache clear called. This will attempt to delete all keys matching the prefix.', { prefix: this.options.keyPrefix });
    
    try {
      const stream = this.client.scanStream({
        match: `${this.options.keyPrefix}*`,
        count: 100, // How many keys to fetch in each iteration
      });

      const keysToDelete: string[] = [];
      stream.on('data', (resultKeys: string[]) => {
        for (const key of resultKeys) {
          keysToDelete.push(key);
        }
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', async () => {
          if (keysToDelete.length > 0) {
            logger.info(`Found ${keysToDelete.length} keys to delete with prefix '${this.options.keyPrefix}'`);
            // Redis `del` can take multiple keys
            await this.client.del(...keysToDelete);
            logger.info('Redis Cache cleared for prefix', { prefix: this.options.keyPrefix, count: keysToDelete.length });
          } else {
            logger.info('No keys found with prefix to clear', { prefix: this.options.keyPrefix });
          }
          resolve();
        });
        stream.on('error', (err: Error) => {
          logger.error('Error scanning keys for clear operation', err);
          reject(err);
        });
      });

    } catch (error) {
      logger.error('Redis Cache CLEAR error', error as Error);
      // Fallback or alternative clear strategy might be needed if scan is problematic
      // For example, if FLUSHDB is acceptable on a dedicated DB:
      // if (this.options.redisDb === DEDICATED_CACHE_DB_NUMBER) { await this.client.flushdb(); logger.info('Redis Cache FLUSHDB completed'); }
    }
  }

  /**
   * Get cache statistics (approximated for Redis)
   */
  public async getStats(): Promise<{ size: number | string; options: RedisCacheOptions; redisInfo?: any }> {
    let size: number | string = 'N/A (scan required for exact count)';
    let redisInfo: any = null;

    if (this.options.enabled && this.client && this.client.status === 'ready') {
      try {
        // INFO command can give 'dbX:keys=Y,expires=Z'
        const info = await this.client.info();
        redisInfo = info; // Store full info for potential debugging
        const dbKey = `db${this.options.redisDb}`;
        const dbInfo = info.split('\r\n').find((line: string) => line.startsWith(dbKey));
        if (dbInfo) {
          const match = dbInfo.match(/keys=(\d+)/);
          if (match && match[1]) {
            size = parseInt(match[1], 10); // This is total keys in DB, not just prefixed ones
          }
        }
        // For a more accurate count of prefixed keys, a scan would be needed, which can be slow.
        // const keys = await this.client.keys(`${this.options.keyPrefix}*`);
        // size = keys.length;
      } catch (error) {
        logger.error('Redis Cache getStats (INFO) error', error as Error);
        size = 'Error fetching size';
      }
    }
    return {
      size,
      options: this.options,
      redisInfo
    };
  }

  /**
   * Disconnect the Redis client.
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis Cache client disconnected.');
    }
  }
}