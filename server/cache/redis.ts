import Redis from 'ioredis';
import { config } from '../config.js';

interface MemoryCacheEntry {
  value: any;
  expiresAt: number;
}

class CacheService {
  private redisClient: Redis | null = null;
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private isRedis = false;
  private hits = 0;
  private misses = 0;

  async init(): Promise<void> {
    if (config.redisUrl) {
      try {
        const client = new Redis(config.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
          connectTimeout: 3000,
        });
        await client.connect();
        this.redisClient = client;
        this.isRedis = true;
        console.log('[Cache] Connected to Redis successfully.');
        return;
      } catch (err) {
        console.warn('[Cache] Could not connect to Redis, falling back to memory cache:', (err as Error).message);
        this.isRedis = false;
        this.redisClient = null;
      }
    } else {
      console.log('[Cache] No REDIS_URL provided, operating with high-speed in-memory cache with TTL.');
    }

    // Clean expired keys every 30 seconds for memory cache
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt <= now) {
          this.memoryCache.delete(key);
        }
      }
    }, 30000);
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isRedis && this.redisClient) {
      try {
        const data = await this.redisClient.get(key);
        if (data) {
          this.hits++;
          return JSON.parse(data) as T;
        }
        this.misses++;
        return null;
      } catch {
        // Fallback to memory
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value as T;
  }

  async set(key: string, value: any, ttlSeconds = 60): Promise<void> {
    const serialized = JSON.stringify(value);
    if (this.isRedis && this.redisClient) {
      try {
        await this.redisClient.set(key, serialized, 'EX', ttlSeconds);
        return;
      } catch {
        // Fallback
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    if (this.isRedis && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch {}
    }
    this.memoryCache.delete(key);
  }

  async flush(): Promise<void> {
    if (this.isRedis && this.redisClient) {
      try {
        await this.redisClient.flushdb();
      } catch {}
    }
    this.memoryCache.clear();
  }

  async getLiveMatches(): Promise<any[] | null> {
    return this.get<any[]>('matches:live');
  }

  async setLiveMatches(matches: any[], ttl = 30): Promise<void> {
    return this.set('matches:live', matches, ttl);
  }

  getStats(): { isRedis: boolean; hits: number; misses: number; keysCount: number; hitRatio: number; status: string } {
    const total = this.hits + this.misses;
    const hitRatio = total > 0 ? Number(((this.hits / total) * 100).toFixed(1)) : 0;
    return {
      isRedis: this.isRedis,
      hits: this.hits,
      misses: this.misses,
      keysCount: this.memoryCache.size,
      hitRatio,
      status: this.isRedis ? 'CONNECTED_REDIS' : 'IN_MEMORY_FALLBACK',
    };
  }
}

export const cache = new CacheService();
