/**
 * Booster Diagnostic Tool
 * Diagnose why users aren't getting their boosters
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '6b1daeca-d1ce-4b4a-9aa3-8f135dd2f2b2';

console.log('🔍 Booster Diagnostic Tool\n');

// Initialize Firebase
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    console.log('✅ Firebase initialized\n');
  } catch (error) {
    console.error('❌ Firebase init failed:', error.message);
    process.exit(1);
  }
}

const walletOrUserId = process.argv[2];

if (!walletOrUserId) {
  console.error('Usage: node scripts/diagnose-booster-issues.js <wallet-address-or-user-id>');
  process.exit(1);
}

console.log(`Diagnosing boosters for: ${walletOrUserId}\n`);

// Import booster service
const BoosterService = (await import('../services/boosterService.js')).default;
const boosterService = new BoosterService();

async function diagnoseUser() {
  console.log('═'.repeat(80));
  console.log('BOOSTER DIAGNOSTIC REPORT');
  console.log('═'.repeat(80) + '\n');
  
  try {
    const db = admin.firestore();
    let userId = walletOrUserId;
    let walletAddress = null;
    
    // Step 1: Find user
    console.log('1️⃣  Finding user...\n');
    
    // Check if input is a wallet address (starts with valid Solana chars)
    if (walletOrUserId.length > 32) {
      console.log('   Input looks like a wallet address');
      walletAddress = walletOrUserId;
      
      // Find user by wallet
      const usersSnapshot = await db.collection('users')
        .where('walletAddress', '==', walletAddress)
        .limit(1)
        .get();
      
      if (!usersSnapshot.empty) {
        userId = usersSnapshot.docs[0].id;
        console.log(`   ✅ Found user: ${userId}`);
      } else {
        console.log('   ⚠️  User not found in users collection');
        
        // Try userRewards
        const rewardsSnapshot = await db.collection('userRewards')
          .where('walletAddress', '==', walletAddress)
          .limit(1)
          .get();
        
        if (!rewardsSnapshot.empty) {
          userId = rewardsSnapshot.docs[0].id;
          console.log(`   ✅ Found user in userRewards: ${userId}`);
        } else {
          console.log('   ❌ User not found anywhere');
          return { success: false, error: 'User not found' };
        }
      }
    } else {
      console.log('   Input looks like a user ID');
      
      // Get wallet from user doc
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        walletAddress = userDoc.data().walletAddress;
        console.log(`   ✅ Found wallet: ${walletAddress}`);
      } else {
        // Try userRewards
        const rewardsDoc = await db.collection('userRewards').doc(userId).get();
        if (rewardsDoc.exists) {
          walletAddress = rewardsDoc.data().walletAddress;
          console.log(`   ✅ Found wallet in userRewards: ${walletAddress}`);
        } else {
          console.log('   ❌ User not found');
          return { success: false, error: 'User not found' };
        }
      }
    }
    
    if (!walletAddress) {
      console.log('   ❌ No wallet address found for user');
      return { success: false, error: 'No wallet address' };
    }
    
    console.log(`\n   User ID: ${userId}`);
    console.log(`   Wallet: ${walletAddress}\n`);
    
    // Step 2: Check staking position and current boosters
    console.log('2️⃣  Checking current booster status...\n');
    
    const positionDoc = await db.collection('staking_positions').doc(userId).get();
    
    if (!positionDoc.exists) {
      console.log('   ⚠️  User has no staking position');
      console.log('   Boosters are only applied to active stakers\n');
    } else {
      const position = positionDoc.data();
      const activeBoosters = position.active_boosters || [];
      
      console.log(`   Principal: ${position.principal_amount || 0} MKIN`);
      console.log(`   Active Boosters: ${activeBoosters.length}`);
      
      if (activeBoosters.length > 0) {
        console.log('   Current Boosters:');
        activeBoosters.forEach(b => {
          console.log(`     - ${b.type}: ${b.multiplier}x (${b.count} NFT${b.count > 1 ? 's' : ''})`);
        });
      } else {
        console.log('   ⚠️  No boosters currently active');
      }
      
      console.log(`   Last Booster Cache: ${position.last_booster_cache_time?.toDate() || 'Never'}`);
      console.log(`   Cache Age: ${position.last_booster_cache_time ? ((Date.now() - position.last_booster_cache_time.toMillis()) / 1000 / 60).toFixed(0) + ' minutes' : 'N/A'}\n`);
    }
    
    // Step 3: Fetch NFTs from Helius
    console.log('3️⃣  Fetching NFTs from Helius...\n');
    
    try {
      const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'booster-diag',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress,
            page: 1,
            limit: 1000
          }
        })
      });
      
      const data = await response.json();
      
      if (data.result && data.result.items) {
        const nfts = data.result.items;
        console.log(`   ✅ Found ${nfts.length} total NFTs in wallet\n`);
        
        if (nfts.length === 0) {
          console.log('   ⚠️  Wallet has no NFTs');
          console.log('   User cannot have boosters without booster NFTs\n');
          return { success: true, boosters: [], reason: 'No NFTs' };
        }
        
        // Step 4: Check against booster categories
        console.log('4️⃣  Checking NFTs against booster categories...\n');
        
        const mintAddresses = nfts.map(nft => nft.id?.toLowerCase()).filter(Boolean);
        const categories = boosterService.NFT_CATEGORIES;
        
        const foundBoosters = [];
        
        for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
          const categoryMintsLower = categoryConfig.mints.map(m => m.toLowerCase());
          const matches = mintAddresses.filter(mint => categoryMintsLower.includes(mint));
          
          if (matches.length > 0) {
            console.log(`   ✅ ${categoryConfig.name}: ${matches.length} NFT(s) found`);
            matches.forEach(mint => {
              const originalMint = categoryConfig.mints.find(m => m.toLowerCase() === mint);
              console.log(`      • ${originalMint}`);
              foundBoosters.push({ category: categoryConfig.name, mint: originalMint, multiplier: categoryConfig.multiplier });
            });
          } else {
            console.log(`   ❌ ${categoryConfig.name}: No matching NFTs`);
          }
        }
        
        console.log();
        
        if (foundBoosters.length === 0) {
          console.log('   ⚠️  No booster NFTs detected');
          console.log('   User owns NFTs but none match booster categories\n');
          
          // Show sample NFTs
          console.log('   Sample NFTs in wallet (first 10):');
          nfts.slice(0, 10).forEach((nft, i) => {
            const name = nft.content?.metadata?.name || 'Unknown';
            console.log(`      ${i + 1}. ${name}`);
            console.log(`         Mint: ${nft.id}`);
          });
          console.log();
          
          return { success: true, boosters: [], nftCount: nfts.length };
        }
        
        // Step 5: Calculate expected multiplier
        console.log('5️⃣  Calculating expected multiplier...\n');
        
        let stackedMultiplier = 1.0;
        const boostersByCategory = {};
        
        foundBoosters.forEach(b => {
          if (!boostersByCategory[b.category]) {
            boostersByCategory[b.category] = { count: 0, multiplier: b.multiplier };
          }
          boostersByCategory[b.category].count++;
        });
        
        console.log('   Booster breakdown:');
        for (const [category, info] of Object.entries(boostersByCategory)) {
          console.log(`     ${category}: ${info.count} NFT(s) × ${info.multiplier}x = ${info.multiplier}x`);
          stackedMultiplier *= info.multiplier;
        }
        
        console.log(`\n   Total Stacked Multiplier: ${stackedMultiplier.toFixed(4)}x`);
        console.log(`   Boost Percentage: +${((stackedMultiplier - 1) * 100).toFixed(2)}%\n`);
        
        // Step 6: Recommendations
        console.log('6️⃣  Recommendations...\n');
        
        if (positionDoc.exists) {
          const position = positionDoc.data();
          const currentBoosters = position.active_boosters || [];
          
          if (currentBoosters.length === 0 && foundBoosters.length > 0) {
            console.log('   ⚠️  ISSUE FOUND: User has booster NFTs but no active boosters');
            console.log('   Possible causes:');
            console.log('     1. Cache hasn\'t been refreshed yet');
            console.log('     2. Booster detection failed during last refresh');
            console.log('     3. User staked before acquiring NFTs');
            console.log();
            console.log('   Solutions:');
            console.log('     1. Trigger manual booster refresh:');
            console.log(`        POST /api/boosters/refresh with user ID ${userId}`);
            console.log('     2. Wait for automatic refresh (runs every 30 min)');
            console.log('     3. Have user unstake and restake (forces booster detection)');
          } else if (currentBoosters.length !== Object.keys(boostersByCategory).length) {
            console.log('   ⚠️  MISMATCH: Expected vs actual boosters differ');
            console.log(`     Expected: ${Object.keys(boostersByCategory).length} categories`);
            console.log(`     Actual: ${currentBoosters.length} categories`);
            console.log('   Trigger a booster refresh to sync');
          } else {
            console.log('   ✅ Boosters look correct');
            console.log('   User should be receiving boosted rewards');
          }
        } else {
          console.log('   ℹ️  User is not currently staking');
          console.log('   Boosters will be detected when they stake');
        }
        
        console.log();
        
        return { success: true, boosters: foundBoosters, multiplier: stackedMultiplier };
        
      } else {
        console.log('   ❌ Failed to fetch NFTs from Helius');
        return { success: false, error: 'Helius API error' };
      }
    } catch (error) {
      console.log(`   ❌ Error fetching NFTs: ${error.message}`);
      return { success: false, error: error.message };
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// Run diagnostic
diagnoseUser()
  .then(result => {
    console.log('═'.repeat(80));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('═'.repeat(80) + '\n');
    
    if (result.success) {
      console.log('✅ Diagnostic completed successfully');
      if (result.boosters) {
        console.log(`   Found ${result.boosters.length} booster NFT(s)`);
      }
    } else {
      console.log('❌ Diagnostic failed:', result.error);
    }
    
    console.log();
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Diagnostic script failed:', error);
    process.exit(1);
  });
