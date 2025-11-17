import admin from 'firebase-admin';
import 'dotenv/config';

console.log('🔍 Testing Firebase Connection...');

// Initialize Firebase Admin using the service account JSON from .env
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_JSON not set in .env');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
  console.log('✅ Parsed service account JSON successfully');
} catch (error) {
  console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error);
  process.exit(1);
}

const db = admin.firestore();

// Test Firestore connection by getting a document count
async function testFirestoreConnection() {
  try {
    console.log('🔍 Testing Firestore connection...');
    const usersSnapshot = await db.collection('users').limit(1).get();
    console.log(`✅ Firestore connection successful. Found ${usersSnapshot.size} user documents (limited to 1 for testing)`);
    
    console.log('✅ All Firebase connections working correctly!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
    process.exit(1);
  }
}

testFirestoreConnection();