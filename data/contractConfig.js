import { sql } from '../database.js';

// Initialize contract configuration table
export async function initContractConfigTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS contract_configs (
        contract_address VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        blockchain VARCHAR(50) NOT NULL DEFAULT 'solana',
        weekly_rate INTEGER NOT NULL DEFAULT 200,
        welcome_bonus INTEGER NOT NULL DEFAULT 200,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Insert default contracts if they don't exist
    await sql`
      INSERT INTO contract_configs (contract_address, name, blockchain, weekly_rate, welcome_bonus, is_active)
      VALUES 
        ('eTQujiFKVvLJXdkAobg9JqULNdDrCt5t4WtDochmVSZ', 'Original Realmkin Collection', 'solana', 200, 200, true),
        ('0xbb03b613Ede925f17E3ffc437592C66C7c78E317', 'Premium Realmkin Collection', 'ethereum', 300, 250, true)
      ON CONFLICT (contract_address) DO NOTHING
    `;

    console.log('Contract configuration table initialized successfully');
  } catch (error) {
    console.error('Error initializing contract configuration table:', error);
    throw error;
  }
}

// Get all active contract configurations
export async function getActiveContractConfigs() {
  try {
    const configs = await sql`
      SELECT * FROM contract_configs 
      WHERE is_active = true 
      ORDER BY created_at ASC
    `;
    return configs;
  } catch (error) {
    console.error('Error fetching contract configs:', error);
    return [];
  }
}

// Get contract configuration by address
export async function getContractConfig(contractAddress) {
  try {
    const configs = await sql`
      SELECT * FROM contract_configs 
      WHERE contract_address = ${contractAddress} AND is_active = true
    `;
    return configs[0] || null;
  } catch (error) {
    console.error('Error fetching contract config:', error);
    return null;
  }
}

// Add new contract configuration
export async function addContractConfig(contractAddress, name, blockchain, weeklyRate, welcomeBonus) {
  try {
    const result = await sql`
      INSERT INTO contract_configs (contract_address, name, blockchain, weekly_rate, welcome_bonus, is_active)
      VALUES (${contractAddress}, ${name}, ${blockchain}, ${weeklyRate}, ${welcomeBonus}, true)
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error adding contract config:', error);
    throw error;
  }
}

// Update contract configuration
export async function updateContractConfig(contractAddress, updates) {
  try {
    const setClause = Object.keys(updates)
      .map(key => `${key} = $${Object.keys(updates).indexOf(key) + 2}`)
      .join(', ');
    
    const values = [contractAddress, ...Object.values(updates)];
    
    const result = await sql`
      UPDATE contract_configs 
      SET ${sql.unsafe(setClause)}, updated_at = CURRENT_TIMESTAMP
      WHERE contract_address = ${contractAddress}
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error updating contract config:', error);
    throw error;
  }
}

// Deactivate contract (soft delete)
export async function deactivateContract(contractAddress) {
  try {
    const result = await sql`
      UPDATE contract_configs 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE contract_address = ${contractAddress}
      RETURNING *
    `;
    return result[0];
  } catch (error) {
    console.error('Error deactivating contract:', error);
    throw error;
  }
}

// Calculate rewards for NFTs based on their contract addresses
export async function calculateNFTRewards(nfts) {
  try {
    const contractConfigs = await getActiveContractConfigs();
    const configMap = new Map(contractConfigs.map(config => [config.contract_address.toLowerCase(), config]));
    
    let totalWeeklyRate = 0;
    let totalWelcomeBonus = 0;
    const nftBreakdown = [];

    for (const nft of nfts) {
      const contractAddress = nft.contractAddress?.toLowerCase();
      const config = configMap.get(contractAddress);
      
      if (config) {
        totalWeeklyRate += config.weekly_rate;
        totalWelcomeBonus += config.welcome_bonus;
        nftBreakdown.push({
          nftId: nft.id,
          contractAddress: nft.contractAddress,
          contractName: config.name,
          weeklyRate: config.weekly_rate,
          welcomeBonus: config.welcome_bonus
        });
      } else {
        // Default rates for unknown contracts
        totalWeeklyRate += 200;
        totalWelcomeBonus += 200;
        nftBreakdown.push({
          nftId: nft.id,
          contractAddress: nft.contractAddress,
          contractName: 'Unknown Contract',
          weeklyRate: 200,
          welcomeBonus: 200
        });
      }
    }

    return {
      totalWeeklyRate,
      totalWelcomeBonus,
      nftBreakdown
    };
  } catch (error) {
    console.error('Error calculating NFT rewards:', error);
    // Fallback to default rates
    return {
      totalWeeklyRate: nfts.length * 200,
      totalWelcomeBonus: nfts.length * 200,
      nftBreakdown: nfts.map(nft => ({
        nftId: nft.id,
        contractAddress: nft.contractAddress,
        contractName: 'Default',
        weeklyRate: 200,
        welcomeBonus: 200
      }))
    };
  }
}

export default {
  initContractConfigTable,
  getActiveContractConfigs,
  getContractConfig,
  addContractConfig,
  updateContractConfig,
  deactivateContract,
  calculateNFTRewards
};
