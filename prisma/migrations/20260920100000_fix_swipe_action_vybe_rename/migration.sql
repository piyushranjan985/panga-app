-- The migration named "20260911091217_rename_panga_enum_to_vybematch"
-- doesn't actually contain this rename (it has unrelated
-- _ProfileInterests SQL instead -- an authoring mistake from that commit).
-- The real PANGA -> VYBE rename only ever reached the dev database
-- directly (via `prisma db push`, which syncs schema.prisma without
-- writing a migration file), so `migrate deploy` never had anything to
-- apply anywhere else, and any database that only ever ran real
-- migrations (production, or a fresh one built from scratch) was left
-- with the original SwipeAction enum: ('PASS', 'PANGA').
--
-- Guarded with an existence check so this is safe to run against every
-- database regardless of history: a database that already has VYBE
-- (dev) just no-ops here; one that still has PANGA (production, or a
-- brand new database built from the migrations in order, which creates
-- it as PANGA in 20260910123259_init) gets the rename.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SwipeAction' AND e.enumlabel = 'PANGA'
  ) THEN
    ALTER TYPE "SwipeAction" RENAME VALUE 'PANGA' TO 'VYBE';
  END IF;
END $$;
