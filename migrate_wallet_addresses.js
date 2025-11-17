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
        id: 'migrate-wallet',
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
 * Enhanced function to fix invalid wallet addresses
 * Uses multiple strategies to recover correct wallet addresses
 */
const fixInvalidWallets = async (walletMappings) => {
  console.log('\n🔧 Fixing invalid wallet addresses...\n');
  let fixedCount = 0;
  const fixedDetails = [];
  
  try {
    // Get all users with invalid wallet addresses
    const usersSnapshot = await db.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Check if user has a wallet address
      if (!userData.walletAddress) {
        continue;
      }

      const walletAddress = userData.walletAddress;
      
      // Check if wallet address is valid
      const isValid = isValidAddress(walletAddress);
      
      if (isValid) {
        continue;
      }

      console.log(`\n📌 Fixing user: ${userId} with invalid wallet: ${walletAddress}`);
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
    }
    
    if (fixedCount > 0) {
      console.log(`\n🔧 Fixed ${fixedCount} invalid wallet addresses:`);
      fixedDetails.forEach((item, index) => {
        console.log(`${index + 1}. User: ${item.userId}`);
        console.log(`   Original: ${item.originalWallet}`);
        console.log(`   Corrected: ${item.correctedWallet}`);
        console.log(`   Method: ${item.method}\n`);
      });
    }
    
    return fixedCount;
  } catch (error) {
    console.error('❌ Fix process failed:', error);
    return 0;
  }
};

/**
 * Main migration function
 */
const migrateWalletAddresses = async () => {
  console.log('🔄 Starting Wallet Address Migration\n');
  console.log('📋 This script will:\n');
  console.log('   1. Find all users with lowercase wallet addresses');
  console.log('   2. Attempt to recover original case from Firestore');
  console.log('   3. Verify against blockchain');
  console.log('   4. Update Firestore with correct case\n');

  let migratedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let fixedCount = 0;
  const failedWallets = [];

  try {
    // Load all valid wallet mappings
    const walletMappings = await getAllWalletMappings();
    
    // Fix invalid wallets first
    fixedCount = await fixInvalidWallets(walletMappings);
    
    // Get all wallets from the wallets collection
    console.log('\n📂 Fetching wallets collection...\n');
    const walletsSnapshot = await db.collection('wallets').get();
    
    console.log(`Found ${walletsSnapshot.size} wallet documents\n`);

    for (const walletDoc of walletsSnapshot.docs) {
      const walletId = walletDoc.id; // This is the lowercase wallet
      const walletData = walletDoc.data();
      
      console.log(`\n📌 Processing: ${walletId}`);
      
      // Check if already has correct case stored
      if (walletData.walletAddress && walletData.walletAddress !== walletId) {
        const storedWallet = walletData.walletAddress;
        const isValid = isValidAddress(storedWallet);
        
        if (isValid) {
          console.log(`   ✅ Already has correct case: ${storedWallet}`);
          skippedCount++;
          continue;
        }
      }

      // Try to recover from users collection
      const uid = walletData.uid;
      if (uid) {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists && userDoc.data()?.walletAddress) {
          const recoveredWallet = userDoc.data().walletAddress;
          const isValid = isValidAddress(recoveredWallet);
          
          if (isValid && recoveredWallet !== walletId) {
            console.log(`   ✅ Recovered from users collection: ${recoveredWallet}`);
            
            // Update the wallet document
            await walletDoc.ref.update({
              walletAddress: recoveredWallet,
              migratedAt: new Date(),
            });
            
            console.log(`   💾 Updated wallet document`);
            migratedCount++;
            continue;
          }
        }
      }

      // If we get here, we couldn't recover it
      console.log(`   ❌ Could not recover wallet address`);
      console.log(`   ℹ️  Wallet ID (lowercase): ${walletId}`);
      console.log(`   ℹ️  UID: ${uid}`);
      
      failedCount++;
      failedWallets.push({
        walletId,
        uid,
        data: walletData
      });
    }

    // Summary
    console.log('\n\n📊 Migration Summary:\n');
    console.log(`✅ Successfully migrated: ${migratedCount}`);
    console.log(`⏭️  Already correct: ${skippedCount}`);
    console.log(`🔧 Fixed invalid wallets: ${fixedCount}`);
    console.log(`❌ Failed to recover: ${failedCount}`);
    console.log(`📈 Total processed: ${walletsSnapshot.size}\n`);

    if (failedWallets.length > 0) {
      console.log('⚠️  Failed Wallets (require manual intervention):\n');
      failedWallets.forEach((item, index) => {
        console.log(`${index + 1}. Wallet ID: ${item.walletId}`);
        console.log(`   UID: ${item.uid}`);
        console.log(`   Data: ${JSON.stringify(item.data)}\n`);
      });

      console.log('\n💡 Next Steps for Failed Wallets:');
      console.log('   1. Check if user has Discord linked');
      console.log('   2. Ask user to reconnect wallet (will store correct case)');
      console.log('   3. Or manually update in Firestore if you know the correct address\n');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    process.exit(0);
  }
};

// Run migration
migrateWalletAddresses();