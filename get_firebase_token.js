/**
 * This script demonstrates how to get a Firebase ID token for testing the claim endpoint.
 * 
 * To use this script:
 * 1. Open your browser's developer console on the Realmkin website
 * 2. Make sure you're logged in
 * 3. Run the appropriate code snippet below
 */

// For browser console (if Firebase is already initialized):
/*
// Method 1: If firebase object is available globally
if (typeof firebase !== 'undefined' && firebase.auth) {
  firebase.auth().currentUser.getIdToken(true).then(token => {
    console.log('Firebase ID Token:', token);
    // Copy this token and use it in your test
  }).catch(error => {
    console.error('Error getting token:', error);
  });
}

// Method 2: If using modular Firebase v9+ syntax
if (typeof getAuth !== 'undefined') {
  const auth = getAuth();
  if (auth.currentUser) {
    auth.currentUser.getIdToken(true).then(token => {
      console.log('Firebase ID Token:', token);
      // Copy this token and use it in your test
    }).catch(error => {
      console.error('Error getting token:', error);
    });
  } else {
    console.log('No user is currently signed in');
  }
}
*/

// For Node.js environment (using Firebase Admin SDK):
/*
import admin from 'firebase-admin';

// Initialize Firebase Admin (use your service account key)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Create a custom token (this is different from ID token)
admin.auth().createCustomToken('some-uid')
  .then(customToken => {
    console.log('Custom Token:', customToken);
    // Note: This is a custom token, not an ID token
    // You would need to exchange this for an ID token on the client side
  })
  .catch(error => {
    console.error('Error creating custom token:', error);
  });
*/

// Instructions for testing the claim endpoint:
console.log(`
To test the claim endpoint:

1. Open your browser and go to the Realmkin website
2. Make sure you're logged in
3. Open the browser's developer console (F12)
4. Run one of the browser console code snippets above
5. Copy the Firebase ID token from the console output
6. Add it to your .env file as TEST_FIREBASE_TOKEN
7. Run: npm run test-claim
`);