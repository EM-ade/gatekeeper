import sql from '../db.js';

/**
 * Compute current day number (1..total_days) for an event based on start_time
 */
export function getCurrentDayNumber(event) {
  if (!event || !event.start_time) return 1;
  const start = new Date(event.start_time).getTime();
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsedDays = Math.floor((now - start) / msPerDay);
  return Math.min(Math.max(1, elapsedDays + 1), event.total_days || 5);
}

/**
 * Event Manager for Void Arena events
 * Handles event creation, tracking, and statistics
 */

// Event state cache
const activeEventCache = new Map();

/**
 * Create a new void event
 */
export const createNewEvent = async (eventName = 'Void Arena Event', days = 5, goalKills = 450) => {
  try {
    const eventId = `void_event_${Date.now()}`;
    
    const result = await sql`
      INSERT INTO void_events (event_id, event_name, start_time, total_days, goal_kills, status)
      VALUES (${eventId}, ${eventName}, NOW(), ${days}, ${goalKills}, 'active')
      RETURNING *
    `;
    
    // Clear cache
    activeEventCache.clear();
    
    console.log(`✅ Created new void event: ${eventId}`);
    return result[0];
  } catch (error) {
    console.error('Error creating new event:', error);
    return null;
  }
};

/**
 * Get event status summary for admin dashboard status command
 */
export const getEventStatusSummary = async (eventId, dayNumber) => {
  try {
    const [participantCountRes, todayKillsRes, totalKillsRes] = await Promise.all([
      sql`SELECT COUNT(*)::int as count FROM event_participation WHERE event_id = ${eventId}`,
      sql`SELECT COALESCE(SUM(kills), 0)::int as today_kills FROM event_daily_user_kills WHERE event_id = ${eventId} AND day_number = ${dayNumber}`,
      sql`SELECT COALESCE(SUM(kills), 0)::int as total_kills FROM event_participation WHERE event_id = ${eventId}`
    ]);

    return {
      participants: participantCountRes[0]?.count || 0,
      today_kills: todayKillsRes[0]?.today_kills || 0,
      total_kills: totalKillsRes[0]?.total_kills || 0,
    };
  } catch (error) {
    console.error('Error getting event status summary:', error);
    return { participants: 0, today_kills: 0, total_kills: 0 };
  }
};

/**
 * Initialize daily user kills table if not present
 */
export const initDailyUserKillsTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS event_daily_user_kills (
        event_id TEXT REFERENCES void_events(event_id),
        day_number INTEGER NOT NULL,
        user_id TEXT REFERENCES linked_wallets(user_id),
        kills INTEGER DEFAULT 0,
        mkin_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (event_id, day_number, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_event_daily_user_kills_event_day ON event_daily_user_kills(event_id, day_number);
      CREATE INDEX IF NOT EXISTS idx_event_daily_user_kills_user ON event_daily_user_kills(user_id);
    `;
    console.log('✅ Ensured event_daily_user_kills table exists');
  } catch (error) {
    console.error('Error ensuring event_daily_user_kills table:', error);
  }
};

/**
 * Get daily leaderboard (day-only kills) for a given event and day
 */
export const getDailyLeaderboard = async (eventId, dayNumber, limit = 10) => {
  try {
    const result = await sql`
      SELECT 
        d.user_id,
        COALESCE(
          lw.display_name, 
          fc.username, 
          uw.display_name,
          'Player_' || SUBSTRING(d.user_id, 1, 8)
        ) as display_name,
        d.kills,
        d.mkin_earned,
        RANK() OVER (ORDER BY d.kills DESC, d.mkin_earned DESC) as rank
      FROM event_daily_user_kills d
      LEFT JOIN user_links ul ON d.user_id = ul.discord_id
      LEFT JOIN linked_wallets lw ON ul.user_id = lw.user_id
      LEFT JOIN fused_characters fc ON ul.user_id = fc.user_id
      LEFT JOIN user_wallets uw ON d.user_id = uw.user_id
      WHERE d.event_id = ${eventId} 
        AND d.day_number = ${dayNumber}
        AND d.kills > 0
      ORDER BY d.kills DESC, d.mkin_earned DESC
      LIMIT ${limit}
    `;
    return result;
  } catch (error) {
    console.error('Error getting daily leaderboard:', error);
    return [];
  }
};

/**
 * Get current active event
 */
export const getCurrentEvent = async () => {
  try {
    // Check cache first
    if (activeEventCache.has('current')) {
      return activeEventCache.get('current');
    }
    
    const result = await sql`
      SELECT * FROM void_events 
      WHERE status = 'active' 
      ORDER BY start_time DESC 
      LIMIT 1
    `;
    
    const event = result[0] || null;
    activeEventCache.set('current', event);
    
    return event;
  } catch (error) {
    console.error('Error getting current event:', error);
    return null;
  }
};

/**
 * End an event
 */
export const endEvent = async (eventId) => {
  try {
    const result = await sql`
      UPDATE void_events 
      SET status = 'completed', end_time = NOW()
      WHERE event_id = ${eventId}
      RETURNING *
    `;
    
    // Clear cache
    activeEventCache.clear();
    
    console.log(`🏁 Ended event: ${eventId}`);
    return result[0];
  } catch (error) {
    console.error('Error ending event:', error);
    return null;
  }
};

/**
 * Add player to event participation (initial join)
 */
export const addPlayerToEvent = async (userId) => {
  try {
    const currentEvent = await getCurrentEvent();
    if (!currentEvent) {
      console.warn('No active event found for player registration');
      return null;
    }
    
    console.log(`Attempting to add player ${userId} to event ${currentEvent.event_id}`);
    
    const result = await sql`
      INSERT INTO event_participation (event_id, user_id, kills, mkin_earned)
      VALUES (${currentEvent.event_id}, ${userId}, 0, 0)
      ON CONFLICT (event_id, user_id) DO NOTHING
      RETURNING *
    `;
    
    if (result.length > 0) {
      console.log(`✅ Player ${userId} successfully added to event ${currentEvent.event_id}`);
      return result[0];
    } else {
      // Check if player already exists in the event
      const existingPlayer = await sql`
        SELECT * FROM event_participation
        WHERE event_id = ${currentEvent.event_id} AND user_id = ${userId}
      `;
      
      if (existingPlayer.length > 0) {
        console.log(`ℹ️ Player ${userId} already exists in event ${currentEvent.event_id}`);
        return existingPlayer[0];
      } else {
        console.log(`❌ Player ${userId} was not added to event ${currentEvent.event_id} (no conflict but no insertion)`);
        return null;
      }
    }
  } catch (error) {
    console.error('Error adding player to event:', error);
    return null;
  }
};

/**
 * Update event kills for a user with timestamp
 */
export const updateEventKills = async (userId, kills, mkinEarned = 0) => {
  try {
    const currentEvent = await getCurrentEvent();
    if (!currentEvent) {
      console.warn('No active event found for kill tracking');
      return null;
    }
    
    const result = await sql`
      INSERT INTO event_participation (event_id, user_id, kills, mkin_earned)
      VALUES (${currentEvent.event_id}, ${userId}, ${kills}, ${mkinEarned})
      ON CONFLICT (event_id, user_id) DO UPDATE SET
        kills = event_participation.kills + ${kills},
        mkin_earned = event_participation.mkin_earned + ${mkinEarned}
      RETURNING *
    `;
    
    // Also update per-day user kills for daily leaderboards
    const dayNumber = getCurrentDayNumber(currentEvent);
    if (dayNumber >= 1 && dayNumber <= (currentEvent.total_days || 5)) {
      await sql`
        INSERT INTO event_daily_user_kills (event_id, day_number, user_id, kills, mkin_earned)
        VALUES (${currentEvent.event_id}, ${dayNumber}, ${userId}, ${kills}, ${mkinEarned})
        ON CONFLICT (event_id, day_number, user_id) DO UPDATE SET
          kills = event_daily_user_kills.kills + ${kills},
          mkin_earned = event_daily_user_kills.mkin_earned + ${mkinEarned}
      `;
    }

    // Credit unified MKIN balance in ledger for this user
    try {
      if (mkinEarned && Number(mkinEarned) !== 0) {
        // Check if userId is already a user_links.user_id or if it's a discord_id
        let linkedUserId = userId;
        
        // If userId looks like a Discord ID (numeric string), resolve to user_links.user_id
        if (/^\d+$/.test(userId)) {
          const linkRows = await sql`
            select user_id from user_links where discord_id = ${userId}
          `;
          linkedUserId = linkRows[0]?.user_id;
        }
        
        if (linkedUserId) {
          await sql`
            select public.apply_ledger_entry(${linkedUserId}::uuid, ${Number(mkinEarned)}::bigint, 'void_kill', ${`void:${currentEvent.event_id}:${dayNumber}:${userId}:${Date.now()}`}) as balance
          `;
        }
      }
    } catch (ledgerErr) {
      console.warn('Ledger credit on event kill failed:', ledgerErr);
    }

    return result[0];
  } catch (error) {
    console.error('Error updating event kills:', error);
    return null;
  }
};

/**
 * Get event leaderboard with real-time updates
 */
export const getEventLeaderboard = async (eventId, limit = 10) => {
  try {
    const result = await sql`
      SELECT
        ep.user_id,
        COALESCE(lw.display_name, fc.username, 'Player_' || ep.user_id) as display_name,
        ep.kills,
        ep.mkin_earned,
        RANK() OVER (ORDER BY ep.kills DESC, ep.mkin_earned DESC) as rank,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.updated_at, NOW()))) as seconds_since_update
      FROM event_participation ep
      LEFT JOIN fused_characters fc ON ep.user_id = fc.user_id
      LEFT JOIN linked_wallets lw ON ep.user_id = lw.user_id
      WHERE ep.event_id = ${eventId}
      ORDER BY ep.kills DESC, ep.mkin_earned DESC
      LIMIT ${limit}
    `;
    
    return result;
  } catch (error) {
    console.error('Error getting event leaderboard:', error);
    return [];
  }
};

/**
 * Calculate total kills for current event
 */
export const calculateEventKills = async (eventId = null) => {
  try {
    const event = eventId ? { event_id: eventId } : await getCurrentEvent();
    if (!event) return 0;
    
    const result = await sql`
      SELECT COALESCE(SUM(kills), 0) as total_kills
      FROM event_participation
      WHERE event_id = ${event.event_id}
    `;
    
    return result[0]?.total_kills || 0;
  } catch (error) {
    console.error('Error calculating event kills:', error);
    return 0;
  }
};

/**
 * Record daily progress
 */
export const recordDailyProgress = async (eventId, dayNumber, totalKills, uniqueParticipants) => {
  try {
    const result = await sql`
      INSERT INTO event_daily_progress (event_id, day_number, total_kills, unique_participants)
      VALUES (${eventId}, ${dayNumber}, ${totalKills}, ${uniqueParticipants})
      ON CONFLICT (event_id, day_number) DO UPDATE SET
        total_kills = ${totalKills},
        unique_participants = ${uniqueParticipants},
        recorded_at = NOW()
      RETURNING *
    `;
    
    return result[0];
  } catch (error) {
    console.error('Error recording daily progress:', error);
    return null;
  }
};

/**
 * Get daily progress for an event
 */
export const getDailyProgress = async (eventId, dayNumber = null) => {
  try {
    let query = sql`
      SELECT * FROM event_daily_progress 
      WHERE event_id = ${eventId}
    `;
    
    if (dayNumber !== null) {
      query = sql`${query} AND day_number = ${dayNumber}`;
    }
    
    query = sql`${query} ORDER BY day_number`;
    
    const result = await query;
    return result;
  } catch (error) {
    console.error('Error getting daily progress:', error);
    return [];
  }
};

/**
 * Get user event statistics
 */
export const getUserEventStats = async (userId, eventId = null) => {
  try {
    const event = eventId ? { event_id: eventId } : await getCurrentEvent();
    if (!event) return null;
    
    const result = await sql`
      SELECT * FROM event_participation
      WHERE event_id = ${event.event_id} AND user_id = ${userId}
    `;
    
    return result[0] || null;
  } catch (error) {
    console.error('Error getting user event stats:', error);
    return null;
  }
};

/**
 * Get all events with statistics
 */
export const getAllEvents = async (limit = 50) => {
  try {
    const result = await sql`
      SELECT 
        ve.*,
        COALESCE(SUM(ep.kills), 0) as total_kills,
        COUNT(DISTINCT ep.user_id) as total_participants
      FROM void_events ve
      LEFT JOIN event_participation ep ON ve.event_id = ep.event_id
      GROUP BY ve.event_id
      ORDER BY ve.start_time DESC
      LIMIT ${limit}
    `;
    
    return result;
  } catch (error) {
    console.error('Error getting all events:', error);
    return [];
  }
};

/**
 * Initialize event system - ensures at least one active event exists
 */
export const initializeEventSystem = async () => {
  try {
    // Ensure daily user kills table exists (safety if migration not applied)
    await initDailyUserKillsTable();

    const currentEvent = await getCurrentEvent();
    if (!currentEvent) {
      console.log('No active event found, creating default event...');
      return await createNewEvent();
    }
    
    console.log(`✅ Event system initialized. Current event: ${currentEvent.event_id}`);
    return currentEvent;
  } catch (error) {
    console.error('Error initializing event system:', error);
    return null;
  }
};

export default {
  createNewEvent,
  getCurrentEvent,
  endEvent,
  addPlayerToEvent,
  updateEventKills,
  getEventLeaderboard,
  getDailyLeaderboard,
  getEventStatusSummary,
  calculateEventKills,
  recordDailyProgress,
  getDailyProgress,
  getUserEventStats,
  getAllEvents,
  initializeEventSystem,
  initDailyUserKillsTable
};
