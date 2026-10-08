-- Discovery/swipe hot-path index hardening (see docs/MYSTERY_MATCH.md's
-- sibling scaling notes / the architecture review this responds to).
--
-- Why now, on a near-empty table: adding an index or a GENERATED column
-- backfill to a table with hundreds of thousands of rows means a full
-- table rewrite under live traffic. Doing it now, while Profile/Swipe are
-- still a few hundred rows, is effectively instant and completely free.

-- 1. PostGIS, so distance filtering can eventually run as a real spatial
--    index lookup (ST_DWithin against a GiST index) instead of pulling
--    rows out to JS and running Haversine math on every candidate, which
--    is what lib/matching.ts does today. Enabling this costs nothing and
--    changes no existing behavior -- it's groundwork, not a query change.
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. A geography column derived from the existing latitude/longitude
--    columns, kept in sync automatically (Postgres recomputes a STORED
--    generated column on every INSERT/UPDATE -- no app code change, no
--    trigger, no risk of the two drifting apart). NULL when either
--    coordinate is NULL (most profiles today, since precise location is
--    opt-in -- see schema.prisma's comment on Profile.latitude).
ALTER TABLE "Profile" ADD COLUMN "geoLocation" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE WHEN "latitude" IS NOT NULL AND "longitude" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
      ELSE NULL
    END
  ) STORED;

-- Spatial (GiST) index on that column -- what makes a future
-- `WHERE ST_DWithin("geoLocation", $point, $radius_m)` fast instead of a
-- full-table distance scan.
CREATE INDEX "Profile_geoLocation_idx" ON "Profile" USING GIST ("geoLocation");

-- 3. The actual filter shape every discovery/wildcard/search pool query
--    runs today (lib/discoverPool.ts, app/api/discover/search/route.ts):
--    WHERE city = ? AND quietMode = false. The existing
--    (city, intent, quietMode) index doesn't serve this well once a city
--    has many quietMode=true rows mixed in, because `intent` sits
--    unconstrained between `city` and `quietMode` in that index, so
--    Postgres can't narrow on quietMode via the index -- it has to walk
--    every row for that city and filter quietMode afterwards. Left the
--    existing index in place (something elsewhere may still filter by
--    intent) and added the one the hot path actually needs.
CREATE INDEX "Profile_city_quietMode_idx" ON "Profile" ("city", "quietMode");

-- 4. lib/searchBehaviorBoost.ts's personalization query
--    (WHERE fromUserId = ? AND action = 'VYBE' ORDER BY createdAt DESC
--    LIMIT 200, run on every /api/discover/search request) has the same
--    problem: the existing @@unique([fromUserId, toUserId]) index can
--    seek on fromUserId but then has to filter `action` and sort
--    `createdAt` itself for every swipe that user has ever made. This
--    index serves the filter and the sort/order directly.
CREATE INDEX "Swipe_fromUserId_action_createdAt_idx" ON "Swipe" ("fromUserId", "action", "createdAt" DESC);
