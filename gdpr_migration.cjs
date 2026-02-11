
const admin = require('firebase-admin');

// IMPORTANT: Path to your service account key file.
// You can download this from your Firebase project settings.
// GO TO: Project Settings > Service accounts > Generate new private key
const serviceAccount = require('./serviceAccountKey.json');

// Initialize the Firebase Admin SDK.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateData() {
  console.log('Starting data migration...');

  const patientsSnapshot = await db.collection('patients').get();

  if (patientsSnapshot.empty) {
    console.log('No patients found. Nothing to migrate.');
    return;
  }

  // Use a batch to perform writes together
  const batch = db.batch();
  let operationsCount = 0;

  for (const patientDoc of patientsSnapshot.docs) {
    const patientId = patientDoc.id;
    const patientData = patientDoc.data();
    console.log(`Processing patient: ${patientId}`);

    // 1. Define the new medical record
    const medicalRecordRef = db.collection('patients').doc(patientId).collection('medical_records').doc('v1');
    const medicalData = {
      condition: patientData.condition || null,
      severity: patientData.severity || null,
      lastTreatment: patientData.lastTreatment || null,
    };
    batch.set(medicalRecordRef, medicalData);
    operationsCount++;

    // 2. Move the treatments subcollection
    const treatmentsSnapshot = await patientDoc.ref.collection('treatments').get();
    if (!treatmentsSnapshot.empty) {
      console.log(`-- Migrating ${treatmentsSnapshot.size} treatments...`);
      for (const treatmentDoc of treatmentsSnapshot.docs) {
        const newTreatmentRef = medicalRecordRef.collection('treatments').doc(treatmentDoc.id);
        batch.set(newTreatmentRef, treatmentDoc.data());
        batch.delete(treatmentDoc.ref); // Delete the old treatment
        operationsCount += 2;
      }
    }
    
    // 3. Remove the old health fields from the root patient document
    const patientUpdateData = {
        condition: admin.firestore.FieldValue.delete(),
        severity: admin.firestore.FieldValue.delete(),
        lastTreatment: admin.firestore.FieldValue.delete()
    };
    batch.update(patientDoc.ref, patientUpdateData);
    operationsCount++;

    // Firestore batches are limited to 500 operations.
    // Commit the batch if it's getting full.
    if (operationsCount > 450) {
        console.log('Committing partial batch...');
        await batch.commit();
        batch = db.batch(); // Start a new batch
        operationsCount = 0;
    }
  }

  // Commit any remaining operations
  if (operationsCount > 0) {
    console.log('Committing final batch...');
    await batch.commit();
  }

  console.log('Data migration completed successfully!');
}

migrateData().catch(console.error);
