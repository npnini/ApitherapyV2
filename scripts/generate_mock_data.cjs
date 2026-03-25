const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * MOCK DATA GENERATOR FOR APITHERAPY V2
 * 
 * --- GENERATION RULES ---
 * 
 * 1. CARETAKERS (--step=caretakers):
 *    - Generates 10 caretakers with Hebrew names.
 *    - Auth: Creates/Updates accounts with email 'caretaker_{i}@gmail.com' and password 'Password123!'.
 *    - Firestore: Creates 'users' docs with 'caretaker' role and random Israeli cities.
 * 
 * 2. PATIENTS (--step=patients):
 *    - Generates 10 patients per mock caretaker (email ends in @gmail.com).
 *    - Identities: Hebrew names, birthdates (1950-2015), email ends in '@test.com'.
 *    - Medical: Assigns 1 random active problem from 'cfg_problems'.
 *    - Docs: Creates 'patients' doc and 'patient_medical_data' doc. pay attention to set the selected problemId, the protcolId from the problem document, ahte measureIds from the problem to the patient_medical_data document.
 * 
 * 3. TREATMENTS (--step=treatments):
 *    - Timeline: Treatments spread over the last 6 months.   
 *    - Generate 10 treatments per mock patient (@test.com), once a week for 5 weeks, within the timeline
 *    - Logic: Uses the patient's assigned problem, protocol and measures from their medical data.
 *    - Sensitivity: The first 2 treatments shall be marked as 'isSensitivityTest: true'.
 *    - Points: set stung points as those with Medium Sensitivity from the protocol definition.
 *    - Vitals: Randomly generated realistic vitals for all session stages.
 *    - Measure reading: 
 *      - create TWO 'measured_values' docs per treatment, one simulting pre treatment reading, the other representing post treatment reading.
 *      - the measure ids are those defined for the patient in patient_medical_data
 *      - make sure to set also the numeric value when a categorial measure is selected
 *      - measure value: Random value based on measure type (Scale range or random Category). 
 *      - Feedback: Create the measure reading simulating 1 day after the treatment.
 *    
 * 
 * 4. FEEDBACK (--step=feedback):
 *    - Batch updates 'patientFeedback' text for treatments of the first 10 mock patients.
 *    - Sets a random Hebrew feedback string simulating a report 24h later.
 * 
 * Usage:
 * node scripts/generate_mock_data.cjs --step=caretakers
 * node scripts/generate_mock_data.cjs --step=patients
 * node scripts/generate_mock_data.cjs --step=treatments
 * node scripts/generate_mock_data.cjs --step=feedback
 * node scripts/generate_mock_data.cjs --step=clear-treatments
 * node scripts/generate_mock_data.cjs --step=clear-measured_values
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
const computeAge = (birthDateStr) => {
    if (!birthDateStr) return '';
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
    }
    return calculatedAge >= 0 ? calculatedAge.toString() : '';
};

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
        case 'clear-treatments':
            await clearTreatments();
            break;
        case 'clear-measured-values':
        case 'clear-measured_values':
            await clearMeasuredValues();
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

    console.log(`Generating 10 patients per caretaker (${caretakers.length * 10} total)...`);

    for (const caretakerDoc of caretakers) {
        const caretakerId = caretakerDoc.id;
        for (let i = 0; i < 10; i++) {
            const name = randomHebrewName();
            const problem = randomElement(problems);

            // 1. Create Patient Document with Deterministic ID
            const patientId = `mock_p_${caretakerId.slice(-5)}_${i}`;
            const patientRef = db.collection('patients').doc(patientId);

            // Deterministic identity number for mock patients
            const idNumber = `999${caretakerId.slice(-3)}${i}`.padEnd(9, '0');

            const birthDateStr = randomDate(new Date(1950, 0, 1), new Date(2015, 0, 1)).toISOString().split('T')[0];
            const patientData = {
                id: patientId,
                fullName: name,
                birthDate: birthDateStr,
                age: computeAge(birthDateStr),
                profession: randomElement(['מהנדס/ת', 'מורה', 'רופא/ה', 'עצמאי/ת', 'פנסיונר/ית', 'סטודנט/ית', 'מנהל/ת', 'אדריכל/ית', 'עורך/ת דין']),
                address: `רחוב ${randomElement(HEBREW_LAST_NAMES)} ${randomInt(1, 100)}, ${randomElement(['תל אביב', 'ירושלים', 'חיפה', 'רמת גן', 'פתח תקווה', 'חולון'])}`,
                identityNumber: idNumber,
                email: `patient_${caretakerId.slice(-4)}_${i}@test.com`,
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
                problemId: problem.id,
                protocolId: problem.protocolId || (problem.protocolIds && problem.protocolIds[0]) || null,
                measureIds: problem.measureIds || [],
                createdTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                updatedTimestamp: admin.firestore.FieldValue.serverTimestamp()
            };

            if (medicalData.protocolId === null) delete medicalData.protocolId;

            await patientRef.set(patientData);
            await db.collection('patient_medical_data').doc(patientId).set(medicalData);
            console.log(`  Patient ${i + 1}/10 for caretaker ${caretakerId} created: ${name}`);
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

    // 5. Fetch all points for sensitivity filtering
    const pointsSnap = await db.collection('cfg_acupuncture_points').get();
    const pointsMap = {};
    pointsSnap.forEach(doc => { pointsMap[doc.id] = doc.data(); });

    console.log(`Generating 10 treatments per patient (${patients.length * 10} total)...`);

    for (const patient of patients) {
        const medical = medicalMap[patient.id];
        if (!medical || !medical.problemId) continue;

        const problemId = medical.problemId;
        const selectedProtocolId = medical.protocolId;

        for (let j = 0; j < 10; j++) {
            // Stable date: Spaced out (~1 treatment per week), independent of current run time
            // We use a fixed reference point (e.g., March 20, 2026) to calculate back
            const baseDate = new Date(2026, 2, 20); // Mar 20, 2026
            const daysAgo = (10 - j) * 7;
            const treatmentDate = new Date(baseDate);
            treatmentDate.setDate(treatmentDate.getDate() - daysAgo - randomInt(0, 2)); // Add small random shift for realism but mostly stable

            const treatmentId = `${patient.id}_${treatmentDate.getTime()}`;

            const protocol = selectedProtocolId ? protocols[selectedProtocolId] : null;

            // Only pick Medium sensitivity points from the protocol
            let stungPointIds = [];
            if (protocol && protocol.points) {
                const mediumPoints = protocol.points.filter(pId => {
                    const pointCfg = pointsMap[pId];
                    if (!pointCfg) return false;
                    const sens = pointCfg.sensitivity || pointCfg.Sensitivity;
                    return sens === 'Medium' || sens === 'medium' || sens === 'בינונית';
                });
                if (mediumPoints.length > 0) {
                    stungPointIds = mediumPoints.slice(0, randomInt(1, Math.min(3, mediumPoints.length)));
                } else {
                    // Fallback to random if no medium points available
                    stungPointIds = protocol.points.slice(0, randomInt(1, Math.min(3, protocol.points.length)));
                }
            }

            // Generate measure readings
            const assignedMeasureIds = medical.measureIds || [];
            let measureReadingId = null;
            let patientFeedbackMeasureReadingId = null;

            if (assignedMeasureIds.length > 0) {
                // Helper to generate a reading document
                const generateReadingDoc = (timestamp) => {
                    const readings = assignedMeasureIds.map(mId => {
                        const measureCfg = measuresConfig[mId];
                        if (!measureCfg) return null;

                        let val;
                        let numericValue;
                        if (measureCfg.type === 'Scale' && measureCfg.scale) {
                            const min = measureCfg.scale.min || 0;
                            const max = measureCfg.scale.max || 10;
                            val = randomInt(min, max);
                            numericValue = val;
                        } else if (measureCfg.type === 'Category' && measureCfg.categories && measureCfg.categories.length > 0) {
                            const categoryObj = randomElement(measureCfg.categories);
                            // Set value to the Hebrew label if available, otherwise any label
                            val = categoryObj.he || categoryObj.en || Object.values(categoryObj).find(v => typeof v === 'string') || 'N/A';
                            numericValue = categoryObj.numericValue;
                        } else {
                            val = 'N/A';
                            numericValue = 0;
                        }
                        return { measureId: mId, type: measureCfg.type, value: val, numericValue: numericValue };
                    }).filter(r => r !== null);

                    return {
                        patientId: patient.id,
                        note: 'אוטומטי מאפליקציית דמה',
                        readings: readings,
                        usedMeasureIds: readings.map(r => r.measureId),
                        createdTimestamp: admin.firestore.Timestamp.fromDate(timestamp),
                        updatedTimestamp: admin.firestore.Timestamp.fromDate(timestamp)
                    };
                };

                // Pre-session reading (Production ID format: {patientId}_{timestamp}_pre)
                const readingRef1 = db.collection('measured_values').doc(`${patient.id}_${treatmentDate.getTime()}_pre`);
                await readingRef1.set(generateReadingDoc(treatmentDate));
                measureReadingId = readingRef1.id;

                // Feedback reading (simulating 1 day later, Production ID format)
                const feedbackDate = new Date(treatmentDate);
                feedbackDate.setDate(feedbackDate.getDate() + 1);
                const readingRef2 = db.collection('measured_values').doc(`${patient.id}_${feedbackDate.getTime()}_post`);
                await readingRef2.set(generateReadingDoc(feedbackDate));
                patientFeedbackMeasureReadingId = readingRef2.id;
            }

            const treatment = {
                id: treatmentId,
                patientId: patient.id,
                caretakerId: patient.caretakerId,
                patientReport: `הרגשה ${randomElement(['טובה', 'שיפור קל', 'ללא שינוי', 'כאבים עמומים', 'שינה טובה יותר', 'פחות לחץ'])}`,
                preTreatmentVitals: {
                    systolic: randomInt(110, 140),
                    diastolic: randomInt(70, 90),
                    heartRate: randomInt(60, 90)
                },
                preTreatmentMeasureReadingId: measureReadingId || null,
                isSensitivityTest: j < 2, // First 2 treatments are sensitivity tests
                protocolId: selectedProtocolId || 'unknown',
                problemId: problemId,
                stungPointIds: stungPointIds,
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
                patientFeedback: null,
                patientFeedbackMeasureReadingId: patientFeedbackMeasureReadingId || null,
                createdTimestamp: admin.firestore.Timestamp.fromDate(treatmentDate),
                updatedTimestamp: admin.firestore.Timestamp.fromDate(treatmentDate)
            };

            await db.collection('treatments').doc(treatmentId).set(treatment);
        }
        console.log(`  10 treatments for patient ${patient.id} created.`);
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

async function getMockPatientIds() {
    const patientSnap = await db.collection('patients').get();
    return patientSnap.docs
        .filter(doc => doc.data().email && doc.data().email.includes('test.com'))
        .map(doc => doc.id);
}

async function clearByPatientIds(collectionName, patientIds) {
    console.log(`Clearing ${collectionName} for ${patientIds.length} mock patients...`);
    let totalDeleted = 0;

    // Use Firestore 'in' query for each batch of 30 patient IDs (Firestore limit for 'in' is 30, not 10 anymore but 30 is safe)
    // Actually, querying 'patientId' in patientIds is better.
    // If patientIds is large, we loop through them in chunks.
    const CHUNK_SIZE = 30;
    for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
        const chunk = patientIds.slice(i, i + CHUNK_SIZE);
        const snap = await db.collection(collectionName).where('patientId', 'in', chunk).get();

        if (!snap.empty) {
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += snap.size;
            console.log(`  Deleted ${snap.size} from ${collectionName}...`);
        }
    }
    console.log(`Total ${collectionName} deleted: ${totalDeleted}`);
}

async function clearTreatments() {
    const mockPatientIds = await getMockPatientIds();
    if (mockPatientIds.length === 0) {
        console.log("No mock patients found.");
        return;
    }
    await clearByPatientIds('treatments', mockPatientIds);
}

async function clearMeasuredValues() {
    const mockPatientIds = await getMockPatientIds();
    if (mockPatientIds.length === 0) {
        console.log("No mock patients found.");
        return;
    }
    await clearByPatientIds('measured_values', mockPatientIds);
}

run().catch(console.error);
