#!/usr/bin/env node
/**
 * Create Staking Position
 *
 * This admin script creates staking positions for users directly in Firestore.
 * Useful for manual corrections, migrations, or testing.
 *
 * Usage:
 *   node scripts/create-staking-position.js --user=<userId> --amount=<MKIN>
 *   node scripts/create-staking-position.js --user=<userId> --amount=<MKIN> --dry-run
 *   node scripts/create-staking-position.js --batch=<file.json>
 *   node scripts/create-staking-position.js --batch=<file.json> --dry-run
 *
 * Options:
 *   --user=<userId>     Firebase UID of the user
 *   --amount=<MKIN>     Amount of MKIN to stake (in display units, not raw)
 *   --dry-run           Show what would be created without actually creating
 *   --batch=<file>      JSON file with array of {userId, amount} objects
 *   --force             Skip user existence validation
 *   --help              Show this help message
 *
 * Examples:
 *   # Create single position (dry run)
 *   node scripts/create-staking-position.js --user=abc123 --amount=1000 --dry-run
 *
 *   # Create single position
 *   node scripts/create-staking-position.js --user=abc123 --amount=1000
 *
 *   # Batch create from file
 *   node scripts/create-staking-position.js --batch=positions.json
 *
 * Batch file format (positions.json):
 *   [
 *     { "userId": "abc123", "amount": 1000 },
 *     { "userId": "def456", "amount": 2500 }
 *   ]
 */

import "dotenv/config";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Collection names
const POSITIONS_COLLECTION = "staking_positions";
const POOL_COLLECTION = "staking_pool";
const POOL_DOC_ID = "staking_global";
const USER_REWARDS_COLLECTION = "userRewards";
const TRANSACTIONS_COLLECTION = "staking_transactions";

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      let content = rawEnv.replace(/^\uFEFF/, "").trim();
      if (content.startsWith("'") && content.endsWith("'")) {
        content = content.slice(1, -1);
      }

      let svcJson = content.startsWith("{")
        ? JSON.parse(content)
        : JSON.parse(fs.readFileSync(content, "utf8"));

      if (svcJson.private_key && typeof svcJson.private_key === "string") {
        svcJson.private_key = svcJson.private_key.replace(/\\n/g, "\n");
      }

      admin.initializeApp({
        credential: admin.credential.cert(svcJson),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      console.log(
        "✅ Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT_JSON"
      );
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const svcJson = JSON.parse(fs.readFileSync(credPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(svcJson),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      console.log(
        "✅ Firebase Admin initialized via GOOGLE_APPLICATION_CREDENTIALS"
      );
    } else {
      console.error("❌ No Firebase credentials found in environment");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Firebase initialization failed:", err);
    process.exit(1);
  }
}

const db = getFirestore();

// Parse command line arguments
const args = process.argv.slice(2);

function getArg(name) {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const userId = getArg("user");
const amount = getArg("amount") ? parseFloat(getArg("amount")) : null;
const batchFile = getArg("batch");
const isDryRun = hasFlag("dry-run");
const forceCreate = hasFlag("force");
const showHelp = hasFlag("help");

// Show help
if (showHelp) {
  console.log(`
Create Staking Position - Admin Script
========================================

Usage:
  node scripts/create-staking-position.js --user=<userId> --amount=<MKIN>
  node scripts/create-staking-position.js --user=<userId> --amount=<MKIN> --dry-run
  node scripts/create-staking-position.js --batch=<file.json>

Options:
  --user=<userId>     Firebase UID of the user
  --amount=<MKIN>     Amount of MKIN to stake (display units)
  --dry-run           Preview without making changes
  --batch=<file>      JSON file with array of {userId, amount}
  --force             Skip user validation
  --help              Show this help

Batch file format:
  [
    { "userId": "abc123", "amount": 1000 },
    { "userId": "def456", "amount": 2500 }
  ]
  `);
  process.exit(0);
}

// Validate arguments
if (!batchFile && (!userId || amount === null)) {
  console.error("❌ Error: Either --user and --amount, or --batch is required");
  console.error("   Use --help for usage information");
  process.exit(1);
}

if (amount !== null && (isNaN(amount) || amount <= 0)) {
  console.error("❌ Error: Amount must be a positive number");
  process.exit(1);
}

/**
 * Verify user exists in userRewards collection
 */
async function verifyUserExists(uid) {
  const userDoc = await db.collection(USER_REWARDS_COLLECTION).doc(uid).get();
  return userDoc.exists;
}

/**
 * Get user wallet address from userRewards
 */
async function getUserWalletAddress(uid) {
  const userDoc = await db.collection(USER_REWARDS_COLLECTION).doc(uid).get();
  if (!userDoc.exists) return null;
  return userDoc.data().walletAddress || null;
}

/**
 * Get existing staking position
 */
async function getExistingPosition(uid) {
  const posDoc = await db.collection(POSITIONS_COLLECTION).doc(uid).get();
  return posDoc.exists ? posDoc.data() : null;
}

/**
 * Create or update staking position for a user
 */
async function createStakingPosition(uid, stakeAmount, dryRun = false) {
  const now = admin.firestore.Timestamp.now();
  
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📋 Processing: User ${uid}`);
  console.log(`   Amount: ${stakeAmount.toLocaleString()} MKIN`);
  console.log(`${"─".repeat(60)}`);

  // 1. Verify user exists (unless --force)
  if (!forceCreate) {
    const userExists = await verifyUserExists(uid);
    if (!userExists) {
      console.error(`❌ User ${uid} not found in ${USER_REWARDS_COLLECTION}`);
      console.error(`   Use --force to skip this validation`);
      return { success: false, error: "User not found" };
    }
    console.log(`✅ User verified in ${USER_REWARDS_COLLECTION}`);
    
    const walletAddress = await getUserWalletAddress(uid);
    if (walletAddress) {
      console.log(`   Wallet: ${walletAddress}`);
    }
  } else {
    console.log(`⚠️ Skipping user validation (--force)`);
  }

  // 2. Check for existing position
  const existingPosition = await getExistingPosition(uid);
  if (existingPosition) {
    console.log(`⚠️ Existing position found:`);
    console.log(`   Principal: ${existingPosition.principal_amount?.toLocaleString() || 0} MKIN`);
    console.log(`   Pending Rewards: ${existingPosition.pending_rewards?.toFixed(9) || 0} SOL`);
    console.log(`   Total Claimed: ${existingPosition.total_claimed_sol?.toFixed(9) || 0} SOL`);
    console.log(`   Created: ${existingPosition.created_at?.toDate?.()?.toISOString() || 'N/A'}`);
    console.log(`   Will ADD ${stakeAmount} MKIN to existing position`);
  }

  // 3. Prepare position data
  const newPrincipal = (existingPosition?.principal_amount || 0) + stakeAmount;
  
  const positionData = {
    user_id: uid,
    principal_amount: newPrincipal,
    pending_rewards: existingPosition?.pending_rewards || 0,
    total_accrued_sol: existingPosition?.total_accrued_sol || 0,
    total_claimed_sol: existingPosition?.total_claimed_sol || 0,
    total_entry_fees_sol: existingPosition?.total_entry_fees_sol || 0,
    total_entry_fees_mkin_value: existingPosition?.total_entry_fees_mkin_value || 0,
    active_boosters: existingPosition?.active_boosters || [],
    booster_multiplier: existingPosition?.booster_multiplier || 1.0,
    stake_start_time: existingPosition?.stake_start_time || now,
    last_stake_time: now,
    created_at: existingPosition?.created_at || now,
    updated_at: now,
    // Admin tracking fields
    admin_created: !existingPosition,
    admin_modified_at: now,
    admin_note: `Admin script: ${existingPosition ? 'added' : 'created'} ${stakeAmount} MKIN`,
  };

  // 4. Prepare transaction record
  const transactionData = {
    user_id: uid,
    type: "STAKE",
    amount_mkin: stakeAmount,
    signature: `ADMIN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fee_tx: null,
    fee_amount_sol: 0,
    fee_amount_mkin_value: 0,
    fee_percent: 0,
    admin_created: true,
    admin_note: "Created via admin script",
    timestamp: now,
  };

  console.log(`\n📝 Position data to ${existingPosition ? 'update' : 'create'}:`);
  console.log(`   Principal: ${newPrincipal.toLocaleString()} MKIN`);
  console.log(`   Stake Start: ${positionData.stake_start_time.toDate().toISOString()}`);
  console.log(`   Last Stake: ${positionData.last_stake_time.toDate().toISOString()}`);

  if (dryRun) {
    console.log(`\n🔍 DRY RUN - No changes made`);
    console.log(`   Would ${existingPosition ? 'update' : 'create'} position: ${uid}`);
    console.log(`   Would create transaction record`);
    console.log(`   Would update global pool total`);
    return { 
      success: true, 
      dryRun: true, 
      userId: uid, 
      amount: stakeAmount,
      newPrincipal 
    };
  }

  // 5. Execute Firestore transaction
  try {
    await db.runTransaction(async (t) => {
      const posRef = db.collection(POSITIONS_COLLECTION).doc(uid);
      const poolRef = db.collection(POOL_COLLECTION).doc(POOL_DOC_ID);
      const txRef = db.collection(TRANSACTIONS_COLLECTION).doc();

      // Get current pool data
      const poolDoc = await t.get(poolRef);
      let poolData = poolDoc.exists
        ? poolDoc.data()
        : {
            total_staked: 0,
            reward_pool_sol: 0,
            acc_reward_per_share: 0,
            last_reward_time: now,
          };

      // Update pool total
      poolData.total_staked = (poolData.total_staked || 0) + stakeAmount;
      poolData.updated_at = now;

      // Write all documents
      t.set(posRef, positionData);
      t.set(poolRef, poolData);
      t.set(txRef, transactionData);

      console.log(`\n✍️ Writing to Firestore...`);
      console.log(`   - Position: ${POSITIONS_COLLECTION}/${uid}`);
      console.log(`   - Pool: ${POOL_COLLECTION}/${POOL_DOC_ID}`);
      console.log(`   - Transaction: ${TRANSACTIONS_COLLECTION}/${txRef.id}`);
    });

    console.log(`\n✅ Successfully ${existingPosition ? 'updated' : 'created'} staking position!`);
    console.log(`   User: ${uid}`);
    console.log(`   New Principal: ${newPrincipal.toLocaleString()} MKIN`);
    
    return { 
      success: true, 
      userId: uid, 
      amount: stakeAmount,
      newPrincipal,
      wasUpdate: !!existingPosition
    };

  } catch (error) {
    console.error(`\n❌ Failed to create position:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Process batch file
 */
async function processBatchFile(filePath, dryRun) {
  console.log(`\n📂 Loading batch file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  let positions;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    positions = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse batch file: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(positions)) {
    console.error(`❌ Batch file must contain an array of positions`);
    process.exit(1);
  }

  console.log(`📋 Found ${positions.length} positions to process`);

  const results = {
    total: positions.length,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    console.log(`\n[${ i + 1}/${positions.length}] Processing...`);

    if (!pos.userId || !pos.amount) {
      console.error(`❌ Invalid entry: missing userId or amount`);
      results.failed++;
      results.errors.push({ index: i, error: "Missing userId or amount" });
      continue;
    }

    if (typeof pos.amount !== "number" || pos.amount <= 0) {
      console.error(`❌ Invalid amount: ${pos.amount}`);
      results.failed++;
      results.errors.push({ index: i, userId: pos.userId, error: "Invalid amount" });
      continue;
    }

    const result = await createStakingPosition(pos.userId, pos.amount, dryRun);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({ index: i, userId: pos.userId, error: result.error });
    }
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔧 CREATE STAKING POSITION - Admin Script`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE"}`);

  if (batchFile) {
    // Batch mode
    const results = await processBatchFile(batchFile, isDryRun);
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 BATCH RESULTS`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Total: ${results.total}`);
    console.log(`Success: ${results.success}`);
    console.log(`Failed: ${results.failed}`);
    
    if (results.errors.length > 0) {
      console.log(`\n❌ Errors:`);
      results.errors.forEach((err) => {
        console.log(`   [${err.index}] ${err.userId || 'N/A'}: ${err.error}`);
      });
    }

    if (isDryRun) {
      console.log(`\n🔍 This was a DRY RUN. Run without --dry-run to apply changes.`);
    }

  } else {
    // Single user mode
    const result = await createStakingPosition(userId, amount, isDryRun);
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 RESULT`);
    console.log(`${"=".repeat(60)}`);
    
    if (result.success) {
      console.log(`✅ Operation completed successfully`);
      if (isDryRun) {
        console.log(`\n🔍 This was a DRY RUN. Run without --dry-run to apply changes.`);
      }
    } else {
      console.log(`❌ Operation failed: ${result.error}`);
      process.exit(1);
    }
  }

  console.log(`\n`);
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
