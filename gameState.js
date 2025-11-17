
const gameState = {
  // Event state
  status: 'ended', // waiting, in_progress, ended
  rewardPerKill: 0,
  joinTime: 0,
  startTime: null,
  joinInterval: null,
  battleInterval: null,
  
  // Player state
  players: {}, // Moved to individual battle tracking
  
  // Individual battle tracking
  playerBattles: {}, // userId -> battleState
  
  // Server-wide statistics for dynamic difficulty
  serverStats: {
    totalKills: 0,
    startTime: null,
    lastDifficultyAdjustment: null,
    currentDifficulty: 1.0, // 1.0 = normal, affects monster HP
    targetKillRate: 16, // minutes per kill (450 kills / 7200 minutes)
    killHistory: [] // timestamps of kills for rate calculation
  },
  
  // Battle timers
  battleTimers: new Map(), // userId -> interval timer
  cooldownTimers: new Map() // userId -> cooldown timer
};

/**
 * Calculate current server kill rate (minutes per kill)
 */
gameState.calculateKillRate = function() {
  if (this.serverStats.killHistory.length < 2) {
    return this.serverStats.targetKillRate; // Default to target
  }
  
  const now = Date.now();
  const recentKills = this.serverStats.killHistory.filter(
    timestamp => now - timestamp < 3600000 // Last hour
  );
  
  if (recentKills.length < 2) {
    return this.serverStats.targetKillRate;
  }
  
  const timeSpan = (recentKills[recentKills.length - 1] - recentKills[0]) / 60000; // minutes
  const kills = recentKills.length - 1;
  
  return timeSpan / kills;
};

/**
 * Adjust difficulty based on current kill rate
 */
gameState.adjustDifficulty = function() {
  const currentRate = this.calculateKillRate();
  const targetRate = this.serverStats.targetKillRate;
  
  // Only adjust every 30 minutes max
  const now = Date.now();
  if (this.serverStats.lastDifficultyAdjustment && 
      now - this.serverStats.lastDifficultyAdjustment < 1800000) {
    return false;
  }
  
  let difficultyChanged = false;
  
  if (currentRate < targetRate * 0.8) {
    // Too fast - increase difficulty
    this.serverStats.currentDifficulty = Math.min(1.33, this.serverStats.currentDifficulty + 0.1);
    difficultyChanged = true;
  } else if (currentRate > targetRate * 1.2) {
    // Too slow - decrease difficulty
    this.serverStats.currentDifficulty = Math.max(0.67, this.serverStats.currentDifficulty - 0.1);
    difficultyChanged = true;
  }
  
  if (difficultyChanged) {
    this.serverStats.lastDifficultyAdjustment = now;
  }
  
  return difficultyChanged;
};

/**
 * Record a kill for server statistics
 */
gameState.recordKill = function() {
  this.serverStats.totalKills++;
  this.serverStats.killHistory.push(Date.now());
  
  // Keep only last 1000 kills for performance
  if (this.serverStats.killHistory.length > 1000) {
    this.serverStats.killHistory.shift();
  }
  
  // Check if we need to adjust difficulty
  return this.adjustDifficulty();
};

/**
 * Initialize server stats for new event
 */
gameState.initializeServerStats = function() {
  this.serverStats = {
    totalKills: 0,
    startTime: Date.now(),
    lastDifficultyAdjustment: null,
    currentDifficulty: 1.0,
    targetKillRate: 16,
    killHistory: []
  };
};

/**
 * Cleanup battle for a player
 */
gameState.cleanupPlayerBattle = function(userId) {
  // Clear timers
  if (this.battleTimers.has(userId)) {
    clearInterval(this.battleTimers.get(userId));
    this.battleTimers.delete(userId);
  }
  
  if (this.cooldownTimers.has(userId)) {
    clearTimeout(this.cooldownTimers.get(userId));
    this.cooldownTimers.delete(userId);
  }
  
  // Remove battle state
  if (this.playerBattles[userId]) {
    delete this.playerBattles[userId];
  }
};

export default gameState;
