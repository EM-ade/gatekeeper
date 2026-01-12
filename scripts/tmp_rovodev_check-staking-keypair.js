/**
 * Temporary script to check what public key corresponds to STAKING_PRIVATE_KEY
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const stakingPrivateKey = process.env.STAKING_PRIVATE_KEY;
const stakingWalletAddress = process.env.STAKING_WALLET_ADDRESS;

console.log('\n' + '='.repeat(80));
console.log('🔑 STAKING WALLET KEY CHECK');
console.log('='.repeat(80));

if (!stakingPrivateKey) {
  console.error('\n❌ STAKING_PRIVATE_KEY not found in .env');
  process.exit(1);
}

try {
  // Derive public key from private key
  const keypair = Keypair.fromSecretKey(bs58.decode(stakingPrivateKey));
  const derivedPublicKey = keypair.publicKey.toBase58();
  
  console.log('\n📋 Configuration:');
  console.log(`   STAKING_WALLET_ADDRESS (in .env): ${stakingWalletAddress || 'NOT SET'}`);
  console.log(`   STAKING_PRIVATE_KEY derives to:    ${derivedPublicKey}`);
  
  console.log('\n🔍 Comparison:');
  if (stakingWalletAddress === derivedPublicKey) {
    console.log('   ✅ MATCH! They are the same wallet.');
    console.log('   The private key corresponds to the configured wallet address.');
  } else {
    console.log('   ❌ MISMATCH! They are DIFFERENT wallets!');
    console.log('   ⚠️  WARNING: This is a configuration problem!');
    console.log('\n   What this means:');
    console.log('   - Claim fees go to: ' + stakingWalletAddress);
    console.log('   - Rewards paid from: ' + derivedPublicKey);
    console.log('   - These are TWO DIFFERENT WALLETS!');
    console.log('\n   💡 You need to either:');
    console.log('   1. Update STAKING_WALLET_ADDRESS to match the private key, OR');
    console.log('   2. Update STAKING_PRIVATE_KEY to match the wallet address');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Check complete\n');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('   The private key might be invalid or incorrectly formatted.');
  process.exit(1);
}
