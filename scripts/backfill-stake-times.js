#!/usr/bin/env node
/**
 * Backfill Stake Start Times
 *
 * For existing stakes that don't have stake_start_time,
 * this script sets it to the earliest transaction time or updated_at.
 *
 * Usage: node scripts/backfill-stake-times.js
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

async function backfillStakeTimes() {
  console.log("\n🔧 Backfilling Stake Times...\n");

  try {
    // Get all staking positions
    const positionsSnapshot = await db.collection("staking_positions").get();

    if (positionsSnapshot.empty) {
      console.log("⚠️ No staking positions found!");
      return;
    }

    console.log(`📊 Found ${positionsSnapshot.size} staking positions\n`);

    let updatedCount = 0;

    for (const posDoc of positionsSnapshot.docs) {
      const userId = posDoc.id;
      const position = posDoc.data();

      // Skip if already has stake_start_time
      if (position.stake_start_time) {
        console.log(`✅ ${userId}: Already has stake_start_time`);
        continue;
      }

      console.log(`🔧 ${userId}: Missing stake_start_time, backfilling...`);

      // Try to find earliest stake transaction
      const txSnapshot = await db
        .collection("staking_transactions")
        .where("user_id", "==", userId)
        .where("type", "==", "STAKE")
        .orderBy("timestamp", "asc")
        .limit(1)
        .get();

      let stakeStartTime;

      if (!txSnapshot.empty) {
        // Use earliest stake transaction time
        stakeStartTime = txSnapshot.docs[0].data().timestamp;
        console.log(
          `   Found earliest stake transaction: ${stakeStartTime
            .toDate()
            .toLocaleString()}`
        );
      } else {
        // Fallback to updated_at or now
        stakeStartTime = position.updated_at || admin.firestore.Timestamp.now();
        console.log(
          `   No stake transaction found, using updated_at: ${stakeStartTime
            .toDate()
            .toLocaleString()}`
        );
      }

      // Update position
      await db
        .collection("staking_positions")
        .doc(userId)
        .update({
          stake_start_time: stakeStartTime,
          last_stake_time: position.updated_at || stakeStartTime,
        });

      console.log(`   ✅ Updated stake_start_time`);
      updatedCount++;
    }

    console.log(`\n✅ Backfill complete! Updated ${updatedCount} positions\n`);
  } catch (error) {
    console.error("❌ Error during backfill:", error);
    process.exit(1);
  }
}

// Run
backfillStakeTimes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unhandled error:", err);
    process.exit(1);
  });
