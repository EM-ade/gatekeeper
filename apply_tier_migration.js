// Script to apply Tier system migration to Supabase
import sql from './db.js';

async function applyTierMigration() {
  try {
    console.log('Applying Tier system migration (004_add_tiers.sql) to Supabase...');

    await sql`
      -- Realmkins: add tier columns if not present
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'realmkins' AND column_name = 'tier'
          ) THEN
              ALTER TABLE realmkins ADD COLUMN tier INTEGER NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'realmkins' AND column_name = 'tier_level'
          ) THEN
              ALTER TABLE realmkins ADD COLUMN tier_level INTEGER NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'realmkins' AND column_name = 'tier_xp'
          ) THEN
              ALTER TABLE realmkins ADD COLUMN tier_xp INTEGER NOT NULL DEFAULT 0;
          END IF;
      END
      $$;

      -- Backfill realmkins
      UPDATE realmkins
      SET 
        tier = COALESCE(tier, 1),
        tier_level = CASE 
          WHEN (tier_level IS NULL OR tier_level = 0) THEN GREATEST(1, LEAST(25, COALESCE(level, 1)))
          ELSE tier_level
        END,
        tier_xp = CASE 
          WHEN (tier_xp IS NULL) THEN COALESCE(xp, 0)
          ELSE tier_xp
        END;

      -- Fused characters: add tier columns if not present
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'fused_characters' AND column_name = 'tier'
          ) THEN
              ALTER TABLE fused_characters ADD COLUMN tier INTEGER NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'fused_characters' AND column_name = 'tier_level'
          ) THEN
              ALTER TABLE fused_characters ADD COLUMN tier_level INTEGER NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'fused_characters' AND column_name = 'tier_xp'
          ) THEN
              ALTER TABLE fused_characters ADD COLUMN tier_xp INTEGER NOT NULL DEFAULT 0;
          END IF;
      END
      $$;

      -- Backfill fused_characters
      UPDATE fused_characters
      SET 
        tier = COALESCE(tier, 1),
        tier_level = CASE 
          WHEN (tier_level IS NULL OR tier_level = 0) THEN GREATEST(1, LEAST(25, COALESCE(level, 1)))
          ELSE tier_level
        END,
        tier_xp = CASE 
          WHEN (tier_xp IS NULL) THEN COALESCE(xp, 0)
          ELSE tier_xp
        END;
    `;

    console.log('✅ Tier migration applied successfully.');
  } catch (error) {
    console.error('Error applying Tier migration:', error);
  } finally {
    process.exit(0);
  }
}

applyTierMigration();
