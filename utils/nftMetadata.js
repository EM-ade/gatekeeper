import fetch from 'node-fetch';
import Redis from 'ioredis';

// Optional Redis client with graceful fallback to in-memory cache
let redis = null;
const useRedis = !!process.env.REDIS_URL; // Only use Redis if URL is provided
const memoryCache = new Map();

if (useRedis) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    redis.on('error', (err) => {
      console.warn('[nftMetadata] Redis error detected, falling back to in-memory cache:', err.message);
      redis = null;
    });
    // Attempt initial connection, but don't crash if it fails
    redis.connect().catch(err => {
      console.warn('[nftMetadata] Redis connect failed, falling back to in-memory cache:', err.message);
      redis = null;
    });
  } catch (err) {
    console.warn('[nftMetadata] Redis initialization failed, using in-memory cache:', err.message);
    redis = null;
  }
} else {
  console.log('[nftMetadata] REDIS_URL not set. Using in-memory cache.');
}

// Environment Variables
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const REALMKIN_COLLECTION_ADDRESS = process.env.REALMKIN_COLLECTION_ADDRESS || "eTQujiFKVvLJXdkAobg9JqULNdDrCt5t4WtDochmVSZ";

// Elemental advantage multipliers (less punishing disadvantages)
const ELEMENTAL_MULTIPLIERS = {
  FIRE: { NATURE: 1.3, LIGHTNING: 0.8, LIGHT: 0.9, NEUTRAL: 1.0 },
  NATURE: { LIGHTNING: 1.3, FIRE: 0.8, LIGHT: 0.9, NEUTRAL: 1.0 },
  LIGHTNING: { FIRE: 1.3, NATURE: 0.8, LIGHT: 0.9, NEUTRAL: 1.0 },
  LIGHT: { FIRE: 1.1, NATURE: 1.1, LIGHTNING: 1.1, NEUTRAL: 1.1 },
  NEUTRAL: { FIRE: 1.0, NATURE: 1.0, LIGHTNING: 1.0, LIGHT: 0.9 }
};

// Base stats for different rarities
const RARITY_BASE_STATS = {
  COMMON: { attack: 50, defense: 50, health: 100 },
  UNCOMMON: { attack: 60, defense: 60, health: 120 },
  RARE: { attack: 70, defense: 70, health: 140 },
  EPIC: { attack: 80, defense: 80, health: 160 },
  LEGENDARY: { attack: 90, defense: 90, health: 180 }
};

/**
 * Fetch NFT metadata from Helius API
 */
const fetchNftMetadataFromHelius = async (nftId) => {
  if (!HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY is not configured');
  }

  try {
    const response = await fetch(`https://api.helius.xyz/v0/tokens/${nftId}?api-key=${HELIUS_API_KEY}`);
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching NFT metadata from Helius:', error);
    throw error;
  }
};

/**
 * Extract traits from NFT metadata
 */
const extractTraits = (metadata) => {
  const traits = {};
  if (metadata.attributes && Array.isArray(metadata.attributes)) {
    metadata.attributes.forEach(attr => {
      traits[attr.trait_type?.toUpperCase()] = attr.value;
    });
  }
  return traits;
};

/**
 * Map NFT metadata to game stats
 */
const mapMetadataToGameStats = (metadata) => {
  const traits = extractTraits(metadata);
  
  const rarity = traits.RARITY || 'COMMON';
  const element = traits.ELEMENT || 'NEUTRAL';
  
  const baseStats = RARITY_BASE_STATS[rarity.toUpperCase()] || RARITY_BASE_STATS.COMMON;
  
  // Apply trait bonuses
  const attackBonus = parseInt(traits.ATTACK) || 0;
  const defenseBonus = parseInt(traits.DEFENSE) || 0;
  
  return {
    name: metadata.name || `Realmkin #${metadata.mint.slice(0, 8)}`,
    rarity: rarity.toUpperCase(),
    element: element.toUpperCase(),
    baseAttack: baseStats.attack + attackBonus,
    baseDefense: baseStats.defense + defenseBonus,
    baseHealth: baseStats.health,
    traits: traits
  };
};

/**
 * Get elemental multiplier for combat
 */
export const getElementMultiplier = (attackerElement, defenderElement) => {
  const attacker = attackerElement.toUpperCase();
  const defender = defenderElement.toUpperCase();
  
  if (ELEMENTAL_MULTIPLIERS[attacker] && ELEMENTAL_MULTIPLIERS[attacker][defender]) {
    return ELEMENTAL_MULTIPLIERS[attacker][defender];
  }
  
  return 1.0; // Default multiplier
};

/**
 * Fetch and cache NFT metadata with Redis
 */
export const fetchAndCacheNftMetadata = async (nftId) => {
  const cacheKey = `nft:${nftId}`;
  
  try {
    // Check cache first (Redis if available, else memory)
    if (redis) {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        console.log(`Cache hit (redis) for NFT ${nftId}`);
        return JSON.parse(cachedData);
      }
    } else if (memoryCache.has(cacheKey)) {
      console.log(`Cache hit (memory) for NFT ${nftId}`);
      return memoryCache.get(cacheKey);
    }
    
    console.log(`Cache miss for NFT ${nftId}, fetching from API`);
    const metadata = await fetchNftMetadataFromHelius(nftId);
    const gameStats = mapMetadataToGameStats(metadata);
    
    // Cache for 24 hours
    if (redis) {
      await redis.setex(cacheKey, 86400, JSON.stringify(gameStats));
    } else {
      memoryCache.set(cacheKey, gameStats);
      // Optionally implement a TTL cleanup for memory cache
      setTimeout(() => memoryCache.delete(cacheKey), 86400 * 1000).unref?.();
    }
    
    return gameStats;
  } catch (error) {
    console.error(`Error fetching/caching NFT ${nftId}:`, error);
    
    // Fallback: return basic stats if API fails
    return {
      name: `Realmkin #${nftId.slice(0, 8)}`,
      rarity: 'COMMON',
      element: 'NEUTRAL',
      baseAttack: 50,
      baseDefense: 50,
      baseHealth: 100,
      traits: {}
    };
  }
};

/**
 * Get multiple NFTs metadata with batch processing
 */
export const getMultipleNftsMetadata = async (nftIds) => {
  const results = [];
  
  for (const nftId of nftIds) {
    try {
      const metadata = await fetchAndCacheNftMetadata(nftId);
      results.push({ nftId, ...metadata });
    } catch (error) {
      console.error(`Failed to get metadata for NFT ${nftId}:`, error);
      results.push({ 
        nftId, 
        name: `Realmkin #${nftId.slice(0, 8)}`,
        rarity: 'COMMON',
        element: 'NEUTRAL',
        baseAttack: 50,
        baseDefense: 50,
        baseHealth: 100,
        error: 'Failed to fetch metadata'
      });
    }
  }
  
  return results;
};

/**
 * Invalidate NFT cache (useful for metadata updates)
 */
export const invalidateNftCache = async (nftId) => {
  const key = `nft:${nftId}`;
  if (redis) {
    await redis.del(key);
  } else {
    memoryCache.delete(key);
  }
  console.log(`Invalidated cache for NFT ${nftId}`);
};

/**
 * Get cached NFT count (for monitoring)
 */
export const getCachedNftCount = async () => {
  if (redis) {
    const keys = await redis.keys('nft:*');
    return keys.length;
  }
  return memoryCache.size;
};

// Export the mapping function for testing and external use
export { mapMetadataToGameStats };

export default {
  fetchAndCacheNftMetadata,
  getMultipleNftsMetadata,
  getElementMultiplier,
  invalidateNftCache,
  getCachedNftCount,
  mapMetadataToGameStats
};
