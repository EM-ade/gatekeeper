#!/usr/bin/env node
/**
 * Backfill Locked Token Price
 *
 * For existing staking positions that don't have locked_token_price_sol,
 * this script sets it to the current MKIN/SOL price.
 *
 * This ensures existing users see a stable mining rate going forward
 * instead of fluctuating rates based on token price changes.
 *
 * Usage: 
 *   node scripts/backfill-locked-token-price.js --dry-run    # Preview changes without applying
 *   node scripts/backfill-locked-token-price.js              # Apply changes
 */

import "dotenv/config";

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run") || args.includes("-d");
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

// Import the existing price utility
import { getMkinPriceSOL } from "../utils/mkinPrice.js";

async function backfillLockedTokenPrice() {
  console.log("\n🔧 Backfilling Locked Token Price for Existing Stakes...\n");
  
  if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
    console.log("=".repeat(80));
  }

  try {
    // First, get the current MKIN/SOL price
    console.log("📊 Fetching current MKIN/SOL price...");
    const currentPrice = await getMkinPriceSOL();
    console.log(`✅ Current price: ${currentPrice.toFixed(9)} SOL/MKIN\n`);

    // Get all staking positions
    const positionsSnapshot = await db.collection("staking_positions").get();

    if (positionsSnapshot.empty) {
      console.log("⚠️ No staking positions found!");
      return;
    }

    console.log(`📊 Found ${positionsSnapshot.size} staking positions\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let noStakeCount = 0;
    
    // For dry-run comparison table
    const comparisonData = [];

    for (const posDoc of positionsSnapshot.docs) {
      const userId = posDoc.id;
      const position = posDoc.data();

      // Skip if no principal (user has unstaked everything)
      if (!position.principal_amount || position.principal_amount <= 0) {
        if (!DRY_RUN) {
          console.log(`⏭️  ${userId}: No active stake (principal: ${position.principal_amount || 0})`);
        }
        noStakeCount++;
        continue;
      }

      const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
      const ROI_PERCENT = 0.3;
      const boosterMultiplier = position.booster_multiplier || 1.0;
      
      // Calculate current (dynamic) mining rate
      const currentBaseMiningRate = (position.principal_amount * ROI_PERCENT * currentPrice) / SECONDS_IN_YEAR;
      const currentMiningRate = currentBaseMiningRate * boosterMultiplier;
      
      // Check if already has locked price
      const existingLockedPrice = position.locked_token_price_sol;
      
      if (existingLockedPrice) {
        // Calculate what the locked rate would be
        const lockedBaseMiningRate = (position.principal_amount * ROI_PERCENT * existingLockedPrice) / SECONDS_IN_YEAR;
        const lockedMiningRate = lockedBaseMiningRate * boosterMultiplier;
        
        if (DRY_RUN) {
          comparisonData.push({
            userId: userId.substring(0, 20) + (userId.length > 20 ? '...' : ''),
            principal: position.principal_amount,
            lockedPrice: existingLockedPrice,
            currentPrice: currentPrice,
            lockedRate: lockedMiningRate,
            currentRate: currentMiningRate,
            weeklyLocked: lockedMiningRate * 60 * 60 * 24 * 7,
            weeklyCurrent: currentMiningRate * 60 * 60 * 24 * 7,
            status: "HAS_LOCKED"
          });
        } else {
          console.log(`✅ ${userId}: Already has locked_token_price_sol (${existingLockedPrice.toFixed(9)} SOL/MKIN)`);
        }
        skippedCount++;
        continue;
      }

      // Will be updated - calculate new locked rate (same as current since we're using current price)
      if (DRY_RUN) {
        comparisonData.push({
          userId: userId.substring(0, 20) + (userId.length > 20 ? '...' : ''),
          principal: position.principal_amount,
          lockedPrice: currentPrice, // Will be set to current
          currentPrice: currentPrice,
          lockedRate: currentMiningRate, // Same as current since locking at current price
          currentRate: currentMiningRate,
          weeklyLocked: currentMiningRate * 60 * 60 * 24 * 7,
          weeklyCurrent: currentMiningRate * 60 * 60 * 24 * 7,
          status: "WILL_UPDATE"
        });
      } else {
        console.log(`🔧 ${userId}: Missing locked_token_price_sol, backfilling...`);
        console.log(`   Principal: ${position.principal_amount.toLocaleString()} MKIN`);
        console.log(`   Display mining rate: ${currentMiningRate.toFixed(12)} SOL/s`);
        console.log(`   (${(currentMiningRate * 60 * 60 * 24 * 7).toFixed(6)} SOL/week)`);

        // Update position with locked price
        await db
          .collection("staking_positions")
          .doc(userId)
          .update({
            locked_token_price_sol: currentPrice,
          });

        console.log(`   ✅ Set locked_token_price_sol to ${currentPrice.toFixed(9)} SOL/MKIN\n`);
      }
      updatedCount++;
    }

    // Print comparison table for dry run
    if (DRY_RUN && comparisonData.length > 0) {
      console.log("\n📊 COMPARISON TABLE - Mining Rates (Current vs Locked)\n");
      console.log("=".repeat(120));
      console.log(
        "User ID".padEnd(25) +
        "Principal (MKIN)".padEnd(18) +
        "Status".padEnd(14) +
        "Locked Price".padEnd(16) +
        "Weekly (Locked)".padEnd(18) +
        "Weekly (Current)".padEnd(18) +
        "Difference"
      );
      console.log("-".repeat(120));

      for (const row of comparisonData) {
        const diff = row.weeklyLocked - row.weeklyCurrent;
        const diffPercent = row.weeklyCurrent > 0 ? ((diff / row.weeklyCurrent) * 100).toFixed(1) : 0;
        const diffStr = diff >= 0 ? `+${diff.toFixed(6)}` : diff.toFixed(6);
        
        console.log(
          row.userId.padEnd(25) +
          row.principal.toLocaleString().padEnd(18) +
          row.status.padEnd(14) +
          row.lockedPrice.toFixed(9).padEnd(16) +
          (row.weeklyLocked.toFixed(6) + " SOL").padEnd(18) +
          (row.weeklyCurrent.toFixed(6) + " SOL").padEnd(18) +
          `${diffStr} (${diffPercent}%)`
        );
      }
      console.log("=".repeat(120));
    }

    console.log(`\n${"=".repeat(60)}`);
    if (DRY_RUN) {
      console.log(`🔍 DRY RUN SUMMARY (no changes made)`);
    } else {
      console.log(`✅ Backfill complete!`);
    }
    console.log(`   - ${DRY_RUN ? "Would update" : "Updated"}: ${updatedCount} positions`);
    console.log(`   - Already had locked price: ${skippedCount} positions`);
    console.log(`   - No active stake: ${noStakeCount} positions`);
    console.log(`   - ${DRY_RUN ? "Would lock at" : "Locked"} price: ${currentPrice.toFixed(9)} SOL/MKIN`);
    if (DRY_RUN) {
      console.log(`\n💡 To apply changes, run without --dry-run flag:`);
      console.log(`   node scripts/backfill-locked-token-price.js`);
    }
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    process.exit(1);
  }
}

// Run
backfillLockedTokenPrice()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unhandled error:", err);
    process.exit(1);
  });
