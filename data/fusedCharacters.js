import sql from "../db.js";

// Create Fused Characters table
export const initFusedCharactersTable = async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS fused_characters (
        user_id TEXT PRIMARY KEY REFERENCES linked_wallets(user_id),
        username TEXT UNIQUE NOT NULL,
        total_attack INTEGER DEFAULT 0,
        total_defense INTEGER DEFAULT 0,
        max_hp INTEGER DEFAULT 100,
        current_hp INTEGER DEFAULT 100,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        tier INTEGER DEFAULT 1,
        tier_level INTEGER DEFAULT 1,
        tier_xp INTEGER DEFAULT 0,
        elemental_affinities JSONB DEFAULT '{}',
        archetype TEXT DEFAULT 'ADVENTURER',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log("Fused Characters table initialized successfully");
  } catch (error) {
    console.error("Error initializing fused characters table:", error);
  }
};

// Create or update fused character
export const createOrUpdateFusedCharacter = async (
  userId,
  nfts,
  username = null
) => {
  try {
    // Calculate fused stats according to new requirements
    const totalNFTs = nfts.length;

    // Base stats are the sum of all NFTs' base stats (Attack and Defense)
    const totalAttack = nfts.reduce(
      (sum, nft) => sum + (nft.baseAttack || 50),
      0
    );
    const totalDefense = nfts.reduce(
      (sum, nft) => sum + (nft.baseDefense || 50),
      0
    );

    // HP formula: (totalNFTs * 20) + (averageLevel * 15) + rarityBonus
    const averageLevel = calculateAverageLevel(nfts);
    const maxHp = Math.floor(
      totalNFTs * 20 + averageLevel * 15 + calculateRarityBonus(nfts)
    );

    // Calculate elemental affinities with bonus damage tracking
    const elementalAffinities = calculateElementalAffinities(nfts);

    // Determine archetype based on most frequent type
    const archetype = determineArchetype(nfts);

    if (username) {
      // Create new fused character with username
      const result = await sql`
        INSERT INTO fused_characters (user_id, username, total_attack, total_defense, max_hp, current_hp, elemental_affinities, archetype)
        VALUES (${userId}, ${username}, ${totalAttack}, ${totalDefense}, ${maxHp}, ${maxHp}, ${elementalAffinities}, ${archetype})
        ON CONFLICT (user_id) DO UPDATE SET
          total_attack = EXCLUDED.total_attack,
          total_defense = EXCLUDED.total_defense,
          max_hp = EXCLUDED.max_hp,
          current_hp = LEAST(fused_characters.current_hp, EXCLUDED.max_hp),
          elemental_affinities = EXCLUDED.elemental_affinities,
          archetype = EXCLUDED.archetype,
          updated_at = NOW()
        RETURNING *
      `;
      return result[0];
    } else {
      // Update existing character without changing username
      const result = await sql`
        UPDATE fused_characters 
        SET 
          total_attack = ${totalAttack},
          total_defense = ${totalDefense},
          max_hp = ${maxHp},
          current_hp = LEAST(current_hp, ${maxHp}),
          elemental_affinities = ${elementalAffinities},
          archetype = ${archetype},
          updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING *
      `;
      return result[0];
    }
  } catch (error) {
    console.error("Error creating/updating fused character:", error);
    return null;
  }
};

// Get fused character by user ID
export const getFusedCharacter = async (userId) => {
  try {
    const result = await sql`
      SELECT * FROM fused_characters WHERE user_id = ${userId}
    `;
    return result[0] || null;
  } catch (error) {
    console.error("Error getting fused character:", error);
    return null;
  }
};

// Update fused character XP and level
export const updateFusedCharacterXP = async (userId, xpGained) => {
  try {
    const character = await getFusedCharacter(userId);
    if (!character) return null;

    const currentTierLevel = character.tier_level || character.level || 1;
    const currentTierXp = character.tier_xp ?? character.xp ?? 0;
    const newTierXp = currentTierXp + xpGained;
    const xpNeeded = getXpForNextLevel(currentTierLevel, character.tier || 1);

    if (newTierXp >= xpNeeded) {
      // Level up within tier, or tier up if at cap
      const atCap = currentTierLevel >= 25;
      const overflowXp = newTierXp - xpNeeded;
      const result = await sql`
        UPDATE fused_characters 
        SET 
          -- Tier logic
          tier = CASE WHEN ${atCap} THEN LEAST(COALESCE(tier,1) + 1, 4) ELSE COALESCE(tier,1) END,
          tier_level = CASE WHEN ${atCap} THEN 1 ELSE GREATEST(1, COALESCE(tier_level,1) + 1) END,
          tier_xp = ${overflowXp}::integer,
          -- Maintain legacy fields for compatibility
          level = GREATEST(1, LEAST(25, COALESCE(level,1) + 1)),
          xp = ${overflowXp}::integer,
          -- Stat growth on level up
          total_attack = total_attack + 10,
          total_defense = total_defense + 8,
          max_hp = max_hp + 25,
          current_hp = LEAST(max_hp + 25, current_hp + 25),
          updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING *
      `;
      return { character: result[0], leveledUp: true, tierUp: atCap };
    } else {
      // Just add XP within current tier
      const result = await sql`
        UPDATE fused_characters 
        SET 
          tier_xp = COALESCE(tier_xp,0) + ${xpGained},
          xp = COALESCE(xp,0) + ${xpGained},
          updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING *
      `;
      return { character: result[0], leveledUp: false, tierUp: false };
    }
  } catch (error) {
    console.error("Error updating fused character XP:", error);
    return null;
  }
};

// Helper functions
const calculateAverageLevel = (nfts) => {
  if (nfts.length === 0) return 1;
  const sum = nfts.reduce((total, nft) => total + (nft.level || 1), 0);
  return Math.floor(sum / nfts.length);
};

const calculateRarityBonus = (nfts) => {
  const rarityValues = {
    COMMON: 0,
    UNCOMMON: 5,
    RARE: 15,
    EPIC: 30,
    LEGENDARY: 50,
  };

  return nfts.reduce(
    (bonus, nft) => bonus + (rarityValues[nft.rarity] || 0),
    0
  );
};

const calculateElementalAffinities = (nfts) => {
  const elements = ["FIRE", "NATURE", "LIGHTNING", "LIGHT", "NEUTRAL"];
  const affinities = {};
  let maxCount = 0;
  let primaryElement = "NEUTRAL";

  // Calculate counts and find primary element
  elements.forEach((element) => {
    const count = nfts.filter((nft) => nft.element === element).length;
    affinities[element] = count / nfts.length;

    if (count > maxCount) {
      maxCount = count;
      primaryElement = element;
    } else if (count === maxCount && count > 0) {
      // If tie, choose the first one alphabetically
      primaryElement = [primaryElement, element].sort()[0];
    }
  });

  // Add primary element flag for +5% damage bonus
  affinities._primaryElement = primaryElement;
  affinities._damageBonus = 0.05; // +5% damage bonus for primary element

  return affinities;
};

const determineArchetype = (nfts) => {
  if (nfts.length === 0) return "ADVENTURER";

  const totalAttack = nfts.reduce(
    (sum, nft) => sum + (nft.baseAttack || 50),
    0
  );
  const totalDefense = nfts.reduce(
    (sum, nft) => sum + (nft.baseDefense || 50),
    0
  );

  const elementCount = new Set(nfts.map((nft) => nft.element)).size;

  if (totalAttack > totalDefense * 1.5) return "BERSERKER";
  if (totalDefense > totalAttack * 1.5) return "GUARDIAN";
  if (elementCount >= 3) return "MAGE";

  return "ADVENTURER";
};

// XP required per level
const getXpForNextLevel = (currentLevel, tier = 1) => {
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
    21: 6400,
    22: 7100,
    23: 7900,
    24: 8800,
    25: 9800,
  };

  const base = XP_REQUIREMENTS[currentLevel] || currentLevel * currentLevel * 100;
  // Tier XP multipliers aligned with realmkin curve
  // T1: x1.0, T2: x1.3, T3: x1.7, T4: x2.2
  const tierMults = [0, 1.0, 1.3, 1.7, 2.2];
  const mult = tierMults[Math.min(Math.max(tier, 1), 4)];
  return Math.floor(base * mult);
};

// Initialize table
export const initializeFusedCharacters = async () => {
  await initFusedCharactersTable();
};

export default {
  createOrUpdateFusedCharacter,
  getFusedCharacter,
  updateFusedCharacterXP,
  initializeFusedCharacters,
};
