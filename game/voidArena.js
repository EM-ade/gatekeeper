import { Worker } from 'worker_threads';
import { calculateDamage } from './combatEngine.js';
import { getElementMultiplier } from '../utils/nftMetadata.js';
import { getUserInventory } from '../data/realmkins.js';

// Enemy templates for Void Arena
const VOID_ENEMY_TEMPLATES = [
  {
    name: "Beastkin Alpha",
    level: 5,
    rarity: "UNCOMMON",
    element: "FIRE",
    attack: 65,
    defense: 55,
    health: 150,
    power: 1.2
  },
  {
    name: "Beastkin Wolf",
    level: 3,
    rarity: "COMMON", 
    element: "NATURE",
    attack: 55,
    defense: 45,
    health: 120,
    power: 1.0
  },
  {
    name: "Void Stalker",
    level: 7,
    rarity: "RARE",
    element: "LIGHTNING", 
    attack: 75,
    defense: 65,
    health: 180,
    power: 1.4
  },
  {
    name: "Ancient Guardian",
    level: 10,
    rarity: "EPIC",
    element: "LIGHT",
    attack: 90,
    defense: 80,
    health: 220,
    power: 1.8
  }
];

// AI Decision Tree for Void Arena
const AI_DECISION_TREE = {
  use_potion: (nft, battleState) => {
    return nft.health < 0.3 * nft.maxHealth && hasItem(nft, 'HEALTH_POTION');
  },
  elemental_attack: (nft, battleState) => {
    const advantageousTarget = findElementalAdvantageTarget(nft, battleState.enemies);
    return advantageousTarget !== null;
  },
  basic_attack: (nft, battleState) => {
    return true; // Fallback action
  }
};

/**
 * Calculate team power for probabilistic combat
 */
export const calculateTeamPower = (team) => {
  return team.reduce((total, nft) => {
    const nftPower = (nft.attack + nft.defense + nft.health) * (1 + (nft.level * 0.1));
    return total + nftPower;
  }, 0);
};

/**
 * Probabilistic combat outcome calculation
 */
export const calculateCombatOutcome = (playerTeam, enemyTeam) => {
  const playerPower = calculateTeamPower(playerTeam);
  const enemyPower = calculateTeamPower(enemyTeam);
  const winProbability = playerPower / (playerPower + enemyPower);
  
  return Math.random() < winProbability ? "win" : "loss";
};

/**
 * AI decision making for Void Arena
 */
export const makeAIDecision = (nft, battleState) => {
  // Check decision tree in priority order
  if (AI_DECISION_TREE.use_potion(nft, battleState)) {
    return { action: 'use_item', item: 'HEALTH_POTION', target: nft.nftId };
  }
  
  if (AI_DECISION_TREE.elemental_attack(nft, battleState)) {
    const target = findElementalAdvantageTarget(nft, battleState.enemies);
    return { action: 'attack', target: target.nftId, move: 'elemental_strike' };
  }
  
  // Fallback to basic attack
  const target = findWeakestEnemy(battleState.enemies);
  return { action: 'attack', target: target.nftId, move: 'basic_attack' };
};

/**
 * Find enemy with elemental advantage
 */
const findElementalAdvantageTarget = (nft, enemies) => {
  return enemies.find(enemy => 
    getElementMultiplier(nft.element, enemy.element) > 1.0
  ) || null;
};

/**
 * Find weakest enemy (lowest health)
 */
const findWeakestEnemy = (enemies) => {
  return enemies.reduce((weakest, enemy) => 
    (!weakest || enemy.health < weakest.health) ? enemy : weakest, null
  ) || enemies[0];
};

/**
 * Check if NFT has specific item
 */
const hasItem = async (nft, itemType) => {
  const inventory = await getUserInventory(nft.userId);
  return inventory.some(item => 
    item.item_type === itemType && item.nft_id === nft.nftId
  );
};

/**
 * Process Void Arena battle using worker threads for scalability
 */
export const processVoidArenaBattle = async (playerTeams, enemyTeams) => {
  const results = [];
  
  // Use worker pool for parallel processing
  const workerPromises = playerTeams.map((playerTeam, index) => {
    return new Promise((resolve) => {
      const worker = new Worker('./game/voidWorker.js', {
        workerData: {
          playerTeam,
          enemyTeam: enemyTeams[index],
          battleId: `battle_${Date.now()}_${index}`
        }
      });
      
      worker.on('message', (result) => {
        results.push(result);
        resolve();
      });
      
      worker.on('error', (error) => {
        console.error(`Worker error for battle ${index}:`, error);
        // Fallback to main thread calculation
        const fallbackResult = calculateFallbackBattle(playerTeam, enemyTeams[index]);
        results.push(fallbackResult);
        resolve();
      });
    });
  });
  
  await Promise.all(workerPromises);
  return results;
};

/**
 * Fallback battle calculation if workers fail
 */
const calculateFallbackBattle = (playerTeam, enemyTeam) => {
  const outcome = calculateCombatOutcome(playerTeam, enemyTeam);
  const kills = outcome === "win" ? Math.floor(Math.random() * enemyTeam.length) + 1 : 0;
  const deaths = outcome === "loss" ? Math.floor(Math.random() * playerTeam.length) : 0;
  
  return {
    battleId: `fallback_${Date.now()}`,
    outcome,
    kills,
    deaths,
    rewards: {
      mkin: kills * 10,
      xp: kills * 5
    }
  };
};

/**
 * Generate enemy team for Void Arena
 */
export const generateEnemyTeam = (playerTeamLevel, difficulty = 'normal') => {
  const difficultyMultiplier = {
    easy: 0.8,
    normal: 1.15,
    hard: 1.35,
    extreme: 1.7
  }[difficulty] || 1.0;
  
  const teamSize = Math.min(3, Math.floor(Math.random() * 3) + 1);
  const enemies = [];
  
  for (let i = 0; i < teamSize; i++) {
    const template = VOID_ENEMY_TEMPLATES[Math.floor(Math.random() * VOID_ENEMY_TEMPLATES.length)];
    const levelVariation = Math.floor(Math.random() * 3) - 1;
    const enemyLevel = Math.max(1, Math.min(20, playerTeamLevel + levelVariation));
    
    const levelMultiplier = 1 + ((enemyLevel - 1) * 0.1);
    const difficultyMulti = difficultyMultiplier;
    
    enemies.push({
      ...template,
      level: enemyLevel,
      attack: Math.floor(template.attack * levelMultiplier * difficultyMulti),
      defense: Math.floor(template.defense * levelMultiplier * difficultyMulti),
      health: Math.floor(template.health * levelMultiplier * difficultyMulti),
      maxHealth: Math.floor(template.health * levelMultiplier * difficultyMulti),
      nftId: `enemy_${template.name.toLowerCase().replace(/\s+/g, '_')}_${i}`
    });
  }
  
  return enemies;
};

/**
 * Calculate average team level
 */
export const calculateAverageTeamLevel = (team) => {
  if (team.length === 0) return 1;
  return Math.round(team.reduce((sum, nft) => sum + nft.level, 0) / team.length);
};

/**
 * Simulate quick Void Arena round (for large events)
 */
export const simulateQuickRound = (playerTeam, enemyTeam) => {
  const playerPower = calculateTeamPower(playerTeam);
  const enemyPower = calculateTeamPower(enemyTeam);
  const winProbability = playerPower / (playerPower + enemyPower);
  
  const outcome = Math.random() < winProbability ? "win" : "loss";
  const kills = Math.floor(Math.random() * (outcome === "win" ? enemyTeam.length : 1)) + 1;
  const deaths = outcome === "loss" ? Math.floor(Math.random() * playerTeam.length) + 1 : 0;
  
  return {
    outcome,
    kills,
    deaths,
    rewards: {
      mkin: kills * 10,
      xp: kills * 5
    }
  };
};

export default {
  calculateTeamPower,
  calculateCombatOutcome,
  makeAIDecision,
  processVoidArenaBattle,
  generateEnemyTeam,
  calculateAverageTeamLevel,
  simulateQuickRound
};
