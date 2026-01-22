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
 * Usage: node scripts/backfill-locked-token-price.js
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

/**
 * Fetch current MKIN/SOL price from Jupiter
 */
async function getMkinPriceSOL() {
  const MKIN_MINT = "MKiNfTBT83DH1GK4azYyypSvQVPhN3E3tGYiHcR2BPR";
  const SOL_MINT = "So11111111111111111111111111111111111111112";

  try {
    // Try Jupiter Price API
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${MKIN_MINT}&vsToken=${SOL_MINT}`
    );
    const data = await response.json();

    if (data?.data?.[MKIN_MINT]?.price) {
      const price = parseFloat(data.data[MKIN_MINT].price);
      console.log(`📊 Jupiter price: ${price.toFixed(9)} SOL/MKIN`);
      return price;
    }

    // Fallback to quote API
    console.log("⚠️ Jupiter Price API failed, trying quote API...");
    const quoteRes = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${MKIN_MINT}&outputMint=${SOL_MINT}&amount=1000000000&slippageBps=50`
    );
    const quoteData = await quoteRes.json();

    if (quoteData?.outAmount) {
      const price = parseInt(quoteData.outAmount) / 1e9;
      console.log(`📊 Jupiter quote price: ${price.toFixed(9)} SOL/MKIN`);
      return price;
    }

    throw new Error("Could not fetch MKIN price");
  } catch (error) {
    console.error("❌ Error fetching MKIN price:", error);
    throw error;
  }
}

async function backfillLockedTokenPrice() {
  console.log("\n🔧 Backfilling Locked Token Price for Existing Stakes...\n");

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

    for (const posDoc of positionsSnapshot.docs) {
      const userId = posDoc.id;
      const position = posDoc.data();

      // Skip if no principal (user has unstaked everything)
      if (!position.principal_amount || position.principal_amount <= 0) {
        console.log(`⏭️  ${userId}: No active stake (principal: ${position.principal_amount || 0})`);
        noStakeCount++;
        continue;
      }

      // Skip if already has locked_token_price_sol
      if (position.locked_token_price_sol) {
        console.log(`✅ ${userId}: Already has locked_token_price_sol (${position.locked_token_price_sol.toFixed(9)} SOL/MKIN)`);
        skippedCount++;
        continue;
      }

      console.log(`🔧 ${userId}: Missing locked_token_price_sol, backfilling...`);
      console.log(`   Principal: ${position.principal_amount.toLocaleString()} MKIN`);

      // Calculate what their display mining rate will be
      const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
      const ROI_PERCENT = 0.3;
      const baseMiningRate = (position.principal_amount * ROI_PERCENT * currentPrice) / SECONDS_IN_YEAR;
      const boosterMultiplier = position.booster_multiplier || 1.0;
      const displayMiningRate = baseMiningRate * boosterMultiplier;

      console.log(`   Display mining rate: ${displayMiningRate.toFixed(12)} SOL/s`);
      console.log(`   (${(displayMiningRate * 60 * 60 * 24 * 7).toFixed(6)} SOL/week)`);

      // Update position with locked price
      await db
        .collection("staking_positions")
        .doc(userId)
        .update({
          locked_token_price_sol: currentPrice,
        });

      console.log(`   ✅ Set locked_token_price_sol to ${currentPrice.toFixed(9)} SOL/MKIN\n`);
      updatedCount++;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ Backfill complete!`);
    console.log(`   - Updated: ${updatedCount} positions`);
    console.log(`   - Already had locked price: ${skippedCount} positions`);
    console.log(`   - No active stake: ${noStakeCount} positions`);
    console.log(`   - Locked price used: ${currentPrice.toFixed(9)} SOL/MKIN`);
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
