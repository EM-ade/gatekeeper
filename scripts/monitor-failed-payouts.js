/**
 * Monitor Failed Payouts
 * Checks for any failed payouts and sends alerts
 * Can be run as a cron job or manually
 */

import admin from 'firebase-admin';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { sendDiscordAlert } from '../utils/discordAlerts.js';

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
    process.exit(1);
  }
}

const db = admin.firestore();
console.log('✅ Firestore database connected\n');

/**
 * Check for failed payouts that need recovery
 */
async function monitorFailedPayouts() {
  console.log('🔍 Checking for failed payouts...\n');
  
  try {
    // Check failed_payouts collection
    const failedPayoutsSnapshot = await db.collection('failed_payouts')
      .where('status', '==', 'PENDING_RECOVERY')
      .orderBy('timestamp', 'desc')
      .get();
    
    if (failedPayoutsSnapshot.empty) {
      console.log('✅ No pending failed payouts found\n');
      return { failedPayouts: 0, pendingRecovery: [] };
    }
    
    console.log(`⚠️  Found ${failedPayoutsSnapshot.size} failed payout(s) requiring recovery!\n`);
    
    const pendingRecovery = [];
    
    for (const doc of failedPayoutsSnapshot.docs) {
      const data = doc.data();
      const failedAt = data.timestamp.toDate();
      const hoursAgo = (Date.now() - failedAt.getTime()) / (1000 * 60 * 60);
      
      pendingRecovery.push({
        id: doc.id,
        userId: data.user_id,
        type: data.type,
        amount: data.type === 'CLAIM' ? `${data.amount_sol?.toFixed(6)} SOL` : `${data.amount_mkin?.toLocaleString()} MKIN`,
        feeTx: data.fee_tx,
        failedAt: failedAt.toISOString(),
        hoursAgo: hoursAgo.toFixed(1),
        errorMessage: data.error_message,
        recoveryAttempts: data.recovery_attempts || 0
      });
      
      console.log(`❌ Failed ${data.type}:`);
      console.log(`   Document ID: ${doc.id}`);
      console.log(`   User ID: ${data.user_id}`);
      console.log(`   Amount: ${data.type === 'CLAIM' ? `${data.amount_sol?.toFixed(6)} SOL` : `${data.amount_mkin?.toLocaleString()} MKIN`}`);
      console.log(`   Fee TX: ${data.fee_tx}`);
      console.log(`   Failed: ${hoursAgo.toFixed(1)} hours ago`);
      console.log(`   Error: ${data.error_message}`);
      console.log(`   Recovery Attempts: ${data.recovery_attempts || 0}`);
      console.log();
    }
    
    // Send Discord alert for critical failures (older than 1 hour)
    const criticalFailures = pendingRecovery.filter(f => parseFloat(f.hoursAgo) > 1);
    
    if (criticalFailures.length > 0) {
      console.log(`🚨 Sending alert for ${criticalFailures.length} critical failure(s)...\n`);
      
      const alertMessage = criticalFailures.map(f => 
        `• **${f.type}** - User: \`${f.userId}\` - Amount: \`${f.amount}\` - Failed ${f.hoursAgo}h ago`
      ).join('\n');
      
      try {
        await sendDiscordAlert({
          type: 'error',
          title: `🚨 CRITICAL: ${criticalFailures.length} Failed Payout(s) Require Recovery`,
          message: `${alertMessage}\n\nThese payouts need immediate manual recovery!`,
          timestamp: new Date().toISOString()
        });
        console.log('✅ Discord alert sent\n');
      } catch (alertError) {
        console.error('⚠️  Failed to send Discord alert:', alertError.message, '\n');
      }
    }
    
    // Also check staking_transactions for any without payout/token signatures
    console.log('🔍 Checking staking_transactions for missing signatures...\n');
    
    const oneDayAgo = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    
    // Check claims without payout_signature
    const claimsSnapshot = await db.collection('staking_transactions')
      .where('type', '==', 'CLAIM')
      .where('timestamp', '>=', oneDayAgo)
      .get();
    
    const claimsWithoutSignature = claimsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.fee_tx && !data.payout_signature && data.status !== 'COMPLETED';
    });
    
    if (claimsWithoutSignature.length > 0) {
      console.log(`⚠️  Found ${claimsWithoutSignature.length} claim(s) without payout signature:\n`);
      claimsWithoutSignature.forEach(doc => {
        const data = doc.data();
        console.log(`   • User: ${data.user_id}, Amount: ${data.amount_sol?.toFixed(6)} SOL, Fee TX: ${data.fee_tx}`);
      });
      console.log();
    }
    
    // Check unstakes without token_tx
    const unstakesSnapshot = await db.collection('staking_transactions')
      .where('type', '==', 'UNSTAKE')
      .where('timestamp', '>=', oneDayAgo)
      .get();
    
    const unstakesWithoutSignature = unstakesSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.fee_tx && !data.token_tx && data.status !== 'COMPLETED';
    });
    
    if (unstakesWithoutSignature.length > 0) {
      console.log(`⚠️  Found ${unstakesWithoutSignature.length} unstake(s) without token signature:\n`);
      unstakesWithoutSignature.forEach(doc => {
        const data = doc.data();
        console.log(`   • User: ${data.user_id}, Amount: ${data.amount_mkin?.toLocaleString()} MKIN, Fee TX: ${data.fee_tx}`);
      });
      console.log();
    }
    
    const totalIssues = failedPayoutsSnapshot.size + claimsWithoutSignature.length + unstakesWithoutSignature.length;
    
    console.log(`${'='.repeat(80)}`);
    console.log(`📊 SUMMARY:`);
    console.log(`   - Failed payouts in collection: ${failedPayoutsSnapshot.size}`);
    console.log(`   - Claims without signature: ${claimsWithoutSignature.length}`);
    console.log(`   - Unstakes without signature: ${unstakesWithoutSignature.length}`);
    console.log(`   - Total issues: ${totalIssues}`);
    console.log(`${'='.repeat(80)}\n`);
    
    return {
      failedPayouts: failedPayoutsSnapshot.size,
      claimsWithoutSignature: claimsWithoutSignature.length,
      unstakesWithoutSignature: unstakesWithoutSignature.length,
      pendingRecovery,
      totalIssues
    };
    
  } catch (error) {
    console.error('❌ Error monitoring failed payouts:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting failed payout monitoring...\n');
  
  monitorFailedPayouts()
    .then((result) => {
      if (result.totalIssues > 0) {
        console.log('⚠️  Issues found - manual recovery may be required\n');
        process.exit(1);
      } else {
        console.log('✅ No issues found\n');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('❌ Monitoring failed:', error.message);
      process.exit(1);
    });
}

export { monitorFailedPayouts };
