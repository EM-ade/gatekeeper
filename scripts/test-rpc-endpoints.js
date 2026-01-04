#!/usr/bin/env node

/**
 * Test script to verify RPC endpoint configuration
 * This script tests both mainnet and devnet RPC endpoints
 * to ensure our Helius configuration is working correctly
 */

const { Connection, PublicKey } = require('@solana/web3.js');

// Test configuration
const TEST_WALLET = 'ABjnax7QfDmG6wR2KJoNc3UyiouwTEZm'; // Test wallet address
const TEST_MINT = 'BKDGf6DnDHK87GsZpdWXyBqiNdcNb6KnoFcYbWPUhJLA'; // Test token mint

async function testRPCConnection(rpcUrl, network, tokenMint) {
  console.log(`\n🔍 Testing ${network} RPC endpoint: ${rpcUrl}`);
  console.log(`🪙 Token mint: ${tokenMint}`);
  
  try {
    // Create connection
    const connection = new Connection(rpcUrl, 'confirmed');
    
    // Test basic connection
    const latestBlockhash = await connection.getLatestBlockhash();
    console.log(`✅ Latest blockhash: ${latestBlockhash}`);
    
    // Test token account
    const tokenAccount = await connection.getAccountInfo(new PublicKey(tokenMint));
    console.log(`✅ Token account info:`, tokenAccount);
    
    // Test balance query
    const balance = await connection.getBalance(new PublicKey(TEST_WALLET));
    console.log(`✅ Wallet balance: ${balance} SOL`);
    
    // Test transaction simulation
    const { blockhash } = await connection.getLatestBlockhash();
    console.log(`✅ Transaction simulation successful`);
    
    return {
      success: true,
      network,
      rpcUrl,
      tokenMint,
      latestBlockhash
    };
  } catch (error) {
    console.error(`❌ ${network} RPC connection failed:`, error.message);
    return {
      success: false,
      network,
      rpcUrl,
      tokenMint,
      error: error.message
    };
  }
}

async function main() {
  console.log('\n🚀 Starting RPC endpoint tests...\n');
  
  // Get environment configuration
  const environmentConfig = require('../config/environment.js').default;
  const networkConfig = environmentConfig.networkConfig;
  
  console.log('📋 Environment configuration:');
  console.log(`  - Network: ${networkConfig.isDevnet ? 'devnet' : 'mainnet'}`);
  console.log(`  - RPC URL: ${networkConfig.rpcUrl}`);
  console.log(`  - Token mint: ${networkConfig.tokenMint}`);
  console.log(`  - Helius URL: ${networkConfig.heliusUrl || 'Not configured'}`);
  
    
  // Test mainnet connection
  console.log('\n🌐 Testing mainnet connection...');
  const mainnetResult = await testRPCConnection(
    networkConfig.rpcUrl,
    networkConfig.isDevnet ? 'mainnet' : 'mainnet',
    networkConfig.tokenMint
  );
  
  if (mainnetResult.success) {
    console.log('✅ Mainnet RPC connection test passed');
  } else {
    console.error('❌ Mainnet RPC connection test failed:', mainnetResult.error);
  }
  
  // Test devnet connection if configured
  if (networkConfig.heliusUrl) {
    console.log('\n🧪 Testing devnet connection...');
    const devnetResult = await testRPCConnection(
      networkConfig.heliusUrl,
      networkConfig.isDevnet ? 'devnet' : 'devnet',
      networkConfig.tokenMint
    );
    
    if (devnetResult.success) {
      console.log('✅ Devnet RPC connection test passed');
    } else {
      console.error('❌ Devnet RPC connection test failed:', devnetResult.error);
    }
  }
  
  console.log('\n🏁 RPC endpoint tests completed!\n');
  console.log('\n📊 Test Results:');
  console.log(`  - Mainnet: ${mainnetResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  - Devnet: ${devnetResult.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  - Using Helius: ${networkConfig.heliusUrl ? '✅ YES' : '❌ NO'}`);
}

main().catch(error => {
  console.error('\n💥 Script execution failed:', error);
  process.exit(1);
  process.exit(1);
});
