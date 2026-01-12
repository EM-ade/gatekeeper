/**
 * User Database Diagnostic Script
 * 
 * Checks if a Discord user exists in the database and shows their verification status
 * 
 * Usage:
 *   node scripts/check-user-database.js <discord_user_id>
 * 
 * Example:
 *   node scripts/check-user-database.js 443919280967385119
 */

import sql from '../db.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function checkUserInDatabase(discordId) {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 USER DATABASE DIAGNOSTIC');
  console.log('='.repeat(80));
  console.log(`\nDiscord User ID: ${discordId}`);
  console.log('='.repeat(80));

  let foundInAnyTable = false;

  // Check PostgreSQL users table
  try {
    console.log('\n📊 Checking PostgreSQL "users" table...');
    const users = await sql`
      SELECT discord_id, guild_id, wallet_address, username, is_verified, 
             last_verification_check, created_at
      FROM users
      WHERE discord_id = ${discordId}
    `;

    if (users.length > 0) {
      foundInAnyTable = true;
      console.log(`✅ Found ${users.length} record(s) in "users" table:\n`);
      
      users.forEach((user, idx) => {
        console.log(`   Record ${idx + 1}:`);
        console.log(`   ├─ Guild ID: ${user.guild_id}`);
        console.log(`   ├─ Username: ${user.username || 'N/A'}`);
        console.log(`   ├─ Wallet: ${user.wallet_address || 'NOT LINKED'}`);
        console.log(`   ├─ Verified: ${user.is_verified ? '✅ Yes' : '❌ No'}`);
        console.log(`   ├─ Last Check: ${user.last_verification_check || 'Never'}`);
        console.log(`   └─ Created: ${user.created_at || 'Unknown'}\n`);
      });
    } else {
      console.log('   ❌ No records found in "users" table');
    }
  } catch (error) {
    console.error('   ⚠️  Error checking "users" table:', error.message);
  }

  // Check Supabase linked_wallets table
  if (supabase) {
    try {
      console.log('\n📊 Checking Supabase "linked_wallets" table...');
      const { data, error } = await supabase
        .from('linked_wallets')
        .select('*')
        .eq('discord_id', discordId);

      if (error) {
        console.error('   ⚠️  Error querying linked_wallets:', error.message);
      } else if (data && data.length > 0) {
        foundInAnyTable = true;
        console.log(`✅ Found ${data.length} record(s) in "linked_wallets" table:\n`);
        
        data.forEach((record, idx) => {
          console.log(`   Record ${idx + 1}:`);
          console.log(`   ├─ User ID: ${record.user_id}`);
          console.log(`   ├─ Discord ID: ${record.discord_id}`);
          console.log(`   ├─ Display Name: ${record.display_name || 'N/A'}`);
          console.log(`   ├─ Wallet: ${record.wallet_address || 'NOT LINKED'}`);
          console.log(`   ├─ Verified: ${record.verified ? '✅ Yes' : '❌ No'}`);
          console.log(`   ├─ Created: ${record.created_at || 'Unknown'}`);
          console.log(`   └─ Updated: ${record.updated_at || 'Unknown'}\n`);
        });
      } else {
        console.log('   ❌ No records found in "linked_wallets" table');
      }
    } catch (error) {
      console.error('   ⚠️  Error checking "linked_wallets" table:', error.message);
    }

    // Check verification sessions
    try {
      console.log('\n📊 Checking Supabase "verification_sessions" table...');
      const { data, error } = await supabase
        .from('verification_sessions')
        .select('*')
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('   ⚠️  Error querying verification_sessions:', error.message);
      } else if (data && data.length > 0) {
        console.log(`✅ Found ${data.length} recent verification session(s):\n`);
        
        data.forEach((session, idx) => {
          console.log(`   Session ${idx + 1}:`);
          console.log(`   ├─ Guild ID: ${session.guild_id}`);
          console.log(`   ├─ Wallet: ${session.wallet_address || 'N/A'}`);
          console.log(`   ├─ Status: ${session.status}`);
          console.log(`   ├─ Created: ${session.created_at}`);
          console.log(`   └─ Expires: ${session.expires_at}\n`);
        });
      } else {
        console.log('   ❌ No verification sessions found');
      }
    } catch (error) {
      console.error('   ⚠️  Error checking "verification_sessions" table:', error.message);
    }
  } else {
    console.log('\n⚠️  Supabase not configured - skipping Supabase tables');
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY');
  console.log('='.repeat(80));
  
  if (foundInAnyTable) {
    console.log('\n✅ User exists in database');
    console.log('\n💡 Next steps:');
    console.log('   1. If they have a wallet linked, run:');
    console.log(`      node scripts/check-user-nfts.js <wallet_address>`);
    console.log('   2. If they should have the holder role, use Discord command:');
    console.log(`      /manual-verify user <@${discordId}>`);
  } else {
    console.log('\n❌ User NOT found in any database table');
    console.log('\n💡 This user needs to complete verification:');
    console.log('   1. Ask them to run: /verify-nft in Discord');
    console.log('   2. Click "Verify Wallet" button');
    console.log('   3. Connect their Solana wallet');
    console.log('   4. Complete the verification process');
  }
  
  console.log('\n' + '='.repeat(80));
}

// Run the script
const discordId = process.argv[2];

if (!discordId) {
  console.error('\n❌ Error: Please provide a Discord user ID');
  console.error('\nUsage:');
  console.error('  node scripts/check-user-database.js <discord_user_id>');
  console.error('\nExample:');
  console.error('  node scripts/check-user-database.js 443919280967385119\n');
  process.exit(1);
}

checkUserInDatabase(discordId)
  .then(() => {
    console.log('\n✅ Diagnostic complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Diagnostic error:', error);
    process.exit(1);
  });
