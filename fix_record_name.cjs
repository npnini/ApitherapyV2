
const admin = require('firebase-admin');

// This script assumes you have the serviceAccountKey.json in the same directory.
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixRecordName() {
  console.log('Starting to correct medical record document name...');

  const patientsSnapshot = await db.collection('patients').get();

  if (patientsSnapshot.empty) {
    console.log('No patients found.');
    return;
  }

  for (const patientDoc of patientsSnapshot.docs) {
    const patientId = patientDoc.id;
    console.log(`Processing patient: ${patientId}`);

    const oldRecordRef = db.collection('patients').doc(patientId).collection('medical_records').doc('v1');
    const oldRecordSnap = await oldRecordRef.get();

    if (!oldRecordSnap.exists) {
      console.log(`-- No record named 'v1' found for patient ${patientId}. Skipping.`);
      continue;
    }

    // A batch for all operations for this single patient
    const batch = db.batch();

    // 1. Create the new document with the old data
    const newRecordRef = db.collection('patients').doc(patientId).collection('medical_records').doc('patient_level_data');
    batch.set(newRecordRef, oldRecordSnap.data());
    console.log(`-- Creating 'patient_level_data' document.`);

    // 2. Move the treatments subcollection
    const treatmentsSnapshot = await oldRecordRef.collection('treatments').get();
    if (!treatmentsSnapshot.empty) {
      console.log(`-- Migrating ${treatmentsSnapshot.size} treatments...`);
      for (const treatmentDoc of treatmentsSnapshot.docs) {
        const newTreatmentRef = newRecordRef.collection('treatments').doc(treatmentDoc.id);
        batch.set(newTreatmentRef, treatmentDoc.data());
        batch.delete(treatmentDoc.ref); // Delete the old treatment doc
      }
    }

    // 3. Delete the old 'v1' document itself
    batch.delete(oldRecordRef);
    console.log(`-- Deleting old 'v1' document.`);

    // 4. Commit all these changes for the patient
    await batch.commit();
    console.log(`-- Successfully migrated record for patient ${patientId}.`);
  }

  console.log('Medical record name correction completed successfully!');
}

fixRecordName().catch(console.error);
