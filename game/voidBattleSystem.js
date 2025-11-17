import { getFusedCharacter } from '../data/fusedCharacters.js';
import { updateTotalKills } from '../data/userWallets.js';
import { updateEventKills } from '../data/eventManager.js';
import gameState from '../gameState.js';

// Monster templates for Void Arena
const VOID_MONSTER_TEMPLATES = [
  {
    name: "Beastkin Champion",
    level: 5,
    element: "FIRE",
    baseHP: 3,
    attack: 65,
    defense: 55
  },
  {
    name: "Void Stalker", 
    level: 7,
    element: "LIGHTNING",
    baseHP: 3,
    attack: 75,
    defense: 65
  },
  {
    name: "Ancient Guardian",
    level: 10, 
    element: "LIGHT",
    baseHP: 3,
    attack: 90,
    defense: 80
  },
  {
    name: "Shadow Predator",
    level: 8,
    element: "NEUTRAL",
    baseHP: 3, 
    attack: 80,
    defense: 70
  }
];

// Narrative messages
const BATTLE_MESSAGES = {
  encounter: (playerName, monsterName) => 
    `⚔️ ${playerName} has encountered a hulking ${monsterName}!`,
  
  playerHit: (playerName, monsterName, remainingHP) =>
    `🗡️ A solid blow! ${playerName} lands a hit on the ${monsterName}! (${remainingHP} HP remaining)`,
  
  playerMiss: (playerName, monsterName) =>
    `🛡️ The ${monsterName} parries the attack! ${playerName} is forced back!`,
  
  counterAttack: (playerName, monsterName, damage) =>
    `💥 The monster strikes back! ${playerName} takes a ${damage > 15 ? 'heavy' : 'glancing'} blow!`,
  
  monsterDefeated: (playerName, monsterName) =>
    `🎉 Victory! ${playerName} has defeated the ${monsterName} and claims a kill!`,
  
  difficultyIncrease: () =>
    `🌀 The Void trembles with newfound power! Monsters grow more resilient!`,
  
  difficultyDecrease: () =>
    `✨ A wave of weakness washes over the Void! The monsters are easier to defeat!`
};

/**
 * Calculate final hit chance for player based on their training/strength
 */
export const calculateHitChance = (playerAttack, playerLevel, playerDefense) => {
  // Base chance starts lower for balance
  const baseChance = 0.15; // 15% base chance
  
  // Attack bonus scales with training (higher attack = better performance)
  const attackBonus = (playerAttack / 300); // More gradual scaling
  
  // Level bonus (higher level = more experience = better performance)
  const levelBonus = (playerLevel / 100); // Level 50 = 50% bonus
  
  // Defense bonus (better defense = more survivability = more opportunities)
  const defenseBonus = (playerDefense / 400); // Defense helps but less than attack
  
  const finalChance = baseChance + attackBonus + levelBonus + defenseBonus;
  
  // Cap between 5% and 90% (even weak players have some chance, strong players are capped)
  return Math.max(0.05, Math.min(0.90, finalChance));
};

/**
 * Calculate counter-attack chance and damage
 */
export const calculateCounterAttack = (monsterLevel) => {
  const counterChance = 0.25; // 25% chance when player misses
  const damage = monsterLevel * 5 + Math.floor(Math.random() * 10) + 1;
  return { chance: counterChance, damage };
};

/**
 * Generate monster for player battle
 */
export const generateMonster = (playerLevel, difficultyMultiplier = 1.0, playerTier = 1) => {
  const template = VOID_MONSTER_TEMPLATES[Math.floor(Math.random() * VOID_MONSTER_TEMPLATES.length)];
  const levelVariation = Math.floor(Math.random() * 5) - 2;
  const monsterLevel = Math.max(1, Math.min(20, playerLevel + levelVariation));
  
  const levelMultiplier = 1 + ((monsterLevel - 1) * 0.1);
  
  // Apply dynamic HP based on difficulty and tier
  const tierMultiplier = [0, 1.0, 1.25, 1.5, 1.8][Math.min(Math.max(playerTier, 1), 4)];
  const baseHP = Math.max(2, Math.min(6, Math.round(template.baseHP * difficultyMultiplier * (tierMultiplier >= 1.5 ? 1.2 : 1.0))));
  
  return {
    ...template,
    level: monsterLevel,
    currentHP: baseHP,
    maxHP: baseHP,
    attack: Math.floor(template.attack * levelMultiplier * tierMultiplier),
    defense: Math.floor(template.defense * levelMultiplier * tierMultiplier)
  };
};

/**
 * Process battle round with multiple attacks
 */
export const processBattleRound = async (playerId, battleState) => {
  const player = await getFusedCharacter(playerId);
  if (!player) return null;

  const { monster } = battleState;
  const hitChance = calculateHitChance(player.total_attack);
  const results = [];
  
  // Process 2-3 attacks per round
  const attackCount = Math.floor(Math.random() * 2) + 2; // 2 or 3 attacks
  
  for (let i = 0; i < attackCount; i++) {
    const hitRoll = Math.random();
    let result = {
      playerHit: false,
      counterAttack: false,
      counterDamage: 0,
      monsterDefeated: false,
      message: ''
    };

    // Player attack
    if (hitRoll < hitChance) {
      monster.currentHP -= 1;
      result.playerHit = true;
      result.message = BATTLE_MESSAGES.playerHit(
        battleState.playerName, 
        monster.name, 
        monster.currentHP
      );
      
      // Check if monster defeated
      if (monster.currentHP <= 0) {
        result.monsterDefeated = true;
        result.message += `\n${BATTLE_MESSAGES.monsterDefeated(battleState.playerName, monster.name)}`;
        results.push(result);
        break; // Stop attacks if monster defeated
      }
    } else {
      // Player missed - check for counter attack
      const counter = calculateCounterAttack(monster.level);
      if (Math.random() < counter.chance) {
        result.counterAttack = true;
        result.counterDamage = Math.max(1, counter.damage - Math.floor(player.total_defense / 10));
        result.message = BATTLE_MESSAGES.playerMiss(battleState.playerName, monster.name) +
          `\n${BATTLE_MESSAGES.counterAttack(battleState.playerName, monster.name, result.counterDamage)}`;
      } else {
        result.message = BATTLE_MESSAGES.playerMiss(battleState.playerName, monster.name);
      }
    }

    results.push(result);
    
    // If monster was defeated, stop processing more attacks
    if (result.monsterDefeated) {
      break;
    }
  }

  return results;
};

/**
 * Get encounter message
 */
export const getEncounterMessage = (playerName, monsterName) => {
  return BATTLE_MESSAGES.encounter(playerName, monsterName);
};

/**
 * Get difficulty change message
 */
export const getDifficultyMessage = (increasing) => {
  return increasing ? BATTLE_MESSAGES.difficultyIncrease() : BATTLE_MESSAGES.difficultyDecrease();
};

/**
 * Run combat cycle for dashboard updates - Simplified Performance + RNG
 */
export async function runCombatCycle() {
  let totalKills = 0;
  
  // Count kills from all active player battles and update database
  for (const userId in gameState.playerBattles) {
    const battle = gameState.playerBattles[userId];
    if (battle && battle.kills > 0) {
      totalKills += battle.kills;
      
      // Update user kills in database
      try {
        await updateTotalKills(userId, battle.kills, true);
        console.log(`✅ Updated ${battle.kills} kills for user ${userId}`);
      } catch (error) {
        console.error(`❌ Failed to update kills for user ${userId}:`, error);
      }
      
      // Reset kills for this cycle
      battle.kills = 0;
    }
  }
  
  // Check if we've reached the kill cap (fix undefined issue)
  const currentEvent = await import('../data/eventManager.js').then(module => module.getCurrentEvent());
  const eventKills = currentEvent ? 
    await import('../data/eventManager.js').then(module => module.calculateEventKills(currentEvent.event_id)) : 
    gameState.serverStats.totalKills;
    
  const killCap = 450; // Fixed kill cap
  console.log(`Current event kills: ${eventKills}/${killCap}`);
  
  // If we've reached the kill cap, stop generating kills
  if (eventKills >= killCap) {
    console.log(`🛑 Kill cap reached (${eventKills}/${killCap})! No more kills will be generated.`);
    return 0;
  }
  
  // Get active players for this cycle
  const activePlayerIds = Object.keys(gameState.players || {});
  const activePlayerCount = activePlayerIds.length;
  
  if (activePlayerCount > 0) {
    // Daily kill target: 70-90 kills per day total
    const DAILY_MIN_KILLS = 70;
    const DAILY_MAX_KILLS = 90;
    const DAILY_TARGET_KILLS = Math.floor(Math.random() * (DAILY_MAX_KILLS - DAILY_MIN_KILLS + 1)) + DAILY_MIN_KILLS;
    
    // Calculate kills needed for today
    const killsNeededToday = Math.max(0, DAILY_TARGET_KILLS - eventKills);
    
    if (killsNeededToday > 0) {
      // Base kill chance - adjust this to hit daily target
      // Assuming 15-second cycles, we have 5760 cycles per day
      const targetKillsPerCycle = DAILY_TARGET_KILLS / 5760;
      
      // Generate kills based on target rate with some randomness
      const killRoll = Math.random();
      if (killRoll < targetKillsPerCycle) {
        // Select player based on performance + training stats
        const selectedPlayerId = await selectPlayerWithPerformanceBias(activePlayerIds);
        
        if (selectedPlayerId) {
          try {
            await updateTotalKills(selectedPlayerId, 1, true);
            console.log(`✅ Kill awarded to user ${selectedPlayerId} (Daily target: ${DAILY_TARGET_KILLS}, Needed: ${killsNeededToday})`);
            totalKills = 1;
          } catch (error) {
            console.error(`❌ Failed to award kill to ${selectedPlayerId}:`, error);
          }
        }
      }
    } else if (killsNeededToday <= 0) {
      console.log(`✅ Daily kill target reached: ${eventKills}/${DAILY_TARGET_KILLS}`);
    }
  }
  
  // Record kills in server stats
  if (gameState.serverStats && totalKills > 0) {
    gameState.serverStats.totalKills += totalKills;
    gameState.serverStats.killHistory.push(...Array(totalKills).fill(Date.now()));
    
    // Record kill events for dashboard
    for (let i = 0; i < totalKills; i++) {
      const activePlayers = Object.keys(gameState.playerBattles || {});
      if (activePlayers.length > 0) {
        const randomPlayerId = activePlayers[Math.floor(Math.random() * activePlayers.length)];
        const playerName = gameState.playerBattles[randomPlayerId]?.playerName || 'Unknown Champion';
        const monsterName = gameState.playerBattles[randomPlayerId]?.monster?.name || 'Beastkin';
        recordKillEvent(playerName, monsterName);
      }
    }
  }
  
  return totalKills;
}

// Event tracking for last kill message
let lastKillEvents = [];

/**
 * Record a kill event for dashboard display
 */
export function recordKillEvent(playerName, monsterName) {
  const event = `${playerName} has slain a ${monsterName}!`;
  lastKillEvents.unshift(event);
  
  // Keep only last 10 events
  if (lastKillEvents.length > 10) {
    lastKillEvents = lastKillEvents.slice(0, 10);
  }
  
  return event;
}

/**
 * Get latest kill event for dashboard
 */
export function getLatestKillEvent() {
  return lastKillEvents[0] || 'The arena is quiet...';
}

/**
 * Calculate performance score based on character stats including training progress
 */
export function calculatePerformanceScore(attack, defense, level, hp, trainingStats = {}) {
  // Enhanced weighted formula with training bonuses
  const attackWeight = 0.35;    // 35% weight (reduced from 40%)
  const levelWeight = 0.3;      // 30% weight
  const defenseWeight = 0.15;   // 15% weight (reduced from 20%)
  const hpWeight = 0.1;         // 10% weight
  const trainingWeight = 0.1;   // 10% weight for training achievements
  
  // Normalize stats to reasonable ranges
  const normalizedAttack = Math.min(attack / 100, 5); // Cap at 500 attack = 5.0
  const normalizedDefense = Math.min(defense / 100, 5); // Cap at 500 defense = 5.0
  const normalizedLevel = Math.min(level / 20, 5); // Cap at level 100 = 5.0
  const normalizedHp = Math.min(hp / 200, 5); // Cap at 1000 HP = 5.0
  
  // Training bonus based on training achievements
  let trainingBonus = 0;
  if (trainingStats) {
    // Bonus for high training frequency (more training = better performance)
    if (trainingStats.trainingCount > 50) trainingBonus += 1.0;
    else if (trainingStats.trainingCount > 25) trainingBonus += 0.5;
    else if (trainingStats.trainingCount > 10) trainingBonus += 0.25;
    
    // Bonus for recent training activity (last 24 hours)
    if (trainingStats.lastTraining && (Date.now() - trainingStats.lastTraining) < 86400000) {
      trainingBonus += 0.3;
    }
    
    // Bonus for training win rate
    if (trainingStats.winRate > 0.8) trainingBonus += 0.5;
    else if (trainingStats.winRate > 0.6) trainingBonus += 0.3;
    else if (trainingStats.winRate > 0.4) trainingBonus += 0.1;
  }
  
  const cappedTrainingBonus = Math.min(trainingBonus, 2.0); // Cap training bonus at 2.0
  
  const performanceScore =
    (normalizedAttack * attackWeight) +
    (normalizedLevel * levelWeight) +
    (normalizedDefense * defenseWeight) +
    (normalizedHp * hpWeight) +
    (cappedTrainingBonus * trainingWeight);
  
  return Math.max(0.1, performanceScore); // Ensure minimum performance score
}

/**
 * Select player based on performance (weighted random selection)
 */
export function selectPlayerByPerformance(playerPerformances) {
  if (playerPerformances.length === 0) return null;
  
  // Calculate total weight
  const totalWeight = playerPerformances.reduce((sum, p) => sum + p.performanceScore, 0);
  
  if (totalWeight === 0) {
    // If all players have 0 performance, select randomly
    return playerPerformances[Math.floor(Math.random() * playerPerformances.length)];
  }
  
  // Weighted random selection
  let random = Math.random() * totalWeight;
  
  for (const player of playerPerformances) {
    random -= player.performanceScore;
    if (random <= 0) {
      return player;
    }
  }
  
  // Fallback to last player
  return playerPerformances[playerPerformances.length - 1];
}

/**
 * Select player with performance bias but more RNG
 */
async function selectPlayerWithPerformanceBias(playerIds) {
  if (playerIds.length === 0) return null;
  
  // 70% chance for performance-based selection, 30% pure random
  if (Math.random() < 0.7) {
    // Performance-based selection
    const playerPerformances = [];
    
    for (const playerId of playerIds) {
      try {
        const playerCharacter = await getFusedCharacter(playerId);
        if (playerCharacter) {
          // Get training stats for performance calculation (placeholder - would need actual training data)
          const trainingStats = {
            trainingCount: playerCharacter.training_count || 0,
            lastTraining: playerCharacter.last_training || null,
            winRate: playerCharacter.training_win_rate || 0.5
          };
          
          const performanceScore = calculatePerformanceScore(
            playerCharacter.total_attack,
            playerCharacter.total_defense,
            playerCharacter.level,
            playerCharacter.max_hp,
            trainingStats
          );
          
          playerPerformances.push({
            playerId,
            performanceScore
          });
        }
      } catch (error) {
        console.error(`Error getting character for player ${playerId}:`, error);
      }
    }
    
    if (playerPerformances.length > 0) {
      const selectedPlayer = selectPlayerByPerformance(playerPerformances);
      return selectedPlayer ? selectedPlayer.playerId : null;
    }
  }
  
  // Pure random selection (30% chance or fallback)
  return playerIds[Math.floor(Math.random() * playerIds.length)];
}

export default {
  calculateHitChance,
  calculateCounterAttack,
  generateMonster,
  processBattleRound,
  getEncounterMessage,
  getDifficultyMessage,
  runCombatCycle,
  recordKillEvent,
  getLatestKillEvent,
  calculatePerformanceScore,
  selectPlayerByPerformance
};
