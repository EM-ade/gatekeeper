import sql from '../db.js';
import * as guildVerificationConfigStore from '../repositories/guildVerificationConfigsRepository.js';
import { checkNftOwnershipWithClass } from '../utils/solana.js';
import { COLLECTIONS } from '../config/collections.js';
import RATE_LIMITING_CONFIG from '../config/rateLimiting.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

class PeriodicVerificationService {
  constructor(client) {
    this.client = client;
    this.isRunning = false;
    this.intervalId = null;
    this.specialRoles = new Map(); // Map of trait value -> { roleId, roleName }
  }

  /**
   * Start the periodic verification checker
   */
  start() {
    if (this.isRunning) {
      console.warn('[periodic-verification] Service already running');
      return;
    }

    console.log('[periodic-verification] Starting periodic verification checks (every 30 minutes)');
    this.isRunning = true;

    // Run immediately on start
    this.runVerificationCheck().catch(err => {
      console.error('[periodic-verification] Initial check failed:', err);
    });

    // Then run every 30 minutes
    this.intervalId = setInterval(() => {
      this.runVerificationCheck().catch(err => {
        console.error('[periodic-verification] Periodic check failed:', err);
      });
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the periodic verification checker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[periodic-verification] Stopped periodic verification checks');
  }

  /**
   * Set a special role mapping for a trait value
   * @param {string} traitValue - The trait value (e.g., "King", "Priest")
   * @param {string} roleId - Discord role ID
   * @param {string} roleName - Discord role name
   */
  setSpecialRole(traitValue, roleId, roleName) {
    this.specialRoles.set(traitValue, { roleId, roleName });
    console.log(`[periodic-verification] Set special role: ${traitValue} -> ${roleName} (${roleId})`);
  }

  /**
   * Run a verification check for all verified users with enhanced rate limiting
   */
  async runVerificationCheck() {
    console.log('[periodic-verification] Running verification check...');
    const startTime = Date.now();

    try {
      // Get all verified users
      const users = await sql`
        SELECT discord_id, guild_id, wallet_address, username, is_verified
        FROM users
        WHERE wallet_address IS NOT NULL
        ORDER BY last_verification_check ASC NULLS FIRST
        LIMIT 50
      `;

      console.log(`[periodic-verification] Found ${users.length} users to check`);

      let checked = 0;
      let rolesAdded = 0;
      let rolesRemoved = 0;
      let errors = 0;

      // Process users in smaller batches with longer delays using configuration
      const BATCH_SIZE = RATE_LIMITING_CONFIG.verification.batchSize;
      const DELAY_BETWEEN_BATCHES = RATE_LIMITING_CONFIG.verification.delayBetweenBatches;
      const DELAY_BETWEEN_USERS = RATE_LIMITING_CONFIG.verification.delayBetweenUsers;

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        
        console.log(`[periodic-verification] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(users.length/BATCH_SIZE)}`);
        
        // Process batch concurrently with individual rate limiting
        const batchResults = await Promise.allSettled(
          batch.map(user => this.checkAndUpdateUser(user))
        );
        
        // Process results
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const user = batch[j];
          
          if (result.status === 'fulfilled') {
            checked++;
            // Count role changes if needed (you may need to track this differently)
          } else {
            console.error(`[periodic-verification] Error checking user ${user.discord_id}:`, result.reason.message);
            errors++;
          }
        }
        
        // Wait between batches
        if (i + BATCH_SIZE < users.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[periodic-verification] Check complete: ${checked} users checked, ` +
        `${rolesAdded} roles added, ${rolesRemoved} roles removed, ` +
        `${errors} errors in ${duration}s`
      );
    } catch (error) {
      console.error('[periodic-verification] Failed to run verification check:', error);
    }
  }

  /**
   * Check and update a single user's verification status
   */
  async checkAndUpdateUser(user) {
    const { discord_id, guild_id, wallet_address, username } = user;

    // Get contract rules for this guild
    let contractRules = [];
    try {
      contractRules = await guildVerificationConfigStore.listByGuild(guild_id);
    } catch (error) {
      console.warn(`[periodic-verification] Failed to load contract rules for guild ${guild_id}:`, error.message);
      return;
    }

    if (contractRules.length === 0) {
      // No rules configured, skip
      return;
    }

    // Verify NFT ownership
    const verificationResult = await this.verifyNFTOwnership(wallet_address, contractRules);
    const isVerified = verificationResult.isVerified;
    const contractSummaries = verificationResult.contracts || [];
    const userNfts = verificationResult.nfts || [];
    
    // Keep original rules for class-based role assignment
    const originalRules = contractRules;

    // Update database
    const now = new Date().toISOString();
    await sql`
      UPDATE users
      SET 
        is_verified = ${isVerified},
        last_verification_check = ${now},
        updated_at = ${now}
      WHERE discord_id = ${discord_id} AND guild_id = ${guild_id}
    `;

    // Update Discord roles
    try {
      const guild = await this.client.guilds.fetch(guild_id);
      const member = await guild.members.fetch(discord_id);

      // Handle regular contract rules with mutually exclusive quantity tiers per collection
      const quantitySummaries = contractSummaries.filter(c => c.ruleType === 'quantity');
      const traitSummaries = contractSummaries.filter(c => c.ruleType === 'trait');

      const selectedQuantityRoleIds = new Set();
      const deselectedQuantityRoleIds = new Set();

      const byCollection = {};
      for (const s of quantitySummaries) {
        if (!byCollection[s.contractAddress]) byCollection[s.contractAddress] = [];
        byCollection[s.contractAddress].push(s);
      }

      for (const [addr, arr] of Object.entries(byCollection)) {
        const eligible = arr.filter(s => s.meetsRequirement);
        if (eligible.length > 0) {
          // Choose the highest tier (largest requiredNftCount) among eligible
          const chosen = eligible.sort((a, b) => a.requiredNftCount - b.requiredNftCount)[eligible.length - 1];
          if (chosen.roleId) selectedQuantityRoleIds.add(chosen.roleId);
          for (const s of arr) {
            if (s.roleId && s.roleId !== chosen.roleId) deselectedQuantityRoleIds.add(s.roleId);
          }
        } else {
          // No eligible tiers: remove all roles for this collection
          for (const s of arr) {
            if (s.roleId) deselectedQuantityRoleIds.add(s.roleId);
          }
        }
      }

      // Apply quantity tier role changes
      for (const roleId of selectedQuantityRoleIds) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId);
          console.log(`[periodic-verification] Added quantity-tier role ${roleId} to ${username || discord_id}`);
        }
      }
      for (const roleId of deselectedQuantityRoleIds) {
        if (member.roles.cache.has(roleId) && !selectedQuantityRoleIds.has(roleId)) {
          await member.roles.remove(roleId);
          console.log(`[periodic-verification] Removed quantity-tier role ${roleId} from ${username || discord_id}`);
        }
      }

      // Apply trait-based role changes independently (non-exclusive)
      for (const contract of traitSummaries) {
        if (!contract.roleId) continue;
        const hasRole = member.roles.cache.has(contract.roleId);
        const shouldHaveRole = contract.meetsRequirement;
        if (shouldHaveRole && !hasRole) {
          await member.roles.add(contract.roleId);
          console.log(`[periodic-verification] Added trait role ${contract.roleName} to ${username || discord_id}`);
        } else if (!shouldHaveRole && hasRole) {
          await member.roles.remove(contract.roleId);
          console.log(`[periodic-verification] Removed trait role ${contract.roleName} from ${username || discord_id}`);
        }
      }

      // Handle class-based roles
      await this.updateClassBasedRoles(member, userNfts, username || discord_id, originalRules);
    } catch (discordError) {
      console.error(
        `[periodic-verification] Failed to update roles for ${username || discord_id}:`,
        discordError.message
      );
    }
  }

  /**
   * Update class-based roles based on NFT ownership
   * Uses both database rules and config-based class definitions
   * @param {GuildMember} member - Discord guild member
   * @param {Array} nfts - User's NFTs with class information
   * @param {string} username - User's username
   * @param {Array} contractRules - Contract rules for trait-based role assignment
   */
  async updateClassBasedRoles(member, nfts, username, contractRules) {
    try {
      // Get all current roles of the member
      const currentRoles = member.roles.cache;
      const processedRoleIds = new Set();

      // Extract trait-based rules from database (tolerate undefined)
      const traitRules = (contractRules || []).filter(rule => 
        (rule.ruleType || rule.rule_type) === 'trait'
      );

      // For each NFT, check if it matches any trait rule
      const eligibleRoleIds = new Set();
      
      for (const nft of nfts) {
        // Check database rules first
        for (const rule of traitRules) {
          const traitType = rule.traitType || rule.trait_type;
          const traitValue = rule.traitValue || rule.trait_value;
          
          // Check if this NFT has the required trait
          // Support multiple attribute formats
          let hasTraitMatch = false;
          
          // Check direct class property (legacy)
          if (nft.class === traitValue) {
            hasTraitMatch = true;
          }
          
          // Check attributes array
          if (!hasTraitMatch && nft.content?.metadata?.attributes) {
            hasTraitMatch = nft.content.metadata.attributes.some(attr => {
              // Handle both formats: { trait_type, value } and { [traitType]: traitValue }
              const attrKey = attr.trait_type || Object.keys(attr).find(k => k.toLowerCase() === traitType.toLowerCase());
              const attrValue = attr.value || attr[traitType];
              
              return (
                (attr.trait_type === traitType && attr.value === traitValue) ||
                (attrKey?.toLowerCase() === traitType.toLowerCase() && attrValue === traitValue)
              );
            });
          }
          
          if (hasTraitMatch && rule.roleId) {
            eligibleRoleIds.add(rule.roleId);
          }
        }
      }

      // Add eligible roles
      for (const roleId of eligibleRoleIds) {
        processedRoleIds.add(roleId);
        
        if (!currentRoles.has(roleId)) {
          try {
            await member.roles.add(roleId);
            const role = await this.client.guilds.cache.get(member.guild.id)?.roles.fetch(roleId);
            console.log(
              `[periodic-verification] Added class-based role ${role?.name || roleId} to ${username}`
            );
          } catch (error) {
            console.error(`[periodic-verification] Failed to add role ${roleId}:`, error.message);
          }
        }
      }

      // Remove trait-based roles that user is no longer eligible for
      for (const rule of traitRules) {
        if (!rule.roleId) continue;
        
        const hasRole = currentRoles.has(rule.roleId);
        const shouldHaveRole = eligibleRoleIds.has(rule.roleId);
        
        if (hasRole && !shouldHaveRole) {
          try {
            await member.roles.remove(rule.roleId);
            const role = await this.client.guilds.cache.get(member.guild.id)?.roles.fetch(rule.roleId);
            console.log(
              `[periodic-verification] Removed class-based role ${role?.name || rule.roleId} from ${username}`
            );
          } catch (error) {
            console.error(`[periodic-verification] Failed to remove role ${rule.roleId}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error(`[periodic-verification] Failed to update class-based roles for ${username}:`, error.message);
    }
  }

  /**
   * Verify NFT ownership using Magic Eden API with class-based filtering
   * Supports both quantity and trait-based rules
   */
  async verifyNFTOwnership(walletAddress, contractRules) {
    try {
      console.log(`[periodic-verification] Verifying NFTs for wallet ${walletAddress}`);
      
      // Group rules by collection
      const rulesByCollection = {};
      for (const rule of contractRules) {
        const collectionAddr = rule.contractAddress?.toLowerCase();
        if (!collectionAddr) continue;
        
        if (!rulesByCollection[collectionAddr]) {
          rulesByCollection[collectionAddr] = [];
        }
        rulesByCollection[collectionAddr].push(rule);
      }

      let allNfts = [];
      const contractSummaries = [];

      // Process each collection
      for (const [collectionAddr, rules] of Object.entries(rulesByCollection)) {
        // Try to find collection config by address
        const collectionConfig = Object.values(COLLECTIONS || {})
          .find(config => config.address?.toLowerCase() === collectionAddr);

        if (!collectionConfig) {
          console.warn(`[periodic-verification] No collection config found for address ${collectionAddr}`);
          // Fallback: construct minimal config to allow Helius-only verification
          const minimalConfig = {
            name: collectionAddr,
            displayName: collectionAddr,
            address: collectionAddr,
            symbols: [],
            primarySource: 'helius',
            fallbackSources: [],
            supportsClassFilter: false,
            classAttributeName: 'Class',
          };
          console.log(`[periodic-verification] Using minimal config for address ${collectionAddr}`);
          console.log(`[periodic-verification] Checking collection ${minimalConfig.name} for wallet ${walletAddress}`);
          const result = await checkNftOwnershipWithClass(walletAddress, minimalConfig);

          const nftList = result.nfts || [];
          if (nftList.length > 0) {
            console.log(`[periodic-verification] Found ${nftList.length} NFTs from ${minimalConfig.name}`);
            allNfts = allNfts.concat(nftList);
          } else {
            console.log(`[periodic-verification] No NFTs found for collection ${minimalConfig.name}`);
          }

          // Process rules for this collection
          for (const rule of rules) {
            const ruleType = rule.ruleType || rule.rule_type || 'quantity';
            if (ruleType === 'trait') {
              const traitValue = rule.traitValue || rule.trait_value;
              const matchingNfts = nftList.filter(nft => nft.class === traitValue);
              const ownedCount = matchingNfts.length;
              contractSummaries.push({
                contractAddress: collectionAddr,
                ruleType: 'trait',
                traitType: 'Class',
                traitValue,
                requiredNftCount: 1,
                roleId: rule.roleId,
                roleName: rule.roleName,
                ownedCount,
                meetsRequirement: ownedCount > 0,
              });
            } else {
              const ownedCount = nftList.length;
              const requiredCount = rule.requiredNftCount || 1;
              const maxCount = rule.maxNftCount ?? rule.max_nft_count ?? null;
              contractSummaries.push({
                contractAddress: collectionAddr,
                ruleType: 'quantity',
                requiredNftCount: requiredCount,
                roleId: rule.roleId,
                roleName: rule.roleName,
                ownedCount,
                meetsRequirement: ownedCount >= requiredCount && (maxCount == null ? true : ownedCount <= maxCount),
              });
            }
          }
          continue;
        }

        console.log(`[periodic-verification] Checking collection ${collectionConfig.name} for wallet ${walletAddress}`);

        // Use Magic Eden to fetch NFTs with class attributes
        const result = await checkNftOwnershipWithClass(walletAddress, collectionConfig);

        const nftList = result.nfts || [];
        
        if (nftList.length > 0) {
          console.log(`[periodic-verification] Found ${nftList.length} NFTs from ${collectionConfig.name}`);
          allNfts = allNfts.concat(nftList);
        } else {
          console.log(`[periodic-verification] No NFTs found for collection ${collectionConfig.name}`);
        }

        // Process rules for this collection (even if no NFTs found - needed for role removal)
        for (const rule of rules) {
          const ruleType = rule.ruleType || rule.rule_type || 'quantity';

          if (ruleType === 'trait') {
            // Trait-based rule: check if user owns ANY NFT with the specified trait
            const traitValue = rule.traitValue || rule.trait_value;
            const matchingNfts = nftList.filter(nft => nft.class === traitValue);
            const ownedCount = matchingNfts.length;

            contractSummaries.push({
              contractAddress: collectionAddr,
              ruleType: 'trait',
              traitType: 'Class',
              traitValue,
              requiredNftCount: 1,
              roleId: rule.roleId,
              roleName: rule.roleName,
              ownedCount,
              meetsRequirement: ownedCount > 0,
            });
          } else {
            // Quantity-based rule: support ranges with optional max
            const ownedCount = nftList.length;
            const requiredCount = rule.requiredNftCount || 1;
            const maxCount = rule.maxNftCount ?? rule.max_nft_count ?? null;

            contractSummaries.push({
              contractAddress: collectionAddr,
              ruleType: 'quantity',
              requiredNftCount: requiredCount,
              roleId: rule.roleId,
              roleName: rule.roleName,
              ownedCount,
              meetsRequirement: ownedCount >= requiredCount && (maxCount == null ? true : ownedCount <= maxCount),
            });
          }
        }
      }

      const meetsAnyRule = contractSummaries.length > 0
        ? contractSummaries.some(summary => summary.meetsRequirement)
        : false;

      const totalNftCount = allNfts.length;

      // Prepare NFT data with class information for role assignment
      const preparedNfts = allNfts.map(nft => ({
        id: nft.mintAddress,
        name: nft.name,
        class: nft.class,
        content: {
          metadata: {
            name: nft.name,
            attributes: nft.class ? [{ trait_type: 'Class', value: nft.class }] : []
          }
        }
      }));

      return {
        isVerified: meetsAnyRule,
        nftCount: totalNftCount,
        nfts: preparedNfts,
        contracts: contractSummaries,
      };
    } catch (error) {
      console.error('[periodic-verification] NFT verification error:', error.message);
      return { isVerified: false, nftCount: 0, nfts: [], contracts: [] };
    }
  }
}

export default PeriodicVerificationService;
