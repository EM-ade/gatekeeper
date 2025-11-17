import sql from '../db.js';

// Initialize PvP achievements table
export const initPvpAchievementsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS pvp_achievements (
      achievement_id SERIAL PRIMARY KEY,
      discord_id TEXT NOT NULL,
      achievement_type TEXT NOT NULL,
      achievement_name TEXT NOT NULL,
      description TEXT NOT NULL,
      earned_at TIMESTAMP DEFAULT NOW(),
      session_id INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(discord_id, achievement_type, achievement_name)
    );
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pvp_achievements_discord_id 
    ON pvp_achievements(discord_id);
  `;
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pvp_achievements_type 
    ON pvp_achievements(achievement_type);
  `;
};

// Achievement definitions
const ACHIEVEMENTS = {
  // Kill-based achievements
  'first_blood': {
    name: 'First Blood',
    description: 'Get your first kill in a PvP race',
    emoji: '🩸',
    rarity: 'common'
  },
  'berserker': {
    name: 'Berserker',
    description: 'Get 10+ kills in a single race',
    emoji: '⚔️',
    rarity: 'rare'
  },
  'massacre': {
    name: 'Massacre',
    description: 'Get 20+ kills in a single race',
    emoji: '💀',
    rarity: 'epic'
  },
  'legendary_slayer': {
    name: 'Legendary Slayer',
    description: 'Get 30+ kills in a single race',
    emoji: '👑',
    rarity: 'legendary'
  },
  
  // Victory-based achievements
  'first_victory': {
    name: 'First Victory',
    description: 'Win your first PvP race',
    emoji: '🏆',
    rarity: 'common'
  },
  'domination': {
    name: 'Domination',
    description: 'Win by 10+ kills',
    emoji: '⚡',
    rarity: 'rare'
  },
  'flawless_victory': {
    name: 'Flawless Victory',
    description: 'Win without your opponent getting a single kill',
    emoji: '💎',
    rarity: 'epic'
  },
  'clutch_master': {
    name: 'Clutch Master',
    description: 'Win in the final minute',
    emoji: '🎯',
    rarity: 'rare'
  },
  
  // Streak achievements
  'win_streak_3': {
    name: 'Hot Streak',
    description: 'Win 3 races in a row',
    emoji: '🔥',
    rarity: 'rare'
  },
  'win_streak_5': {
    name: 'Unstoppable',
    description: 'Win 5 races in a row',
    emoji: '🚀',
    rarity: 'epic'
  },
  'win_streak_10': {
    name: 'Legendary Champion',
    description: 'Win 10 races in a row',
    emoji: '👑',
    rarity: 'legendary'
  },
  
  // Stakes achievements
  'high_roller': {
    name: 'High Roller',
    description: 'Win a race with 500+ MKIN stakes',
    emoji: '💰',
    rarity: 'rare'
  },
  'whale': {
    name: 'Whale',
    description: 'Win a race with 1000+ MKIN stakes',
    emoji: '🐋',
    rarity: 'epic'
  },
  
  // Special achievements
  'comeback_kid': {
    name: 'Comeback Kid',
    description: 'Win after being 5+ kills behind',
    emoji: '🔄',
    rarity: 'epic'
  },
  'speed_demon': {
    name: 'Speed Demon',
    description: 'Get 5 kills in under 2 minutes',
    emoji: '💨',
    rarity: 'rare'
  },
  'marathon_runner': {
    name: 'Marathon Runner',
    description: 'Complete a 30+ minute race',
    emoji: '🏃',
    rarity: 'rare'
  }
};

// Award achievement to player
export const awardAchievement = async (discordId, achievementKey, sessionId = null, metadata = {}) => {
  const achievement = ACHIEVEMENTS[achievementKey];
  if (!achievement) {
    console.warn(`Unknown achievement: ${achievementKey}`);
    return null;
  }

  try {
    const result = await sql`
      INSERT INTO pvp_achievements (discord_id, achievement_type, achievement_name, description, session_id, metadata)
      VALUES (${discordId}, ${achievementKey}, ${achievement.name}, ${achievement.description}, ${sessionId}, ${JSON.stringify(metadata)})
      ON CONFLICT (discord_id, achievement_type, achievement_name) DO NOTHING
      RETURNING *;
    `;

    if (result.length > 0) {
      console.log(`🏆 Achievement unlocked: ${discordId} earned "${achievement.name}"`);
      return {
        ...result[0],
        emoji: achievement.emoji,
        rarity: achievement.rarity
      };
    }
    return null; // Already had this achievement
  } catch (error) {
    console.error('Error awarding achievement:', error);
    return null;
  }
};

// Get player's achievements
export const getPlayerAchievements = async (discordId) => {
  const achievements = await sql`
    SELECT * FROM pvp_achievements 
    WHERE discord_id = ${discordId}
    ORDER BY earned_at DESC;
  `;

  return achievements.map(ach => ({
    ...ach,
    emoji: ACHIEVEMENTS[ach.achievement_type]?.emoji || '🏆',
    rarity: ACHIEVEMENTS[ach.achievement_type]?.rarity || 'common'
  }));
};

// Get achievement leaderboard
export const getAchievementLeaderboard = async (limit = 10) => {
  const leaderboard = await sql`
    SELECT 
      discord_id,
      COUNT(*) as total_achievements,
      COUNT(CASE WHEN achievement_type IN ('legendary_slayer', 'win_streak_10', 'whale') THEN 1 END) as legendary_count,
      COUNT(CASE WHEN achievement_type IN ('massacre', 'flawless_victory', 'win_streak_5', 'comeback_kid') THEN 1 END) as epic_count,
      COUNT(CASE WHEN achievement_type IN ('berserker', 'domination', 'clutch_master', 'win_streak_3', 'high_roller', 'speed_demon', 'marathon_runner') THEN 1 END) as rare_count,
      MAX(earned_at) as last_earned
    FROM pvp_achievements
    GROUP BY discord_id
    ORDER BY 
      legendary_count DESC,
      epic_count DESC,
      rare_count DESC,
      total_achievements DESC
    LIMIT ${limit};
  `;

  return leaderboard;
};

// Check and award achievements after a race
export const checkRaceAchievements = async (session, winnerId, loserId, winnerKills, loserKills) => {
  const achievements = [];
  const sessionId = session.session_id;
  const raceTimeMinutes = session.duration_minutes;
  const stakes = session.stake_mkin;
  
  // Check winner achievements
  if (winnerId) {
    // First victory check
    const previousWins = await sql`
      SELECT COUNT(*) as wins FROM pvp_sessions 
      WHERE (player_a_discord_id = ${winnerId} AND kills_a > kills_b) 
         OR (player_b_discord_id = ${winnerId} AND kills_b > kills_a)
      AND status = 'completed';
    `;
    
    if (previousWins[0].wins === 1) { // This is their first win
      const ach = await awardAchievement(winnerId, 'first_victory', sessionId);
      if (ach) achievements.push(ach);
    }

    // Kill-based achievements
    if (winnerKills >= 30) {
      const ach = await awardAchievement(winnerId, 'legendary_slayer', sessionId, { kills: winnerKills });
      if (ach) achievements.push(ach);
    } else if (winnerKills >= 20) {
      const ach = await awardAchievement(winnerId, 'massacre', sessionId, { kills: winnerKills });
      if (ach) achievements.push(ach);
    } else if (winnerKills >= 10) {
      const ach = await awardAchievement(winnerId, 'berserker', sessionId, { kills: winnerKills });
      if (ach) achievements.push(ach);
    }

    // Victory type achievements
    const killDiff = winnerKills - loserKills;
    if (loserKills === 0) {
      const ach = await awardAchievement(winnerId, 'flawless_victory', sessionId);
      if (ach) achievements.push(ach);
    } else if (killDiff >= 10) {
      const ach = await awardAchievement(winnerId, 'domination', sessionId, { killDiff });
      if (ach) achievements.push(ach);
    }

    // Stakes achievements
    if (stakes >= 1000) {
      const ach = await awardAchievement(winnerId, 'whale', sessionId, { stakes });
      if (ach) achievements.push(ach);
    } else if (stakes >= 500) {
      const ach = await awardAchievement(winnerId, 'high_roller', sessionId, { stakes });
      if (ach) achievements.push(ach);
    }

    // Marathon achievement
    if (raceTimeMinutes >= 30) {
      const ach = await awardAchievement(winnerId, 'marathon_runner', sessionId, { duration: raceTimeMinutes });
      if (ach) achievements.push(ach);
    }

    // Check win streaks
    await checkWinStreak(winnerId, sessionId, achievements);
  }

  // Check first blood for both players
  await checkFirstBlood(session.player_a_discord_id, sessionId, achievements);
  await checkFirstBlood(session.player_b_discord_id, sessionId, achievements);

  return achievements;
};

// Check win streak achievements
async function checkWinStreak(discordId, sessionId, achievements) {
  // Get recent race results for this player
  const recentRaces = await sql`
    SELECT 
      session_id,
      CASE 
        WHEN player_a_discord_id = ${discordId} THEN 
          CASE WHEN kills_a > kills_b THEN 'win' ELSE 'loss' END
        ELSE 
          CASE WHEN kills_b > kills_a THEN 'win' ELSE 'loss' END
      END as result
    FROM pvp_sessions 
    WHERE (player_a_discord_id = ${discordId} OR player_b_discord_id = ${discordId})
    AND status = 'completed'
    ORDER BY ended_at DESC
    LIMIT 15;
  `;

  // Count consecutive wins from the most recent
  let streak = 0;
  for (const race of recentRaces) {
    if (race.result === 'win') {
      streak++;
    } else {
      break;
    }
  }

  // Award streak achievements
  if (streak >= 10) {
    const ach = await awardAchievement(discordId, 'win_streak_10', sessionId, { streak });
    if (ach) achievements.push(ach);
  } else if (streak >= 5) {
    const ach = await awardAchievement(discordId, 'win_streak_5', sessionId, { streak });
    if (ach) achievements.push(ach);
  } else if (streak >= 3) {
    const ach = await awardAchievement(discordId, 'win_streak_3', sessionId, { streak });
    if (ach) achievements.push(ach);
  }
}

// Check first blood achievement
async function checkFirstBlood(discordId, sessionId, achievements) {
  const previousKills = await sql`
    SELECT COUNT(*) as total_kills FROM pvp_sessions 
    WHERE (player_a_discord_id = ${discordId} AND kills_a > 0) 
       OR (player_b_discord_id = ${discordId} AND kills_b > 0)
    AND status = 'completed'
    AND session_id != ${sessionId};
  `;

  if (previousKills[0].total_kills === 0) {
    // This was their first kill ever
    const ach = await awardAchievement(discordId, 'first_blood', sessionId);
    if (ach) achievements.push(ach);
  }
}

export default {
  initPvpAchievementsTable,
  awardAchievement,
  getPlayerAchievements,
  getAchievementLeaderboard,
  checkRaceAchievements,
  ACHIEVEMENTS
};
