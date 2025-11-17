import 'dotenv/config';
import { PublicKey } from '@solana/web3.js';

// Test the wallet validation and recovery logic
const testWalletValidation = () => {
  console.log('🧪 Testing Wallet Validation & Recovery Logic\n');
  
  // Test cases
  const testCases = [
    // {
    //   name: 'Valid wallet (correct case)',
    //   wallet: '98vJraBpTmT2hmFxfHchp1Bd7Wg5UN17ZKUuGQKfPi1r',
    //   shouldPass: true
    // },
    {
      name: 'Invalid wallet (all lowercase)',
      wallet: 'drwcfkwhdmmy2pkwarv8fgxeuonrsa5ycu9ftysctijw@wallet.realmkin.com',
      shouldPass: false
    },
    {
      name: 'Invalid wallet (mixed case wrong)',
      wallet: 'drwcfkwhdmmy2pkwarv8fgxeuonrsa5ycu9ftysctijw@wallet.realmkin.com',
      shouldPass: false
    },
    {
      name: 'Valid wallet (different address)',
      wallet: '11111111111111111111111111111112',
      shouldPass: true
    },
  ];

  // Proper Solana address validation using web3.js PublicKey class
  const isValidAddress = (wallet) => {
    try {
      new PublicKey(wallet);
      return true;
    } catch (error) {
      console.warn(`Address ${wallet} is invalid: ${error.message}`);
      return false;
    }
  };

  console.log('📋 Validation Results:\n');
  
  testCases.forEach((testCase) => {
    const isValid = isValidAddress(testCase.wallet);
    const passed = isValid === testCase.shouldPass;
    const status = passed ? '✅' : '❌';
    
    console.log(`${status} ${testCase.name}`);
    console.log(`   Wallet: ${testCase.wallet}`);
    console.log(`   Valid: ${isValid} (Expected: ${testCase.shouldPass})`);
    console.log(`   Length: ${testCase.wallet.length}`);
    console.log('');
  });

  console.log('\n🔄 Recovery Simulation:\n');
  
  // Simulate recovery with the actual wallet from Firestore
  const lowercaseWallet = 'drwcfkwhdmmy2pkwarv8fgxeuonrsa5ycu9ftysctijw';
  const originalWallet = 'drwcfkwhdmmy2pkwarv8fgxeuonrsa5ycu9ftysctijw';
  
  console.log('❌ Invalid wallet received:', lowercaseWallet);
  console.log('   Validation: FAILED\n');
  
  console.log('🔍 Attempting recovery from Firestore...');
  console.log('   Looking in wallets collection...');
  console.log('   Found original address: ' + originalWallet);
  console.log('   Re-validating recovered address...\n');
  
  const recoveredValid = isValidAddress(originalWallet);
  console.log(`   Recovery validation: ${recoveredValid ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Using for verification: ${originalWallet}\n`);
};

testWalletValidation();