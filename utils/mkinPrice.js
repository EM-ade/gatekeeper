/**
 * MKIN Token Price Fetching
 * 
 * Gets the current MKIN/SOL and MKIN/USD prices
 */

// Cache for price data
let priceCache = {
  mkinSol: null,
  mkinUsd: null,
  timestamp: 0,
  ttl: 60 * 1000, // 1 minute cache
};

/**
 * Fetch MKIN price from Jupiter (Solana DEX aggregator)
 * This is the most accurate for Solana tokens
 * 
 * NOTE: Jupiter only works for:
 * - Verified tokens on mainnet
 * - Tokens with active DEX pairs
 */
async function fetchMkinPriceFromJupiter() {
  try {
    // Check if we're on devnet or if token is unverified
    const isDevnet = process.env.SOLANA_RPC_URL?.includes('devnet');
    if (isDevnet) {
      console.log("⚠️ On devnet - Jupiter price not available");
      return null;
    }

    const tokenMint = process.env.MKIN_TOKEN_MINT;
    if (!tokenMint) {
      console.warn("⚠️ MKIN_TOKEN_MINT not configured");
      return null;
    }
    
    const response = await fetch(
      `https://price.jup.ag/v4/price?ids=${tokenMint}`,
      { timeout: 5000 }
    );
    
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.data?.[tokenMint]?.price;
    
    if (!price || isNaN(price)) {
      throw new Error("Token not found on Jupiter (likely unverified or no liquidity)");
    }
    
    console.log(`✅ Jupiter MKIN price: $${price}`);
    return { usd: price };
  } catch (error) {
    console.warn("❌ Jupiter MKIN price failed:", error.message);
    return null;
  }
}

/**
 * Fetch MKIN/SOL pair price from DEX (if available)
 */
async function fetchMkinSolPairPrice() {
  try {
    // TODO: Add Raydium/Orca pool price fetching
    // For now, calculate from USD prices
    return null;
  } catch (error) {
    console.warn("❌ MKIN/SOL pair price failed:", error.message);
    return null;
  }
}

/**
 * Get MKIN price in USD
 * 
 * Priority:
 * 1. Manual configuration (MKIN_PRICE_USD env var)
 * 2. Jupiter API (mainnet verified tokens only)
 * 3. Fallback ($1 default)
 */
export async function getMkinPriceUSD() {
  // Check cache first
  const now = Date.now();
  if (priceCache.mkinUsd && (now - priceCache.timestamp) < priceCache.ttl) {
    console.log(`📦 Using cached MKIN price: $${priceCache.mkinUsd}`);
    return priceCache.mkinUsd;
  }

  console.log("🔍 Fetching fresh MKIN price...");

  // Priority 1: Manual configuration (for devnet/unverified tokens)
  if (process.env.MKIN_PRICE_USD) {
    const manualPrice = parseFloat(process.env.MKIN_PRICE_USD);
    if (!isNaN(manualPrice) && manualPrice > 0) {
      console.log(`✅ Using configured MKIN price: $${manualPrice}`);
      priceCache = {
        mkinUsd: manualPrice,
        mkinSol: null,
        timestamp: now,
        ttl: 60 * 1000,
      };
      return manualPrice;
    }
  }

  // Priority 2: Try Jupiter (mainnet only)
  const jupiterPrice = await fetchMkinPriceFromJupiter();
  if (jupiterPrice) {
    priceCache = {
      mkinUsd: jupiterPrice.usd,
      mkinSol: null,
      timestamp: now,
      ttl: 60 * 1000,
    };
    return jupiterPrice.usd;
  }

  // Priority 3: Fallback ($1 default)
  console.warn("⚠️ All MKIN price sources failed! Using fallback: $1");
  console.warn("💡 Set MKIN_PRICE_USD in .env to configure manually");
  return 1.0;
}

/**
 * Get MKIN price in SOL
 * This calculates MKIN/SOL ratio using USD prices
 */
export async function getMkinPriceSOL() {
  try {
    const { getSolPriceUSD } = await import("./solPrice.js");
    
    const [mkinUsd, solUsd] = await Promise.all([
      getMkinPriceUSD(),
      getSolPriceUSD()
    ]);
    
    const mkinSol = mkinUsd / solUsd;
    
    console.log(`💱 MKIN price: $${mkinUsd} | SOL price: $${solUsd} | MKIN/SOL: ${mkinSol.toFixed(6)}`);
    
    return mkinSol;
  } catch (error) {
    console.error("Error calculating MKIN/SOL price:", error);
    // Fallback: 1 MKIN = 0.01 SOL (if SOL = $100 and MKIN = $1)
    return 0.01;
  }
}

/**
 * Calculate staking fee in SOL for a given MKIN amount
 * @param {number} mkinAmount - Amount of MKIN being staked
 * @param {number} feePercent - Fee percentage (default 5%)
 * @returns {Object} - { feeInMkin, feeInSol, mkinPrice, solPrice }
 */
export async function calculateStakingFee(mkinAmount, feePercent = 5) {
  const feeInMkin = mkinAmount * (feePercent / 100);
  const mkinSolPrice = await getMkinPriceSOL();
  const feeInSol = feeInMkin * mkinSolPrice;
  
  const mkinUsd = await getMkinPriceUSD();
  const { getSolPriceUSD } = await import("./solPrice.js");
  const solUsd = await getSolPriceUSD();
  
  console.log(`💰 Staking fee calculation:`);
  console.log(`   Amount: ${mkinAmount} MKIN`);
  console.log(`   Fee %: ${feePercent}%`);
  console.log(`   Fee (MKIN value): ${feeInMkin} MKIN`);
  console.log(`   Fee (SOL): ${feeInSol.toFixed(6)} SOL`);
  console.log(`   MKIN price: $${mkinUsd}`);
  console.log(`   SOL price: $${solUsd}`);
  
  return {
    feeInMkin,
    feeInSol,
    mkinPriceUsd: mkinUsd,
    solPriceUsd: solUsd,
    feePercent,
  };
}
