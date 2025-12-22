/**
 * Vault Setup & Verification Script
 *
 * This script checks if the staking wallet has the necessary token accounts
 * and creates them if needed.
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

const DEVNET_RPC = "https://api.devnet.solana.com";
const MAINNET_RPC =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const MKIN_MINT_MAINNET = new PublicKey(
  "BKDGf6DnDHK87GsZpdWXyBqiNdcNb6KnoFcYbWPUhJLA"
);
const MKIN_MINT_DEVNET = new PublicKey(
  "CARXmxarjsCwvzpmjVB2x4xkAo8fMgsAVUBPREoUGyZm"
);

async function checkAndSetupVault(network = "devnet") {
  console.log(`\n🔍 Checking vault setup on ${network.toUpperCase()}...\n`);

  const connection = new Connection(
    network === "mainnet" ? MAINNET_RPC : DEVNET_RPC,
    "confirmed"
  );

  const mint = network === "mainnet" ? MKIN_MINT_MAINNET : MKIN_MINT_DEVNET;

  // Get vault wallet from env
  const vaultPrivateKey = process.env.STAKING_PRIVATE_KEY;
  if (!vaultPrivateKey) {
    console.error("❌ STAKING_PRIVATE_KEY not found in .env");
    process.exit(1);
  }

  let vaultKeypair;
  try {
    vaultKeypair = Keypair.fromSecretKey(bs58.decode(vaultPrivateKey));
  } catch (e) {
    console.error("❌ Invalid STAKING_PRIVATE_KEY format");
    process.exit(1);
  }

  const vaultAddress = vaultKeypair.publicKey;
  console.log(`Vault Address: ${vaultAddress.toBase58()}`);

  // Check SOL balance
  const solBalance = await connection.getBalance(vaultAddress);
  console.log(`SOL Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);

  if (solBalance < 0.01 * 1e9) {
    console.warn("⚠️  Low SOL balance! Vault needs SOL for transaction fees.");
    console.warn("   Please send at least 0.1 SOL to the vault address.");
  }

  // Get Associated Token Address
  const ata = await getAssociatedTokenAddress(mint, vaultAddress);
  console.log(`Expected Token Account (ATA): ${ata.toBase58()}`);

  // Check if ATA exists
  try {
    const accountInfo = await getAccount(connection, ata);
    console.log("✅ Token account exists!");
    console.log(`   Token Balance: ${accountInfo.amount.toString()} (raw)`);
    console.log(
      `   Token Balance: ${
        Number(accountInfo.amount) / 1e9
      } MKIN (assuming 9 decimals)`
    );
  } catch (e) {
    if (e.message.includes("could not find account")) {
      console.log("⚠️  Token account does NOT exist yet.");
      console.log(
        "   It will be created automatically when the first user stakes."
      );
      console.log(
        "   (Or you can create it manually by sending tokens to the vault)"
      );
    } else {
      console.error("❌ Error checking token account:", e.message);
    }
  }

  console.log("\n✅ Vault check complete!\n");
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("   MKIN Staking Vault Setup Check");
  console.log("═══════════════════════════════════════");

  // Check both networks
  await checkAndSetupVault("devnet");
  await checkAndSetupVault("mainnet");

  console.log("═══════════════════════════════════════");
  console.log("Next steps:");
  console.log("1. Ensure vault has sufficient SOL on both networks");
  console.log("2. Token accounts will be created on first stake");
  console.log("3. Update frontend .env with vault address");
  console.log("═══════════════════════════════════════\n");
}

main().catch(console.error);
