
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Load extracted Corpo coordinates
const corpoCoords = JSON.parse(fs.readFileSync('corpo_coords.json', 'utf8'));

// Mapping Constants
const CORPO_BBOX = {
    min: { x: -30.56779800686468, y: -93.17999999999924, z: -9.299999999999985 },
    size: { x: 60.10000000000032, y: 165.07999999999907, z: 20.59999999999996 }
};

const XBOT_HEIGHT = 1.8;
const XBOT_WIDTH = (CORPO_BBOX.size.x / CORPO_BBOX.size.y) * XBOT_HEIGHT;
const XBOT_DEPTH = (CORPO_BBOX.size.z / CORPO_BBOX.size.y) * XBOT_HEIGHT;

const XBOT_BBOX = {
    min: { x: -XBOT_WIDTH / 2, y: 0, z: -XBOT_DEPTH / 2 },
    size: { x: XBOT_WIDTH, y: XBOT_HEIGHT, z: XBOT_DEPTH }
};

function mapCorpoToXbot(pos) {
    const nx = (pos.x - CORPO_BBOX.min.x) / CORPO_BBOX.size.x;
    const ny = (pos.y - CORPO_BBOX.min.y) / CORPO_BBOX.size.y;
    const nz = (pos.z - CORPO_BBOX.min.z) / CORPO_BBOX.size.z;

    return {
        x: XBOT_BBOX.min.x + nx * XBOT_BBOX.size.x,
        y: XBOT_BBOX.min.y + ny * XBOT_BBOX.size.y,
        z: XBOT_BBOX.min.z + nz * XBOT_BBOX.size.z
    };
}

async function migrate() {
    const pointsRef = db.collection('cfg_acupuncture_points');
    const snapshot = await pointsRef.get();

    console.log(`Found ${snapshot.size} points in Firestore.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const code = (data.code || '').toUpperCase();

        // 1. Determine Corpo Coordinates
        let finalCorpoPos = corpoCoords[code] || corpoCoords[code.toLowerCase()];

        // If we have corpo coordinates, calculate xbot
        if (finalCorpoPos) {
            const finalXbotPos = mapCorpoToXbot(finalCorpoPos);

            const positions = {
                xbot: finalXbotPos,
                corpo: finalCorpoPos
            };

            await doc.ref.update({
                positions: positions,
                // Also keep 'position' for backward compatibility during migration
                position: finalXbotPos,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            updatedCount++;
            console.log(`[UPDATED] ${code}: Corpo(${finalCorpoPos.x.toFixed(2)}, ${finalCorpoPos.y.toFixed(2)}) -> Xbot(${finalXbotPos.x.toFixed(2)}, ${finalXbotPos.y.toFixed(2)})`);
        } else {
            // If we don't have corpo coordinates for this point, we just migrate existing 'position' to 'positions.xbot'
            if (data.position && !data.positions) {
                await doc.ref.update({
                    positions: {
                        xbot: data.position,
                        corpo: { x: 0, y: 0, z: 0 }
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                updatedCount++;
                console.log(`[MIGRATED LEGACY] ${code}: Moved single position to positions.xbot`);
            } else {
                skippedCount++;
                console.log(`[SKIPPED] ${code}: No Corpo data found.`);
            }
        }
    }

    console.log(`Migration completed! Updated: ${updatedCount}, Skipped: ${skippedCount}`);
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
