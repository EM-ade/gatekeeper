#!/usr/bin/env node
/**
 * Reconcile Staking Positions
 *
 * This script compares staking_transactions with staking_positions to find
 * discrepancies where transactions exist but positions are not updated correctly.
 *
 * Usage:
 *   node scripts/reconcile-staking-positions.js           # Dry run - show discrepancies
 *   node scripts/reconcile-staking-positions.js --repair  # Fix discrepancies
 *   node scripts/reconcile-staking-positions.js --user=<userId>  # Check specific user
 *
 * Created to fix the bug where Firestore transactions with async operations
 * inside were causing position updates to fail silently.
 */

import "dotenv/config";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

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
const shouldRepair = args.includes("--repair");
const specificUserArg = args.find((arg) => arg.startsWith("--user="));
const specificUser = specificUserArg ? specificUserArg.split("=")[1] : null;

/**
 * Calculate expected position from transactions
 */
function calculateExpectedPosition(transactions) {
  let totalStaked = 0;
  let totalUnstaked = 0;
  let totalEntryFeesSol = 0;
  let totalEntryFeesMkinValue = 0;
  let earliestStakeTime = null;
  let latestStakeTime = null;

  for (const tx of transactions) {
    const data = tx.data ? tx.data : tx;
    
    if (data.type === "STAKE") {
      const amount = data.amount_mkin || 0;
      totalStaked += amount;
      totalEntryFeesSol += data.fee_amount_sol || 0;
      totalEntryFeesMkinValue += data.fee_amount_mkin_value || 0;

      const txTime = data.timestamp;
      if (!earliestStakeTime || txTime.seconds < earliestStakeTime.seconds) {
        earliestStakeTime = txTime;
      }
      if (!latestStakeTime || txTime.seconds > latestStakeTime.seconds) {
        latestStakeTime = txTime;
      }
    } else if (data.type === "UNSTAKE") {
      const amount = data.amount_mkin || 0;
      totalUnstaked += amount;
    }
  }

  return {
    expected_principal: totalStaked - totalUnstaked,
    total_staked: totalStaked,
    total_unstaked: totalUnstaked,
    total_entry_fees_sol: totalEntryFeesSol,
    total_entry_fees_mkin_value: totalEntryFeesMkinValue,
    stake_start_time: earliestStakeTime,
    last_stake_time: latestStakeTime,
    transaction_count: transactions.length,
  };
}

/**
 * Get all transactions for a user (without requiring composite index)
 */
async function getUserTransactions(userId, allTransactions = null) {
  // If we have pre-fetched all transactions, filter from that
  if (allTransactions) {
    return allTransactions
      .filter((tx) => tx.data.user_id === userId)
      .sort((a, b) => (a.data.timestamp?.seconds || 0) - (b.data.timestamp?.seconds || 0));
  }

  // Otherwise fetch just for this user (no orderBy to avoid index requirement)
  const snapshot = await db
    .collection("staking_transactions")
    .where("user_id", "==", userId)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }))
    .sort((a, b) => (a.data.timestamp?.seconds || 0) - (b.data.timestamp?.seconds || 0));
}

/**
 * Get staking position for a user
 */
async function getUserPosition(userId) {
  const doc = await db.collection("staking_positions").doc(userId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Repair a user's staking position
 */
async function repairUserPosition(userId, expectedPosition) {
  const now = admin.firestore.Timestamp.now();

  const positionData = {
    user_id: userId,
    principal_amount: expectedPosition.expected_principal,
    total_entry_fees_sol: expectedPosition.total_entry_fees_sol,
    total_entry_fees_mkin_value: expectedPosition.total_entry_fees_mkin_value,
    stake_start_time: expectedPosition.stake_start_time || now,
    last_stake_time: expectedPosition.last_stake_time || now,
    updated_at: now,
    // Preserve existing rewards data, or initialize
    pending_rewards: 0,
    total_accrued_sol: 0,
    total_claimed_sol: 0,
  };

  // Get existing position to preserve some fields
  const existingPos = await getUserPosition(userId);
  if (existingPos) {
    // Preserve reward-related fields if they exist and are valid
    if (typeof existingPos.pending_rewards === "number" && !isNaN(existingPos.pending_rewards)) {
      positionData.pending_rewards = existingPos.pending_rewards;
    }
    if (typeof existingPos.total_accrued_sol === "number" && !isNaN(existingPos.total_accrued_sol)) {
      positionData.total_accrued_sol = existingPos.total_accrued_sol;
    }
    if (typeof existingPos.total_claimed_sol === "number" && !isNaN(existingPos.total_claimed_sol)) {
      positionData.total_claimed_sol = existingPos.total_claimed_sol;
    }
    // Preserve booster data if exists
    if (existingPos.active_boosters) {
      positionData.active_boosters = existingPos.active_boosters;
    }
    if (existingPos.booster_multiplier) {
      positionData.booster_multiplier = existingPos.booster_multiplier;
    }
    if (existingPos.boosters_updated_at) {
      positionData.boosters_updated_at = existingPos.boosters_updated_at;
    }
  }

  await db.collection("staking_positions").doc(userId).set(positionData, { merge: true });
  
  return positionData;
}

/**
 * Check a single user's data
 */
async function checkUser(userId, allTransactions = null) {
  const transactions = await getUserTransactions(userId, allTransactions);
  const position = await getUserPosition(userId);
  const expected = calculateExpectedPosition(transactions);

  const currentPrincipal = position?.principal_amount;
  const hasDiscrepancy =
    transactions.length > 0 &&
    (position === null ||
      currentPrincipal === undefined ||
      currentPrincipal === null ||
      isNaN(currentPrincipal) ||
      Math.abs(currentPrincipal - expected.expected_principal) > 0.001);

  return {
    userId,
    transactions,
    position,
    expected,
    currentPrincipal,
    hasDiscrepancy,
  };
}

/**
 * Main reconciliation function
 */
async function reconcileStakingPositions() {
  console.log("\n🔍 Reconciling Staking Positions...\n");
  console.log(`Mode: ${shouldRepair ? "🔧 REPAIR" : "👀 DRY RUN (use --repair to fix)"}`);
  if (specificUser) {
    console.log(`Checking specific user: ${specificUser}`);
  }
  console.log("");

  try {
    // Pre-fetch all transactions once to avoid multiple queries and index requirements
    console.log("📥 Fetching all transactions...");
    const txSnapshot = await db.collection("staking_transactions").get();
    const allTransactions = txSnapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));
    console.log(`   Found ${allTransactions.length} total transactions\n`);

    let usersToCheck = [];

    if (specificUser) {
      usersToCheck = [specificUser];
    } else {
      // Get all unique user IDs from transactions
      const userIds = new Set();
      allTransactions.forEach((tx) => {
        const userId = tx.data.user_id;
        if (userId) userIds.add(userId);
      });
      usersToCheck = Array.from(userIds);
    }

    console.log(`📊 Checking ${usersToCheck.length} users with transactions...\n`);

    const discrepancies = [];
    const healthy = [];

    for (const userId of usersToCheck) {
      const result = await checkUser(userId, allTransactions);

      if (result.hasDiscrepancy) {
        discrepancies.push(result);
      } else {
        healthy.push(result);
      }
    }

    // Print summary
    console.log("═".repeat(80));
    console.log("📊 SUMMARY");
    console.log("═".repeat(80));
    console.log(`✅ Healthy positions: ${healthy.length}`);
    console.log(`❌ Discrepancies found: ${discrepancies.length}`);
    console.log("");

    if (discrepancies.length === 0) {
      console.log("🎉 No discrepancies found! All positions match transactions.");
      return;
    }

    // Print discrepancies
    console.log("═".repeat(80));
    console.log("❌ DISCREPANCIES DETAIL");
    console.log("═".repeat(80));

    for (const d of discrepancies) {
      console.log("");
      console.log(`👤 User: ${d.userId}`);
      console.log(`   Transactions: ${d.transactions.length}`);
      
      // List transactions
      for (const tx of d.transactions) {
        const data = tx.data;
        const amount = data.type === "STAKE" ? data.amount_mkin : data.amount_mkin;
        const time = data.timestamp?.toDate?.()?.toLocaleString() || "Unknown";
        console.log(`     - ${data.type}: ${amount?.toLocaleString() || 0} MKIN @ ${time}`);
      }

      console.log(`   Expected principal: ${d.expected.expected_principal.toLocaleString()} MKIN`);
      console.log(`   Current principal:  ${d.currentPrincipal === undefined || d.currentPrincipal === null ? "NULL" : isNaN(d.currentPrincipal) ? "NaN" : d.currentPrincipal.toLocaleString()} MKIN`);
      console.log(`   Position exists: ${d.position ? "Yes" : "No"}`);
      
      if (d.position) {
        console.log(`   Position data: principal=${d.position.principal_amount}, principal_old=${d.position.principal}`);
      }

      if (shouldRepair) {
        console.log(`   🔧 Repairing...`);
        const repaired = await repairUserPosition(d.userId, d.expected);
        console.log(`   ✅ Repaired! New principal: ${repaired.principal_amount.toLocaleString()} MKIN`);
      }
    }

    console.log("");
    console.log("═".repeat(80));

    if (shouldRepair) {
      console.log(`\n✅ Repaired ${discrepancies.length} positions!\n`);
    } else {
      console.log(`\n💡 Run with --repair flag to fix these discrepancies:\n`);
      console.log(`   node scripts/reconcile-staking-positions.js --repair\n`);
    }

    // Also check for positions that exist but have no transactions (orphaned)
    console.log("═".repeat(80));
    console.log("🔍 Checking for orphaned positions (positions without transactions)...");
    console.log("═".repeat(80));

    const allPositions = await db.collection("staking_positions").get();
    const orphanedPositions = [];

    for (const posDoc of allPositions.docs) {
      const userId = posDoc.id;
      const txs = await getUserTransactions(userId);
      const posData = posDoc.data();
      
      if (txs.length === 0 && (posData.principal_amount > 0 || posData.principal > 0)) {
        orphanedPositions.push({
          userId,
          principal_amount: posData.principal_amount,
          principal: posData.principal,
        });
      }
    }

    if (orphanedPositions.length > 0) {
      console.log(`\n⚠️ Found ${orphanedPositions.length} orphaned positions (have balance but no transactions):`);
      for (const op of orphanedPositions) {
        console.log(`   👤 ${op.userId}: principal_amount=${op.principal_amount}, principal=${op.principal}`);
      }
      console.log("\n   These may be from direct database edits or older system versions.");
    } else {
      console.log("\n✅ No orphaned positions found.");
    }

  } catch (error) {
    console.error("❌ Error during reconciliation:", error);
    process.exit(1);
  }
}

// Run
reconcileStakingPositions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unhandled error:", err);
    process.exit(1);
  });
