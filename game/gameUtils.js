import { getMultipleNftsMetadata } from '../utils/nftMetadata.js';
import { getUserRealmkins, getOrCreateRealmkin } from '../data/realmkins.js';
import { calculateTotalStats } from './combatEngine.js';

/**
 * Utility functions for game operations
 */

/**
 * Prepare player team for battle with combined stats
 */
export const preparePlayerTeam = async (userId, nftIds) => {
  const realmkins = await getUserRealmkins(userId);
  const nftsMetadata = await getMultipleNftsMetadata(nftIds);
  
  const team = [];
  
  for (const nftId of nftIds) {
    const realmkin = realmkins.find(r => r.nft_id === nftId) || 
                    await getOrCreateRealmkin(nftId, userId);
    const metadata = nftsMetadata.find(m => m.nftId === nftId);
    
    if (metadata && !metadata.error) {
      const totalStats = calculateTotalStats(realmkin, metadata);
      
      team.push({
        nftId: nftId,
        userId: userId,
        name: metadata.name,
        level: realmkin.level,
        rarity: metadata.rarity,
        element: metadata.element,
        attack: totalStats.attack,
        defense: totalStats.defense,
        health: totalStats.health,
        maxHealth: totalStats.maxHealth,
        xp: realmkin.xp
      });
    }
  }
  
  return team;
};

/**
 * Format battle results for Discord embed
 */
export const formatBattleResults = (results, battleType = 'training', playerData = null) => {
  const embed = {
    title: `🏆 ${battleType.toUpperCase()} BATTLE RESULTS 🏆`,
    color: battleType === 'void' ? 0x800080 : 0x00FF00,
    fields: [],
    timestamp: new Date().toISOString()
  };
  
  if (battleType === 'training' && playerData) {
    // Add player stats section
    embed.fields.push(
      {
        name: '🧙‍♂️ Your Realmkin',
        value: `**${playerData.name}**\n⭐ Level ${playerData.level} ${playerData.rarity} ${playerData.element}\n🗡️ Attack: ${playerData.attack}\n🛡️ Defense: ${playerData.defense}\n❤️ Health: ${playerData.health}/${playerData.maxHealth}`,
        inline: false
      },
      {
        name: '⚔️ Combat Results',
        value: `**Damage Dealt**: ${results.damage} ${results.critical ? '💥 CRITICAL!' : ''}\n**XP Gained**: ${results.xpGained} XP\n**Level Up**: ${results.levelUp ? '🎉 YES!' : 'Not yet'}`,
        inline: false
      }
    );
    
    if (results.loot) {
      embed.fields.push({
        name: '🎁 Loot Dropped',
        value: results.loot,
        inline: false
      });
    }
  } else if (battleType === 'training') {
    // Fallback if no player data
    embed.fields.push(
      {
        name: 'Damage Dealt',
        value: `${results.damage} ${results.critical ? '💥 CRITICAL!' : ''}`,
        inline: true
      },
      {
        name: 'XP Gained',
        value: `${results.xpGained} XP`,
        inline: true
      },
      {
        name: 'Level Up',
        value: results.levelUp ? '🎉 YES!' : 'Not yet',
        inline: true
      }
    );
    
    if (results.loot) {
      embed.fields.push({
        name: 'Loot Dropped',
        value: `🎁 ${results.loot}`,
        inline: false
      });
    }
  } else if (battleType === 'void') {
    embed.fields.push(
      {
        name: 'Outcome',
        value: results.outcome.toUpperCase(),
        inline: true
      },
      {
        name: 'Kills',
        value: `${results.kills} 🗡️`,
        inline: true
      },
      {
        name: 'Deaths',
        value: `${results.deaths} 💀`,
        inline: true
      },
      {
        name: 'Rewards',
        value: `💰 ${results.rewards.mkin} $MKIN\n⭐ ${results.rewards.xp} XP`,
        inline: false
      }
    );
  }
  
  return { embeds: [embed] };
};

/**
 * Generate progress bar for XP/level display
 */
export const generateProgressBar = (current, max, length = 10) => {
  const percentage = Math.min(1, Math.max(0, current / max));
  const filledLength = Math.floor(percentage * length);
  const emptyLength = length - filledLength;
  
  return `[${'█'.repeat(filledLength)}${'░'.repeat(emptyLength)}] ${Math.floor(percentage * 100)}%`;
};

/**
 * Format Realmkin stats for display
 */
export const formatRealmkinStats = (realmkin, metadata) => {
  const totalStats = calculateTotalStats(realmkin, metadata);
  const currentTier = realmkin.tier || 1;
  const currentTierLevel = realmkin.tier_level || realmkin.level || 1;
  const currentTierXp = realmkin.tier_xp ?? realmkin.xp ?? 0;
  const xpForNext = require('./combatEngine.js').getXpForNextLevel(currentTierLevel);
  const isMax = (currentTier >= 4 && currentTierLevel >= 25);
  
  return `
**${metadata.name}**
🏅 Tier ${currentTier}  •  ⭐ Level ${currentTierLevel} ${metadata.rarity} ${metadata.element}
🗡️ Attack: ${totalStats.attack} (${metadata.baseAttack} + ${realmkin.attack_boost})
🛡️ Defense: ${totalStats.defense} (${metadata.baseDefense} + ${realmkin.defense_boost})
❤️ Health: ${totalStats.health} (${metadata.baseHealth} + ${realmkin.health_boost})
📊 Tier XP: ${isMax ? 'MAX' : `${currentTierXp}/${xpForNext}`} 
${isMax ? '🏆 MAX TIER' : generateProgressBar(currentTierXp, xpForNext)}
  `.trim();
};

/**
 * Calculate battle rewards based on performance
 */
export const calculateBattleRewards = (kills, battleType, difficulty = 'normal', tier = 1) => {
  const baseRewards = {
    training: { mkin: 5, xp: 10 },
    void: { mkin: 10, xp: 5 }
  };
  
  const difficultyMultipliers = {
    easy: 0.8,
    normal: 1.0,
    hard: 1.2,
    extreme: 1.5
  };
  
  const multiplier = difficultyMultipliers[difficulty] || 1.0;
  const tierMultipliers = [0, 1.0, 1.1, 1.2, 1.3];
  const tierMult = tierMultipliers[Math.min(Math.max(tier, 1), 4)];
  
  return {
    mkin: Math.floor(baseRewards[battleType].mkin * kills * multiplier * tierMult),
    xp: Math.floor(baseRewards[battleType].xp * kills * multiplier * tierMult)
  };
};

/**
 * Validate NFT selection for battles
 */
export const validateNftSelection = (selectedNfts, maxNfts = 3) => {
  if (selectedNfts.length === 0) {
    return { valid: false, error: 'Please select at least one NFT' };
  }
  
  if (selectedNfts.length > maxNfts) {
    return { valid: false, error: `You can only select up to ${maxNfts} NFTs` };
  }
  
  // Check for duplicate NFTs
  const uniqueNfts = new Set(selectedNfts);
  if (uniqueNfts.size !== selectedNfts.length) {
    return { valid: false, error: 'Duplicate NFTs are not allowed' };
  }
  
  return { valid: true, error: null };
};

/**
 * Cooldown management for commands
 */
export class CooldownManager {
  constructor(cooldownTime = 30000) {
    this.cooldowns = new Map();
    this.cooldownTime = cooldownTime;
  }
  
  isOnCooldown(userId) {
    const lastUsed = this.cooldowns.get(userId);
    if (!lastUsed) return false;
    
    return Date.now() - lastUsed < this.cooldownTime;
  }
  
  getRemainingCooldown(userId) {
    const lastUsed = this.cooldowns.get(userId);
    if (!lastUsed) return 0;
    
    const remaining = this.cooldownTime - (Date.now() - lastUsed);
    return Math.max(0, remaining);
  }
  
  setCooldown(userId) {
    this.cooldowns.set(userId, Date.now());
  }
  
  clearCooldown(userId) {
    this.cooldowns.delete(userId);
  }
}

/**
 * Format cooldown time for display
 */
export const formatCooldown = (ms) => {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m`;
};

export default {
  preparePlayerTeam,
  formatBattleResults,
  generateProgressBar,
  formatRealmkinStats,
  calculateBattleRewards,
  validateNftSelection,
  CooldownManager,
  formatCooldown
};
