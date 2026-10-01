import { Redis } from '@upstash/redis';

/**
 * Thin, optional cache wrapper around Upstash Redis.
 *
 * Upstash is HTTP-based (not a persistent TCP connection), which is why it
 * works from Vercel's serverless functions at all -- a traditional Redis
 * client like ioredis can't hold a connection open across invocations the
 * way it would on a long-running server.
 *
 * Entirely opt-in: if neither UPSTASH_REDIS_REST_URL/TOKEN nor Vercel's own
 * KV_REST_API_URL/TOKEN (same thing, different name -- set automatically by
 * the "Upstash for Redis" Vercel Marketplace integration) are configured,
 * every function below is a no-op and callers fall back to querying the
 * database directly. Same "simple now, documented upgrade path" pattern as
 * db.ts and lib/upload.ts elsewhere in this codebase -- this file is safe to
 * ship before the integration is set up, and starts caching the moment it is,
 * with no further code change.
 */
let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) {
    redis = Redis.fromEnv();
  }
} catch {
  redis = null;
}

export const cacheConfigured = redis !== null;

/**
 * Reads a cached value. Returns null on a miss OR on any Redis-side failure
 * -- a cache outage should degrade the request to "slower", never "broken".
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch {
    return null;
  }
}

/**
 * Writes a cached value with a TTL. Best-effort: a write failure is swallowed
 * rather than thrown, since a cache-set failing should never fail the request
 * that triggered it.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // best-effort
  }
}
