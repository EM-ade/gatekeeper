#!/usr/bin/env node
/**
 * Check Current APR
 * 
 * This script calculates and displays the current APR based on
 * the staking pool data in Firestore.
 * 
 * Usage: node scripts/check-apr.js
 */

import "dotenv/config";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const svcJson = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(svcJson),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    } else {
      console.error("❌ GOOGLE_APPLICATION_CREDENTIALS not set");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Firebase initialization failed:", err);
    process.exit(1);
  }
}

const db = getFirestore();

async function checkAPR() {
  console.log("\n📊 Checking Current APR...\n");

  try {
    // Get pool data
    const poolRef = db.collection("staking_pool").doc("staking_global");
    const poolDoc = await poolRef.get();

    if (!poolDoc.exists) {
      console.error("❌ Staking pool not initialized!");
      console.log("   Run: node scripts/init-staking-pool.js");
      process.exit(1);
    }

    const pool = poolDoc.data();

    console.log("🎯 Pool Status:");
    console.log(`   Total Staked: ${pool.total_staked.toLocaleString()} MKIN`);
    console.log(`   Reward Pool: ${pool.reward_pool_sol.toFixed(4)} SOL`);
    console.log(`   Last Updated: ${pool.last_reward_time?.toDate()?.toLocaleString()}`);
    console.log("");

    // Calculate APR
    if (pool.total_staked === 0) {
      console.log("⚠️  No one has staked yet!");
      console.log("   APR: N/A (waiting for first staker)");
      console.log("");
      console.log("💡 When someone stakes, APR will be:");
      console.log(`   APR = (${pool.reward_pool_sol.toFixed(2)} SOL / X MKIN) * 100%`);
      console.log("");
      console.log("   Examples:");
      console.log(`   - If 1,000 MKIN staked: ${((pool.reward_pool_sol / 1000) * 100).toFixed(2)}% APR`);
      console.log(`   - If 10,000 MKIN staked: ${((pool.reward_pool_sol / 10000) * 100).toFixed(2)}% APR`);
      console.log(`   - If 100,000 MKIN staked: ${((pool.reward_pool_sol / 100000) * 100).toFixed(2)}% APR`);
    } else {
      const apr = (pool.reward_pool_sol / pool.total_staked) * 100;
      
      console.log("📈 Current APR:");
      console.log(`   ${apr.toFixed(2)}% 🔥`);
      console.log("");
      
      // Show what users earn
      console.log("💰 Earning Examples:");
      console.log(`   If you stake 1,000 MKIN:`);
      console.log(`     Daily: ${((pool.reward_pool_sol / 365) * (1000 / pool.total_staked)).toFixed(4)} SOL`);
      console.log(`     Monthly: ${((pool.reward_pool_sol / 365) * 30 * (1000 / pool.total_staked)).toFixed(4)} SOL`);
      console.log(`     Yearly: ${((pool.reward_pool_sol) * (1000 / pool.total_staked)).toFixed(4)} SOL`);
      console.log("");
      
      console.log(`   If you stake 10,000 MKIN:`);
      console.log(`     Daily: ${((pool.reward_pool_sol / 365) * (10000 / pool.total_staked)).toFixed(4)} SOL`);
      console.log(`     Monthly: ${((pool.reward_pool_sol / 365) * 30 * (10000 / pool.total_staked)).toFixed(4)} SOL`);
      console.log(`     Yearly: ${((pool.reward_pool_sol) * (10000 / pool.total_staked)).toFixed(4)} SOL`);
    }

    console.log("");
    console.log("📅 Pool Longevity:");
    const daysRemaining = pool.reward_pool_sol > 0 ? 365 * (pool.reward_pool_sol / (pool.reward_pool_sol || 1)) : 0;
    console.log(`   At current rate, pool will last: ${Math.floor(daysRemaining)} days`);
    console.log(`   (Assuming no new rewards added)`);
    console.log("");

    // Check vault balance
    const vaultAddress = process.env.STAKING_WALLET_ADDRESS;
    if (vaultAddress) {
      console.log("🏦 Vault Address:");
      console.log(`   ${vaultAddress}`);
      console.log("");
      console.log("💡 To add more rewards:");
      console.log(`   1. Send SOL to vault: ${vaultAddress}`);
      console.log(`   2. Update Firestore: node scripts/fund-staking-pool.js <amount>`);
    }

    console.log("");

  } catch (error) {
    console.error("❌ Error checking APR:", error);
    process.exit(1);
  }
}

// Run
checkAPR()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unhandled error:", err);
    process.exit(1);
  });
