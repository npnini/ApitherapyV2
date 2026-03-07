const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * MOCK DATA GENERATOR FOR APITHERAPY V2
 * 
 * Usage:
 * node scripts/generate_mock_data.cjs --step=caretakers
 * node scripts/generate_mock_data.cjs --step=patients
 * node scripts/generate_mock_data.cjs --step=treatments
 * node scripts/generate_mock_data.cjs --step=feedback
 */

const projectId = "apitherapyv2";
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');

let adminConfig = { projectId };
if (fs.existsSync(serviceAccountPath)) {
    adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
}
admin.initializeApp(adminConfig);
const db = admin.firestore();

// --- CONFIG & POOLS ---
const HEBREW_FIRST_NAMES = ['נועם', 'איתי', 'אורי', 'אריאל', 'יוסף', 'דוד', 'משה', 'שרה', 'רבקה', 'מרים', 'תמר', 'יעל', 'אביגיל', 'אפרים', 'מנחם'];
const HEBREW_LAST_NAMES = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אגמון', 'חזן', 'מלכה', 'שבתאי'];
const GENDERS = ['male', 'female'];
const SEVERITIES = ['mild', 'moderate', 'severe'];

// --- UTILS ---
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomHebrewName = () => `${randomElement(HEBREW_FIRST_NAMES)} ${randomElement(HEBREW_LAST_NAMES)}`;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// --- COMMAND LINE ARGS ---
const args = process.argv.slice(2);
const stepArg = args.find(a => a.startsWith('--step='));
const step = stepArg ? stepArg.split('=')[1] : null;

async function run() {
    if (!step) {
        console.log("Usage: node scripts/generate_mock_data.cjs --step=[caretakers|patients|treatments|feedback]");
        return;
    }

    console.log(`\n>>> EXECUTING STEP: ${step.toUpperCase()} <<<`);

    switch (step) {
        case 'caretakers':
            await generateCaretakers();
            break;
        case 'patients':
            await generatePatients();
            break;
        case 'treatments':
            await generateTreatments();
            break;
        case 'feedback':
            await generateFeedback();
            break;
        default:
            console.error("Unknown step:", step);
    }
}

// --- STEP 1: CARETAKERS ---
const MOCK_PASSWORD = 'Password123!';

async function generateCaretakers() {
    console.log("Generating 10 caretakers... (Auth + Firestore)");
    for (let i = 0; i < 10; i++) {
        const email = `caretaker_${i}@gmail.com`;
        const name = randomHebrewName();

        try {
            // 1. Create/Get Auth User
            let userRecord;
            try {
                userRecord = await admin.auth().getUserByEmail(email);
                console.log(`  User ${email} already exists in Auth. Updating Firestore record...`);
            } catch (e) {
                userRecord = await admin.auth().createUser({
                    email: email,
                    password: MOCK_PASSWORD,
                    displayName: name,
                });
                console.log(`  Created Auth user: ${email}`);
            }

            const uid = userRecord.uid;

            // 2. Create/Update Firestore Record
            const caretaker = {
                uid: uid,
                email: email,
                fullName: name,
                displayName: name,
                mobile: `05${randomInt(0, 9)}-${randomInt(1000000, 9999999)}`,
                role: 'caretaker',
                preferredLanguage: 'he',
                country: 'Israel',
                city: randomElement(['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'רמת גן', 'אשדוד', 'נתניה', 'ראשון לציון']),
                address: `רחוב ${randomElement(HEBREW_LAST_NAMES)} ${randomInt(1, 150)}`,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Only set createdAt if it doesn't exist
            const docRef = db.collection('users').doc(uid);
            const doc = await docRef.get();
            if (!doc.exists) {
                caretaker.createdAt = admin.firestore.FieldValue.serverTimestamp();
            }

            await docRef.set(caretaker, { merge: true });
            console.log(`  Firestore sync complete for: ${caretaker.fullName} (${uid})`);
        } catch (error) {
            console.error(`  Error processing caretaker ${i}:`, error.message);
        }
    }
}

// --- STEP 2: PATIENTS ---
async function generatePatients() {
    // 1. Get caretakers
    const caretakerSnap = await db.collection('users').where('role', '==', 'caretaker').get();
    if (caretakerSnap.empty) {
        console.error("No caretakers found. Run step=caretakers first.");
        return;
    }
    const caretakers = caretakerSnap.docs.filter(doc => doc.data().email.endsWith('@gmail.com'));

    // 2. Get existing problems
    const problemSnap = await db.collection('cfg_problems').where('status', '==', 'active').get();
    if (problemSnap.empty) {
        console.error("No active problems found in cfg_problems. Use existing config.");
        return;
    }
    const problems = problemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    console.log(`Generating 30 patients per caretaker (${caretakers.length * 30} total)...`);

    for (const caretakerDoc of caretakers) {
        const caretakerId = caretakerDoc.id;
        for (let i = 0; i < 30; i++) {
            const name = randomHebrewName();
            const problem = randomElement(problems);

            // Random ID (9 digits)
            const idNumber = Math.floor(100000000 + Math.random() * 900000000).toString();

            // 1. Create Patient Document
            const patientRef = db.collection('patients').doc();
            const patientId = patientRef.id;

            const patientData = {
                id: patientId,
                fullName: name,
                birthDate: randomDate(new Date(1950, 0, 1), new Date(2015, 0, 1)).toISOString().split('T')[0],
                profession: randomElement(['מהנדס/ת', 'מורה', 'רופא/ה', 'עצמאי/ת', 'פנסיונר/ית', 'סטודנט/ית', 'מנהל/ת', 'אדריכל/ית', 'עורך/ת דין']),
                address: `רחוב ${randomElement(HEBREW_LAST_NAMES)} ${randomInt(1, 100)}, ${randomElement(['תל אביב', 'ירושלים', 'חיפה', 'רמת גן', 'פתח תקווה', 'חולון'])}`,
                identityNumber: idNumber,
                email: `patient_${patientId.slice(-4)}@test.com`,
                mobile: `05${randomInt(0, 9)}-${randomInt(1000000, 9999999)}`,
                caretakerId: caretakerId,
                gender: randomElement(GENDERS),
                createdTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                updatedTimestamp: admin.firestore.FieldValue.serverTimestamp()
            };

            // 2. Medical data (singleton per patient)
            const medicalData = {
                patientId: patientId,
                condition: (problem.name && (problem.name.he || problem.name.en || Object.values(problem.name)[0])) || 'Unknown',
                severity: randomElement(SEVERITIES),
                treatment_plan: {
                    problemIds: [problem.id],
                    protocolIds: problem.protocolIds || [],
                    measureIds: problem.measureIds || []
                },
                createdTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                updatedTimestamp: admin.firestore.FieldValue.serverTimestamp()
            };

            await patientRef.set(patientData);
            await db.collection('patient_medical_data').doc(patientId).set(medicalData);
            console.log(`  Patient ${i + 1}/30 for caretaker ${caretakerId} created: ${name}`);
        }
    }
}

// --- STEP 3: TREATMENTS ---
async function generateTreatments() {
    // 1. Get patients (only mock ones)
    const patientSnap = await db.collection('patients').get();
    const patients = patientSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => p.email && p.email.includes('test.com'));

    if (patients.length === 0) {
        console.error("No mock patients found. Run step=patients first.");
        return;
    }

    // 2. Fetch all medical data to know their problems
    const medicalSnap = await db.collection('patient_medical_data').get();
    const medicalMap = {};
    medicalSnap.forEach(doc => { medicalMap[doc.id] = doc.data(); });

    // 3. Fetch all protocols
    const protocolSnap = await db.collection('cfg_protocols').get();
    const protocols = {};
    protocolSnap.forEach(doc => { protocols[doc.id] = doc.data(); });

    // 4. Fetch all measures
    const measureSnap = await db.collection('cfg_measures').get();
    const measuresConfig = {};
    measureSnap.forEach(doc => { measuresConfig[doc.id] = doc.data(); });

    console.log(`Generating 5 treatments per patient (${patients.length * 5} total)...`);

    for (const patient of patients) {
        const medical = medicalMap[patient.id];
        if (!medical || !medical.treatment_plan || !medical.treatment_plan.problemIds) continue;

        const problemId = medical.treatment_plan.problemIds[0];
        const possibleProtocolIds = medical.treatment_plan.protocolIds || [];

        for (let j = 0; j < 5; j++) {
            // Random date in last 6 months, spaced out
            const daysAgo = (5 - j) * 15 + randomInt(0, 5);
            const treatmentDate = new Date();
            treatmentDate.setDate(treatmentDate.getDate() - daysAgo);

            const treatmentId = `${patient.id}_${treatmentDate.getTime()}`;

            const selectedProtocolId = randomElement(possibleProtocolIds);
            const protocol = protocols[selectedProtocolId];

            // Random points from the protocol
            let stungPointIds = [];
            if (protocol && protocol.stingingPoints) {
                // protocol.stingingPoints is usually an array of objects {id, ...}
                stungPointIds = protocol.stingingPoints
                    .slice(0, randomInt(1, Math.min(3, protocol.stingingPoints.length)))
                    .map(p => p.id || p);
            }

            // Generate measure readings
            const assignedMeasureIds = medical.treatment_plan.measureIds || [];
            let measureReadingId = null;
            let patientFeedbackMeasureReadingId = null;

            if (assignedMeasureIds.length > 0) {
                // Helper to generate a reading document
                const generateReadingDoc = (timestamp) => {
                    const readings = assignedMeasureIds.map(mId => {
                        const measureCfg = measuresConfig[mId];
                        if (!measureCfg) return null;

                        let val;
                        if (measureCfg.type === 'Scale' && measureCfg.scale) {
                            const min = measureCfg.scale.min || 0;
                            const max = measureCfg.scale.max || 10;
                            val = randomInt(min, max);
                        } else if (measureCfg.type === 'Category' && measureCfg.categories && measureCfg.categories.length > 0) {
                            // categories is an array of options
                            const categoryObj = { ...randomElement(measureCfg.categories) };
                            delete categoryObj.en;
                            val = categoryObj;
                        } else {
                            val = 'N/A';
                        }
                        return { measureId: mId, type: measureCfg.type, value: val };
                    }).filter(r => r !== null);

                    return {
                        patientId: patient.id,
                        note: 'אוטומטי מאפליקציית דמה',
                        readings: readings,
                        createdTimestamp: admin.firestore.Timestamp.fromDate(timestamp),
                        updatedTimestamp: admin.firestore.Timestamp.fromDate(timestamp)
                    };
                };

                // Pre-session reading
                const readingRef1 = db.collection('measured_values').doc();
                await readingRef1.set(generateReadingDoc(treatmentDate));
                measureReadingId = readingRef1.id;

                // Feedback reading (simulating 1 day later)
                const feedbackDate = new Date(treatmentDate);
                feedbackDate.setDate(feedbackDate.getDate() + 1);
                const readingRef2 = db.collection('measured_values').doc();
                await readingRef2.set(generateReadingDoc(feedbackDate));
                patientFeedbackMeasureReadingId = readingRef2.id;
            }

            const treatment = {
                id: treatmentId,
                patientId: patient.id,
                caretakerId: patient.caretakerId,
                patientReport: `הרגשה ${randomElement(['טובה', 'שיפור קל', 'ללא שינוי', 'כאבים עמומים', 'שינה טובה יותר', 'פחות לחץ'])}`,
                preSessionVitals: {
                    systolic: randomInt(110, 140),
                    diastolic: randomInt(70, 90),
                    heartRate: randomInt(60, 90)
                },
                rounds: [
                    {
                        protocolId: selectedProtocolId || 'unknown',
                        problemId: problemId,
                        stungPointIds: stungPointIds,
                        postRoundVitals: {
                            systolic: randomInt(115, 145),
                            diastolic: randomInt(75, 95),
                            heartRate: randomInt(65, 95)
                        }
                    }
                ],
                postStingingVitals: {
                    systolic: randomInt(110, 135),
                    diastolic: randomInt(70, 85),
                    heartRate: randomInt(60, 85)
                },
                finalVitals: {
                    systolic: randomInt(115, 130),
                    diastolic: randomInt(75, 85),
                    heartRate: randomInt(65, 80)
                },
                finalNotes: randomElement(["טיפול עבר ללא אירועים מיוחדים", "המטופל דיווח על רגישות קלה", "שיפור ניכר לעומת פעם קודמת", "בוצע לפי הפרוטוקול"]),
                isSensitivityTest: j === 0, // First treatment is sensitivity test
                measureReadingId: measureReadingId,
                patientFeedbackMeasureReadingId: patientFeedbackMeasureReadingId,
                createdTimestamp: admin.firestore.Timestamp.fromDate(treatmentDate),
                updatedTimestamp: admin.firestore.Timestamp.fromDate(treatmentDate)
            };

            await db.collection('treatments').doc(treatmentId).set(treatment);
        }
        console.log(`  5 treatments for patient ${patient.id} created.`);
    }
}

// --- STEP 4: FEEDBACK ---
async function generateFeedback() {
    // Get treatments for mock patients
    const patientSnap = await db.collection('patients').get();
    const mockPatientIds = patientSnap.docs
        .filter(doc => doc.data().email && doc.data().email.includes('test.com'))
        .map(doc => doc.id);

    if (mockPatientIds.length === 0) {
        console.error("No mock patients found.");
        return;
    }

    const treatmentSnap = await db.collection('treatments')
        .where('patientId', 'in', mockPatientIds.slice(0, 10)) // Firestore 'in' limit is 10, need to batch if more
        .get();

    console.log(`Generating feedback for ${treatmentSnap.size} treatments (batched)...`);

    // For simplicity in mock data, we'll just process all treatments of the first 10 mock patients
    // In a real scenario, we'd loop through all mockPatientIds in chunks of 10.

    for (const doc of treatmentSnap.docs) {
        const treatment = doc.data();
        const feedbackDate = new Date(treatment.createdTimestamp.toDate().getTime() + 24 * 60 * 60 * 1000);

        await db.collection('treatments').doc(doc.id).update({
            patientFeedback: `מרגיש ${randomElement(['הרבה יותר טוב', 'שיפור משמעותי', 'הטבה קלה', 'ללא שינוי'])} יום אחרי הטיפול.`,
            updatedTimestamp: admin.firestore.Timestamp.fromDate(feedbackDate)
        });
    }
    console.log("Feedback generation complete for initial batch.");
}

run().catch(console.error);
