import { getElementMultiplier } from "../utils/nftMetadata.js";
import { selectTrainer } from "../data/trainers.js";

import {
  updateFusedCharacterXP,
  getFusedCharacter,
} from "../data/fusedCharacters.js";
import { addItemToInventory } from "../data/realmkins.js";

// XP required per level for fused characters
const XP_REQUIREMENTS = {
  1: 100,
  2: 220,
  3: 360,
  4: 520,
  5: 700,
  6: 900,
  7: 1120,
  8: 1360,
  9: 1620,
  10: 1900,
  11: 2200,
  12: 2520,
  13: 2860,
  14: 3220,
  15: 3600,
  16: 4000,
  17: 4420,
  18: 4860,
  19: 5320,
  20: 5800,
};

// Loot table probabilities for fused characters
const LOOT_TABLE = {
  common: [
    { item: "HEALTH_POTION", probability: 0.2 },
    { item: "ATTACK_BOOST_1H", probability: 0.3 },
    { item: "DEFENSE_BOOST_1H", probability: 0.3 },
    { item: "XP_BOOST_1H", probability: 0.2 },
  ],
  rare: [
    { item: "LEVEL_UP_TOKEN", probability: 0.1 },
    { item: "ELEMENTAL_CRYSTAL", probability: 0.15 },
    { item: "RARE_WEAPON", probability: 0.08 },
  ],
  epic: [
    { item: "EPIC_ARMOR", probability: 0.05 },
    { item: "SKILL_TOME", probability: 0.04 },
    { item: "ANCIENT_RELIC", probability: 0.02 },
  ],
};

/**
 * Calculate XP required for next level
 */
export const getXpForNextLevel = (currentLevel) => {
  return XP_REQUIREMENTS[currentLevel] || currentLevel * currentLevel * 100;
};

/**
 * Calculate damage in combat for fused characters with active boosts
 */
export const calculateFusedDamage = (
  attacker,
  defender,
  attackElement,
  isCritical = false,
  battleState = null
) => {
  const levelDifference = attacker.level - defender.level;
  const levelBonus = 1 + levelDifference * 0.5;

  // Get base element multiplier
  const elementMultiplier = getElementMultiplier(
    attackElement,
    defender.element
  );

  // Apply +5% damage bonus if using primary element
  let damageBonus = 1.0;
  if (
    attacker.elementalAffinities &&
    attacker.elementalAffinities._primaryElement === attackElement
  ) {
    damageBonus = 1.05; // +5% damage bonus
  }

  // Apply attack boost if active
  let attackBoost = 1.0;
  if (battleState?.activeBoosts?.attack) {
    attackBoost = battleState.activeBoosts.attack.multiplier;
  }

  const criticalMultiplier = isCritical ? 1.5 : 1.0;

  // Calculate base damage before defense reduction
  const baseDamage =
    attacker.total_attack *
    elementMultiplier *
    levelBonus *
    criticalMultiplier *
    damageBonus *
    attackBoost;

  // Apply small passive tier bonus (+2% per tier above 1)
  const tier = attacker.tier || 1;
  const tierBonus = 1 + Math.max(0, tier - 1) * 0.02;
  const tieredDamage = baseDamage * tierBonus;

  // Apply defense boost if active
  let defenseValue = defender.defense;
  if (battleState?.activeBoosts?.defense && battleState.player.user_id === defender.user_id) {
    defenseValue *= battleState.activeBoosts.defense.multiplier;
  }

  // Defense reduces damage by a percentage, not a flat amount
  const defenseReduction = Math.min(0.75, defenseValue / (defenseValue + 100));
  const finalDamage = tieredDamage * (1 - defenseReduction);

  return Math.max(1, Math.floor(finalDamage));
};

/**
 * Check if attack is critical hit for fused characters
 */
export const isCriticalHit = (attacker) => {
  const criticalChance = 0.05 + attacker.level * 0.005; // 5% base + 0.5% per level
  return Math.random() < criticalChance;
};

/**
 * Execute a combat turn between two entities for fused characters
 */
export const executeFusedCombatTurn = async (
  attackerData,
  defenderData,
  attackElement,
  battleType = "training",
  battleState = null
) => {
  const critical = isCriticalHit(attackerData);
  const damage = calculateFusedDamage(
    attackerData,
    defenderData,
    attackElement,
    critical,
    battleState
  );

  defenderData.currentHealth -= damage;
  const isDefeated = defenderData.currentHealth <= 0;

  let xpGained = 0;
  let levelUp = false;
  let tierUp = false;
  let lootItem = null;

  if (isDefeated && battleType === "training") {
    // XP calculation based on defender level and rarity
    const baseXp = defenderData.level * 15; // Slightly more XP for fused characters
    const rarityMultiplier =
      {
        COMMON: 1.0,
        UNCOMMON: 1.2,
        RARE: 1.5,
        EPIC: 2.0,
        LEGENDARY: 3.0,
      }[defenderData.rarity] || 1.0;

    // Elemental disadvantage bonus (25% more XP if at disadvantage)
    const elementMultiplier = getElementMultiplier(
      attackElement,
      defenderData.element
    );
    const elementalBonus = elementMultiplier < 1 ? 1.25 : 1.0;

    // Apply XP boost if active
    let xpBoost = 1.0;
    if (battleState?.activeBoosts?.xp) {
      xpBoost = battleState.activeBoosts.xp.multiplier;
    }

    xpGained = Math.max(
      10,
      Math.floor(baseXp * rarityMultiplier * elementalBonus * xpBoost)
    );

    // Update fused character stats
    const result = await updateFusedCharacterXP(attackerData.user_id, xpGained);

    if (result) {
      levelUp = result.leveledUp;
      tierUp = result.tierUp;
    }

    // Chance to drop loot with elemental disadvantage bonus
    const lootDropBonus = elementMultiplier < 1 ? 1.5 : 1.0;
    lootItem = await handleLootDrop(
      attackerData.user_id,
      defenderData.rarity,
      lootDropBonus
    );
  }

  return {
    damage,
    critical,
    isDefeated,
    xpGained,
    levelUp,
    tierUp,
    lootItem,
    attackerHealth: attackerData.currentHealth,
    defenderHealth: Math.max(0, defenderData.currentHealth),
    attackElement,
  };
};

/**
 * Handle loot drop after defeating an enemy for fused characters
 */
const handleLootDrop = async (userId, enemyRarity, bonusMultiplier = 1.0) => {
  // Chance-based loot (no longer guaranteed potion)
  const dropChance = Math.random();
  const rarityDropModifier =
    {
      COMMON: 0.6,
      UNCOMMON: 0.7,
      RARE: 0.8,
      EPIC: 0.9,
      LEGENDARY: 1.0,
    }[enemyRarity] || 0.6;

  // 35% base chance for loot (scaled by rarity and any bonus)
  if (dropChance < 0.35 * rarityDropModifier * bonusMultiplier) {
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
      if (
        randomItem.item.includes("BOOST") ||
        randomItem.item.includes("POTION")
      ) {
        expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      }

      await addItemToInventory(userId, null, randomItem.item, 1, expiresAt);
      return randomItem.item;
    }
  }

  return null;
};

/**
 * Generate enemy for training grounds (compatible with fused characters)
 */
export const generateTrainingEnemy = (playerLevel, playerTier = 1) => {
  // Attempt to use tier-locked trainers first
  try {
    const trainer = selectTrainer(playerTier, playerLevel);
    if (trainer) {
      // Enemy level range around player level for mild variance
      const minLevel = Math.max(1, playerLevel - 2);
      const maxLevel = Math.min(25, playerLevel + 1);
      const enemyLevel = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;

      // Rarity by tier for presentation
      const rarityByTier = { 1: 'UNCOMMON', 2: 'RARE', 3: 'EPIC', 4: 'LEGENDARY' };
      const rarity = rarityByTier[Math.max(1, Math.min(4, trainer.tier))] || 'RARE';

      const baseStats = {
        COMMON: { attack: 15, defense: 15, health: 35 },
        UNCOMMON: { attack: 20, defense: 20, health: 50 },
        RARE: { attack: 25, defense: 25, health: 65 },
        EPIC: { attack: 30, defense: 30, health: 80 },
        LEGENDARY: { attack: 35, defense: 35, health: 95 },
      }[rarity];

      const levelMultiplier = 1 + (enemyLevel - 1) * 0.03;
      const tierMultiplier = [0, 1.0, 1.25, 1.5, 1.75][Math.min(Math.max(playerTier, 1), 4)];

      const atk = Math.floor(baseStats.attack * levelMultiplier * tierMultiplier);
      const def = Math.floor(baseStats.defense * levelMultiplier * tierMultiplier);
      const hp = Math.floor(baseStats.health * levelMultiplier * tierMultiplier);

      return {
        name: trainer.name,
        level: enemyLevel,
        rarity,
        element: trainer.element,
        attack: atk,
        defense: def,
        health: hp,
        maxHealth: hp,
        currentHealth: hp,
        image_url: trainer.image_url,
        lore: trainer.lore,
      };
    }
  } catch (_) {
    // Fall through to legacy generator
  }

  // Legacy random generator (fallback)
  const minLevel = Math.max(1, playerLevel - 3);
  const maxLevel = Math.min(20, playerLevel + 1);
  const enemyLevel = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;
  const elements = ["FIRE", "NATURE", "LIGHTNING", "LIGHT", "NEUTRAL"];
  let availableRarities;
  if (playerLevel <= 4) {
    // Levels 1-4: Only common and uncommon enemies
    availableRarities = ["COMMON", "UNCOMMON"];
  } else {
    // Level 5+: All rarities available
    availableRarities = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
  }

  const rarity =
    availableRarities[Math.floor(Math.random() * availableRarities.length)];
  const element = elements[Math.floor(Math.random() * elements.length)];

  const baseStats = {
    COMMON: { attack: 15, defense: 15, health: 35 },
    UNCOMMON: { attack: 20, defense: 20, health: 50 },
    RARE: { attack: 25, defense: 25, health: 65 },
    EPIC: { attack: 30, defense: 30, health: 80 },
    LEGENDARY: { attack: 35, defense: 35, health: 95 },
  }[rarity];

  // Scale stats with level and tier
  const levelMultiplier = 1 + (enemyLevel - 1) * 0.03;
  const tierMultiplier = [0, 1.0, 1.25, 1.5, 1.75][Math.min(Math.max(playerTier, 1), 4)];

  return {
    name: `${element.toLowerCase()} ${rarity.toLowerCase()} beast`,
    level: enemyLevel,
    rarity: rarity,
    element: element,
    attack: Math.floor(baseStats.attack * levelMultiplier * tierMultiplier),
    defense: Math.floor(baseStats.defense * levelMultiplier * tierMultiplier),
    health: Math.floor(baseStats.health * levelMultiplier * tierMultiplier),
    maxHealth: Math.floor(baseStats.health * levelMultiplier * tierMultiplier),
    currentHealth: Math.floor(baseStats.health * levelMultiplier * tierMultiplier),
  };
};

/**
 * Get available elements for a fused character
 */
export const getAvailableElements = (fusedCharacter) => {
  if (!fusedCharacter.elementalAffinities) {
    return ["NEUTRAL"];
  }

  const elements = [];
  for (const [element, affinity] of Object.entries(
    fusedCharacter.elementalAffinities
  )) {
    if (
      element !== "_primaryElement" &&
      element !== "_damageBonus" &&
      affinity > 0
    ) {
      elements.push(element);
    }
  }

  return elements.length > 0 ? elements : ["NEUTRAL"];
};

/**
 * Get primary element for damage bonus
 */
export const getPrimaryElement = (fusedCharacter) => {
  if (
    fusedCharacter.elementalAffinities &&
    fusedCharacter.elementalAffinities._primaryElement
  ) {
    return fusedCharacter.elementalAffinities._primaryElement;
  }
  return "NEUTRAL";
};

export default {
  calculateFusedDamage,
  executeFusedCombatTurn,
  generateTrainingEnemy,
  getXpForNextLevel,
  getAvailableElements,
  getPrimaryElement,
  isCriticalHit,
};
