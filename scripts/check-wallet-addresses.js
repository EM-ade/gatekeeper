/**
 * Check if STAKING_WALLET_ADDRESS matches STAKING_PRIVATE_KEY
 * This verifies if stakes go to the same wallet that pays for gas/rewards
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from 'dotenv';

// Load environment variables
config();

console.log('\n' + '='.repeat(80));
console.log('🔍 WALLET ADDRESS VERIFICATION');
console.log('='.repeat(80) + '\n');

try {
  // Get the configured staking wallet address (where users send stakes TO)
  const stakingWalletAddress = process.env.STAKING_WALLET_ADDRESS;
  
  if (!stakingWalletAddress) {
    console.error('❌ STAKING_WALLET_ADDRESS not found in environment');
    process.exit(1);
  }
  
  console.log('📍 STAKING_WALLET_ADDRESS (where stakes go TO):');
  console.log(`   ${stakingWalletAddress}\n`);
  
  // Get the private key and derive its public address (who PAYS for gas/rewards)
  const stakingPrivateKey = process.env.STAKING_PRIVATE_KEY;
  
  if (!stakingPrivateKey) {
    console.error('❌ STAKING_PRIVATE_KEY not found in environment');
    process.exit(1);
  }
  
  const keypair = Keypair.fromSecretKey(bs58.decode(stakingPrivateKey));
  const derivedPublicKey = keypair.publicKey.toString();
  
  console.log('🔑 STAKING_PRIVATE_KEY derives to (who PAYS gas/rewards):');
  console.log(`   ${derivedPublicKey}\n`);
  
  // Check if they match
  const isMatch = derivedPublicKey === stakingWalletAddress;
  
  console.log('='.repeat(80));
  if (isMatch) {
    console.log('✅ MATCH - They are the SAME wallet!');
    console.log('='.repeat(80) + '\n');
    
    console.log('📊 ANALYSIS:');
    console.log('   - Stakes come INTO this wallet from users');
    console.log('   - Entry fees (SOL) accumulate in this wallet');
    console.log('   - Claim rewards (SOL) are paid OUT from this wallet');
    console.log('   - Unstake gas fees are paid by this wallet');
    console.log('   - Token transfers (MKIN) come FROM this wallet\n');
    
    console.log('💡 ISSUE:');
    console.log('   If this wallet ran out of SOL, it means:');
    console.log('   - Claim reward payouts > Entry fees collected');
    console.log('   - The 30% APR rewards are draining the SOL faster than fees replenish it\n');
    
    console.log('🎯 SOLUTION:');
    console.log('   Fund this wallet with enough SOL to cover reward payouts:');
    console.log(`   solana transfer ${stakingWalletAddress} 5.0\n`);
    
  } else {
    console.log('❌ MISMATCH - They are DIFFERENT wallets!');
    console.log('='.repeat(80) + '\n');
    
    console.log('📊 ANALYSIS:');
    console.log('   - Wallet A (STAKING_WALLET_ADDRESS): Receives stakes & fees');
    console.log('   - Wallet B (from STAKING_PRIVATE_KEY): Pays rewards & gas');
    console.log('   - Wallet A accumulates SOL but never uses it');
    console.log('   - Wallet B pays everything but never receives fees\n');
    
    console.log('💡 ISSUE:');
    console.log('   This is a CONFIGURATION ERROR!');
    console.log('   Fees are going to Wallet A, but Wallet B is paying for everything.\n');
    
    console.log('🎯 SOLUTIONS:');
    console.log('   Option 1: Fix the configuration (RECOMMENDED):');
    console.log('     - Update STAKING_WALLET_ADDRESS to match the private key');
    console.log(`     - Set STAKING_WALLET_ADDRESS=${derivedPublicKey}\n`);
    
    console.log('   Option 2: Transfer SOL from Wallet A to Wallet B:');
    console.log(`     - Send SOL from ${stakingWalletAddress}`);
    console.log(`     - To: ${derivedPublicKey}\n`);
    
    console.log('   Option 3: Use the private key for Wallet A instead:');
    console.log('     - Update STAKING_PRIVATE_KEY to match STAKING_WALLET_ADDRESS\n');
  }
  
  console.log('='.repeat(80) + '\n');
  
  process.exit(isMatch ? 0 : 1);
  
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
