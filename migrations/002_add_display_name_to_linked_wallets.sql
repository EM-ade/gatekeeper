-- Migration: Add display_name column to linked_wallets table
-- This migration adds the missing display_name column that is referenced in event leaderboard queries

-- Add display_name column to linked_wallets if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'linked_wallets' 
        AND column_name = 'display_name'
    ) THEN
        ALTER TABLE linked_wallets ADD COLUMN display_name TEXT;
        RAISE NOTICE 'Added display_name column to linked_wallets table';
    ELSE
        RAISE NOTICE 'display_name column already exists in linked_wallets table';
    END IF;
END
$$;

-- Update existing records to set a default display_name if needed
UPDATE linked_wallets 
SET display_name = 'Player_' || user_id 
WHERE display_name IS NULL;

COMMENT ON COLUMN linked_wallets.display_name IS 'User display name for leaderboard and UI purposes';