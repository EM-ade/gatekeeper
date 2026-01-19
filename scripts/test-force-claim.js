/**
 * Test Force-Claim Service
 * 
 * This script tests the force-claim functionality without making actual changes.
 * It can run in three modes:
 *   1. preview - Show what would be claimed (no changes)
 *   2. dry-run - Simulate the full process (no actual database changes)
 *   3. execute - Actually run the force-claim (USE WITH CAUTION)
 * 
 * Usage:
 *   node scripts/test-force-claim.js preview   # See pending rewards summary
 *   node scripts/test-force-claim.js dry-run   # Simulate without changes
 *   node scripts/test-force-claim.js execute   # Actually run (requires confirmation)
 */

import admin from 'firebase-admin';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

// Load environment variables
config();

console.log('🔧 Initializing Firebase Admin...');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.SERVICE_ACCOUNT_PATH;
    
    if (serviceAccountPath) {
      console.log(`📄 Loading credentials from: ${serviceAccountPath}`);
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized with service account');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.log('📄 Loading credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized from env variable');
    } else {
      console.log('📄 Attempting to use default application credentials...');
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('✅ Firebase Admin initialized with default credentials');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('\n💡 Make sure one of these is set:');
    console.error('   - GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json');
    console.error('   - SERVICE_ACCOUNT_PATH=path/to/service-account.json');
    console.error('   - FIREBASE_SERVICE_ACCOUNT_JSON=<json_string>');
    process.exit(1);
  }
}

// Now import the force claim service (after Firebase is initialized)
const { default: forceClaimService } = await import('../services/forceClaimService.js');

async function runPreview() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 FORCE-CLAIM PREVIEW');
  console.log('   This shows what would be claimed without making any changes');
  console.log('='.repeat(80) + '\n');

  try {
    const preview = await forceClaimService.getForceClaimPreview();
    
    console.log('📋 Summary:');
    console.log(`   Total users: ${preview.totalUsers}`);
    console.log(`   Users with pending rewards: ${preview.usersWithPendingRewards}`);
    console.log(`   Total pending rewards: ${preview.formattedTotal}`);
    console.log('');
    
    if (preview.top10Users.length > 0) {
      console.log('🏆 Top 10 Users by Pending Rewards:');
      console.log('-'.repeat(60));
      preview.top10Users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.userId}`);
        console.log(`      Wallet: ${user.walletAddress}`);
        console.log(`      Pending: ₥${user.pendingRewards.toFixed(2)}`);
      });
      console.log('-'.repeat(60));
    } else {
      console.log('ℹ️  No users have pending rewards');
    }
    
    console.log('\n✅ Preview completed');
    return preview;
  } catch (error) {
    console.error('❌ Preview failed:', error.message);
    throw error;
  }
}

async function runDryRun() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 FORCE-CLAIM DRY RUN');
  console.log('   This simulates the full process without making actual changes');
  console.log('='.repeat(80) + '\n');

  try {
    const result = await forceClaimService.runForceClaim({ dryRun: true });
    
    console.log('\n📋 Dry Run Results:');
    console.log(`   Would process: ${result.claimsProcessed} claims`);
    console.log(`   Would distribute: ₥${result.totalAmountDistributed.toLocaleString()}`);
    console.log(`   Duration: ${result.duration}`);
    
    console.log('\n✅ Dry run completed - NO CHANGES WERE MADE');
    return result;
  } catch (error) {
    console.error('❌ Dry run failed:', error.message);
    throw error;
  }
}

async function runExecute() {
  console.log('\n' + '='.repeat(80));
  console.log('⚠️  FORCE-CLAIM EXECUTION');
  console.log('   THIS WILL ACTUALLY PROCESS CLAIMS AND UPDATE THE DATABASE');
  console.log('='.repeat(80) + '\n');

  // Show preview first
  const preview = await forceClaimService.getForceClaimPreview();
  console.log('📊 About to process:');
  console.log(`   Users with pending rewards: ${preview.usersWithPendingRewards}`);
  console.log(`   Total to distribute: ${preview.formattedTotal}`);
  console.log('');

  // Safety confirmation
  console.log('⚠️  WARNING: This action cannot be undone!');
  console.log('   Press Ctrl+C within 10 seconds to cancel...\n');
  
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log('🚀 Proceeding with force-claim execution...\n');

  try {
    const result = await forceClaimService.runForceClaim({ dryRun: false });
    
    console.log('\n📋 Execution Results:');
    console.log(`   Claims processed: ${result.claimsProcessed}`);
    console.log(`   Total distributed: ₥${result.totalAmountDistributed.toLocaleString()}`);
    console.log(`   Duration: ${result.duration}`);
    
    console.log('\n✅ Force-claim execution completed successfully!');
    return result;
  } catch (error) {
    console.error('❌ Execution failed:', error.message);
    throw error;
  }
}

async function testSchedulerLogic() {
  console.log('\n' + '='.repeat(80));
  console.log('🕐 SCHEDULER LOGIC TEST');
  console.log('   Testing the day/hour detection logic');
  console.log('='.repeat(80) + '\n');

  const FORCE_CLAIM_HOUR = 12;
  const FORCE_CLAIM_DAY = 0; // Sunday
  
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  console.log('📅 Current time (UTC):');
  console.log(`   Date: ${now.toISOString()}`);
  console.log(`   Day: ${dayNames[currentDay]} (${currentDay})`);
  console.log(`   Hour: ${currentHour}:00`);
  console.log('');
  
  console.log('⚙️  Scheduler configuration:');
  console.log(`   Target day: ${dayNames[FORCE_CLAIM_DAY]} (${FORCE_CLAIM_DAY})`);
  console.log(`   Target hour: ${FORCE_CLAIM_HOUR}:00 UTC`);
  console.log('');
  
  const wouldTrigger = currentDay === FORCE_CLAIM_DAY && currentHour === FORCE_CLAIM_HOUR;
  console.log(`🎯 Would trigger now: ${wouldTrigger ? '✅ YES' : '❌ NO'}`);
  
  // Calculate next run
  const daysUntilSunday = (7 - currentDay) % 7 || 7;
  const nextSunday = new Date(now);
  
  if (currentDay === 0 && currentHour < FORCE_CLAIM_HOUR) {
    nextSunday.setUTCHours(FORCE_CLAIM_HOUR, 0, 0, 0);
  } else {
    nextSunday.setUTCDate(nextSunday.getUTCDate() + (currentDay === 0 ? 7 : daysUntilSunday));
    nextSunday.setUTCHours(FORCE_CLAIM_HOUR, 0, 0, 0);
  }
  
  const msUntilNext = nextSunday - now;
  const hoursUntilNext = Math.floor(msUntilNext / (1000 * 60 * 60));
  const daysUntilNext = Math.floor(hoursUntilNext / 24);
  
  console.log('');
  console.log('📆 Next scheduled run:');
  console.log(`   Date: ${nextSunday.toISOString()}`);
  console.log(`   Time until: ${daysUntilNext} days, ${hoursUntilNext % 24} hours`);
  
  console.log('\n✅ Scheduler logic test completed');
}

// Main execution
const mode = process.argv[2] || 'preview';

console.log('\n' + '🔄'.repeat(40));
console.log('   FORCE-CLAIM TEST SCRIPT');
console.log('   Mode: ' + mode.toUpperCase());
console.log('🔄'.repeat(40) + '\n');

try {
  switch (mode) {
    case 'preview':
      await runPreview();
      break;
    case 'dry-run':
      await runDryRun();
      break;
    case 'execute':
      await runExecute();
      break;
    case 'scheduler':
      await testSchedulerLogic();
      break;
    default:
      console.log('❌ Unknown mode:', mode);
      console.log('\nUsage:');
      console.log('  node scripts/test-force-claim.js preview    # See pending rewards summary');
      console.log('  node scripts/test-force-claim.js dry-run    # Simulate without changes');
      console.log('  node scripts/test-force-claim.js execute    # Actually run (with confirmation)');
      console.log('  node scripts/test-force-claim.js scheduler  # Test scheduler timing logic');
      process.exit(1);
  }
  
  console.log('\n✅ Test completed successfully');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
}
