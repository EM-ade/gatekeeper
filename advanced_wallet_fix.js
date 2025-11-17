import admin from 'firebase-admin';
import fetch from 'node-fetch';
import 'dotenv/config';
import { PublicKey } from '@solana/web3.js';

// Initialize Firebase Admin using the service account JSON from .env
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON not set in .env');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (error) {
  console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

if (!HELIUS_API_KEY) {
  console.error('❌ HELIUS_API_KEY not set in .env');
  process.exit(1);
}

const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

/**
 * Validates if a wallet address is a valid Solana address
 */
const isValidAddress = (wallet) => {
  try {
    new PublicKey(wallet);
    return true;
  } catch (error) {
    console.warn(`Address ${wallet} is invalid: ${error.message}`);
    return false;
  }
};

/**
 * Attempts to recover the original case-sensitive wallet from blockchain
 * by checking if it owns any NFTs
 */
const recoverWalletFromBlockchain = async (lowercaseWallet) => {
  try {
    console.log(`   🔍 Querying Helius for wallet: ${lowercaseWallet}`);
    
    const response = await fetch(heliusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'advanced-wallet-fix',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: lowercaseWallet,
          page: 1,
          limit: 10,
          options: {
            showUnverifiedCollections: false,
            showCollectionMetadata: false,
            showGrandTotal: false,
            showFungible: false,
            showNativeBalance: false,
            showInscription: false,
            showZeroBalance: false
          }
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.log(`   ⚠️  Helius error: ${data.error.message}`);
      return null;
    }

    // If we got assets, we can try to determine the correct case
    // by looking at the owner addresses in the response
    if (data.result && data.result.items && data.result.items.length > 0) {
      const ownerAddress = data.result.items[0].ownership.owner;
      if (ownerAddress && isValidAddress(ownerAddress)) {
        console.log(`   ✅ Found correct case from blockchain: ${ownerAddress}`);
        return ownerAddress;
      }
    }

    console.log(`   ⚠️  Wallet found on blockchain but couldn't determine correct case`);
    return null;
  } catch (error) {
    console.log(`   ❌ Blockchain query failed: ${error.message}`);
    return null;
  }
};

/**
 * Gets all wallet mappings from the wallets collection
 */
const getAllWalletMappings = async () => {
  console.log('📂 Fetching all wallet mappings...');
  const walletMappings = new Map();
  
  try {
    const walletsSnapshot = await db.collection('wallets').get();
    console.log(`   Found ${walletsSnapshot.size} wallet mappings`);
    
    for (const walletDoc of walletsSnapshot.docs) {
      const lowercaseWallet = walletDoc.id;
      const walletData = walletDoc.data();
      
      if (walletData.walletAddress && isValidAddress(walletData.walletAddress)) {
        walletMappings.set(lowercaseWallet, walletData.walletAddress);
      }
    }
    
    console.log(`   Loaded ${walletMappings.size} valid wallet mappings`);
    return walletMappings;
  } catch (error) {
    console.error('❌ Failed to load wallet mappings:', error);
    return walletMappings;
  }
};

/**
 * Advanced function to fix invalid wallet addresses
 * Uses multiple strategies to recover correct wallet addresses
 */
const advancedFixInvalidWallets = async () => {
  console.log('🔧 Starting Advanced Invalid Wallet Fix Process\n');
  console.log('📋 This script will:\n');
  console.log('   1. Find all users with invalid wallet addresses');
  console.log('   2. Use multiple strategies to fix them:');
  console.log('      - Check existing wallet mappings');
  console.log('      - Query blockchain for correct case');
  console.log('      - Cross-reference with other collections\n');

  let fixedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const fixedDetails = [];
  const failedWallets = [];

  try {
    // Load all valid wallet mappings
    const walletMappings = await getAllWalletMappings();
    
    // Get all users from the users collection
    console.log('\n📂 Fetching users collection...\n');
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`Found ${usersSnapshot.size} user documents\n`);

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      console.log(`\n📌 Processing user: ${userId}`);
      
      // Check if user has a wallet address
      if (!userData.walletAddress) {
        console.log(`   ⚠️  No wallet address found for user`);
        skippedCount++;
        continue;
      }

      const walletAddress = userData.walletAddress;
      console.log(`   💳 Wallet address: ${walletAddress}`);
      
      // Check if wallet address is valid
      const isValid = isValidAddress(walletAddress);
      
      if (isValid) {
        console.log(`   ✅ Wallet address is valid`);
        skippedCount++;
        continue;
      }

      console.log(`   ❌ Wallet address is invalid, attempting to fix...`);
      let fixed = false;
      let fixedMethod = '';
      let correctedWallet = null;
      
      // Strategy 1: Check if there's a wallet document with the lowercase version
      const lowercaseWallet = walletAddress.toLowerCase();
      console.log(`   🔎 Strategy 1: Checking wallet mappings for ${lowercaseWallet}`);
      
      if (walletMappings.has(lowercaseWallet)) {
        correctedWallet = walletMappings.get(lowercaseWallet);
        fixedMethod = 'Wallet mapping lookup';
        console.log(`   🔄 Found corrected wallet address: ${correctedWallet}`);
      }
      
      // Strategy 2: Try to recover from blockchain if not found in mappings
      if (!correctedWallet) {
        console.log(`   🔎 Strategy 2: Querying blockchain for correct case`);
        correctedWallet = await recoverWalletFromBlockchain(lowercaseWallet);
        if (correctedWallet) {
          fixedMethod = 'Blockchain recovery';
        }
      }
      
      // Strategy 3: Check if user has sessions with correct wallet addresses
      if (!correctedWallet) {
        console.log(`   🔎 Strategy 3: Checking user sessions for correct wallet address`);
        try {
          const sessionsSnapshot = await db.collection('sessions')
            .where('uid', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
          
          for (const sessionDoc of sessionsSnapshot.docs) {
            const sessionData = sessionDoc.data();
            if (sessionData.walletAddress && isValidAddress(sessionData.walletAddress)) {
              correctedWallet = sessionData.walletAddress;
              fixedMethod = 'Session history lookup';
              console.log(`   🔄 Found corrected wallet address from session: ${correctedWallet}`);
              break;
            }
          }
        } catch (error) {
          console.log(`   ⚠️  Session lookup failed: ${error.message}`);
        }
      }
      
      // Strategy 4: Check verification sessions
      if (!correctedWallet) {
        console.log(`   🔎 Strategy 4: Checking verification sessions for correct wallet address`);
        try {
          const verificationSnapshot = await db.collection('verification_sessions')
            .where('discord_id', '==', userId)
            .orderBy('created_at', 'desc')
            .limit(5)
            .get();
          
          for (const verificationDoc of verificationSnapshot.docs) {
            const verificationData = verificationDoc.data();
            if (verificationData.wallet_address && isValidAddress(verificationData.wallet_address)) {
              correctedWallet = verificationData.wallet_address;
              fixedMethod = 'Verification session lookup';
              console.log(`   🔄 Found corrected wallet address from verification: ${correctedWallet}`);
              break;
            }
          }
        } catch (error) {
          console.log(`   ⚠️  Verification session lookup failed: ${error.message}`);
        }
      }

      // If we found a corrected wallet address, update the user document
      if (correctedWallet && correctedWallet !== walletAddress) {
        console.log(`   🔄 Updating user with corrected wallet address: ${correctedWallet}`);
        
        // Update the user document with the corrected wallet address
        await userDoc.ref.update({
          walletAddress: correctedWallet,
          fixedAt: new Date(),
          fixedMethod: fixedMethod,
          originalInvalidWallet: walletAddress
        });
        
        console.log(`   💾 Updated user document with corrected wallet address`);
        fixedCount++;
        fixed = true;
        fixedDetails.push({
          userId,
          originalWallet: walletAddress,
          correctedWallet,
          method: fixedMethod
        });
      }

      if (!fixed) {
        // If we get here, we couldn't fix it
        console.log(`   ❌ Could not fix wallet address`);
        console.log(`   ℹ️  Original wallet address: ${walletAddress}`);
        console.log(`   ℹ️  Lowercase wallet address: ${lowercaseWallet}`);
        
        failedCount++;
        failedWallets.push({
          userId,
          walletAddress,
          data: userData
        });
      }
    }

    // Summary
    console.log('\n\n📊 Fix Summary:\n');
    console.log(`✅ Successfully fixed: ${fixedCount}`);
    console.log(`⏭️  Skipped (already valid): ${skippedCount}`);
    console.log(`❌ Failed to fix: ${failedCount}`);
    console.log(`📈 Total processed: ${usersSnapshot.size}\n`);

    if (fixedDetails.length > 0) {
      console.log('🔧 Fixed Wallets:\n');
      fixedDetails.forEach((item, index) => {
        console.log(`${index + 1}. User ID: ${item.userId}`);
        console.log(`   Original: ${item.originalWallet}`);
        console.log(`   Corrected: ${item.correctedWallet}`);
        console.log(`   Method: ${item.method}\n`);
      });
    }

    if (failedWallets.length > 0) {
      console.log('⚠️  Failed Wallets (require manual intervention):\n');
      failedWallets.forEach((item, index) => {
        console.log(`${index + 1}. User ID: ${item.userId}`);
        console.log(`   Wallet Address: ${item.walletAddress}`);
        // Limit data output to avoid clutter
        console.log(`   Data: ${JSON.stringify({ 
          displayName: item.data.displayName, 
          email: item.data.email,
          createdAt: item.data.createdAt 
        })}\n`);
      });

      console.log('\n💡 Next Steps for Failed Wallets:');
      console.log('   1. Contact the user and ask them to reconnect their wallet');
      console.log('   2. Or manually update in Firestore if you know the correct address\n');
    }

    // Also check for orphaned wallet mappings
    console.log('\n🔍 Checking for orphaned wallet mappings...\n');
    let orphanedCount = 0;
    
    try {
      const walletsSnapshot = await db.collection('wallets').get();
      
      for (const walletDoc of walletsSnapshot.docs) {
        const walletData = walletDoc.data();
        if (walletData.uid) {
          try {
            const userDoc = await db.collection('users').doc(walletData.uid).get();
            if (!userDoc.exists) {
              console.log(`   🗑️  Orphaned wallet mapping found: ${walletDoc.id} -> ${walletData.uid}`);
              orphanedCount++;
              
              // Optionally remove orphaned mappings
              // await walletDoc.ref.delete();
              // console.log(`   🧹 Removed orphaned wallet mapping`);
            }
          } catch (error) {
            console.log(`   ⚠️  Error checking user for wallet ${walletDoc.id}: ${error.message}`);
          }
        }
      }
      
      console.log(`\n🗑️  Found ${orphanedCount} orphaned wallet mappings`);
    } catch (error) {
      console.log(`⚠️  Error checking for orphaned wallet mappings: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Fix process failed:', error);
  } finally {
    process.exit(0);
  }
};

// Run the advanced fix process
advancedFixInvalidWallets();