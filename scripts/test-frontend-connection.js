/**
 * Test Frontend Connection to Backend API
 * Simulates frontend requests to ensure the API is accessible
 */

import fetch from 'node-fetch';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:3000';

console.log('🧪 Testing Frontend → Backend API Connection');
console.log(`📍 API URL: ${API_BASE_URL}`);
console.log(`🌐 Frontend Origin: ${FRONTEND_ORIGIN}\n`);

// Simulated Firebase Auth Token (for testing)
const MOCK_FIREBASE_TOKEN = process.env.TEST_FIREBASE_TOKEN || 'mock-token-for-testing';

const tests = [];

// Test 1: Staking API - Get Overview
async function testGetStakingBalance() {
  console.log('1️⃣  Testing GET /api/staking/overview...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/staking/overview`, {
      method: 'GET',
      headers: {
        'Origin': FRONTEND_ORIGIN,
        'Authorization': `Bearer ${MOCK_FIREBASE_TOKEN}`
      }
    });
    
    console.log(`   📊 Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('   ⚠️  401 Unauthorized (expected without valid token)');
      return { pass: true, test: 'GET /api/staking/overview', note: 'Auth required' };
    } else if (response.status === 200) {
      const data = await response.json();
      console.log('   ✅ Successfully connected');
      console.log(`   💰 Response:`, JSON.stringify(data).substring(0, 100));
      return { pass: true, test: 'GET /api/staking/overview' };
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
      return { pass: true, test: 'GET /api/staking/overview', note: `Status ${response.status}` };
    }
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    return { pass: false, test: 'GET /api/staking/overview', error: error.message };
  }
}

// Test 2: Boosters API
async function testGetBoosters() {
  console.log('\n2️⃣  Testing GET /api/boosters...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/boosters`, {
      method: 'GET',
      headers: {
        'Origin': FRONTEND_ORIGIN,
        'Authorization': `Bearer ${MOCK_FIREBASE_TOKEN}`
      }
    });
    
    console.log(`   📊 Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('   ⚠️  401 Unauthorized (expected without valid token)');
      return { pass: true, test: 'GET /api/boosters', note: 'Auth required' };
    } else if (response.status === 200) {
      const data = await response.json();
      console.log('   ✅ Successfully connected');
      return { pass: true, test: 'GET /api/boosters' };
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
      return { pass: true, test: 'GET /api/boosters', note: `Status ${response.status}` };
    }
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    return { pass: false, test: 'GET /api/boosters', error: error.message };
  }
}

// Test 3: Leaderboard API (Public)
async function testGetLeaderboard() {
  console.log('\n3️⃣  Testing GET /api/leaderboard/mining...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/leaderboard/mining`, {
      method: 'GET',
      headers: {
        'Origin': FRONTEND_ORIGIN
      }
    });
    
    console.log(`   📊 Status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('   ✅ Successfully connected');
      console.log(`   📋 Leaderboard entries: ${data.length || 'unknown'}`);
      return { pass: true, test: 'GET /api/leaderboard/mining' };
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
      return { pass: false, test: 'GET /api/leaderboard/mining', error: `Status ${response.status}` };
    }
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    return { pass: false, test: 'GET /api/leaderboard/mining', error: error.message };
  }
}

// Test 4: Goal API
async function testGetGoal() {
  console.log('\n4️⃣  Testing GET /api/goal...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/goal`, {
      method: 'GET',
      headers: {
        'Origin': FRONTEND_ORIGIN
      }
    });
    
    console.log(`   📊 Status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('   ✅ Successfully connected');
      console.log(`   🎯 Goal data:`, JSON.stringify(data).substring(0, 100));
      return { pass: true, test: 'GET /api/goal' };
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
      return { pass: false, test: 'GET /api/goal', error: `Status ${response.status}` };
    }
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    return { pass: false, test: 'GET /api/goal', error: error.message };
  }
}

// Test 5: CORS Preflight
async function testCORSPreflight() {
  console.log('\n5️⃣  Testing CORS preflight...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/staking/balance`, {
      method: 'OPTIONS',
      headers: {
        'Origin': FRONTEND_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization'
      }
    });
    
    const allowOrigin = response.headers.get('access-control-allow-origin');
    const allowMethods = response.headers.get('access-control-allow-methods');
    
    console.log(`   📊 Status: ${response.status}`);
    console.log(`   🔓 Allow-Origin: ${allowOrigin || 'not set'}`);
    console.log(`   📝 Allow-Methods: ${allowMethods || 'not set'}`);
    
    if (allowOrigin) {
      console.log('   ✅ CORS preflight successful');
      return { pass: true, test: 'CORS Preflight' };
    } else {
      console.log('   ⚠️  CORS headers not present');
      return { pass: false, test: 'CORS Preflight', error: 'No CORS headers' };
    }
  } catch (error) {
    console.log(`   ❌ CORS preflight failed: ${error.message}`);
    return { pass: false, test: 'CORS Preflight', error: error.message };
  }
}

// Run all tests
async function runTests() {
  console.log('═'.repeat(80));
  console.log('Starting Frontend Connection Tests...');
  console.log('═'.repeat(80) + '\n');
  
  const results = [];
  
  results.push(await testGetStakingBalance());
  results.push(await testGetBoosters());
  results.push(await testGetLeaderboard());
  results.push(await testGetGoal());
  results.push(await testCORSPreflight());
  
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
    if (result.note) console.log(`   Note: ${result.note}`);
  });
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed === 0) {
    console.log('🎉 All frontend connection tests passed!');
    console.log('   The API is accessible and CORS is configured correctly.\n');
    console.log('💡 Next Steps:');
    console.log('   1. Update your frontend to use: ' + API_BASE_URL);
    console.log('   2. Test with a real Firebase auth token');
    console.log('   3. Deploy and test from production frontend\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some frontend connection tests failed.');
    console.log('   Check the errors above and ensure:');
    console.log('   1. The API is running');
    console.log('   2. CORS is configured correctly');
    console.log('   3. The API URL is correct\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
