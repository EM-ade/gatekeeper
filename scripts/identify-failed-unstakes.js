/**
 * Identify Failed Unstake Transactions
 * Finds unstakes where users paid fees but didn't receive tokens
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
    // Try to load from service account JSON file
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.SERVICE_ACCOUNT_PATH;
    
    if (serviceAccountPath) {
      console.log(`📄 Loading credentials from: ${serviceAccountPath}`);
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized with service account');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      // Try loading from environment variable
      console.log('📄 Loading credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var');
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized from env variable');
    } else {
      // Try default application credentials (for GCP environments)
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

const db = admin.firestore();
console.log('✅ Firestore database connected\n');

/**
 * Find failed unstake transactions
 * A failed unstake has:
 * 1. Type = UNSTAKE
 * 2. Has a fee_tx (user paid)
 * 3. No token_tx or status = FAILED
 * 4. Recent (within last 7 days)
 */
async function identifyFailedUnstakes() {
  console.log('🔍 Searching for failed unstake transactions...\n');
  
  // Get transactions from the last 7 days
  const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  
  const transactionsSnapshot = await db.collection('staking_transactions')
    .where('type', '==', 'UNSTAKE')
    .where('timestamp', '>=', sevenDaysAgo)
    .orderBy('timestamp', 'desc')
    .get();
  
  console.log(`📊 Found ${transactionsSnapshot.size} unstake transactions in last 7 days\n`);
  
  const failedUnstakes = [];
  
  for (const doc of transactionsSnapshot.docs) {
    const tx = doc.data();
    const txId = doc.id;
    
    // Check if this transaction appears to have failed
    // Failed = has fee_tx but no token_tx
    const hasFee = Boolean(tx.fee_tx);
    const hasTokenTransfer = Boolean(tx.token_tx) || tx.status === 'COMPLETED';
    const isFailed = hasFee && !hasTokenTransfer;
    
    if (isFailed) {
      // Get user details
      const userDoc = await db.collection('userRewards').doc(tx.user_id).get();
      const userData = userDoc.exists ? userDoc.data() : null;
      
      failedUnstakes.push({
        txId,
        userId: tx.user_id,
        userWallet: userData?.walletAddress || 'UNKNOWN',
        amount: tx.amount_mkin,
        feeTx: tx.fee_tx,
        timestamp: tx.timestamp.toDate(),
        feeAmountSol: tx.fee_amount_sol || 'UNKNOWN',
        status: tx.status || 'NO_STATUS'
      });
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`❌ FAILED UNSTAKES FOUND: ${failedUnstakes.length}`);
  console.log(`${'='.repeat(80)}\n`);
  
  if (failedUnstakes.length === 0) {
    console.log('✅ No failed unstakes found! All transactions completed successfully.\n');
    return [];
  }
  
  // Display results
  for (const [index, failed] of failedUnstakes.entries()) {
    console.log(`\n${index + 1}. FAILED UNSTAKE`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`   Transaction ID:  ${failed.txId}`);
    console.log(`   User ID:         ${failed.userId}`);
    console.log(`   User Wallet:     ${failed.userWallet}`);
    console.log(`   Amount:          ${failed.amount.toLocaleString()} MKIN`);
    console.log(`   Fee TX:          ${failed.feeTx}`);
    console.log(`   Fee Paid:        ${failed.feeAmountSol} SOL`);
    console.log(`   Timestamp:       ${failed.timestamp.toISOString()}`);
    console.log(`   Status:          ${failed.status}`);
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`\n📋 SUMMARY:`);
  console.log(`   - Total Failed Unstakes: ${failedUnstakes.length}`);
  console.log(`   - Total MKIN Owed: ${failedUnstakes.reduce((sum, f) => sum + f.amount, 0).toLocaleString()} MKIN`);
  console.log(`   - Total Fees Paid: ${failedUnstakes.reduce((sum, f) => sum + (parseFloat(f.feeAmountSol) || 0), 0).toFixed(6)} SOL`);
  
  console.log(`\n🎯 NEXT STEPS:`);
  console.log(`   1. Verify these are legitimate failed unstakes`);
  console.log(`   2. Run recovery script for each user:`);
  console.log(`      node gatekeeper/scripts/recover-failed-unstake.js <USER_ID>`);
  console.log(`\n`);
  
  // Save results to JSON file for reference
  const { writeFileSync } = await import('fs');
  const outputPath = './failed-unstakes-report.json';
  
  try {
    writeFileSync(outputPath, JSON.stringify(failedUnstakes, null, 2));
    console.log(`💾 Report saved to: ${outputPath}\n`);
  } catch (error) {
    console.warn(`⚠️  Could not save report: ${error.message}\n`);
  }
  
  return failedUnstakes;
}

// Run the script - Always run when executed directly
console.log('🚀 Starting failed unstake identification script...\n');

identifyFailedUnstakes()
  .then((failed) => {
    console.log('\n✅ Identification complete');
    console.log(`Found ${failed.length} failed unstake(s)\n`);
    process.exit(failed.length > 0 ? 1 : 0); // Exit with error code if failures found
  })
  .catch((error) => {
    console.error('\n❌ Error identifying failed unstakes:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

export { identifyFailedUnstakes };
