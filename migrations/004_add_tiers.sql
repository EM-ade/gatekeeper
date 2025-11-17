-- 004_add_tiers.sql
-- Add tier fields to realmkins and fused_characters with fair backfill

BEGIN;

-- Realmkins: add tier columns if not present
ALTER TABLE IF EXISTS realmkins
  ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tier_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tier_xp INTEGER NOT NULL DEFAULT 0;

-- Backfill realmkins: map legacy level/xp fairly into tiers
UPDATE realmkins
SET 
  tier = COALESCE(tier, LEAST(4, 1 + ((GREATEST(COALESCE(level,1),1) - 1) / 25))),
  tier_level = COALESCE(
    NULLIF(tier_level, 0),
    1 + ((GREATEST(COALESCE(level,1),1) - 1) % 25)
  ),
  tier_xp = COALESCE(tier_xp, COALESCE(xp, 0));

-- Fused characters: add tier columns if not present
ALTER TABLE IF EXISTS fused_characters
  ADD COLUMN IF NOT EXISTS tier INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tier_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tier_xp INTEGER NOT NULL DEFAULT 0;

-- Backfill fused_characters
UPDATE fused_characters
SET 
  tier = COALESCE(tier, LEAST(4, 1 + ((GREATEST(COALESCE(level,1),1) - 1) / 25))),
  tier_level = COALESCE(
    NULLIF(tier_level, 0),
    1 + ((GREATEST(COALESCE(level,1),1) - 1) % 25)
  ),
  tier_xp = COALESCE(tier_xp, COALESCE(xp, 0));

COMMIT;