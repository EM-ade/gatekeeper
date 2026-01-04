import "dotenv/config";
import admin from 'firebase-admin';
import fs from 'fs';
import BoosterService from '../services/boosterService.js';

/**
 * Initialize Firebase Admin for testing
 */
function initializeFirebase() {
  if (!admin.apps.length) {
    try {
      // Prefer FIREBASE_SERVICE_ACCOUNT_JSON env var (string or path)
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        let svcJson = null;
        const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

        // Strip UTF-8 BOM if present and trim
        let content = rawEnv.replace(/^\uFEFF/, "").trim();

        // Fix: Strip surrounding single quotes if present (common .env issue)
        if (content.startsWith("'") && content.endsWith("'")) {
          content = content.slice(1, -1);
        }

        if (content.startsWith("{")) {
          // JSON directly in env var
          try {
            svcJson = JSON.parse(content);
          } catch (e) {
            console.error("JSON Parse Error. Content being parsed:", content);
            throw e;
          }
        } else if (/\.json$/i.test(content)) {
          // Treat as path to a JSON file
          try {
            const fileStr = fs
              .readFileSync(content, "utf8")
              .replace(/^\uFEFF/, "");
            svcJson = JSON.parse(fileStr);
          } catch (e) {
            console.warn(
              "Failed to read service account JSON from path:",
              content,
              e
            );
          }
        } else {
          // Unexpected format; attempt JSON parse anyway
          try {
            svcJson = JSON.parse(content);
          } catch (_) {
            /* ignore */
          }
        }

        if (svcJson) {
          // Ensure private_key has real newlines (env often stores as escaped \n)
          if (svcJson.private_key && typeof svcJson.private_key === "string") {
            svcJson.private_key = svcJson.private_key.replace(/\\n/g, "\n");
          }
          const initConfig = {
            credential: admin.credential.cert(svcJson),
          };

          if (process.env.FIREBASE_DATABASE_URL) {
            initConfig.databaseURL = process.env.FIREBASE_DATABASE_URL;
          }

          admin.initializeApp(initConfig);
          console.log(
            "Firebase Admin initialized for testing, project:",
            svcJson.project_id
          );
        }
      }

      if (!admin.apps.length) {
        throw new Error("No Firebase credentials found in environment");
      }
    } catch (err) {
      console.error(
        "Firebase Admin failed to initialize for testing:",
        err
      );
      throw err;
    }
  }
}

/**
 * Test script to verify booster detection with test NFTs
 *
 * Usage: node scripts/test-booster-detection.js [wallet_address]
 *
 * If no wallet address is provided, it will test with a sample wallet containing the test NFTs
 */

async function testBoosterDetection(walletAddress) {
  console.log('🧪 Testing Booster Detection System');
  console.log('=====================================');
  
  // Initialize Firebase first
  initializeFirebase();
  
  const boosterService = new BoosterService();
  
  // Test wallet containing the test NFTs
  const testWallet = walletAddress || '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Example wallet
  
  try {
    console.log(`\n📋 Testing wallet: ${testWallet}`);
    
    // Detect boosters for the test wallet using scanWalletForBoosters
    const boosters = await boosterService.scanWalletForBoosters(testWallet);
    
    console.log('\n🎯 Detected Boosters:');
    console.log('---------------------');
    
    if (boosters.length === 0) {
      console.log('❌ No boosters detected');
    } else {
      boosters.forEach((booster, index) => {
        console.log(`${index + 1}. ${booster.name} - ${booster.multiplier}x (${booster.mints.length} NFTs)`);
        console.log(`   Type: ${booster.type}`);
        console.log(`   NFTs: ${booster.mints.join(', ')}`);
        console.log('');
      });
      
      // Calculate total multiplier using the service method
      const totalMultiplier = boosterService.calculateStackedMultiplier(boosters);
      
      console.log(`📊 Total Stacked Multiplier: ${totalMultiplier.toFixed(4)}x`);
    }
    
    // Test individual NFT detection
    console.log('\n🔍 Testing Individual NFT Detection:');
    console.log('------------------------------------');
    
    const testNFTs = [
      '6SABMjQ6DfbnyT5msoVdybVLDQgPfsQhixZufK6xjJun',
      '5MbExwqPUNL8yNuUb8JK9iCXHGGcLXEDkecgZDfSEJfu',
      'GK5yLk7TEML3dudTYwyUgHz2z4iCMgfW6MVNfdThjbs1'
    ];
    
    // Check each test NFT against the categories
    for (const nftMint of testNFTs) {
      let found = false;
      for (const [categoryKey, category] of Object.entries(boosterService.NFT_CATEGORIES)) {
        if (category.mints.includes(nftMint)) {
          console.log(`✅ ${nftMint} -> ${category.name} (${category.multiplier}x)`);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`❌ ${nftMint} -> Not recognized as booster NFT`);
      }
    }
    
    // Test cache functionality
    console.log('\n💾 Testing Cache Functionality:');
    console.log('---------------------------------');
    
    // Since we're testing by wallet address directly, we'll test the cache structure
    console.log(`✅ Cache system initialized with TTL: ${boosterService.CACHE_TTL}ms`);
    console.log(`   Current cache size: ${boosterService.cache.size} entries`);
    
    // Test booster categories
    console.log('\n📋 Available Booster Categories:');
    console.log('----------------------------------');
    
    const categories = boosterService.getBoosterCategories();
    categories.forEach((category, index) => {
      console.log(`${index + 1}. ${category.name} (${category.type}) - ${category.multiplier}x`);
      console.log(`   Mint count: ${category.mintCount}`);
    });
    
    console.log('\n🎉 Booster Detection Test Complete!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    console.error(error.stack);
  }
}

// Run the test
const walletAddress = process.argv[2];
testBoosterDetection(walletAddress);

export default testBoosterDetection;