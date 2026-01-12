/**
 * Booster Ownership Checker
 * 
 * Checks if a wallet owns any Realmkin booster NFTs
 * 
 * Usage:
 *   node scripts/check-booster-ownership.js <wallet_address>
 * 
 * Example:
 *   node scripts/check-booster-ownership.js 7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD
 */

import axios from 'axios';
import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// All booster NFT mint addresses from boosterService.js
const BOOSTERS = {
  RANDOM_1_1: {
    name: "Random 1/1 Booster",
    multiplier: 1.17,
    mints: [
      "4fdpMgnie15mLP8q6AQZbYnvPGQz6FzPrgVVRKfMyeC3",
      "6SVWe3GqymeP6mjgYNXvPnEYj6soi3fCzYxVTvS1kmJL",
      "7Ze45CngJ1DNUZaUYMNBpatDQoVqTL8Yjq2EPUYPVgbh",
      "E21XaE8zaoBZwt2roq7KppxjfFhrcDMpFa7ZMWsFreUh",
      "FMG9Be91LgVd9cb2YX15hPBFJ3iUhH2guB7RbCBFbDbg",
      "J4koZzipRmLjc4QzSbRsn8CdXCZCHUUmTbCSqAtvSJFZ",
      "khoX7jkUK98uMPv2yF9H9ftLJKTesgpmWbuvKpRvW8h",
      "LWVzjTiSKBZDWvWP4RmsXffqctmDH7GeZjchupwd1HF",
      "EXA4nEohnyY9XTeAzNsV3f9GXcYUh8cCpWV9qbjf1egS",
      "HchoYoGU9ZnVffHaEo1Aw9xitvqyhiP575GpebiSXNK4",
      "5MbExwqPUNL8yNuUb8JK9iCXHGGcLXEDkecgZDfSEJfu"
    ]
  },
  CUSTOM_1_1: {
    name: "Custom 1/1 Booster",
    multiplier: 1.23,
    mints: [
      "AN3u7XKFSDCVAe4KopeHRZqpKByR2j9WRkTpq2SQ8ieo",
      "14PaqpEwRntJ3tVhFewBS3bFK8kjk5CX2YeiLWYvVabu",
      "2UsvdbGXg28B2piq3oW1rfMBQTQYhUGhCYRwJfNhUagr",
      "4G44MShUoWPtyQog7fCH6XTgNHqwEjTtcuGpHg4BxJ1p",
      "AukNaSscLLUKZuWm5eRxxukZ76kNt5iTB7Raeeevrhw",
      "HiW5i4yiumjcZHaHpgjAgHdCRZgpX3j6s9vSeukpxuAF",
      "PUjmyCPfyEd92D2cm4pppjGB1ddX6wnnttmEzxBHErD",
      "5j9xjtXjC3ZwfLsTHnZZEZKKa7uR75m8aXyS4rBbt8CB",
      "4aak3vYyJMyP5FJPW3avATDmXB7UBPCb3WVLFCtEDLJs",
      "EQjH6VMk9rsEK7bnEzBcyx9ZoYPhqW2KfGUgWAWBDnEh"
    ]
  },
  SOLANA_MINER: {
    name: "Solana Miner Booster",
    multiplier: 1.27,
    mints: [
      "4dFgb3Zbcu2m3VwEfgxHkDKaijyxyhyhfRvgEfYtbuvc",
      "97psosjbGRs8j9KmG1gDcfiwajAkkzMifMfL1nsGpPZ9",
      "A5E5hsXsydS4ttrs3Y4ZRPLsBb2ormtDKeFcL5D7Q9vj",
      "EWbzAwkxJRZGoSXSuGq3Gz8eNX1g2muXdspsMimEB8EU",
      "HPaU5hLy3XzNygLTcmM1KWa1ceZvFD3xbAP5eCXoDNuh",
      "J4EshVN9yfnrqLcfpVXgVpfXd3ySEJkD2aTwfyiDrqDf",
      "J2F9etQhMYNkwPAWctbJBwr3z4rMpYprdcqAKuNR4h4q",
      "5DD4yFFycyGhXgnqAh58HQ659uRjvr5KBTBbTcBTkhf5",
      "7pKZgMEVo1jnndSUCcDpY2Hpa3SapveooAmMPL2HCTWV",
      "BGtMZEb36SLHB3WceU61AwfdXbxy7k6vqXciWtvxSJsQ"
    ]
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
 * Fetch all NFTs from wallet using Helius
 */
async function fetchAllNFTs(walletAddress) {
  console.log(`\n🔍 Fetching all NFTs from wallet...`);
  
  try {
    let allNFTs = [];
    let page = 1;
    let hasMore = true;
    const limit = 1000;

    while (hasMore) {
      const response = await axios.post(RPC_URL, {
        jsonrpc: '2.0',
        id: 'booster-check',
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

    console.log(`   ✅ Total NFTs in wallet: ${allNFTs.length}`);
    return allNFTs;
  } catch (error) {
    console.error(`   ❌ Error fetching NFTs: ${error.message}`);
    return [];
  }
}

/**
 * Check for booster NFTs in wallet
 */
async function checkBoosterOwnership(walletAddress) {
  console.log('\n' + '='.repeat(100));
  console.log('🎯 BOOSTER OWNERSHIP CHECKER');
  console.log('='.repeat(100));
  
  if (!isValidSolanaAddress(walletAddress)) {
    console.error('\n❌ Invalid Solana wallet address');
    return;
  }

  console.log(`\n💼 Wallet: ${walletAddress}`);
  console.log('='.repeat(100));

  // Fetch all NFTs from wallet
  const allNFTs = await fetchAllNFTs(walletAddress);
  
  if (allNFTs.length === 0) {
    console.log('\n⚠️  No NFTs found in wallet or fetch failed');
    return;
  }

  // Create a set of all NFT mint addresses in wallet for fast lookup
  const walletMints = new Set(allNFTs.map(nft => nft.id));

  // Check each booster category
  const results = {};
  let totalBoosters = 0;
  let totalMultiplier = 1.0;

  for (const [key, boosterConfig] of Object.entries(BOOSTERS)) {
    console.log(`\n\n${'='.repeat(100)}`);
    console.log(`🔥 ${boosterConfig.name}`);
    console.log(`   Multiplier: ${boosterConfig.multiplier}x`);
    console.log(`   Checking ${boosterConfig.mints.length} possible NFTs...`);
    console.log('='.repeat(100));

    // Find which booster NFTs the wallet owns
    const ownedBoosters = [];
    
    for (const mintAddress of boosterConfig.mints) {
      if (walletMints.has(mintAddress)) {
        ownedBoosters.push(mintAddress);
        
        // Try to get NFT details
        const nft = allNFTs.find(n => n.id === mintAddress);
        const name = nft?.content?.metadata?.name || 'Unknown NFT';
        
        console.log(`\n   ✅ FOUND: ${name}`);
        console.log(`      Mint: ${mintAddress}`);
        
        // Show image if available
        if (nft?.content?.links?.image) {
          console.log(`      Image: ${nft.content.links.image}`);
        }
      }
    }

    results[key] = {
      category: boosterConfig.name,
      multiplier: boosterConfig.multiplier,
      owned: ownedBoosters.length,
      mints: ownedBoosters
    };

    if (ownedBoosters.length > 0) {
      console.log(`\n   🎉 Total ${boosterConfig.name}s: ${ownedBoosters.length}`);
      totalBoosters += ownedBoosters.length;
      totalMultiplier *= boosterConfig.multiplier;
    } else {
      console.log(`\n   ❌ No ${boosterConfig.name}s found`);
    }
  }

  // Summary
  console.log(`\n\n${'='.repeat(100)}`);
  console.log('📊 BOOSTER SUMMARY');
  console.log('='.repeat(100));
  
  for (const [key, result] of Object.entries(results)) {
    console.log(`\n${result.category}:`);
    console.log(`   Owned: ${result.owned}`);
    console.log(`   Multiplier: ${result.multiplier}x`);
    if (result.owned > 0) {
      console.log(`   Status: ✅ ACTIVE`);
    } else {
      console.log(`   Status: ❌ NONE`);
    }
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`🎯 TOTAL BOOSTERS: ${totalBoosters}`);
  
  if (totalBoosters > 0) {
    console.log(`🔥 COMBINED MULTIPLIER: ${totalMultiplier.toFixed(4)}x`);
    console.log(`\n✅ This wallet has active boosters!`);
    console.log(`   Staking rewards will be multiplied by ${totalMultiplier.toFixed(4)}x`);
  } else {
    console.log(`\n❌ No boosters found in this wallet`);
    console.log(`   Standard 1.0x multiplier applies`);
  }
  
  console.log(`\n${'='.repeat(100)}\n`);
}

// Run the script
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.error('\n❌ Error: Please provide a wallet address');
  console.error('\nUsage:');
  console.error('  node scripts/check-booster-ownership.js <wallet_address>');
  console.error('\nExample:');
  console.error('  node scripts/check-booster-ownership.js 7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD\n');
  process.exit(1);
}

checkBoosterOwnership(walletAddress)
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
