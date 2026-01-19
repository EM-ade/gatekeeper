/**
 * Recover Failed Unstake
 * Manually sends tokens to users who paid fees but didn't receive tokens
 */

import admin from 'firebase-admin';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction, 
  createAssociatedTokenAccountInstruction,
  getAccount 
} from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { sendRecoverySuccessAlert, sendDiscordAlert } from '../utils/discordAlerts.js';

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
 * Recover a failed unstake for a specific user
 * @param {string} userId - Firebase UID of the user
 * @param {boolean} dryRun - If true, only simulate (don't send tokens)
 */
async function recoverFailedUnstake(userId, dryRun = true) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 STARTING RECOVERY FOR USER: ${userId}`);
  console.log(`   Mode: ${dryRun ? '🧪 DRY RUN (simulation)' : '💰 LIVE (will send tokens)'}`);
  console.log(`${'='.repeat(80)}\n`);
  
  try {
    // 1. Find the failed transaction
    console.log('📖 Step 1: Finding failed transaction...');
    const txSnapshot = await db.collection('staking_transactions')
      .where('user_id', '==', userId)
      .where('type', '==', 'UNSTAKE')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();
    
    if (txSnapshot.empty) {
      throw new Error(`No unstake transactions found for user ${userId}`);
    }
    
    // Find the first transaction without a token_tx
    let failedTx = null;
    let failedTxDoc = null;
    
    for (const doc of txSnapshot.docs) {
      const tx = doc.data();
      if (tx.fee_tx && !tx.token_tx && tx.status !== 'COMPLETED') {
        failedTx = tx;
        failedTxDoc = doc;
        break;
      }
    }
    
    if (!failedTx) {
      console.log('✅ No failed unstake found for this user - all transactions completed!');
      return { success: true, message: 'No recovery needed' };
    }
    
    console.log(`✅ Found failed transaction: ${failedTxDoc.id}`);
    console.log(`   Amount: ${failedTx.amount_mkin.toLocaleString()} MKIN`);
    console.log(`   Fee TX: ${failedTx.fee_tx}`);
    console.log(`   Timestamp: ${failedTx.timestamp.toDate().toISOString()}`);
    
    // 2. Get user's wallet address
    console.log('\n📖 Step 2: Getting user wallet address...');
    const userDoc = await db.collection('userRewards').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new Error(`User ${userId} not found in userRewards`);
    }
    
    const userWallet = userDoc.data().walletAddress;
    
    if (!userWallet) {
      throw new Error(`No wallet address found for user ${userId}`);
    }
    
    console.log(`✅ User wallet: ${userWallet}`);
    
    // 3. Setup connection and keypairs
    console.log('\n📖 Step 3: Setting up Solana connection...');
    
    // Use the same environment config as stakingService
    const { default: environmentConfig } = await import('../config/environment.js');
    const networkConfig = environmentConfig.networkConfig;
    
    const rpcUrl = networkConfig.rpcUrl;
    const tokenMintAddress = networkConfig.tokenMint;
    const vaultPrivateKey = process.env.STAKING_PRIVATE_KEY;
    
    console.log(`   Network: ${networkConfig.cluster}`);
    console.log(`   RPC URL: ${rpcUrl.substring(0, 50)}...`);
    const connection = new Connection(rpcUrl, 'confirmed');
    
    if (!tokenMintAddress || !vaultPrivateKey) {
      throw new Error('TOKEN_MINT or STAKING_PRIVATE_KEY not set in environment');
    }
    
    console.log(`✅ Using environment: ${process.env.NODE_ENV || 'development'}`);
    
    const tokenMint = new PublicKey(tokenMintAddress);
    const vaultKeypair = Keypair.fromSecretKey(bs58.decode(vaultPrivateKey));
    
    console.log(`✅ Token Mint: ${tokenMintAddress}`);
    console.log(`✅ Vault: ${vaultKeypair.publicKey.toString()}`);
    
    // 4. Check vault balances
    console.log('\n📖 Step 4: Checking vault balances...');
    
    const vaultATA = await getAssociatedTokenAddress(tokenMint, vaultKeypair.publicKey);
    const vaultTokenAccount = await getAccount(connection, vaultATA);
    const vaultTokenBalance = Number(vaultTokenAccount.amount) / 1e9;
    
    const vaultSolBalance = await connection.getBalance(vaultKeypair.publicKey);
    const vaultSolBalanceSOL = vaultSolBalance / 1e9;
    
    console.log(`   Vault MKIN: ${vaultTokenBalance.toLocaleString()} MKIN`);
    console.log(`   Vault SOL: ${vaultSolBalanceSOL.toFixed(6)} SOL`);
    console.log(`   Need to send: ${failedTx.amount_mkin.toLocaleString()} MKIN`);
    
    if (vaultTokenBalance < failedTx.amount_mkin) {
      throw new Error(`Insufficient MKIN in vault: have ${vaultTokenBalance}, need ${failedTx.amount_mkin}`);
    }
    
    if (vaultSolBalanceSOL < 0.001) {
      throw new Error(`Insufficient SOL for gas: ${vaultSolBalanceSOL.toFixed(6)} SOL`);
    }
    
    console.log(`✅ Vault has sufficient balance`);
    
    // 5. Prepare transaction
    console.log('\n📖 Step 5: Preparing token transfer...');
    
    const userPubkey = new PublicKey(userWallet);
    const userATA = await getAssociatedTokenAddress(tokenMint, userPubkey);
    const amountLamports = BigInt(Math.floor(failedTx.amount_mkin * 1e9));
    
    console.log(`   From: ${vaultATA.toString()}`);
    console.log(`   To: ${userATA.toString()}`);
    console.log(`   Amount: ${amountLamports.toString()} lamports (${failedTx.amount_mkin} MKIN)`);
    
    // Check if user's ATA exists
    let needsCreateATA = false;
    try {
      await getAccount(connection, userATA);
      console.log(`   ✅ User ATA exists`);
    } catch (e) {
      if (e.name === 'TokenAccountNotFoundError') {
        console.log(`   ⚠️ User ATA does not exist, will create it`);
        needsCreateATA = true;
      } else {
        throw e;
      }
    }
    
    if (dryRun) {
      console.log('\n🧪 DRY RUN MODE - Transaction prepared but NOT sent');
      if (needsCreateATA) {
        console.log('   📝 Would create user ATA (vault pays rent ~0.002 SOL)');
      }
      console.log('\n✅ Recovery simulation successful!');
      console.log('\n💡 To execute for real, run:');
      console.log(`   node gatekeeper/scripts/recover-failed-unstake.js ${userId} --execute\n`);
      return { success: true, dryRun: true };
    }
    
    // 6. Send transaction (LIVE MODE)
    console.log('\n📤 Step 6: Sending token transfer...');
    console.log('⚠️  EXECUTING LIVE TRANSACTION...');
    
    // Build transaction
    const transaction = new Transaction();
    
    // Add create ATA instruction if needed (vault pays for rent)
    if (needsCreateATA) {
      const createATAIx = createAssociatedTokenAccountInstruction(
        vaultKeypair.publicKey, // payer
        userATA,                // ata address
        userPubkey,             // owner
        tokenMint               // mint
      );
      transaction.add(createATAIx);
      console.log(`   📝 Added instruction to create user ATA`);
    }
    
    // Add transfer instruction
    const transferInstruction = createTransferInstruction(
      vaultATA,
      userATA,
      vaultKeypair.publicKey,
      amountLamports
    );
    transaction.add(transferInstruction);
    
    const signature = await connection.sendTransaction(transaction, [vaultKeypair], {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    console.log(`📝 Transaction sent: ${signature}`);
    console.log('⏳ Confirming...');
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`✅ Transaction confirmed!`);
    
    // 7. Update Firestore
    console.log('\n📖 Step 7: Updating database...');
    
    await failedTxDoc.ref.update({
      token_tx: signature,
      status: 'RECOVERED',
      recovered_at: admin.firestore.Timestamp.now(),
      recovered_by: 'manual_recovery_script'
    });
    
    // Log recovery action
    await db.collection('recovery_actions').add({
      type: 'MANUAL_UNSTAKE_RECOVERY',
      user_id: userId,
      user_wallet: userWallet,
      amount_mkin: failedTx.amount_mkin,
      original_tx_id: failedTxDoc.id,
      original_fee_tx: failedTx.fee_tx,
      recovery_tx: signature,
      reason: 'Insufficient vault SOL for gas - manual recovery',
      recovered_at: admin.firestore.Timestamp.now(),
      recovered_by: 'admin'
    });
    
    console.log(`✅ Database updated`);
    
    // 8. Send Discord notification
    console.log('\n📢 Step 8: Sending Discord notification...');
    
    await sendRecoverySuccessAlert({
      userId,
      amount: failedTx.amount_mkin,
      signature
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎉 RECOVERY COMPLETED SUCCESSFULLY!`);
    console.log(`${'='.repeat(80)}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Amount: ${failedTx.amount_mkin.toLocaleString()} MKIN`);
    console.log(`   Transaction: ${signature}`);
    console.log(`   Explorer: https://solscan.io/tx/${signature}`);
    console.log(`${'='.repeat(80)}\n`);
    
    return {
      success: true,
      userId,
      amount: failedTx.amount_mkin,
      signature,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
    
  } catch (error) {
    console.error(`\n❌ RECOVERY FAILED:`, error.message);
    console.error(error.stack);
    
    // Send error alert to Discord
    await sendDiscordAlert({
      level: 'ERROR',
      title: 'Recovery Script Failed',
      message: `Failed to recover unstake for user ${userId}`,
      details: {
        'User ID': userId,
        'Error': error.message
      }
    });
    
    throw error;
  }
}

// Run the script - Always run when executed directly
const userId = process.argv[2];
const executeFlag = process.argv[3];

if (!userId) {
  console.error('❌ Error: User ID required');
  console.log('\nUsage:');
  console.log('  Dry run (simulation):');
  console.log('    node gatekeeper/scripts/recover-failed-unstake.js <USER_ID>');
  console.log('');
  console.log('  Execute (live):');
  console.log('    node gatekeeper/scripts/recover-failed-unstake.js <USER_ID> --execute');
  console.log('');
  process.exit(1);
}

const isExecute = executeFlag === '--execute' || executeFlag === '-e';

if (isExecute) {
  console.log('⚠️  WARNING: You are about to execute a LIVE transaction!');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  
  setTimeout(() => {
    recoverFailedUnstake(userId, false)
      .then((result) => {
        console.log('✅ Recovery script completed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Recovery script failed');
        process.exit(1);
      });
  }, 5000);
} else {
  recoverFailedUnstake(userId, true)
    .then((result) => {
      console.log('✅ Dry run completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Dry run failed');
      process.exit(1);
    });
}

export { recoverFailedUnstake };
