#!/usr/bin/env node
/**
 * Fund Staking Pool
 * 
 * This script helps you fund the staking pool with SOL for rewards.
 * After transferring SOL to the vault, it updates the Firestore pool document.
 * 
 * Usage: node scripts/fund-staking-pool.js <amount_in_sol>
 */

import "dotenv/config";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
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
      console.log("✅ Firebase Admin initialized");
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
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

async function fundPool() {
  const amountArg = process.argv[2];
  
  if (!amountArg) {
    console.log("\n📋 Usage: node scripts/fund-staking-pool.js <amount_in_sol>");
    console.log("   Example: node scripts/fund-staking-pool.js 100\n");
    process.exit(1);
  }

  const fundAmount = parseFloat(amountArg);
  
  if (isNaN(fundAmount) || fundAmount <= 0) {
    console.error("❌ Invalid amount. Must be a positive number.");
    process.exit(1);
  }

  console.log("\n💰 Funding Staking Pool...\n");

  const vaultAddress = process.env.STAKING_WALLET_ADDRESS;
  
  if (!vaultAddress) {
    console.error("❌ STAKING_WALLET_ADDRESS not set in .env");
    process.exit(1);
  }

  try {
    // Check vault balance
    const vaultPubkey = new PublicKey(vaultAddress);
    const balance = await connection.getBalance(vaultPubkey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    
    console.log(`📊 Current Vault Status:`);
    console.log(`   Address: ${vaultAddress}`);
    console.log(`   Balance: ${balanceSOL.toFixed(4)} SOL\n`);

    // Get current pool data
    const poolRef = db.collection("staking_pool").doc("staking_global");
    const poolDoc = await poolRef.get();
    
    if (!poolDoc.exists) {
      console.error("❌ Staking pool not initialized. Run init-staking-pool.js first.");
      process.exit(1);
    }

    const currentPoolData = poolDoc.data();
    const currentRewardPool = currentPoolData.reward_pool_sol || 0;
    
    console.log(`📈 Current Pool Data (Firestore):`);
    console.log(`   Reward Pool: ${currentRewardPool.toFixed(4)} SOL`);
    console.log(`   Total Staked: ${currentPoolData.total_staked} MKIN\n`);

    // Calculate new reward pool amount
    const newRewardPool = currentRewardPool + fundAmount;
    
    console.log(`💵 Funding Summary:`);
    console.log(`   Adding: ${fundAmount.toFixed(4)} SOL`);
    console.log(`   New Pool Balance: ${newRewardPool.toFixed(4)} SOL\n`);

    console.log(`⚠️  IMPORTANT: Before proceeding, ensure you have transferred`);
    console.log(`   ${fundAmount.toFixed(4)} SOL to the vault address:`);
    console.log(`   ${vaultAddress}\n`);

    console.log(`   After transfer, the vault should have at least:`);
    console.log(`   ${(balanceSOL + fundAmount).toFixed(4)} SOL\n`);

    console.log(`   Do you want to update the Firestore pool with this amount?`);
    console.log(`   This will enable ${fundAmount.toFixed(4)} SOL in rewards for stakers.\n`);

    // Update pool
    await poolRef.update({
      reward_pool_sol: admin.firestore.FieldValue.increment(fundAmount),
      updated_at: admin.firestore.Timestamp.now(),
    });

    console.log(`✅ Pool funded successfully!`);
    console.log(`   New reward pool balance: ${newRewardPool.toFixed(4)} SOL`);
    
    // Calculate APR
    const totalStaked = currentPoolData.total_staked || 0;
    if (totalStaked > 0) {
      const annualReward = newRewardPool; // Simplified: entire pool over 1 year
      const apr = (annualReward / totalStaked) * 100;
      console.log(`   Estimated APR: ${apr.toFixed(2)}%`);
    }
    
    console.log("\n✅ Staking pool is ready to distribute rewards!\n");

  } catch (error) {
    console.error("❌ Error funding pool:", error);
    process.exit(1);
  }
}

// Run funding
fundPool()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unhandled error:", err);
    process.exit(1);
  });
