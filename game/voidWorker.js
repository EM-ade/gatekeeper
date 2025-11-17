import { parentPort, workerData } from 'worker_threads';
import { calculateCombatOutcome, simulateQuickRound } from './voidArena.js';

/**
 * Worker thread for processing Void Arena battles
 * This allows parallel processing of multiple battles for scalability
 */

const processBattle = (playerTeam, enemyTeam, battleId) => {
  try {
    // For large-scale events, use quick simulation
    if (playerTeam.length > 0 && enemyTeam.length > 0) {
      const result = simulateQuickRound(playerTeam, enemyTeam);
      
      return {
        battleId,
        outcome: result.outcome,
        kills: result.kills,
        deaths: result.deaths,
        rewards: result.rewards,
        processedAt: new Date().toISOString()
      };
    }
    
    // Fallback if teams are empty
    return {
      battleId,
      outcome: "draw",
      kills: 0,
      deaths: 0,
      rewards: { mkin: 0, xp: 0 },
      processedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error processing battle ${battleId}:`, error);
    
    // Return fallback result on error
    return {
      battleId,
      outcome: "error",
      kills: 0,
      deaths: 0,
      rewards: { mkin: 0, xp: 0 },
      error: error.message,
      processedAt: new Date().toISOString()
    };
  }
};

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', (message) => {
    if (message.type === 'process_battle') {
      const result = processBattle(
        message.playerTeam,
        message.enemyTeam,
        message.battleId
      );
      
      parentPort.postMessage(result);
    }
  });
}

// Process initial battle data if provided via workerData
if (workerData) {
  const result = processBattle(
    workerData.playerTeam,
    workerData.enemyTeam,
    workerData.battleId
  );
  
  if (parentPort) {
    parentPort.postMessage(result);
  } else {
    // For testing/debugging
    console.log('Battle result:', result);
  }
}
