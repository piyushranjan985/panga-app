/**
 * Request-time reads of the admin-managed FeatureFlag table (key, enabled,
 * rolloutPercent -- see prisma/schema.prisma). The admin console has let
 * ops create/toggle these rows for a while (admin/app/(console)/
 * configuration/page.tsx, admin/components/ProposeFeatureFlagForm.tsx), but
 * until this file, nothing in the consumer app actually read one back at
 * request time -- this is that read path.
 *
 * Deliberately minimal: `rolloutPercent` isn't consulted here (every flag
 * this reads is a plain on/off switch for now); a percentage rollout is a
 * reasonable future extension, not something to half-build speculatively.
 *
 * Same "ships before configured, never crashes" convention as lib/cache.ts,
 * lib/ops/alerts.ts and the push/email/SMS integrations: a missing flag
 * row, a DB outage, or a cache outage all just fall back to `fallback`
 * rather than throwing -- a feature flag check must never be why a request
 * that didn't ask for the new behavior fails. `fallback` defaults to
 * `false` (closed/off) on purpose -- an unreadable flag should never be
 * mistaken for "on".
 */
import { db } from '@/lib/db';
import { cacheGet, cacheSet } from '@/lib/cache';

// Short enough that toggling a flag in the admin console takes effect
// almost immediately; long enough to absorb a burst of concurrent requests
// checking the same flag with one DB round trip -- same reasoning as
// lib/discoverPool.ts's ELIGIBLE_POOL_CACHE_TTL_SECONDS, just shorter since
// this is checked on ordinary request paths, not a cacheable pool query.
const FEATURE_FLAG_CACHE_TTL_SECONDS = 30;

function cacheKeyFor(key: string): string {
  return `featureFlag:${key}`;
}

/**
 * Whether the FeatureFlag row for `key` is enabled. Returns `fallback`
 * (default `false`) if the row doesn't exist yet, or if reading it fails
 * for any reason -- see the file-level comment. Never throws.
 */
export async function isFeatureFlagEnabled(key: string, fallback = false): Promise<boolean> {
  try {
    const cacheKey = cacheKeyFor(key);
    const cached = await cacheGet<boolean>(cacheKey);
    if (cached !== null) return cached;

    const flag = await db.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
    const enabled = flag?.enabled ?? fallback;

    await cacheSet(cacheKey, enabled, FEATURE_FLAG_CACHE_TTL_SECONDS);
    return enabled;
  } catch (err) {
    console.error(`[featureFlags] failed to read "${key}"; falling back to ${fallback}`, err);
    return fallback;
  }
}
