import 'dotenv/config';
import sql from './db.js';
import fs from 'fs';

async function applyMigration() {
    try {
        console.log('Applying verification system migration...');
        
        const migrationSQL = fs.readFileSync('./migrations/005_add_updated_at_to_verification_sessions.sql', 'utf8');
        
        await sql.unsafe(migrationSQL);
        
        console.log('✅ Migration applied successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

applyMigration();
