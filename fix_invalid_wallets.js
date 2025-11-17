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
        id: 'fix-invalid-wallets',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: lowercaseWallet,
          page: 1,
          limit: 1,
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

    // If we got a successful response, the wallet exists on blockchain
    // But we can't recover the exact case from Helius
    // Instead, we'll mark it for manual review
    console.log(`   ✅ Wallet found on blockchain (but case cannot be recovered from Helius)`);
    return null;
  } catch (error) {
    console.log(`   ❌ Blockchain query failed: ${error.message}`);
    return null;
  }
};

/**
 * Finds users with invalid wallet addresses and attempts to fix them
 * by using correct wallet addresses from Web3 context
 */
const fixInvalidWallets = async () => {
  console.log('🔧 Starting Invalid Wallet Fix Process\n');
  console.log('📋 This script will:\n');
  console.log('   1. Find all users with invalid wallet addresses');
  console.log('   2. Attempt to fix them using correct wallet addresses from Web3 context\n');

  let fixedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failedWallets = [];

  try {
    // Get all users from the users collection
    console.log('📂 Fetching users collection...\n');
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
      
      // Try to find a corrected wallet address
      // First, check if there's a wallet document with the lowercase version
      const lowercaseWallet = walletAddress.toLowerCase();
      const walletDoc = await db.collection('wallets').doc(lowercaseWallet).get();
      
      if (walletDoc.exists && walletDoc.data().walletAddress) {
        const correctedWallet = walletDoc.data().walletAddress;
        const isCorrectedValid = isValidAddress(correctedWallet);
        
        if (isCorrectedValid && correctedWallet !== walletAddress) {
          console.log(`   🔄 Found corrected wallet address: ${correctedWallet}`);
          
          // Update the user document with the corrected wallet address
          await userDoc.ref.update({
            walletAddress: correctedWallet,
            fixedAt: new Date(),
            fixedReason: 'Corrected from wallet mapping'
          });
          
          console.log(`   💾 Updated user document with corrected wallet address`);
          fixedCount++;
          continue;
        }
      }

      // Try to recover from blockchain
      const recoveredWallet = await recoverWalletFromBlockchain(lowercaseWallet);
      if (recoveredWallet) {
        console.log(`   🔄 Recovered wallet address from blockchain: ${recoveredWallet}`);
        
        // Update the user document with the recovered wallet address
        await userDoc.ref.update({
          walletAddress: recoveredWallet,
          fixedAt: new Date(),
          fixedReason: 'Recovered from blockchain'
        });
        
        console.log(`   💾 Updated user document with recovered wallet address`);
        fixedCount++;
        continue;
      }

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

    // Summary
    console.log('\n\n📊 Fix Summary:\n');
    console.log(`✅ Successfully fixed: ${fixedCount}`);
    console.log(`⏭️  Skipped (already valid): ${skippedCount}`);
    console.log(`❌ Failed to fix: ${failedCount}`);
    console.log(`📈 Total processed: ${usersSnapshot.size}\n`);

    if (failedWallets.length > 0) {
      console.log('⚠️  Failed Wallets (require manual intervention):\n');
      failedWallets.forEach((item, index) => {
        console.log(`${index + 1}. User ID: ${item.userId}`);
        console.log(`   Wallet Address: ${item.walletAddress}`);
        console.log(`   Data: ${JSON.stringify(item.data)}\n`);
      });

      console.log('\n💡 Next Steps for Failed Wallets:');
      console.log('   1. Contact the user and ask them to reconnect their wallet');
      console.log('   2. Or manually update in Firestore if you know the correct address\n');
    }

  } catch (error) {
    console.error('❌ Fix process failed:', error);
  } finally {
    process.exit(0);
  }
};

// Run the fix process
fixInvalidWallets();