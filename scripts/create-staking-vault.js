#!/usr/bin/env node
/**
 * Create Staking Vault Wallet
 * 
 * This script creates a new Solana keypair to use as the staking vault.
 * The vault will hold staked MKIN tokens and reward SOL.
 * 
 * Usage: node scripts/create-staking-vault.js
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

console.log("\n🔐 Creating Staking Vault Wallet...\n");

// Generate new keypair
const keypair = Keypair.generate();

// Get public key (wallet address)
const publicKey = keypair.publicKey.toBase58();

// Get private key in base58 format (for .env)
const privateKeyBase58 = bs58.encode(keypair.secretKey);

// Get private key as array (alternative format)
const privateKeyArray = Array.from(keypair.secretKey);

console.log("✅ Vault Wallet Created!\n");
console.log("📋 Add these to your gatekeeper/.env:\n");
console.log("STAKING_WALLET_ADDRESS=" + publicKey);
console.log("STAKING_PRIVATE_KEY=" + privateKeyBase58);
console.log("\n⚠️  IMPORTANT NEXT STEPS:");
console.log("1. Add the above variables to gatekeeper/.env");
console.log("2. Fund this wallet with SOL for transaction fees (~0.1 SOL)");
console.log("3. Fund the reward pool with SOL for staking rewards");
console.log("4. This wallet will hold users' staked MKIN tokens\n");
console.log("💡 To fund the wallet on devnet:");
console.log(`   solana airdrop 1 ${publicKey} --url devnet\n`);
console.log("💡 To fund the wallet on mainnet:");
console.log(`   solana transfer ${publicKey} 0.1 --from your-wallet.json\n`);
console.log("🔒 Keep the private key SECRET! Never commit it to git.\n");
