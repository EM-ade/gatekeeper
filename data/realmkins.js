import sql from '../db.js';

// Create Realmkins table if it doesn't exist
export const initRealmkinsTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS realmkins (
        nft_id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES linked_wallets(user_id),
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        tier INTEGER DEFAULT 1,
        tier_level INTEGER DEFAULT 1,
        tier_xp INTEGER DEFAULT 0,
        attack_boost INTEGER DEFAULT 0,
        defense_boost INTEGER DEFAULT 0,
        health_boost INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('Realmkins table initialized successfully');
  } catch (error) {
    console.error('Error initializing realmkins table:', error);
  }
};

// Create Items table if it doesn't exist
export const initItemsTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS items (
        item_id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES linked_wallets(user_id),
        nft_id TEXT REFERENCES realmkins(nft_id),
        item_type TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('Items table initialized successfully');
  } catch (error) {
    console.error('Error initializing items table:', error);
  }
};

// Create Battle History table if it doesn't exist
export const initBattleHistoryTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS battle_history (
        battle_id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES linked_wallets(user_id),
        battle_type TEXT NOT NULL,
        result TEXT NOT NULL,
        rewards JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('Battle History table initialized successfully');
  } catch (error) {
    console.error('Error initializing battle history table:', error);
  }
};

// Get or create a Realmkin record
export const getOrCreateRealmkin = async (nftId, userId) => {
  try {
    const result = await sql`
      INSERT INTO realmkins (nft_id, user_id)
      VALUES (${nftId}, ${userId})
      ON CONFLICT (nft_id) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error getting/creating realmkin:', error);
    return null;
  }
};

// Update Realmkin stats after battle
export const updateRealmkinStats = async (nftId, xpGained, levelUp = false) => {
  try {
    if (levelUp) {
      // Tier-aware level up: increment tier_level and reset tier_xp
      // If at cap (25), tier up and reset to tier_level=1
      const current = (await sql`SELECT tier, tier_level FROM realmkins WHERE nft_id = ${nftId}`)[0];
      const atCap = (current?.tier_level || 1) >= 25;
      const result = await sql`
        UPDATE realmkins 
        SET 
          tier = CASE WHEN ${atCap} THEN LEAST(COALESCE(tier,1) + 1, 4) ELSE COALESCE(tier,1) END,
          tier_level = CASE WHEN ${atCap} THEN 1 ELSE GREATEST(1, COALESCE(tier_level,1) + 1) END,
          tier_xp = 0,
          -- Maintain legacy fields for compatibility (approximate)
          level = GREATEST(1, LEAST(25, COALESCE(level,1) + 1)),
          xp = 0,
          attack_boost = attack_boost + 2,
          defense_boost = defense_boost + 2,
          health_boost = health_boost + 10,
          updated_at = NOW()
        WHERE nft_id = ${nftId}
        RETURNING *
      `;
      return result[0];
    } else {
      // Add XP within current tier; caller decides if threshold reached
      const result = await sql`
        UPDATE realmkins 
        SET 
          tier_xp = COALESCE(tier_xp,0) + ${xpGained},
          -- Maintain legacy xp for compatibility
          xp = COALESCE(xp,0) + ${xpGained},
          updated_at = NOW()
        WHERE nft_id = ${nftId}
        RETURNING *
      `;
      return result[0];
    }
  } catch (error) {
    console.error('Error updating realmkin stats:', error);
    return null;
  }
};

// Get all Realmkins for a user
export const getUserRealmkins = async (userId) => {
  try {
    const result = await sql`
      SELECT * FROM realmkins WHERE user_id = ${userId}
    `;
    return result;
  } catch (error) {
    console.error('Error getting user realmkins:', error);
    return [];
  }
};

// Add item to user inventory
export const addItemToInventory = async (userId, nftId, itemType, quantity = 1, expiresAt = null) => {
  try {
    const result = await sql`
      INSERT INTO items (user_id, nft_id, item_type, quantity, expires_at)
      VALUES (${userId}, ${nftId}, ${itemType}, ${quantity}, ${expiresAt})
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error adding item to inventory:', error);
    return null;
  }
};

// Get user inventory
export const getUserInventory = async (userId) => {
  try {
    const result = await sql`
      SELECT * FROM items WHERE user_id = ${userId} AND (expires_at IS NULL OR expires_at > NOW())
    `;
    return result;
  } catch (error) {
    console.error('Error getting user inventory:', error);
    return [];
  }
};

// Decrement item quantity
export const decrementItemQuantity = async (itemId, userId, amount = 1) => {
  try {
    const result = await sql`
      UPDATE items 
      SET quantity = quantity - ${amount}
      WHERE item_id = ${itemId} AND user_id = ${userId} AND quantity >= ${amount}
      RETURNING *
    `;
    
    if (result.length === 0) {
      return null; // Item not found or insufficient quantity
    }
    
    // Remove item if quantity reaches 0
    if (result[0].quantity <= 0) {
      await sql`DELETE FROM items WHERE item_id = ${itemId}`;
      return { ...result[0], quantity: 0, deleted: true };
    }
    
    return result[0];
  } catch (error) {
    console.error('Error decrementing item quantity:', error);
    return null;
  }
};

// Get specific item type from user inventory
export const getUserItemByType = async (userId, itemType) => {
  try {
    const result = await sql`
      SELECT * FROM items 
      WHERE user_id = ${userId} AND item_type = ${itemType} 
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result[0] || null;
  } catch (error) {
    console.error('Error getting user item by type:', error);
    return null;
  }
};

// Record battle history
export const recordBattleHistory = async (userId, battleType, result, rewards) => {
  try {
    const resultData = await sql`
      INSERT INTO battle_history (user_id, battle_type, result, rewards)
      VALUES (${userId}, ${battleType}, ${result}, ${rewards})
      RETURNING *
    `;
    return resultData[0];
  } catch (error) {
    console.error('Error recording battle history:', error);
    return null;
  }
};

// Initialize all tables
export const initializeGameTables = async () => {
  await initRealmkinsTable();
  await initItemsTable();
  await initBattleHistoryTable();
};
