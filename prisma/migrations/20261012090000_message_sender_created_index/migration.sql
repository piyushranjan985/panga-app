-- Backs the new per-sender rolling-24h message-send rate limit
-- (lib/messageRateLimit.ts, checked in app/api/matches/[matchId]/
-- messages/route.ts's POST handler) -- same "add the index while the
-- table is still small" reasoning as the
-- 20261011090000_discovery_swipe_indexes migration: doing this now,
-- pre-launch, is effectively instant; doing it later against a live,
-- large Message table would mean a full index build under real traffic.
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message" ("senderId", "createdAt");
