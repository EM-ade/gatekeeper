import admin from 'firebase-admin';
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

/**
 * Validates if a wallet address is a valid Solana address
 */
const isValidAddress = (wallet) => {
  try {
    new PublicKey(wallet);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Identifies users with invalid wallet addresses
 */
const identifyInvalidWallets = async () => {
  console.log('🔍 Identifying Users with Invalid Wallet Addresses\n');
  
  const invalidWallets = [];
  let totalCount = 0;
  
  try {
    // Get all users from the users collection
    console.log('📂 Fetching users collection...\n');
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`Found ${usersSnapshot.size} user documents\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      totalCount++;
      
      // Check if user has a wallet address
      if (!userData.walletAddress) {
        console.log(`⚠️  User ${userId} has no wallet address`);
        continue;
      }
      
      const walletAddress = userData.walletAddress;
      
      // Check if wallet address is valid
      const isValid = isValidAddress(walletAddress);
      
      if (!isValid) {
        console.log(`❌ User ${userId} has invalid wallet address: ${walletAddress}`);
        invalidWallets.push({
          userId,
          walletAddress,
          userData
        });
      } else {
        console.log(`✅ User ${userId} has valid wallet address: ${walletAddress}`);
      }
    }
    
    // Summary
    console.log('\n\n📊 Identification Summary:\n');
    console.log(`📈 Total users processed: ${totalCount}`);
    console.log(`❌ Users with invalid wallets: ${invalidWallets.length}`);
    console.log(`✅ Users with valid wallets: ${totalCount - invalidWallets.length}\n`);
    
    if (invalidWallets.length > 0) {
      console.log('📋 Users with Invalid Wallets:\n');
      invalidWallets.forEach((item, index) => {
        console.log(`${index + 1}. User ID: ${item.userId}`);
        console.log(`   Invalid Wallet: ${item.walletAddress}`);
        console.log(`   Display Name: ${item.userData.displayName || 'N/A'}`);
        console.log(`   Email: ${item.userData.email || 'N/A'}`);
        console.log('');
      });
      
      // Save to file
      const fs = require('fs');
      const fileName = `invalid_wallets_${new Date().toISOString().split('T')[0]}.json`;
      fs.writeFileSync(fileName, JSON.stringify(invalidWallets, null, 2));
      console.log(`💾 Invalid wallets saved to ${fileName}\n`);
    }
    
    return invalidWallets;
  } catch (error) {
    console.error('❌ Identification process failed:', error);
    return [];
  }
};

// Run the identification process
identifyInvalidWallets().then((invalidWallets) => {
  console.log(`🔍 Identified ${invalidWallets.length} users with invalid wallet addresses`);
  process.exit(0);
});