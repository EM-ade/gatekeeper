// Script to apply the display_name migration to Supabase
import sql from './db.js';

async function applyMigration() {
  try {
    console.log('Applying display_name migration to Supabase...');
    
    // Apply the migration using the SQL from the migration file
    const result = await sql`
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
    `;
    
    console.log('✅ Migration applied successfully to Supabase');
    console.log('The display_name column has been added to the linked_wallets table');
    
  } catch (error) {
    console.error('Error applying migration to Supabase:', error);
  }
}

// Run the migration
applyMigration().then(() => {
  console.log('\nMigration process completed');
  process.exit(0);
});