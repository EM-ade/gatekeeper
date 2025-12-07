/**
 * SOL Price Fetching Utility
 * Fetches current SOL/USD price with caching and fallback providers
 */

let cachedPrice = { value: 0, timestamp: 0 };
const CACHE_DURATION = 60000; // 1 minute

/**
 * Fetches current SOL/USD price with caching
 * @returns {Promise<number>} SOL price in USD
 */
async function getSolPriceUSD() {
  const now = Date.now();
  
  // Return cached price if fresh
  if (now - cachedPrice.timestamp < CACHE_DURATION && cachedPrice.value > 0) {
    console.log('[SOL Price] Using cached price: \$' + cachedPrice.value.toFixed(2));
    return cachedPrice.value;
  }
  
  try {
    // Try Jupiter first (Solana-native price aggregator)
    const response = await fetch('https://price.jup.ag/v4/price?ids=SOL');
    const data = await response.json();
    const price = data.data?.SOL?.price;
    
    if (price && price > 0) {
      cachedPrice = { value: price, timestamp: now };
      console.log('[SOL Price] Fetched from Jupiter: \$' + price.toFixed(2));
      return price;
    }
  } catch (err) {
    console.warn('[SOL Price] Jupiter fetch failed:', err.message);
  }
  
  try {
    // Fallback to Binance
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    const data = await response.json();
    const price = parseFloat(data.price);
    
    if (price && price > 0) {
      cachedPrice = { value: price, timestamp: now };
      console.log('[SOL Price] Fetched from Binance: \$' + price.toFixed(2));
      return price;
    }
  } catch (err) {
    console.error('[SOL Price] Binance fetch failed:', err.message);
  }
  
  // Fallback to last cached price or default
  const fallbackPrice = cachedPrice.value || 100;
  console.warn('[SOL Price] Using fallback price: \$' + fallbackPrice.toFixed(2));
  return fallbackPrice;
}

export { getSolPriceUSD };
