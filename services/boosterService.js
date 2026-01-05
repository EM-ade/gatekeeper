import NFTVerificationService from './nftVerification.js';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

/**
 * BoosterService - Detects NFTs in user wallets and assigns appropriate staking boosters
 *
 * NFT Categories and Multipliers:
 * - Random 1/1: 1.17x multiplier
 * - Custom 1/1: 1.23x multiplier
 * - Solana Miner: 1.27x multiplier
 *
 * Boosters stack multiplicatively for maximum rewards
 */
class BoosterService {
  constructor() {
    // Lazy initialization
    this._db = null;
    this._nftVerification = null;
    
    // NFT category configurations with mint addresses
    this.NFT_CATEGORIES = {
      RANDOM_1_1: {
        name: "Random 1/1",
        type: "random_1_1",
        multiplier: 1.17,
        mints: [
          "4fdpMgnie15mLP8q6AQZbYnvPGQz6FzPrgVVRKfMyeC3",
          "6SVWe3GqymeP6mjgYNXvPnEYj6soi3fCzYxVTvS1kmJL",
          "7Ze45CngJ1DNUZaUYMNBpatDQoVqTL8Yjq2EPUYPVgbh",
          "E21XaE8zaoBZwt2roq7KppxjfFhrcDMpFa7ZMWsFreUh",
          "FMG9Be91LgVd9cb2YX15hPBFJ3iUhH2guB7RbCBFbDbg",
          "J4koZzipRmLjc4QzSbRsn8CdXCZCHUUmTbCSqAtvSJFZ",
          "khoX7jkUK98uMPv2yF9H9ftLJKTesgpmWbuvKpRvW8h",
          // Test NFTs for verification
          "6SABMjQ6DfbnyT5msoVdybVLDQgPfsQhixZufK6xjJun",
          "5MbExwqPUNL8yNuUb8JK9iCXHGGcLXEDkecgZDfSEJfu",
          "GK5yLk7TEML3dudTYwyUgHz2z4iCMgfW6MVNfdThjbs1"
        ]
      },
      CUSTOM_1_1: {
        name: "Custom 1/1",
        type: "custom_1_1", 
        multiplier: 1.23,
        mints: [
          "AN3u7XKFSDCVAe4KopeHRZqpKByR2j9WRkTpq2SQ8ieo",
          "14PaqpEwRntJ3tVhFewBS3bFK8kjk5CX2YeiLWYvVabu",
          "2UsvdbGXg28B2piq3oW1rfMBQTQYhUGhCYRwJfNhUagr",
          "4G44MShUoWPtyQog7fCH6XTgNHqwEjTtcuGpHg4BxJ1p",
          "AukNaSscLLUKZuWm5eRxxukZ76kNt5iTB7Raeeevrhw",
          "HiW5i4yiumjcZHaHpgjAgHdCRZgpX3j6s9vSeukpxuAF",
          "PUjmyCPfyEd92D2cm4pppjGB1ddX6wnnttmEzxBHErD",
          // Test NFTs for verification
          "6SABMjQ6DfbnyT5msoVdybVLDQgPfsQhixZufK6xjJun",
          "5MbExwqPUNL8yNuUb8JK9iCXHGGcLXEDkecgZDfSEJfu",
          "GK5yLk7TEML3dudTYwyUgHz2z4iCMgfW6MVNfdThjbs1"
        ]
      },
      SOLANA_MINER: {
        name: "Solana Miner",
        type: "solana_miner",
        multiplier: 1.27,
        mints: [
          "4dFgb3Zbcu2m3VwEfgxHkDKaijyxyhyhfRvgEfYtbuvc",
          "97psosjbGRs8j9KmG1gDcfiwajAkkzMifMfL1nsGpPZ9",
          "A5E5hsXsydS4ttrs3Y4ZRPLsBb2ormtDKeFcL5D7Q9vj",
          "EWbzAwkxJRZGoSXSuGq3Gz8eNX1g2muXdspsMimEB8EU",
          "HPaU5hLy3XzNygLTcmM1KWa1ceZvFD3xbAP5eCXoDNuh",
          "J4EshVN9yfnrqLcfpVXgVpfXd3ySEJkD2aTwfyiDrqDf",
          // Test NFTs for verification
          "6SABMjQ6DfbnyT5msoVdybVLDQgPfsQhixZufK6xjJun",
          "5MbExwqPUNL8yNuUb8JK9iCXHGGcLXEDkecgZDfSEJfu",
          "GK5yLk7TEML3dudTYwyUgHz2z4iCMgfW6MVNfdThjbs1"
        ]
      }
    };

    // Cache for booster detection results (5 minutes)
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    console.log(`📦 Booster cache TTL: ${this.CACHE_TTL}ms (${this.CACHE_TTL / 1000}s)`);
  }

  get db() {
    if (!this._db) {
      this._db = getFirestore();
    }
    return this._db;
  }

  get nftVerification() {
    if (!this._nftVerification) {
      this._nftVerification = new NFTVerificationService();
    }
    return this._nftVerification;
  }

  /**
   * Get user's wallet address from userRewards collection
   */
  async getUserWalletAddress(firebaseUid) {
    try {
      const userDoc = await this.db
        .collection('userRewards')
        .doc(firebaseUid)
        .get();
      
      if (!userDoc.exists) {
        throw new Error('User not found in userRewards');
      }
      
      return userDoc.data().walletAddress;
    } catch (error) {
      console.error(`Error getting wallet address for ${firebaseUid}:`, error);
      throw error;
    }
  }

  /**
   * Scan user's wallet for eligible NFTs and return detected boosters
   */
  async scanWalletForBoosters(walletAddress) {
    try {
      console.log(`🔍 Scanning wallet ${walletAddress} for booster NFTs...`);
      
      // Get all NFTs from wallet
      const allNFTs = await this.nftVerification.getNFTsByOwner(walletAddress);
      const walletMints = allNFTs.map(nft => nft.id?.toLowerCase());
      
      const detectedBoosters = [];
      
      // Check each category
      for (const [categoryKey, category] of Object.entries(this.NFT_CATEGORIES)) {
        const matchingMints = category.mints.filter(mint => 
          walletMints.includes(mint.toLowerCase())
        );
        
        if (matchingMints.length > 0) {
          detectedBoosters.push({
            type: category.type,
            name: category.name,
            multiplier: category.multiplier,
            category: categoryKey,
            mints: matchingMints,
            detectedAt: new Date()
          });
          
          console.log(`✅ Detected ${category.name} booster (${matchingMints.length} NFTs):`, matchingMints);
        }
      }
      
      return detectedBoosters;
    } catch (error) {
      console.error(`Error scanning wallet ${walletAddress} for boosters:`, error);
      throw error;
    }
  }

  /**
   * Calculate stacked multiplier from multiple boosters
   * Boosters stack multiplicatively: 1.0 × 1.17 × 1.23 × 1.27 = 1.83x
   */
  calculateStackedMultiplier(boosters) {
    if (!boosters || boosters.length === 0) {
      return 1.0;
    }
    
    let totalMultiplier = 1.0;
    
    for (const booster of boosters) {
      totalMultiplier *= booster.multiplier;
    }
    
    return totalMultiplier;
  }

  /**
   * Update user's staking position with detected boosters
   * Creates position document if it doesn't exist to store booster data
   */
  async updateUserBoosters(firebaseUid, detectedBoosters) {
    try {
      const posRef = this.db.collection('staking_positions').doc(firebaseUid);
      
      await this.db.runTransaction(async (t) => {
        const posDoc = await t.get(posRef);
        
        if (!posDoc.exists) {
          console.log(`Creating staking position document for ${firebaseUid} with detected boosters`);
          // Create a minimal staking position document to store booster data
          await t.set(posRef, {
            firebase_uid: firebaseUid,
            principal: 0,
            start_time: admin.firestore.Timestamp.now(),
            accumulated_rewards: 0,
            last_update: admin.firestore.Timestamp.now(),
            active_boosters: detectedBoosters,
            booster_multiplier: this.calculateStackedMultiplier(detectedBoosters),
            boosters_updated_at: admin.firestore.Timestamp.now(),
            created_at: admin.firestore.Timestamp.now()
          });
          return;
        }
        
        const posData = posDoc.data();
        const oldBoosters = posData.active_boosters || [];
        
        // Update with new boosters
        await t.set(posRef, {
          ...posData,
          active_boosters: detectedBoosters,
          booster_multiplier: this.calculateStackedMultiplier(detectedBoosters),
          boosters_updated_at: admin.firestore.Timestamp.now(),
          updated_at: admin.firestore.Timestamp.now()
        });
        
        // Log booster changes
        if (JSON.stringify(oldBoosters) !== JSON.stringify(detectedBoosters)) {
          console.log(`🔄 Updated boosters for ${firebaseUid}:`, {
            old: oldBoosters.length,
            new: detectedBoosters.length,
            multiplier: this.calculateStackedMultiplier(detectedBoosters)
          });
          
          // Add to booster history
          const historyRef = this.db.collection('booster_history').doc();
          await t.set(historyRef, {
            user_id: firebaseUid,
            old_boosters: oldBoosters,
            new_boosters: detectedBoosters,
            old_multiplier: this.calculateStackedMultiplier(oldBoosters),
            new_multiplier: this.calculateStackedMultiplier(detectedBoosters),
            timestamp: admin.firestore.Timestamp.now()
          });
        }
      });
      
      return detectedBoosters;
    } catch (error) {
      console.error(`Error updating boosters for ${firebaseUid}:`, error);
      throw error;
    }
  }

  /**
   * Detect and assign boosters for a user
   * Main entry point for booster detection
   * Returns detected boosters even if database update fails
   */
  async detectAndAssignBoosters(firebaseUid) {
    try {
      // Check cache first
      const cacheKey = `boosters_${firebaseUid}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        console.log(`📦 Using cached boosters for ${firebaseUid}`);
        return cached.boosters;
      }
      
      // Get user's wallet address
      const walletAddress = await this.getUserWalletAddress(firebaseUid);
      if (!walletAddress) {
        console.log(`No wallet address found for ${firebaseUid}`);
        return [];
      }
      
      // Scan wallet for eligible NFTs
      const detectedBoosters = await this.scanWalletForBoosters(walletAddress);
      
      // Try to update user's staking position, but return boosters anyway
      try {
        await this.updateUserBoosters(firebaseUid, detectedBoosters);
      } catch (updateError) {
        console.warn(`Failed to update database with boosters for ${firebaseUid}, but will still return detected boosters:`, updateError);
      }
      
      // Cache result
      this.cache.set(cacheKey, {
        boosters: detectedBoosters,
        timestamp: Date.now()
      });
      
      return detectedBoosters;
    } catch (error) {
      console.error(`Error detecting boosters for ${firebaseUid}:`, error);
      // Return empty array instead of throwing to allow staking page to load
      return [];
    }
  }

  /**
   * Refresh boosters for a specific user (bypasses cache)
   */
  async refreshUserBoosters(firebaseUid) {
    // Clear cache for this user
    const cacheKey = `boosters_${firebaseUid}`;
    this.cache.delete(cacheKey);
    
    // Redetect boosters
    return await this.detectAndAssignBoosters(firebaseUid);
  }

  /**
   * Get current boosters for a user (from cache or database)
   */
  async getUserBoosters(firebaseUid) {
    try {
      // Check cache first
      const cacheKey = `boosters_${firebaseUid}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        return cached.boosters;
      }
      
      // Get from database
      const posDoc = await this.db
        .collection('staking_positions')
        .doc(firebaseUid)
        .get();
      
      if (!posDoc.exists) {
        return [];
      }
      
      const boosters = posDoc.data().active_boosters || [];
      
      // Cache result
      this.cache.set(cacheKey, {
        boosters: boosters,
        timestamp: Date.now()
      });
      
      return boosters;
    } catch (error) {
      console.error(`Error getting boosters for ${firebaseUid}:`, error);
      return [];
    }
  }

  /**
   * Get all available booster categories (for frontend display)
   */
  getBoosterCategories() {
    return Object.entries(this.NFT_CATEGORIES).map(([key, category]) => ({
      key,
      name: category.name,
      type: category.type,
      multiplier: category.multiplier,
      mintCount: category.mints.length
    }));
  }

  /**
   * Periodic scanning of all active staking users
   * Call this from a scheduled job
   */
  async refreshAllActiveBoosters() {
    try {
      console.log('🔄 Starting periodic booster refresh for all active stakers...');
      
      // Get all users with active staking positions
      const positionsSnapshot = await this.db
        .collection('staking_positions')
        .where('principal_amount', '>', 0)
        .get();
      
      const refreshPromises = [];
      
      for (const doc of positionsSnapshot.docs) {
        const firebaseUid = doc.id;
        refreshPromises.push(
          this.refreshUserBoosters(firebaseUid).catch(error => {
            console.error(`Failed to refresh boosters for ${firebaseUid}:`, error);
          })
        );
      }
      
      await Promise.all(refreshPromises);
      
      console.log(`✅ Completed booster refresh for ${positionsSnapshot.size} active stakers`);
    } catch (error) {
      console.error('Error in periodic booster refresh:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}

export default BoosterService;
