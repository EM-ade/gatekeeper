import { getElementMultiplier } from '../utils/nftMetadata.js';
import { getOrCreateRealmkin, updateRealmkinStats, addItemToInventory } from '../data/realmkins.js';

// XP required per level (gentler curve for beginners)
const XP_REQUIREMENTS = {
  1: 50,    // Reduced from 100
  2: 110,   // Reduced from 220
  3: 180,   // Reduced from 360
  4: 260,   // Reduced from 520
  5: 350,   // Reduced from 700
  6: 450,   // Reduced from 900
  7: 560,   // Reduced from 1120
  8: 680,   // Reduced from 1360
  9: 810,   // Reduced from 1620
  10: 950,  // Reduced from 1900
  11: 1100, // Reduced from 2200
  12: 1260, // Reduced from 2520
  13: 1430, // Reduced from 2860
  14: 1610, // Reduced from 3220
  15: 1800, // Reduced from 3600
  16: 2000, // Reduced from 4000
  17: 2210, // Reduced from 4420
  18: 2430, // Reduced from 4860
  19: 2660, // Reduced from 5320
  20: 2900,  // Reduced from 5800
  21: 3200,
  22: 3500,
  23: 3800,
  24: 4100,
  25: 4400
};

// Loot table probabilities
const LOOT_TABLE = {
  common: [
    { item: 'HEALTH_POTION', probability: 0.2 },
    { item: 'ATTACK_BOOST_1H', probability: 0.3 },
    { item: 'DEFENSE_BOOST_1H', probability: 0.3 },
    { item: 'XP_BOOST_1H', probability: 0.2 }
  ],
  rare: [
    { item: 'LEVEL_UP_TOKEN', probability: 0.1 },
    { item: 'ELEMENTAL_CRYSTAL', probability: 0.15 },
    { item: 'RARE_WEAPON', probability: 0.08 }
  ],
  epic: [
    { item: 'EPIC_ARMOR', probability: 0.05 },
    { item: 'SKILL_TOME', probability: 0.04 },
    { item: 'ANCIENT_RELIC', probability: 0.02 }
  ]
};

/**
 * Calculate XP required for next level
 */
export const getXpForNextLevel = (currentLevel, tier = 1) => {
  const base = XP_REQUIREMENTS[currentLevel] || (currentLevel * currentLevel * 100);
  // Tier XP multipliers: reasonable but grindable
  // T1: x1.0, T2: x1.3, T3: x1.7, T4: x2.2
  const tierMults = [0, 1.0, 1.3, 1.7, 2.2];
  const mult = tierMults[Math.min(Math.max(tier, 1), 4)];
  return Math.floor(base * mult);
};

/**
 * Calculate damage in combat
 */
export const calculateDamage = (attacker, defender, isCritical = false) => {
  const levelDifference = attacker.level - defender.level;
  const levelBonus = 1 + (levelDifference * 0.5);
  
  const elementMultiplier = getElementMultiplier(attacker.element, defender.element);
  const criticalMultiplier = isCritical ? 1.5 : 1.0;
  
  const rawDamage = (attacker.attack * elementMultiplier * levelBonus * criticalMultiplier) - defender.defense;
  
  return Math.max(1, Math.floor(rawDamage));
};

/**
 * Check if attack is critical hit
 */
export const isCriticalHit = (attacker) => {
  const criticalChance = 0.05 + (attacker.level * 0.005); // 5% base + 0.5% per level
  return Math.random() < criticalChance;
};

/**
 * Execute a combat turn between two entities
 */
export const executeCombatTurn = async (attackerData, defenderData, battleType = 'training') => {
  const critical = isCriticalHit(attackerData);
  const damage = calculateDamage(attackerData, defenderData, critical);
  
  defenderData.health -= damage;
  const isDefeated = defenderData.health <= 0;
  
  let xpGained = 0;
  let levelUp = false;
  
  let lootItem = null;
  
  if (isDefeated && battleType === 'training') {
    // XP calculation based on defender level and rarity
    const baseXp = defenderData.level * 10;
    const rarityMultiplier = {
      COMMON: 1.0,
      UNCOMMON: 1.2,
      RARE: 1.5,
      EPIC: 2.0,
      LEGENDARY: 3.0
    }[defenderData.rarity] || 1.0;
    
    // Elemental disadvantage bonus (25% more XP if at disadvantage)
    const elementMultiplier = getElementMultiplier(attackerData.element, defenderData.element);
    const elementalBonus = elementMultiplier < 1 ? 1.25 : 1.0;
    
    xpGained = Math.max(5, Math.floor(baseXp * rarityMultiplier * elementalBonus));
    
    // Update realmkin stats with tier-aware logic
    const realmkin = await getOrCreateRealmkin(attackerData.nftId, attackerData.userId);
    const currentTierLevel = realmkin.tier_level || realmkin.level || 1;
    const currentTierXp = realmkin.tier_xp ?? realmkin.xp ?? 0;
    const newTierXp = currentTierXp + xpGained;
    const xpNeeded = getXpForNextLevel(currentTierLevel, realmkin.tier || 1);
    
    if (newTierXp >= xpNeeded) {
      levelUp = true;
      await updateRealmkinStats(attackerData.nftId, xpGained, true);
    } else {
      await updateRealmkinStats(attackerData.nftId, xpGained, false);
    }
    
    // Chance to drop loot with elemental disadvantage bonus
    const lootDropBonus = elementMultiplier < 1 ? 1.5 : 1.0; // 50% better loot chance if at disadvantage
    lootItem = await handleLootDrop(attackerData.userId, attackerData.nftId, defenderData.rarity, lootDropBonus);
  }
  
  return {
    damage,
    critical,
    isDefeated,
    xpGained,
    levelUp,
    lootItem,
    attackerHealth: attackerData.health,
    defenderHealth: Math.max(0, defenderData.health)
  };
};

/**
 * Handle loot drop after defeating an enemy
 */
const handleLootDrop = async (userId, nftId, enemyRarity, bonusMultiplier = 1.0) => {
  // Chance-based loot (no longer guaranteed potion)
  const dropChance = Math.random();
  const rarityDropModifier = {
    COMMON: 0.6,
    UNCOMMON: 0.7,
    RARE: 0.8,
    EPIC: 0.9,
    LEGENDARY: 1.0
  }[enemyRarity] || 0.6;
  
  // 35% base chance for loot (scaled by rarity and any bonus)
  if (dropChance < (0.35 * rarityDropModifier * bonusMultiplier)) {
    let lootPool = LOOT_TABLE.common;
    if (dropChance < 0.15 * rarityDropModifier) {
      lootPool = LOOT_TABLE.epic;
    } else if (dropChance < 0.3 * rarityDropModifier) {
      lootPool = LOOT_TABLE.rare;
    }
    
    const randomItem = lootPool[Math.floor(Math.random() * lootPool.length)];
    const finalProbability = randomItem.probability * rarityDropModifier;
    
    if (Math.random() < finalProbability) {
      let expiresAt = null;
      if (randomItem.item.includes('BOOST') || randomItem.item.includes('POTION')) {
        expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      }
      
      await addItemToInventory(userId, nftId, randomItem.item, 1, expiresAt);
      return randomItem.item;
    }
  }
  
  return null;
};

/**
 * Generate enemy for training grounds
 */
export const generateTrainingEnemy = (playerLevel) => {
  // Enemy level range: -3 to +1 of player level
  const minLevel = Math.max(1, playerLevel - 3);
  const maxLevel = Math.min(20, playerLevel + 1);
  
  // Random level within the range
  const enemyLevel = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;
  
  const elements = ['FIRE', 'NATURE', 'LIGHTNING', 'LIGHT', 'NEUTRAL'];
  
  // Determine available rarities based on player level
  let availableRarities;
  if (playerLevel <= 4) {
    // Levels 1-4: Only common and uncommon enemies
    availableRarities = ['COMMON', 'UNCOMMON'];
  } else {
    // Level 5+: All rarities available
    availableRarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  }
  
  const rarity = availableRarities[Math.floor(Math.random() * availableRarities.length)];
  const element = elements[Math.floor(Math.random() * elements.length)];
  
  const baseStats = {
    COMMON: { attack: 40, defense: 40, health: 10 },
    UNCOMMON: { attack: 50, defense: 50, health: 10 },
    RARE: { attack: 60, defense: 60, health: 120 },
    EPIC: { attack: 70, defense: 70, health: 140 },
    LEGENDARY: { attack: 80, defense: 80, health: 160 }
  }[rarity];
  
  // Scale stats with level
  const levelMultiplier = 1 + ((enemyLevel - 1) * 0.1);
  
  return {
    name: `${element.toLowerCase()} ${rarity.toLowerCase()} beast`,
    level: enemyLevel,
    rarity: rarity,
    element: element,
    attack: Math.floor(baseStats.attack * levelMultiplier),
    defense: Math.floor(baseStats.defense * levelMultiplier),
    health: Math.floor(baseStats.health * levelMultiplier),
    maxHealth: Math.floor(baseStats.health * levelMultiplier)
  };
};

/**
 * Calculate total stats for a Realmkin (base + boosts)
 */
export const calculateTotalStats = (realmkinData, nftMetadata) => {
  const tier = realmkinData.tier || 1;
  const tierBonus = 1 + Math.max(0, tier - 1) * 0.02; // +2% per tier above 1
  const attack = (nftMetadata.baseAttack + realmkinData.attack_boost) * tierBonus;
  const defense = (nftMetadata.baseDefense + realmkinData.defense_boost) * tierBonus;
  const health = (nftMetadata.baseHealth + realmkinData.health_boost) * tierBonus;
  const maxHealth = (nftMetadata.baseHealth + realmkinData.health_boost) * tierBonus;
  return {
    attack: Math.floor(attack),
    defense: Math.floor(defense),
    health: Math.floor(health),
    maxHealth: Math.floor(maxHealth)
  };
};

export default {
  calculateDamage,
  executeCombatTurn,
  generateTrainingEnemy,
  getXpForNextLevel,
  calculateTotalStats
};
