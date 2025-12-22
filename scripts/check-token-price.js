#!/usr/bin/env node
/**
 * Check Token Price
 * 
 * Fetches and displays token prices from multiple sources
 * Usage: node scripts/check-token-price.js <TOKEN_MINT_ADDRESS>
 */

import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";

const tokenMint = process.argv[2];

if (!tokenMint) {
  console.log("\n❌ Usage: node scripts/check-token-price.js <TOKEN_MINT_ADDRESS>\n");
  console.log("Examples:");
  console.log("  Mainnet MKIN: node scripts/check-token-price.js BKDGf6DnDHK87GsZpdWXyBqiNdcNb6KnoFcYbWPUhJLA");
  console.log("  Devnet MKIN:  node scripts/check-token-price.js CARXmxarjsCwvzpmjVB2x4xkAo8fMgsAVUBPREoUGyZm\n");
  process.exit(1);
}

console.log("\n🔍 Checking Token Price...\n");
console.log(`Token Mint: ${tokenMint}\n`);

// Check SOL price first
async function getSolPrice() {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT");
    const data = await response.json();
    return parseFloat(data.price);
  } catch (e) {
    console.warn("⚠️ Failed to fetch SOL price from Binance");
    return 150; // Fallback
  }
}

// Check Jupiter
async function checkJupiter() {
  try {
    console.log("🔍 Checking Jupiter API...");
    const response = await fetch(`https://price.jup.ag/v4/price?ids=${tokenMint}`, {
      timeout: 5000
    });
    
    if (!response.ok) {
      throw new Error(`Jupiter API returned ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.data?.[tokenMint]?.price;
    
    if (!price) {
      throw new Error("Token not found on Jupiter");
    }
    
    console.log(`✅ Jupiter Price: $${price}`);
    return { usd: price, source: "Jupiter" };
  } catch (e) {
    console.log(`❌ Jupiter: ${e.message}`);
    return null;
  }
}

// Check if token has metadata
async function checkTokenMetadata() {
  try {
    console.log("\n🔍 Checking Token Metadata...");
    // Allow override with --mainnet flag
    const forceMainnet = process.argv.includes('--mainnet');
    let rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    
    if (forceMainnet) {
      rpcUrl = "https://api.mainnet-beta.solana.com";
      console.log("   Using mainnet RPC (forced with --mainnet flag)");
    }
    
    const connection = new Connection(rpcUrl, "confirmed");
    
    const mintPubkey = new PublicKey(tokenMint);
    const accountInfo = await connection.getAccountInfo(mintPubkey);
    
    if (!accountInfo) {
      console.log("❌ Token account not found (invalid mint or wrong network)");
      return null;
    }
    
    console.log("✅ Token account exists");
    console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
    console.log(`   Data length: ${accountInfo.data.length} bytes`);
    
    // Try to get token supply
    try {
      const supply = await connection.getTokenSupply(mintPubkey);
      console.log(`   Supply: ${Number(supply.value.amount) / Math.pow(10, supply.value.decimals)}`);
      console.log(`   Decimals: ${supply.value.decimals}`);
    } catch (e) {
      console.log(`   Could not fetch supply: ${e.message}`);
    }
    
    return accountInfo;
  } catch (e) {
    console.log(`❌ Metadata check failed: ${e.message}`);
    return null;
  }
}

// Check Raydium (if mainnet)
async function checkRaydium() {
  try {
    console.log("\n🔍 Checking Raydium...");
    // Raydium API endpoint
    const response = await fetch(`https://api.raydium.io/v2/main/price/${tokenMint}`);
    
    if (!response.ok) {
      throw new Error("Token not listed on Raydium");
    }
    
    const data = await response.json();
    console.log(`✅ Raydium Price: $${data.price}`);
    return { usd: data.price, source: "Raydium" };
  } catch (e) {
    console.log(`❌ Raydium: ${e.message}`);
    return null;
  }
}

// Check DexScreener
async function checkDexScreener() {
  try {
    console.log("\n🔍 Checking DexScreener...");
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    
    if (!response.ok) {
      throw new Error("Token not found on DexScreener");
    }
    
    const data = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      throw new Error("No trading pairs found");
    }
    
    const pair = data.pairs[0]; // Get most liquid pair
    console.log(`✅ DexScreener Price: $${pair.priceUsd}`);
    console.log(`   Pair: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}`);
    console.log(`   DEX: ${pair.dexId}`);
    console.log(`   Liquidity: $${parseFloat(pair.liquidity?.usd || 0).toLocaleString()}`);
    console.log(`   24h Volume: $${parseFloat(pair.volume?.h24 || 0).toLocaleString()}`);
    
    return { usd: parseFloat(pair.priceUsd), source: "DexScreener" };
  } catch (e) {
    console.log(`❌ DexScreener: ${e.message}`);
    return null;
  }
}

// Main execution
async function main() {
  const forceMainnet = process.argv.includes('--mainnet');
  const isDevnet = !forceMainnet && (process.env.SOLANA_RPC_URL?.includes('devnet') || process.argv.includes('--devnet'));
  
  if (forceMainnet) {
    console.log("🌐 Forcing MAINNET check (--mainnet flag)\n");
  } else if (isDevnet) {
    console.log("⚠️  Detected DEVNET - most price APIs won't work\n");
    console.log("💡 To check mainnet token, add --mainnet flag:\n");
    console.log(`   node scripts/check-token-price.js ${tokenMint} --mainnet\n`);
  }
  
  // Check token metadata
  await checkTokenMetadata();
  
  // Try price sources
  const prices = [];
  
  const jupiterPrice = await checkJupiter();
  if (jupiterPrice) prices.push(jupiterPrice);
  
  if (!isDevnet) {
    const raydiumPrice = await checkRaydium();
    if (raydiumPrice) prices.push(raydiumPrice);
    
    const dexScreenerPrice = await checkDexScreener();
    if (dexScreenerPrice) prices.push(dexScreenerPrice);
  }
  
  // Get SOL price
  const solPrice = await getSolPrice();
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 PRICE SUMMARY");
  console.log("=".repeat(60) + "\n");
  
  if (prices.length === 0) {
    console.log("❌ No prices found!\n");
    console.log("Possible reasons:");
    console.log("  • Token is on devnet (no price data available)");
    console.log("  • Token not verified/listed on any DEX");
    console.log("  • No liquidity pools exist for this token");
    console.log("  • Wrong network (check RPC URL)\n");
    console.log("💡 For devnet or unlisted tokens, set MKIN_PRICE_USD manually in .env\n");
  } else {
    console.log(`SOL Price: $${solPrice.toFixed(2)}\n`);
    
    prices.forEach((p, i) => {
      console.log(`${i + 1}. ${p.source}: $${p.usd}`);
      console.log(`   Token/SOL ratio: ${(p.usd / solPrice).toFixed(6)} SOL per token`);
    });
    
    // Calculate average
    const avgPrice = prices.reduce((sum, p) => sum + p.usd, 0) / prices.length;
    console.log(`\nAverage Price: $${avgPrice.toFixed(6)}`);
    console.log(`Token/SOL Ratio: ${(avgPrice / solPrice).toFixed(6)}`);
    
    // Calculate entry fee example
    console.log("\n" + "=".repeat(60));
    console.log("💰 ENTRY FEE CALCULATION (5%)");
    console.log("=".repeat(60) + "\n");
    
    const stakeAmount = 1000;
    const feePercent = 5;
    const feeInTokenValue = stakeAmount * (feePercent / 100);
    const feeInSol = (feeInTokenValue * avgPrice) / solPrice;
    
    console.log(`If you stake ${stakeAmount} tokens:`);
    console.log(`  Fee (5%): ${feeInTokenValue} tokens`);
    console.log(`  Fee value: $${(feeInTokenValue * avgPrice).toFixed(2)}`);
    console.log(`  Fee in SOL: ${feeInSol.toFixed(6)} SOL`);
    
    console.log("\n💡 To use this price, add to gatekeeper/.env:");
    console.log(`   MKIN_PRICE_USD=${avgPrice.toFixed(6)}\n`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  });
