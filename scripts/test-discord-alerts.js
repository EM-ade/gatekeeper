/**
 * Test Discord Alert System
 * Sends test alerts to verify webhook is working
 */

import { config } from 'dotenv';
import {
  sendDiscordAlert,
  sendVaultCriticalAlert,
  sendVaultWarningAlert,
  sendFailedUnstakeAlert,
  sendRecoverySuccessAlert
} from '../utils/discordAlerts.js';

config();

async function testDiscordAlerts() {
  console.log('🧪 Testing Discord Alert System...\n');
  
  // Check if webhook URL is configured
  if (!process.env.DISCORD_ADMIN_WEBHOOK_URL) {
    console.error('❌ DISCORD_ADMIN_WEBHOOK_URL not set in .env file');
    console.log('\n📝 Setup instructions:');
    console.log('1. Go to Discord Server Settings → Integrations → Webhooks');
    console.log('2. Create a new webhook');
    console.log('3. Copy the webhook URL');
    console.log('4. Add to .env: DISCORD_ADMIN_WEBHOOK_URL=your_webhook_url\n');
    process.exit(1);
  }
  
  console.log('✅ Webhook URL configured');
  console.log(`📍 Webhook: ${process.env.DISCORD_ADMIN_WEBHOOK_URL.substring(0, 50)}...`);
  console.log('\n⏳ Sending test alerts (5 second delay between each)...\n');
  
  try {
    // Test 1: Basic Info Alert
    console.log('1️⃣ Testing INFO alert...');
    await sendDiscordAlert({
      level: 'INFO',
      title: 'Test Alert - INFO',
      message: 'This is a test information alert. If you see this, your Discord webhook is working! 🎉',
      details: {
        'Test Time': new Date().toISOString(),
        'Status': '✅ Working'
      }
    });
    console.log('   ✅ Sent INFO alert\n');
    await sleep(5000);
    
    // Test 2: Warning Alert
    console.log('2️⃣ Testing WARNING alert...');
    await sendVaultWarningAlert(0.03);
    console.log('   ✅ Sent WARNING alert (Vault SOL low)\n');
    await sleep(5000);
    
    // Test 3: Critical Alert
    console.log('3️⃣ Testing CRITICAL alert...');
    await sendVaultCriticalAlert(0.005);
    console.log('   ✅ Sent CRITICAL alert (Vault SOL critical)\n');
    await sleep(5000);
    
    // Test 4: Error Alert (Failed Unstake)
    console.log('4️⃣ Testing ERROR alert...');
    await sendFailedUnstakeAlert({
      userId: 'test_user_123',
      amount: 50000,
      error: 'Insufficient vault SOL for gas fees (TEST)'
    });
    console.log('   ✅ Sent ERROR alert (Failed unstake)\n');
    await sleep(5000);
    
    // Test 5: Success Alert (Recovery)
    console.log('5️⃣ Testing SUCCESS alert...');
    await sendRecoverySuccessAlert({
      userId: 'test_user_123',
      amount: 50000,
      signature: 'test_signature_abc123xyz'
    });
    console.log('   ✅ Sent SUCCESS alert (Recovery completed)\n');
    
    console.log('═'.repeat(60));
    console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(60));
    console.log('\n📱 Check your Discord channel for 5 test messages:');
    console.log('   1. ℹ️  INFO - Test message');
    console.log('   2. ⚠️  WARNING - Vault SOL getting low');
    console.log('   3. 🚨 CRITICAL - Vault SOL critically low');
    console.log('   4. ❌ ERROR - Failed unstake');
    console.log('   5. ℹ️  INFO - Recovery success');
    console.log('\n💡 If you didn\'t receive all messages, check:');
    console.log('   - Webhook URL is correct');
    console.log('   - Webhook has permission to post in the channel');
    console.log('   - Channel exists and is accessible\n');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
testDiscordAlerts()
  .then(() => {
    console.log('✅ Test script completed\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
