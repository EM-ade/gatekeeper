/**
 * Comprehensive NFT Ownership Checker
 * 
 * Checks all Realmkin collections for a wallet with full detailed output
 * 
 * Usage:
 *   node scripts/check-full-nft-ownership.js <discord_user_id>
 *   node scripts/check-full-nft-ownership.js <wallet_address>
 * 
 * Example:
 *   node scripts/check-full-nft-ownership.js 443919280967385119
 *   node scripts/check-full-nft-ownership.js 7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD
 */

import axios from 'axios';
import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

// Conditionally import db only if DATABASE_URL is set
let sql = null;
if (process.env.DATABASE_URL) {
  sql = (await import('../db.js')).default;
}

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, 'confirmed');

// All Realmkin collection configurations
const COLLECTIONS = {
  the_realmkin: {
    name: 'The Realmkin (Magic Eden)',
    symbol: 'therealmkin',
    address: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    type: 'both'
  },
  realmkin_helius: {
    name: 'Realmkin (Helius Only)',
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
 * Get wallet address from Discord user ID
 */
async function getWalletFromDiscordId(discordId) {
  console.log(`\n🔍 Looking up wallet for Discord user: ${discordId}`);
  
  if (!sql) {
    console.error(`   ❌ Database not available. Cannot lookup Discord user ${discordId}`);
    console.error(`   💡 Set DATABASE_URL in .env or provide wallet address directly`);
    return null;
  }
  
  // Check PostgreSQL users table
  try {
    const users = await sql`
      SELECT discord_id, wallet_address, username
      FROM users
      WHERE discord_id = ${discordId}
      LIMIT 1
    `;

    if (users.length > 0 && users[0].wallet_address) {
      console.log(`   ✅ Found wallet in PostgreSQL: ${users[0].wallet_address}`);
      if (users[0].username) {
        console.log(`   👤 Username: ${users[0].username}`);
      }
      return users[0].wallet_address;
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check PostgreSQL: ${error.message}`);
  }

  console.error(`   ❌ No wallet found for Discord user ${discordId}`);
  return null;
}

/**
 * Fetch NFTs from Magic Eden
 */
async function fetchFromMagicEden(walletAddress, collectionSymbol) {
  console.log(`\n🔵 MAGIC EDEN API`);
  console.log(`   Symbol: ${collectionSymbol}`);
  
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/wallets/${walletAddress}/tokens?collectionSymbol=${encodeURIComponent(collectionSymbol)}`;
    
    const response = await axios.get(url, {
      headers: { accept: 'application/json' }
    });

    const nfts = response.data || [];
    console.log(`   ✅ Found: ${nfts.length} NFTs`);
    
    return nfts;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return [];
  }
}

/**
 * Fetch NFTs from Helius
 */
async function fetchFromHelius(walletAddress, collectionAddress) {
  console.log(`\n🟣 HELIUS API`);
  console.log(`   Collection: ${collectionAddress}`);
  
  try {
    let allNFTs = [];
    let page = 1;
    let hasMore = true;
    const limit = 1000;

    while (hasMore) {
      const response = await axios.post(RPC_URL, {
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

    console.log(`   ✅ Found: ${collectionNFTs.length} NFTs in collection ${collectionAddress}`);
    
    return collectionNFTs;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return [];
  }
}

/**
 * Extract class from NFT attributes
 */
function extractClass(nft) {
  // Magic Eden format
  if (nft.attributes && Array.isArray(nft.attributes)) {
    const classAttr = nft.attributes.find(a => 
      a.trait_type === 'Class' || a.trait_type === 'CLASS'
    );
    if (classAttr) return classAttr.value;
  }
  
  // Helius format
  if (nft.content?.metadata?.attributes) {
    const classAttr = nft.content.metadata.attributes.find(a => 
      a.trait_type === 'Class' || a.trait_type === 'CLASS'
    );
    if (classAttr) return classAttr.value;
  }
  
  return null;
}

/**
 * Main check function
 */
async function checkFullOwnership(input) {
  console.log('\n' + '='.repeat(100));
  console.log('🔎 COMPREHENSIVE NFT OWNERSHIP CHECK');
  console.log('='.repeat(100));
  
  let walletAddress;
  
  // Determine if input is Discord ID or wallet address
  if (isValidSolanaAddress(input)) {
    walletAddress = input;
    console.log(`\n📍 Input type: Wallet Address`);
    console.log(`   Wallet: ${walletAddress}`);
  } else {
    console.log(`\n📍 Input type: Discord User ID`);
    console.log(`   Discord ID: ${input}`);
    walletAddress = await getWalletFromDiscordId(input);
    if (!walletAddress) {
      console.log('\n❌ Cannot proceed without a wallet address');
      return;
    }
  }

  console.log(`\n💼 Checking wallet: ${walletAddress}`);
  console.log('='.repeat(100));

  const allResults = {};
  let totalNFTs = 0;

  // Check each collection
  for (const [key, config] of Object.entries(COLLECTIONS)) {
    console.log(`\n\n${'='.repeat(100)}`);
    console.log(`📦 COLLECTION: ${config.name}`);
    console.log(`   Key: ${key}`);
    console.log(`   Address: ${config.address}`);
    console.log(`   Type: ${config.type}`);
    console.log('='.repeat(100));
    
    let magicEdenNFTs = [];
    let heliusNFTs = [];
    
    // Fetch from Magic Eden if applicable
    if (config.type === 'both' && config.symbol) {
      magicEdenNFTs = await fetchFromMagicEden(walletAddress, config.symbol);
    }
    
    // Fetch from Helius
    heliusNFTs = await fetchFromHelius(walletAddress, config.address);
    
    // Store results
    allResults[key] = {
      collection: config.name,
      magicEdenCount: magicEdenNFTs.length,
      heliusCount: heliusNFTs.length,
      magicEdenNFTs,
      heliusNFTs
    };
    
    totalNFTs += heliusNFTs.length; // Use Helius as source of truth
    
    // Show detailed NFT info
    console.log(`\n📊 DETAILED BREAKDOWN:`);
    console.log(`   Magic Eden: ${magicEdenNFTs.length} NFTs`);
    console.log(`   Helius: ${heliusNFTs.length} NFTs`);
    
    // Show all Helius NFTs with full details
    if (heliusNFTs.length > 0) {
      console.log(`\n📋 ALL ${heliusNFTs.length} NFTs FROM HELIUS:`);
      console.log('-'.repeat(100));
      
      heliusNFTs.forEach((nft, idx) => {
        const name = nft.content?.metadata?.name || 'Unknown';
        const mint = nft.id;
        const nftClass = extractClass(nft);
        
        console.log(`\n   ${idx + 1}. ${name}`);
        console.log(`      Mint: ${mint}`);
        if (nftClass) {
          console.log(`      Class: ${nftClass}`);
        }
        
        // Show collection verification
        const grouping = nft.grouping?.find(g => g.group_key === 'collection');
        if (grouping) {
          console.log(`      Collection Address: ${grouping.group_value}`);
          console.log(`      Verified: ${grouping.group_value === config.address ? '✅ YES' : '❌ NO'}`);
        }
      });
      
      console.log(`\n${'='.repeat(100)}`);
      
      // Class distribution
      const classCounts = {};
      heliusNFTs.forEach(nft => {
        const nftClass = extractClass(nft);
        if (nftClass) {
          classCounts[nftClass] = (classCounts[nftClass] || 0) + 1;
        }
      });
      
      if (Object.keys(classCounts).length > 0) {
        console.log(`\n📊 CLASS DISTRIBUTION:`);
        Object.entries(classCounts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([className, count]) => {
            console.log(`   ${className}: ${count} NFTs`);
          });
      }
    }
    
    // Show sample Magic Eden NFTs if different
    if (magicEdenNFTs.length > 0 && magicEdenNFTs.length !== heliusNFTs.length) {
      console.log(`\n⚠️  DISCREPANCY: Magic Eden shows ${magicEdenNFTs.length} but Helius shows ${heliusNFTs.length}`);
      console.log(`\n📋 SAMPLE MAGIC EDEN NFTs (first 5):`);
      
      magicEdenNFTs.slice(0, 5).forEach((nft, idx) => {
        const name = nft.name || 'Unknown';
        const mint = nft.mintAddress || nft.tokenMint;
        const nftClass = extractClass(nft);
        
        console.log(`\n   ${idx + 1}. ${name}`);
        console.log(`      Mint: ${mint}`);
        if (nftClass) {
          console.log(`      Class: ${nftClass}`);
        }
      });
    }
  }

  // Final Summary
  console.log(`\n\n${'='.repeat(100)}`);
  console.log('🎯 FINAL SUMMARY');
  console.log('='.repeat(100));
  
  for (const [key, result] of Object.entries(allResults)) {
    console.log(`\n${result.collection}:`);
    console.log(`   Helius (Authoritative): ${result.heliusCount} NFTs`);
    console.log(`   Magic Eden: ${result.magicEdenCount} NFTs`);
    if (result.heliusCount !== result.magicEdenCount && result.magicEdenCount > 0) {
      console.log(`   ⚠️  Discrepancy detected!`);
    }
  }
  
  console.log(`\n🎯 TOTAL VERIFIED REALMKIN NFTs: ${totalNFTs}`);
  
  if (totalNFTs === 0) {
    console.log('\n❌ This user has NO verified Realmkin NFTs');
    console.log('   They should NOT have any holder/class roles');
  } else {
    console.log('\n✅ User has verified Realmkin NFTs');
    console.log('   They should have appropriate roles based on counts and classes above');
  }
  
  console.log(`\n${'='.repeat(100)}\n`);
}

// Run the script
const input = process.argv[2];

if (!input) {
  console.error('\n❌ Error: Please provide a Discord user ID or wallet address');
  console.error('\nUsage:');
  console.error('  node scripts/check-full-nft-ownership.js <discord_user_id>');
  console.error('  node scripts/check-full-nft-ownership.js <wallet_address>');
  console.error('\nExample:');
  console.error('  node scripts/check-full-nft-ownership.js 443919280967385119');
  console.error('  node scripts/check-full-nft-ownership.js 7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD\n');
  process.exit(1);
}

checkFullOwnership(input)
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
