const admin = require('firebase-admin');
const fs = require('fs');

const isProd = process.argv.includes('--prod');
const serviceAccountPath = isProd ? 'service-account-prod.json' : 'service-account.json';
console.log(`Target: ${isProd ? 'PRODUCTION (apitherapy-c94a6)' : 'STAGING (apitherapyv2)'} — using ${serviceAccountPath}`);

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function cleanup() {
  // 1. Strip positions.xbot from every acupuncture point
  const pointsRef = db.collection('cfg_acupuncture_points');
  const pointsSnap = await pointsRef.get();
  let pointsUpdated = 0;
  for (const doc of pointsSnap.docs) {
    if (doc.data().positions?.xbot !== undefined) {
      await doc.ref.update({ 'positions.xbot': admin.firestore.FieldValue.delete() });
      pointsUpdated++;
      console.log(`[POINT] Removed positions.xbot from ${doc.data().code || doc.id}`);
    }
  }

  // 2. Strip preferredModel from every user
  const usersRef = db.collection('users');
  const usersSnap = await usersRef.get();
  let usersUpdated = 0;
  for (const doc of usersSnap.docs) {
    if (doc.data().preferredModel !== undefined) {
      await doc.ref.update({ preferredModel: admin.firestore.FieldValue.delete() });
      usersUpdated++;
      console.log(`[USER] Removed preferredModel from ${doc.id}`);
    }
  }

  console.log(`Done. Points updated: ${pointsUpdated}, Users updated: ${usersUpdated}`);
  process.exit(0);
}

cleanup().catch(err => { console.error('Cleanup failed:', err); process.exit(1); });
