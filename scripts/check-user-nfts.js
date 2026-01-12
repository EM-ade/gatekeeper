/**
 * NFT Verification Debug Script
 * 
 * This script checks if a user actually has Realmkin NFTs in their wallet
 * by querying both Helius and Magic Eden APIs directly.
 * 
 * Usage:
 *   node scripts/check-user-nfts.js <discord_user_id>
 *   node scripts/check-user-nfts.js <wallet_address>
 * 
 * Example:
 *   node scripts/check-user-nfts.js 443919280967385119
 *   node scripts/check-user-nfts.js 7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD
 */

import axios from 'axios';
import { PublicKey } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase (only if credentials are available)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
} else {
  console.log('⚠️  Supabase credentials not found. Discord ID lookup will be disabled.');
  console.log('   You can still check wallet addresses directly.\n');
}

// Collection configurations
const COLLECTIONS = {
  therealmkin: {
    name: 'The Realmkin',
    address: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    type: 'magic_eden'
  },
  realmkin_helius: {
    name: 'Realmkin (Helius)',
    address: 'eTQujiFKVvLJXdkAobg9JqULNdDrCt5t4WtDochmVSZ',
    type: 'helius'
  },
  realmkin_mass_mint: {
    name: 'Realmkin Mass Mint',
    address: 'EzjhzaTBqXohJTsaMKFSX6fgXcDJyXAV85NK7RK79u3Z',
    type: 'helius'
  }
};

/**
 * Check if string is a valid Solana address
 */
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch NFTs from Helius API
 */
async function fetchNFTsFromHelius(walletAddress, collectionAddress) {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  
  console.log(`\n🔍 Helius: Fetching NFTs for wallet: ${walletAddress}`);
  console.log(`   Collection: ${collectionAddress}`);
  
  try {
    let allNFTs = [];
    let page = 1;
    let hasMore = true;
    const limit = 1000;

    while (hasMore) {
      const response = await axios.post(rpcUrl, {
        jsonrpc: '2.0',
        id: 'nft-check',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: walletAddress,
          page: page,
          limit: limit,
          displayOptions: {
            showFungible: false,
            showNativeBalance: false,
            showInscription: false,
          },
        },
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const items = response.data.result?.items || [];
      allNFTs = allNFTs.concat(items);
      
      console.log(`   📄 Page ${page}: ${items.length} items (total: ${allNFTs.length})`);
      
      hasMore = items.length === limit;
      if (hasMore) page++;
    }

    // Filter by collection
    const collectionNFTs = allNFTs.filter(nft => {
      const grouping = nft.grouping?.find(g => g.group_key === 'collection');
      return grouping?.group_value === collectionAddress;
    });

    console.log(`   ✅ Found ${allNFTs.length} total NFTs`);
    console.log(`   ✅ Found ${collectionNFTs.length} NFTs in collection ${collectionAddress}`);
    
    return collectionNFTs;
  } catch (error) {
    console.error(`   ❌ Helius Error: ${error.message}`);
    return [];
  }
}

/**
 * Fetch NFTs from Magic Eden API
 */
async function fetchNFTsFromMagicEden(walletAddress, collectionSymbol) {
  console.log(`\n🔍 Magic Eden: Fetching NFTs for wallet: ${walletAddress}`);
  console.log(`   Collection: ${collectionSymbol}`);
  
  try {
    const response = await axios.get(
      `https://api-mainnet.magiceden.dev/v2/wallets/${walletAddress}/tokens`,
      {
        params: {
          listStatus: 'both',
          collection: collectionSymbol
        },
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    const nfts = response.data || [];
    console.log(`   ✅ Found ${nfts.length} NFTs in collection ${collectionSymbol}`);
    
    return nfts;
  } catch (error) {
    console.error(`   ❌ Magic Eden Error: ${error.message}`);
    return [];
  }
}

/**
 * Get wallet address from Discord user ID
 */
async function getWalletFromDiscordId(discordId) {
  console.log(`\n🔍 Looking up wallet for Discord user: ${discordId}`);
  
  // First try PostgreSQL users table (this is what periodic verification uses!)
  try {
    const sql = (await import('../db.js')).default;
    const users = await sql`
      SELECT discord_id, wallet_address, username
      FROM users
      WHERE discord_id = ${discordId}
      LIMIT 1
    `;

    if (users.length > 0 && users[0].wallet_address) {
      console.log(`   ✅ Found wallet in PostgreSQL users table: ${users[0].wallet_address}`);
      if (users[0].username) {
        console.log(`   👤 Username: ${users[0].username}`);
      }
      return users[0].wallet_address;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check PostgreSQL users table: ${error.message}`);
  }
  
  // Fallback: Try Supabase linked_wallets table
  if (supabase) {
    const { data, error } = await supabase
      .from('linked_wallets')
      .select('wallet_address, display_name')
      .eq('discord_id', discordId)
      .single();

    if (!error && data && data.wallet_address) {
      console.log(`   ✅ Found wallet in Supabase linked_wallets table: ${data.wallet_address}`);
      if (data.display_name) {
        console.log(`   👤 Display name: ${data.display_name}`);
      }
      return data.wallet_address;
    }
  }

  console.error(`   ❌ No wallet found for Discord user ${discordId} in any table`);
  return null;
}

/**
 * Main verification function
 */
async function checkUserNFTs(input) {
  console.log('\n' + '='.repeat(80));
  console.log('🔎 NFT VERIFICATION DEBUG SCRIPT');
  console.log('='.repeat(80));
  
  let walletAddress;
  
  // Determine if input is Discord ID or wallet address
  if (isValidSolanaAddress(input)) {
    walletAddress = input;
    console.log(`\n📍 Input type: Wallet Address`);
  } else {
    console.log(`\n📍 Input type: Discord User ID`);
    walletAddress = await getWalletFromDiscordId(input);
    if (!walletAddress) {
      console.log('\n❌ Cannot proceed without a wallet address');
      return;
    }
  }

  console.log(`\n💼 Checking wallet: ${walletAddress}`);
  console.log('='.repeat(80));

  // Check each collection
  const results = {};
  
  for (const [key, config] of Object.entries(COLLECTIONS)) {
    console.log(`\n\n📦 Checking Collection: ${config.name}`);
    console.log('-'.repeat(80));
    
    let nfts = [];
    
    if (config.type === 'helius') {
      nfts = await fetchNFTsFromHelius(walletAddress, config.address);
    } else if (config.type === 'magic_eden') {
      // Try Magic Eden first
      nfts = await fetchNFTsFromMagicEden(walletAddress, 'therealmkin');
      
      // Also try Helius as fallback
      const heliusNFTs = await fetchNFTsFromHelius(walletAddress, config.address);
      
      if (heliusNFTs.length > 0 && nfts.length === 0) {
        console.log(`   ⚠️  Magic Eden found 0, but Helius found ${heliusNFTs.length}!`);
        nfts = heliusNFTs;
      }
    }
    
    results[key] = {
      collection: config.name,
      count: nfts.length,
      nfts: nfts
    };
    
    // Show sample NFTs if found
    if (nfts.length > 0) {
      console.log(`\n   📋 Sample NFTs (showing first 3):`);
      nfts.slice(0, 3).forEach((nft, idx) => {
        const name = nft.content?.metadata?.name || nft.name || 'Unknown';
        const mint = nft.id || nft.mintAddress || 'Unknown';
        console.log(`      ${idx + 1}. ${name}`);
        console.log(`         Mint: ${mint}`);
        
        // Show attributes if available
        if (nft.content?.metadata?.attributes) {
          const classAttr = nft.content.metadata.attributes.find(a => a.trait_type === 'Class');
          if (classAttr) {
            console.log(`         Class: ${classAttr.value}`);
          }
        }
      });
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  
  let totalNFTs = 0;
  for (const [key, result] of Object.entries(results)) {
    console.log(`\n${result.collection}:`);
    console.log(`   Count: ${result.count} NFTs`);
    totalNFTs += result.count;
  }
  
  console.log(`\n🎯 TOTAL REALMKIN NFTs: ${totalNFTs}`);
  
  if (totalNFTs === 0) {
    console.log('\n⚠️  WARNING: No Realmkin NFTs found in this wallet!');
    console.log('   This user should NOT have the holder role.');
  } else {
    console.log('\n✅ User has Realmkin NFTs and should have the holder role.');
  }
  
  console.log('\n' + '='.repeat(80));
}

// Run the script
const input = process.argv[2];

if (!input) {
  console.error('\n❌ Error: Please provide a Discord user ID or wallet address');
  console.error('\nUsage:');
  console.error('  node scripts/check-user-nfts.js <discord_user_id>');
  console.error('  node scripts/check-user-nfts.js <wallet_address>');
  console.error('\nExample:');
  console.error('  node scripts/check-user-nfts.js 443919280967385119');
  console.error('  node scripts/check-user-nfts.js 7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD\n');
  process.exit(1);
}

checkUserNFTs(input)
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script error:', error);
    process.exit(1);
  });
