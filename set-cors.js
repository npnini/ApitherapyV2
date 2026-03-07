/**
 * This script sets the CORS policy for your Firebase Storage bucket via Node.js.
 * This is an alternative if the 'gsutil' command fails with permission errors.
 * 
 * Usage: 
 * 1. Ensure you have 'firebase-admin' installed (it should be if you ran npm install).
 * 2. Run: node set-cors.js
 */

import admin from 'firebase-admin';
import fs from 'fs';

// Load bucket name from .env.local if available, else hardcode it
const BUCKET_NAME = "apitherapyv2.firebasestorage.app";

console.log(`Setting CORS for bucket: ${BUCKET_NAME}...`);

// Initialize Firebase Admin
// Note: This requires credentials. If running locally, it will look for 
// GOOGLE_APPLICATION_CREDENTIALS environment variable.
// Alternatively, since you are logged in via Firebase CLI, 
// the simplest way is to use a service account key if this fails.
try {
    admin.initializeApp({
        storageBucket: BUCKET_NAME
    });

    const bucket = admin.storage().bucket();

    const corsConfiguration = [
        {
            origin: ['*'],
            method: ['GET'],
            maxAgeSeconds: 3600,
            responseHeader: ['Content-Type']
        }
    ];

    await bucket.setCorsConfiguration(corsConfiguration);

    console.log('✅ CORS configuration updated successfully!');
} catch (error) {
    console.error('❌ Error setting CORS:', error.message);
    console.log('\nTIP: If you get a "Credential" error, you may need a Service Account key.');
    console.log('Or, try running your Terminal as Administrator and using the gsutil command again.');
}
