/**
 * Test Backend API Service
 * Validates that the API service is running correctly
 */

import fetch from 'node-fetch';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

console.log('🧪 Testing Backend API Service');
console.log(`📍 API URL: ${API_BASE_URL}\n`);

const tests = [];

// Test 1: Health Check
async function testHealthCheck() {
  console.log('1️⃣  Testing health endpoint...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    if (response.ok && data.ok && data.service === 'backend-api') {
      console.log('   ✅ Health check passed');
      console.log(`   📊 Service: ${data.service}`);
      console.log(`   🕐 Timestamp: ${data.timestamp}`);
      return { pass: true, test: 'Health Check' };
    } else {
      console.log('   ❌ Health check failed - unexpected response');
      return { pass: false, test: 'Health Check', error: 'Unexpected response' };
    }
  } catch (error) {
    console.log(`   ❌ Health check failed - ${error.message}`);
    return { pass: false, test: 'Health Check', error: error.message };
  }
}

// Test 2: CORS Headers
async function testCORS() {
  console.log('\n2️⃣  Testing CORS headers...');
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });
    
    const corsHeader = response.headers.get('access-control-allow-origin');
    if (corsHeader) {
      console.log('   ✅ CORS headers present');
      console.log(`   🔓 Allow-Origin: ${corsHeader}`);
      return { pass: true, test: 'CORS Headers' };
    } else {
      console.log('   ⚠️  CORS headers missing (might be restrictive)');
      return { pass: true, test: 'CORS Headers', warning: 'Headers not present' };
    }
  } catch (error) {
    console.log(`   ❌ CORS test failed - ${error.message}`);
    return { pass: false, test: 'CORS Headers', error: error.message };
  }
}

// Test 3: API Routes Exist
async function testAPIRoutes() {
  console.log('\n3️⃣  Testing API routes...');
  const routes = [
    '/api/staking',
    '/api/boosters',
    '/api/goal',
    '/api/leaderboard'
  ];
  
  const results = [];
  for (const route of routes) {
    try {
      const response = await fetch(`${API_BASE_URL}${route}`);
      // We don't care if it's 404 or requires auth, just that the route is mounted
      if (response.status !== 404) {
        console.log(`   ✅ ${route} - mounted`);
        results.push({ route, mounted: true });
      } else {
        console.log(`   ⚠️  ${route} - 404 (may need specific endpoint)`);
        results.push({ route, mounted: false });
      }
    } catch (error) {
      console.log(`   ❌ ${route} - ${error.message}`);
      results.push({ route, error: error.message });
    }
  }
  
  const allMounted = results.every(r => r.mounted !== false);
  return { pass: allMounted, test: 'API Routes', results };
}

// Test 4: Database Connection (via API)
async function testDatabaseConnection() {
  console.log('\n4️⃣  Testing database connection...');
  try {
    // Try to access an endpoint that requires DB
    const response = await fetch(`${API_BASE_URL}/api/leaderboard`);
    
    if (response.status !== 500) {
      console.log('   ✅ Database appears to be connected');
      console.log(`   📊 Response status: ${response.status}`);
      return { pass: true, test: 'Database Connection' };
    } else {
      console.log('   ❌ Database connection failed (500 error)');
      return { pass: false, test: 'Database Connection', error: '500 error' };
    }
  } catch (error) {
    console.log(`   ❌ Database test failed - ${error.message}`);
    return { pass: false, test: 'Database Connection', error: error.message };
  }
}

// Run all tests
async function runTests() {
  console.log('═'.repeat(80));
  console.log('Starting Backend API Tests...');
  console.log('═'.repeat(80) + '\n');
  
  const results = [];
  
  results.push(await testHealthCheck());
  results.push(await testCORS());
  results.push(await testAPIRoutes());
  results.push(await testDatabaseConnection());
  
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
    if (result.warning) console.log(`   Warning: ${result.warning}`);
  });
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed === 0) {
    console.log('🎉 All tests passed! Backend API is ready.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
