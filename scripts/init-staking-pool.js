/**
 * Initialize Firestore Staking Pool
 *
 * This script creates the global staking pool document in Firestore
 * with initial values for testing.
 */

import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (rawEnv) {
      let content = rawEnv.replace(/^\uFEFF/, "").trim();

      // Strip surrounding single quotes if present
      if (content.startsWith("'") && content.endsWith("'")) {
        content = content.slice(1, -1);
      }

      if (content.startsWith("{")) {
        svcJson = JSON.parse(content);
      } else if (/\.json$/i.test(content)) {
        const fileStr = fs.readFileSync(content, "utf8").replace(/^\uFEFF/, "");
        svcJson = JSON.parse(fileStr);
      }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      svcJson = JSON.parse(fs.readFileSync(credPath, "utf8"));
    }

    if (svcJson) {
      if (svcJson.private_key && typeof svcJson.private_key === "string") {
        svcJson.private_key = svcJson.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({
        credential: admin.credential.cert(svcJson),
      });
      console.log("✅ Firebase Admin initialized");
    } else {
      console.error("❌ No Firebase credentials found");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Firebase initialization failed:", err.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function initializeStakingPool() {
  console.log("\n🚀 Initializing Staking Pool...\n");

  const poolRef = db.collection("staking_pool").doc("global");

  const poolData = {
    total_staked: 0,
    acc_reward_per_share: 0,
    reward_pool_sol: 10, // 10 SOL available for distribution
    reward_per_second: 0.0001, // ~8.64 SOL per day total pool emissions
    last_update_time: admin.firestore.Timestamp.now(),
    created_at: admin.firestore.Timestamp.now(),
    updated_at: admin.firestore.Timestamp.now(),
  };

  try {
    // Check if pool already exists
    const existingPool = await poolRef.get();

    if (existingPool.exists) {
      console.log("⚠️  Staking pool already exists!");
      console.log("Current data:", existingPool.data());
      console.log(
        "\nDo you want to overwrite? (This will reset all pool state)"
      );
      console.log(
        "If yes, delete the document manually and run this script again."
      );
      process.exit(0);
    }

    // Create the pool
    await poolRef.set(poolData);

    console.log("✅ Staking pool initialized successfully!\n");
    console.log("Pool Configuration:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Total Staked:          ${poolData.total_staked} MKIN`);
    console.log(`  Reward Pool:           ${poolData.reward_pool_sol} SOL`);
    console.log(`  Reward Per Second:     ${poolData.reward_per_second} SOL`);
    console.log(
      `  Est. Daily Emissions:  ${(poolData.reward_per_second * 86400).toFixed(
        4
      )} SOL`
    );
    console.log(`  Acc Reward Per Share:  ${poolData.acc_reward_per_share}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("🎉 You can now start testing the staking system!\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error initializing pool:", error);
    process.exit(1);
  }
}

initializeStakingPool();
