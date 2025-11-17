
import sql from '../db.js'; // Import the postgres client
import { updateEventKills } from './eventManager.js';

// Create linked_wallets table if it doesn't exist
export const initLinkedWalletsTable = async () => {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS linked_wallets (
                user_id TEXT PRIMARY KEY,
                wallet_address TEXT NOT NULL,
                display_name TEXT,
                total_mkin_gained INTEGER DEFAULT 0,
                total_kills INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `;
        console.log('Linked wallets table initialized successfully');
    } catch (error) {
        console.error('Error initializing linked wallets table:', error);
    }
};

/**
 * Get unified MKIN balance for a Discord user by resolving to internal user_id via user_links
 */
export const getUnifiedBalanceByDiscord = async (discordId) => {
    try {
        const userRows = await sql`
            select user_id from user_links where discord_id = ${discordId}
        `;
        const userId = userRows[0]?.user_id;
        if (!userId) return 0;
        const balRows = await sql`
            select balance from user_balances where user_id = ${userId}
        `;
        const balance = balRows[0]?.balance ?? 0n; // bigint
        return Number(balance);
    } catch (error) {
        console.error('Error getting unified balance by Discord ID:', error);
        return 0;
    }
};

// This function will handle saving/updating all core user data
export const saveUserData = async (userId, walletAddress, displayName = null) => {
    try {
        console.log(`saveUserData called for userId: ${userId}, walletAddress: ${walletAddress}, displayName: '${displayName}' (type: ${typeof displayName})`);
        // Upsert functionality: insert if not exists, update if exists
        // total_mkin_gained and total_kills will default to 0 if not explicitly set during initial insert
        const result = await sql`
            INSERT INTO linked_wallets (user_id, wallet_address, display_name, total_mkin_gained, total_kills)
            VALUES (${userId}, ${walletAddress}, ${displayName}, 0, 0)
            ON CONFLICT (user_id) DO UPDATE SET 
                wallet_address = EXCLUDED.wallet_address,
                display_name = COALESCE(EXCLUDED.display_name, linked_wallets.display_name)
            RETURNING user_id, wallet_address, display_name, total_mkin_gained, total_kills;
        `;

        console.log(`User data saved/updated for user ${userId} in Supabase.`);
        console.log('Result from saveUserData SQL:', result[0]);
        return result[0]; // Returns the updated/inserted row
    } catch (error) {
        console.error('Error saving user data in Supabase:', error);
        return null;
    }
};

// This function will now return an object containing wallet_address, total_mkin_gained, display_name, and total_kills
export const getUserData = async (userId) => {
    try {
        const result = await sql`
            SELECT user_id, wallet_address, display_name, total_mkin_gained, total_kills FROM linked_wallets WHERE user_id = ${userId};
        `;

        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error('Error getting user data from Supabase:', error);
        return null;
    }
};

export const updateTotalMkinGained = async (userId, amount) => {
    try {
        const result = await sql`
            UPDATE linked_wallets
            SET total_mkin_gained = total_mkin_gained + ${amount}
            WHERE user_id = ${userId}
            RETURNING total_mkin_gained;
        `;

        if (result.length === 0) {
            console.warn(`Attempted to update Mkin for user ${userId}, but user not found.`);
            return null;
        }
        console.log(`Updated Mkin for user ${userId}. New total: ${result[0].total_mkin_gained}`);
        return result[0].total_mkin_gained; // Return the new total
    } catch (error) {
        console.error('Error updating total Mkin gained in Supabase:', error);
        return null;
    }
};

export const updateTotalKills = async (userId, amount, updateEventKillsFlag = true) => {
  try {
    const result = await sql`
      UPDATE linked_wallets
      SET total_kills = total_kills + ${amount}
      WHERE user_id = ${userId}
      RETURNING total_kills;
    `;

    if (result.length === 0) {
      console.warn(`Attempted to update total kills for user ${userId}, but user not found.`);
      return null;
    }
    
    // Only update event-specific kills if explicitly requested
    if (updateEventKillsFlag) {
      await updateEventKills(userId, amount, amount * 7); // 7 MKIN per kill (hardcoded)
    }
    
    
    console.log(`Updated total kills for user ${userId}. New total: ${result[0].total_kills}, Event update: ${updateEventKillsFlag}`);
    return result[0].total_kills; // Return the new total
  } catch (error) {
    console.error('Error updating total kills in Supabase:', error);
    return null;
  }
};

export const getLeaderboard = async (activeEventOnly = true) => {
    try {
        // First get the current active event
        const currentEventQuery = await sql`
            SELECT event_id FROM void_events 
            WHERE status = 'active' 
            ORDER BY start_time DESC 
            LIMIT 1
        `;
        
        const currentEventId = currentEventQuery.length > 0 ? currentEventQuery[0].event_id : null;
        
        // If we want active event only and there is no active event, return empty array
        if (activeEventOnly && !currentEventId) {
            return [];
        }
        
        let query;
        if (activeEventOnly && currentEventId) {
            // Only show players who have joined the current event
            query = sql`
                SELECT 
                    lw.display_name, 
                    lw.total_mkin_gained,
                    COALESCE(ep.kills, 0) as event_kills
                FROM linked_wallets lw
                JOIN event_participation ep ON lw.user_id = ep.user_id
                WHERE lw.display_name IS NOT NULL
                AND ep.event_id = ${currentEventId}
                ORDER BY ep.kills DESC, lw.total_mkin_gained DESC
                LIMIT 10;
            `;
        } else {
            // Show all players with display names (legacy behavior)
            query = sql`
                SELECT 
                    lw.display_name, 
                    lw.total_mkin_gained,
                    COALESCE(SUM(ep.kills), 0) as event_kills
                FROM linked_wallets lw
                LEFT JOIN event_participation ep ON lw.user_id = ep.user_id
                WHERE lw.display_name IS NOT NULL
                GROUP BY lw.user_id, lw.display_name, lw.total_mkin_gained
                ORDER BY lw.total_mkin_gained DESC, event_kills DESC
                LIMIT 10;
            `;
        }
        
        const result = await query;
        return result;
    } catch (error) {
        console.error('Error fetching leaderboard from Supabase:', error);
        return [];
    }
};

/**
 * Calculate total kills across all players
 */
export const calculateTotalKills = async () => {
    try {
        const result = await sql`
            SELECT SUM(total_kills) as total_kills
            FROM linked_wallets;
        `;
        return result[0]?.total_kills || 0;
    } catch (error) {
        console.error('Error calculating total kills:', error);
        return 0;
    }
};
