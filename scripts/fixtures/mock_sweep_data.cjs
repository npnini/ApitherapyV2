const admin = require('firebase-admin');
const { randomUUID } = require('crypto');

// Initialize Firebase Admin using Application Default Credentials
// Make sure you have run `gcloud auth application-default login` previously or the emulator is running
admin.initializeApp({
    projectId: "apitherapyv2"
});
const db = admin.firestore();

async function runMockSweep() {
    console.log("Starting manual sweep emulation...");

    // 1. Create a dummy patient if needed
    const patientId = "mock_patient_" + Date.now();
    console.log("Creating mock patient:", patientId);
    await db.collection("patients").doc(patientId).set({
        firstName: "Test",
        lastName: "User",
        // To ensure you get the email, REPLACE this with your actual email string:
        email: "nati.perlman@gmail.com",
        phone: "555-0101"
    });

    // 2. Create a dummy treatment from "yesterday"
    const treatmentId = "mock_treatment_" + Date.now();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0); // Noon yesterday

    console.log("Creating mock treatment from yesterday:", treatmentId);
    await db.collection("treatments").doc(treatmentId).set({
        patientId: patientId,
        createdTimestamp: admin.firestore.Timestamp.fromDate(yesterday),
        protocols: [
            {
                protocolId: "mock_protocol",
                // Assuming measure "VAS" exists, you can put a real measure ID here
                measureIds: ["vas_pain_scale"]
            }
        ]
    });

    // Note: For full SendGrid testing, ensure your API keys are in cfg_app_config/main
    // and that you've configured Sender Authentication matching your "from" email inside index.ts!
    console.log("Mock data created!");
    console.log("To fully test the cloud function, you can either wait for 5 AM, or manually trigger the HTTP event via Google Cloud Console -> Cloud Scheduler -> Run Now.");
}

runMockSweep().catch(console.error).then(() => {
    console.log("Done");
    process.exit(0);
});
