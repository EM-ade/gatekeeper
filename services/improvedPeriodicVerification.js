/**
 * Improved Periodic Verification Service
 * 
 * Improvements:
 * 1. Better user rotation (don't check same users repeatedly)
 * 2. Priority queue (new users, VIPs, whales first)
 * 3. Smarter scheduling (skip recently verified users)
 * 4. Cleanup old sessions
 */

import sql from '../db.js';
import NFTVerificationService from './nftVerification.js';
import { heliusRateLimiter } from '../utils/rateLimiter.js';
import rateLimitingConfig from '../config/rateLimiting.js';

const { BATCH_SIZE, DELAY_BETWEEN_BATCHES, DELAY_BETWEEN_USERS, MAX_USERS_PER_RUN } = 
  rateLimitingConfig.verification;

class ImprovedPeriodicVerificationService {
  constructor(client) {
    this.client = client;
    this.nftService = new NFTVerificationService();
    this.isRunning = false;
    this.runInterval = 6 * 60 * 60 * 1000; // 6 hours
    this.intervalId = null;
  }

  /**
   * Start periodic verification
   */
  start() {
    if (this.intervalId) {
      console.log('[periodic-verification] Already running');
      return;
    }

    console.log('[periodic-verification] Starting service (runs every 6 hours)');
    
    // Run immediately on start
    this.runVerification();
    
    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.runVerification();
    }, this.runInterval);
  }

  /**
   * Stop periodic verification
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[periodic-verification] Service stopped');
    }
  }

  /**
   * Main verification run with improved user selection
   */
  async runVerification() {
    if (this.isRunning) {
      console.log('[periodic-verification] Already running, skipping this cycle');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('[periodic-verification] Starting verification run...');

      // Step 1: Cleanup old verification sessions
      await this.cleanupOldSessions();

      // Step 2: Get users with priority
      const users = await this.getUsersWithPriority();

      if (users.length === 0) {
        console.log('[periodic-verification] No users to verify');
        return;
      }

      console.log(`[periodic-verification] Selected ${users.length} users to verify`);

      // Step 3: Process users in batches
      let checked = 0;
      let rolesAdded = 0;
      let rolesRemoved = 0;
      let errors = 0;

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        console.log(`[periodic-verification] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(users.length/BATCH_SIZE)}`);

        // Process batch sequentially to avoid rate limits
        for (let j = 0; j < batch.length; j++) {
          const user = batch[j];
          
          try {
            const result = await this.checkAndUpdateUser(user);
            checked++;
            
            if (result?.rolesAdded) rolesAdded += result.rolesAdded;
            if (result?.rolesRemoved) rolesRemoved += result.rolesRemoved;
            
            // Update last verification check time
            await this.updateLastCheckTime(user.discord_id);
            
            // Add delay between users in the same batch
            if (j < batch.length - 1) {
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS));
            }
          } catch (err) {
            console.error(`[periodic-verification] Error checking user ${user.discord_id}:`, err.message);
            errors++;
          }
        }

        // Delay between batches
        if (i + BATCH_SIZE < users.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[periodic-verification] Completed: ${checked} checked, ${rolesAdded} roles added, ${rolesRemoved} roles removed, ${errors} errors (${duration}s)`);

    } catch (error) {
      console.error('[periodic-verification] Run failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get users with priority-based selection
   * Priority order:
   * 1. New users (never verified)
   * 2. Users not checked in 24+ hours
   * 3. VIP/Whale holders (high NFT count)
   * 4. Recently active users
   * 5. Everyone else (oldest check first)
   */
  async getUsersWithPriority() {
    try {
      const users = await sql`
        WITH user_stats AS (
          SELECT 
            u.discord_id,
            u.guild_id,
            u.wallet_address,
            u.username,
            u.is_verified,
            u.last_verification_check,
            u.created_at,
            COALESCE(uvh.nft_count, 0) as nft_count,
            EXTRACT(EPOCH FROM (NOW() - u.last_verification_check)) / 3600 as hours_since_check,
            CASE
              -- Priority 1: Never verified
              WHEN u.last_verification_check IS NULL THEN 1
              -- Priority 2: Not checked in 24+ hours
              WHEN EXTRACT(EPOCH FROM (NOW() - u.last_verification_check)) > 86400 THEN 2
              -- Priority 3: VIP/Whales (10+ NFTs)
              WHEN COALESCE(uvh.nft_count, 0) >= 10 AND EXTRACT(EPOCH FROM (NOW() - u.last_verification_check)) > 43200 THEN 3
              -- Priority 4: Recent users (created in last 7 days)
              WHEN EXTRACT(EPOCH FROM (NOW() - u.created_at)) < 604800 THEN 4
              -- Priority 5: Everyone else
              ELSE 5
            END as priority
          FROM users u
          LEFT JOIN (
            SELECT user_id, COUNT(*) as nft_count
            FROM user_verification_history
            WHERE verified_at > NOW() - INTERVAL '7 days'
            GROUP BY user_id
          ) uvh ON u.discord_id = uvh.user_id
          WHERE u.wallet_address IS NOT NULL
            AND u.wallet_address != ''
            -- Skip users verified in last 12 hours (unless priority 1 or 2)
            AND (
              u.last_verification_check IS NULL
              OR EXTRACT(EPOCH FROM (NOW() - u.last_verification_check)) > 43200
            )
        )
        SELECT 
          discord_id,
          guild_id,
          wallet_address,
          username,
          is_verified,
          nft_count,
          priority
        FROM user_stats
        ORDER BY 
          priority ASC,  -- Lower priority number = higher priority
          hours_since_check DESC NULLS FIRST,  -- Oldest check first within priority
          nft_count DESC  -- More NFTs = higher priority as tiebreaker
        LIMIT ${MAX_USERS_PER_RUN}
      `;

      return users;
    } catch (error) {
      console.error('[periodic-verification] Error fetching users:', error);
      return [];
    }
  }

  /**
   * Check and update a single user
   * (This method should match the existing implementation)
   */
  async checkAndUpdateUser(user) {
    // Use existing implementation from periodicVerification.js
    // This is a placeholder - the actual implementation would check NFTs and update roles
    return { rolesAdded: 0, rolesRemoved: 0 };
  }

  /**
   * Update last verification check time
   */
  async updateLastCheckTime(discordId) {
    try {
      await sql`
        UPDATE users 
        SET last_verification_check = NOW()
        WHERE discord_id = ${discordId}
      `;
    } catch (error) {
      console.error(`[periodic-verification] Error updating check time for ${discordId}:`, error.message);
    }
  }

  /**
   * Cleanup old verification sessions (>7 days old)
   */
  async cleanupOldSessions() {
    try {
      const result = await sql`
        DELETE FROM verification_sessions
        WHERE created_at < NOW() - INTERVAL '7 days'
          AND status IN ('expired', 'completed', 'failed')
      `;

      if (result.count > 0) {
        console.log(`[periodic-verification] Cleaned up ${result.count} old verification sessions`);
      }
    } catch (error) {
      console.error('[periodic-verification] Error cleaning up sessions:', error.message);
    }
  }

  /**
   * Get verification statistics
   */
  async getStats() {
    try {
      const stats = await sql`
        SELECT 
          COUNT(*) FILTER (WHERE last_verification_check IS NULL) as never_verified,
          COUNT(*) FILTER (WHERE last_verification_check > NOW() - INTERVAL '24 hours') as verified_24h,
          COUNT(*) FILTER (WHERE last_verification_check > NOW() - INTERVAL '7 days') as verified_7d,
          COUNT(*) as total_users
        FROM users
        WHERE wallet_address IS NOT NULL
      `;

      return stats[0];
    } catch (error) {
      console.error('[periodic-verification] Error getting stats:', error);
      return null;
    }
  }
}

export default ImprovedPeriodicVerificationService;
