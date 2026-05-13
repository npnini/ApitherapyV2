import admin from 'firebase-admin';

/**
 * IMPERSONATE USER IN LOCAL AUTH EMULATOR
 * 
 * Usage: node scripts/impersonate-user.js <email> <target_uid>
 */

const [email, targetUid] = process.argv.slice(2);

if (!email || !targetUid) {
  console.error('❌ Usage: node scripts/impersonate-user.js <email> <target_uid>');
  process.exit(1);
}

process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const app = admin.initializeApp({
  projectId: 'apitherapyv2'
});

async function impersonate() {
  console.log(`👤 Attempting to impersonate user: ${email} with UID: ${targetUid}`);

  try {
    // 1. Check if a user with this email already exists and delete it to avoid conflicts
    try {
      const existingUser = await admin.auth().getUserByEmail(email);
      console.log(`   Found existing user with UID: ${existingUser.uid}. Deleting to overwrite...`);
      await admin.auth().deleteUser(existingUser.uid);
    } catch (e) {
      // User doesn't exist, which is fine
    }

    // 2. Check if the target UID already exists and delete it to avoid conflicts
    try {
      await admin.auth().deleteUser(targetUid);
      console.log(`   Deleted existing user with target UID: ${targetUid} to overwrite...`);
    } catch (e) {
      // User doesn't exist, which is fine
    }

    // 3. Create the user with the target UID
    await admin.auth().createUser({
      uid: targetUid,
      email: email,
      password: 'password123', // Default local password
      emailVerified: true
    });

    console.log(`\n✅ SUCCESS!`);
    console.log(`   User created in local Auth Emulator.`);
    console.log(`   Email: ${email}`);
    console.log(`   UID:   ${targetUid}`);
    console.log(`   Password: password123`);
    console.log(`\nNow you can log in to your local app using these credentials!`);

  } catch (err) {
    console.error('\n❌ Failed to impersonate user:', err.message);
  }
  process.exit(0);
}

impersonate();
