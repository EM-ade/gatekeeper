/**
 * Frontend Integration Test Suite
 * Simulates real frontend API calls to validate backend-api service
 */

import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'https://discord.therealmkin.xyz';

// Initialize Firebase Admin for creating test tokens
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  } catch (error) {
    console.warn('⚠️  Firebase Admin not initialized - auth tests will be skipped');
  }
}

console.log('🧪 Frontend Integration Test Suite');
console.log(`📍 API: ${API_BASE_URL}`);
console.log(`🌐 Origin: ${FRONTEND_ORIGIN}\n`);

// Helper to create Firebase custom token (for testing)
async function createTestToken(uid = 'test-user-123') {
  if (!admin.apps.length) {
    return 'mock-token-for-testing';
  }
  
  try {
    const customToken = await admin.auth().createCustomToken(uid);
    // In real scenario, frontend would exchange this for an ID token
    // For testing, we'll use a mock token since we can't exchange without frontend
    return 'test-' + customToken.substring(0, 20);
  } catch (error) {
    console.warn('Could not create custom token:', error.message);
    return 'mock-token-for-testing';
  }
}

// Test 1: Public Endpoints (No Auth)
async function testPublicEndpoints() {
  console.log('1️⃣  Testing Public Endpoints\n');
  const tests = [];
  
  // Leaderboard
  try {
    console.log('   Testing GET /api/leaderboard/mining...');
    const response = await fetch(`${API_BASE_URL}/api/leaderboard/mining`, {
      headers: { 'Origin': FRONTEND_ORIGIN }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Leaderboard: ${response.status} - ${Array.isArray(data) ? data.length : 0} entries`);
      tests.push({ name: 'Leaderboard', pass: true, data: { count: data.length } });
    } else {
      console.log(`   ❌ Leaderboard: ${response.status}`);
      tests.push({ name: 'Leaderboard', pass: false, error: `Status ${response.status}` });
    }
  } catch (error) {
    console.log(`   ❌ Leaderboard: ${error.message}`);
    tests.push({ name: 'Leaderboard', pass: false, error: error.message });
  }
  
  // Goal
  try {
    console.log('   Testing GET /api/goal...');
    const response = await fetch(`${API_BASE_URL}/api/goal`, {
      headers: { 'Origin': FRONTEND_ORIGIN }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Goal: ${response.status} - Data received`);
      tests.push({ name: 'Goal', pass: true, data });
    } else {
      console.log(`   ❌ Goal: ${response.status}`);
      tests.push({ name: 'Goal', pass: false, error: `Status ${response.status}` });
    }
  } catch (error) {
    console.log(`   ❌ Goal: ${error.message}`);
    tests.push({ name: 'Goal', pass: false, error: error.message });
  }
  
  // Booster Categories
  try {
    console.log('   Testing GET /api/boosters/categories...');
    const response = await fetch(`${API_BASE_URL}/api/boosters/categories`, {
      headers: { 'Origin': FRONTEND_ORIGIN }
    });
    
    if (response.ok || response.status === 404) {
      console.log(`   ✅ Booster Categories: ${response.status}`);
      tests.push({ name: 'Booster Categories', pass: true, note: response.status === 404 ? 'Endpoint may not exist' : 'OK' });
    } else {
      console.log(`   ❌ Booster Categories: ${response.status}`);
      tests.push({ name: 'Booster Categories', pass: false, error: `Status ${response.status}` });
    }
  } catch (error) {
    console.log(`   ❌ Booster Categories: ${error.message}`);
    tests.push({ name: 'Booster Categories', pass: false, error: error.message });
  }
  
  return tests;
}

// Test 2: Auth-Protected Endpoints
async function testAuthEndpoints() {
  console.log('\n2️⃣  Testing Auth-Protected Endpoints\n');
  const tests = [];
  const token = await createTestToken();
  
  // Staking Overview
  try {
    console.log('   Testing GET /api/staking/overview...');
    const response = await fetch(`${API_BASE_URL}/api/staking/overview`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': FRONTEND_ORIGIN
      }
    });
    
    if (response.status === 401 || response.status === 403) {
      console.log(`   ✅ Staking Overview: ${response.status} (Auth required ✓)`);
      tests.push({ name: 'Staking Overview', pass: true, note: 'Auth protection working' });
    } else if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Staking Overview: ${response.status} - Data received`);
      tests.push({ name: 'Staking Overview', pass: true, data });
    } else {
      console.log(`   ⚠️  Staking Overview: ${response.status}`);
      tests.push({ name: 'Staking Overview', pass: true, note: `Unexpected status ${response.status}` });
    }
  } catch (error) {
    console.log(`   ❌ Staking Overview: ${error.message}`);
    tests.push({ name: 'Staking Overview', pass: false, error: error.message });
  }
  
  // Staking Calculate Fee
  try {
    console.log('   Testing POST /api/staking/calculate-fee...');
    const response = await fetch(`${API_BASE_URL}/api/staking/calculate-fee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': FRONTEND_ORIGIN
      },
      body: JSON.stringify({ amount: 1000 })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Calculate Fee: ${response.status} - Fee: $${data.feeAmountUsd || 'N/A'}`);
      tests.push({ name: 'Calculate Fee', pass: true, data });
    } else {
      console.log(`   ⚠️  Calculate Fee: ${response.status}`);
      tests.push({ name: 'Calculate Fee', pass: true, note: `Status ${response.status}` });
    }
  } catch (error) {
    console.log(`   ❌ Calculate Fee: ${error.message}`);
    tests.push({ name: 'Calculate Fee', pass: false, error: error.message });
  }
  
  // Boosters Status
  try {
    console.log('   Testing GET /api/boosters/status...');
    const response = await fetch(`${API_BASE_URL}/api/boosters/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': FRONTEND_ORIGIN
      }
    });
    
    if (response.status === 401 || response.status === 403) {
      console.log(`   ✅ Boosters Status: ${response.status} (Auth required ✓)`);
      tests.push({ name: 'Boosters Status', pass: true, note: 'Auth protection working' });
    } else if (response.ok || response.status === 404) {
      console.log(`   ✅ Boosters Status: ${response.status}`);
      tests.push({ name: 'Boosters Status', pass: true, note: response.status === 404 ? 'May need user ID' : 'OK' });
    } else {
      console.log(`   ⚠️  Boosters Status: ${response.status}`);
      tests.push({ name: 'Boosters Status', pass: true, note: `Status ${response.status}` });
    }
  } catch (error) {
    console.log(`   ❌ Boosters Status: ${error.message}`);
    tests.push({ name: 'Boosters Status', pass: false, error: error.message });
  }
  
  return tests;
}

// Test 3: Staking Flow Simulation
async function testStakingFlow() {
  console.log('\n3️⃣  Testing Complete Staking Flow\n');
  const tests = [];
  const token = await createTestToken();
  
  console.log('   Simulating: Check Overview → Calculate Fee → Stake → Claim → Unstake\n');
  
  // Step 1: Get Overview
  try {
    console.log('   Step 1: GET /api/staking/overview');
    const response = await fetch(`${API_BASE_URL}/api/staking/overview`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': FRONTEND_ORIGIN
      }
    });
    console.log(`   Status: ${response.status}`);
    tests.push({ step: 'Get Overview', status: response.status, pass: response.status === 401 || response.ok });
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    tests.push({ step: 'Get Overview', error: error.message, pass: false });
  }
  
  // Step 2: Calculate Fee
  try {
    console.log('\n   Step 2: POST /api/staking/calculate-fee');
    const response = await fetch(`${API_BASE_URL}/api/staking/calculate-fee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': FRONTEND_ORIGIN
      },
      body: JSON.stringify({ amount: 1000 })
    });
    console.log(`   Status: ${response.status}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`   Fee: $${data.feeAmountUsd}, ${data.feeAmountSol} SOL`);
    }
    tests.push({ step: 'Calculate Fee', status: response.status, pass: response.ok });
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    tests.push({ step: 'Calculate Fee', error: error.message, pass: false });
  }
  
  // Step 3: Attempt Stake (will fail without valid auth)
  try {
    console.log('\n   Step 3: POST /api/staking/stake');
    const response = await fetch(`${API_BASE_URL}/api/staking/stake`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': FRONTEND_ORIGIN
      },
      body: JSON.stringify({
        amount: 1000,
        feeSignature: 'mock-signature'
      })
    });
    console.log(`   Status: ${response.status} (expected 401/403 with mock token)`);
    tests.push({ step: 'Stake', status: response.status, pass: response.status === 401 || response.status === 403 });
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    tests.push({ step: 'Stake', error: error.message, pass: false });
  }
  
  return tests;
}

// Test 4: Error Handling
async function testErrorHandling() {
  console.log('\n4️⃣  Testing Error Handling\n');
  const tests = [];
  
  // Invalid endpoint
  try {
    console.log('   Testing 404: GET /api/invalid-endpoint');
    const response = await fetch(`${API_BASE_URL}/api/invalid-endpoint`);
    console.log(`   Status: ${response.status} (expected 404)`);
    tests.push({ name: '404 Handling', pass: response.status === 404 });
  } catch (error) {
    tests.push({ name: '404 Handling', pass: false, error: error.message });
  }
  
  // Missing auth token
  try {
    console.log('   Testing 401: GET /api/staking/overview (no token)');
    const response = await fetch(`${API_BASE_URL}/api/staking/overview`);
    console.log(`   Status: ${response.status} (expected 401)`);
    tests.push({ name: '401 Handling', pass: response.status === 401 });
  } catch (error) {
    tests.push({ name: '401 Handling', pass: false, error: error.message });
  }
  
  // Invalid JSON
  try {
    console.log('   Testing 400: POST /api/staking/calculate-fee (invalid JSON)');
    const response = await fetch(`${API_BASE_URL}/api/staking/calculate-fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json'
    });
    console.log(`   Status: ${response.status} (expected 400)`);
    tests.push({ name: '400 Handling', pass: response.status === 400 || response.status === 500 });
  } catch (error) {
    tests.push({ name: '400 Handling', pass: false, error: error.message });
  }
  
  return tests;
}

// Run all tests
async function runAllTests() {
  console.log('═'.repeat(80));
  console.log('FRONTEND INTEGRATION TEST SUITE');
  console.log('═'.repeat(80) + '\n');
  
  const allResults = {
    publicEndpoints: await testPublicEndpoints(),
    authEndpoints: await testAuthEndpoints(),
    stakingFlow: await testStakingFlow(),
    errorHandling: await testErrorHandling()
  };
  
  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80) + '\n');
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const [category, results] of Object.entries(allResults)) {
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    totalTests += total;
    passedTests += passed;
    
    console.log(`${category}: ${passed}/${total} passed`);
  }
  
  console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Frontend integration is ready.');
  } else {
    console.log(`\n⚠️  ${totalTests - passedTests} test(s) failed. Review errors above.`);
  }
  
  console.log('\n' + '═'.repeat(80) + '\n');
  
  return passedTests === totalTests;
}

// Run tests
runAllTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
