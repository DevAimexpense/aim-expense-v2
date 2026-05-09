// ===========================================
// Aim Expense — Redis Cache Layer (S25)
//
// Wraps Google Sheets reads with a short-TTL Upstash Redis cache so we
// don't hit Sheets API on every request when scaling to 1000+ users.
//
// Contract:
// - Cached values are RAW row data from a single tab (no aggregation/snapshots)
// - TTL is short (default 30s) → eventual-consistency window stays bounded
// - All write methods on GoogleSheetsService invalidate their tab key
// - If Upstash env is not configured (or Redis is unreachable) we silently
//   fall back to direct API calls — caching is best-effort, never required
//
// See session25/design/CACHE_LAYER_ADR.md for the override of
// SYSTEM_REQUIREMENTS principle 3 ("no cache").
// ===========================================

import { Redis } from "@upstash/redis";

const redis: Redis | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[cache] UPSTASH_REDIS_REST_URL/TOKEN not set — caching disabled");
    }
    return null;
  }
  return new Redis({ url, token });
})();

/** Default TTL for sheet-tab cache entries (seconds). */
export const SHEETS_TTL_SEC = 30;

/** Whether the cache backend is wired up. */
export function isCacheEnabled(): boolean {
  return redis !== null;
}

// ===== Lightweight observability =====
//
// Per-process counters — read by an instrumentation endpoint or dumped on
// SIGTERM in the future. Free, no external service needed. We log MISSes only
// (hits are silent to keep log volume down on Vercel).
const stats = { hits: 0, misses: 0, errors: 0 };

export function getCacheStats(): { hits: number; misses: number; errors: number } {
  return { ...stats };
}

/** Get a JSON-serialised value from cache. Returns null on miss/error/disabled. */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    if (value !== null && value !== undefined) {
      stats.hits++;
      return value as T;
    }
    stats.misses++;
    return null;
  } catch (err) {
    stats.errors++;
    console.warn("[cache] get failed:", key, err);
    return null;
  }
}

/** Get many keys in one round-trip. Returns array aligned with input. */
export async function mgetCache<T>(keys: string[]): Promise<(T | null)[]> {
  if (!redis || keys.length === 0) return keys.map(() => null);
  try {
    const values = await redis.mget<T[]>(...keys);
    const out = values.map((v) => (v ?? null) as T | null);
    out.forEach((v) => (v !== null ? stats.hits++ : stats.misses++));
    return out;
  } catch (err) {
    stats.errors++;
    console.warn("[cache] mget failed:", keys.length, "keys", err);
    return keys.map(() => null);
  }
}

/** Set a JSON-serialisable value with a TTL (seconds). No-op if disabled. */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSec: number,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSec });
  } catch (err) {
    console.warn("[cache] set failed:", key, err);
  }
}

/** Set many keys (each with same TTL) in parallel. */
export async function msetCache<T>(
  entries: Array<{ key: string; value: T }>,
  ttlSec: number,
): Promise<void> {
  if (!redis || entries.length === 0) return;
  await Promise.all(entries.map((e) => setCache(e.key, e.value, ttlSec)));
}

/** Delete one or more keys. No-op if disabled. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    console.warn("[cache] del failed:", keys, err);
  }
}

/**
 * Read-through helper. Returns cached value if present, else calls the
 * fetcher, caches the result, and returns it. Cache failures fall back
 * to the fetcher transparently.
 */
export async function getOrFetch<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  await setCache(key, fresh, ttlSec);
  return fresh;
}

// ===== Sheet-tab key helpers =====
//
// Key format: `sheets:{spreadsheetId}:tab:{tabName}`
// (spreadsheetId scopes per org — different users' data never collide)

/** Cache key for a full-tab `getAll()` snapshot. */
export function sheetsTabKey(spreadsheetId: string, tabName: string): string {
  return `sheets:${spreadsheetId}:tab:${tabName}`;
}

/** Cache key for the `getConfigMap()` materialised map. */
export function sheetsConfigMapKey(spreadsheetId: string): string {
  return `sheets:${spreadsheetId}:config-map`;
}

/**
 * Invalidate every cache entry derived from a tab's data.
 *
 * Call this from any write path (append/update/delete/setConfig).
 * For the `Config` tab we also drop the materialised config-map key.
 */
export async function invalidateTab(
  spreadsheetId: string,
  tabName: string,
): Promise<void> {
  const keys = [sheetsTabKey(spreadsheetId, tabName)];
  if (tabName === "Config") {
    keys.push(sheetsConfigMapKey(spreadsheetId));
  }
  await invalidate(...keys);
}
