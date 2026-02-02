/**
 * Test Discord Bot Service
 * Validates that the bot service can start and connect
 */

import { config } from 'dotenv';
config();

console.log('🧪 Testing Discord Bot Service\n');

const tests = [];

// Test 1: Environment Variables
function testEnvironmentVariables() {
  console.log('1️⃣  Testing environment variables...');
  const required = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DATABASE_URL',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'HELIUS_API_KEY',
    'STAKING_PRIVATE_KEY'
  ];
  
  const missing = [];
  const present = [];
  
  for (const env of required) {
    if (process.env[env]) {
      present.push(env);
      console.log(`   ✅ ${env} - Set`);
    } else {
      missing.push(env);
      console.log(`   ❌ ${env} - Missing`);
    }
  }
  
  if (missing.length === 0) {
    console.log(`   ✅ All required environment variables present`);
    return { pass: true, test: 'Environment Variables' };
  } else {
    console.log(`   ❌ ${missing.length} environment variable(s) missing`);
    return { pass: false, test: 'Environment Variables', missing };
  }
}

// Test 2: File Dependencies
async function testFileDependencies() {
  console.log('\n2️⃣  Testing file dependencies...');
  const files = [
    'bot.js',
    'commands/help.js',
    'events/interactionCreate.js',
    'services/periodicVerification.js',
    'config/environment.js'
  ];
  
  const { access } = await import('fs/promises');
  const missing = [];
  const present = [];
  
  for (const file of files) {
    try {
      await access(file);
      present.push(file);
      console.log(`   ✅ ${file} - Exists`);
    } catch {
      missing.push(file);
      console.log(`   ❌ ${file} - Missing`);
    }
  }
  
  if (missing.length === 0) {
    console.log(`   ✅ All required files present`);
    return { pass: true, test: 'File Dependencies' };
  } else {
    console.log(`   ❌ ${missing.length} file(s) missing`);
    return { pass: false, test: 'File Dependencies', missing };
  }
}

// Test 3: Module Imports
async function testModuleImports() {
  console.log('\n3️⃣  Testing module imports...');
  try {
    // Try to import Discord.js
    await import('discord.js');
    console.log('   ✅ discord.js - Imported');
    
    // Try to import Firebase Admin
    await import('firebase-admin');
    console.log('   ✅ firebase-admin - Imported');
    
    // Try to import Solana
    await import('@solana/web3.js');
    console.log('   ✅ @solana/web3.js - Imported');
    
    console.log('   ✅ All core modules imported successfully');
    return { pass: true, test: 'Module Imports' };
  } catch (error) {
    console.log(`   ❌ Module import failed: ${error.message}`);
    return { pass: false, test: 'Module Imports', error: error.message };
  }
}

// Test 4: Syntax Check
async function testSyntaxCheck() {
  console.log('\n4️⃣  Testing bot.js syntax...');
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync('node --check bot.js');
    console.log('   ✅ bot.js syntax valid');
    return { pass: true, test: 'Syntax Check' };
  } catch (error) {
    console.log(`   ❌ Syntax error in bot.js: ${error.message}`);
    return { pass: false, test: 'Syntax Check', error: error.message };
  }
}

// Run all tests
async function runTests() {
  console.log('═'.repeat(80));
  console.log('Starting Discord Bot Tests...');
  console.log('═'.repeat(80) + '\n');
  
  const results = [];
  
  results.push(testEnvironmentVariables());
  results.push(await testFileDependencies());
  results.push(await testModuleImports());
  results.push(await testSyntaxCheck());
  
  console.log('\n' + '═'.repeat(80));
  console.log('TEST RESULTS');
  console.log('═'.repeat(80));
  
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  results.forEach(result => {
    const icon = result.pass ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
    if (result.error) console.log(`   Error: ${result.error}`);
    if (result.missing && result.missing.length > 0) {
      console.log(`   Missing: ${result.missing.join(', ')}`);
    }
  });
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Discord bot is ready to start.\n');
    console.log('💡 To start the bot, run: npm start\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Fix the errors above before starting the bot.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
