const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin SDK
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Helper to escape CSV values
function escapeCsv(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Helper to safely get ML string
function getMlString(val, lang) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val[lang] || '';
}

async function exportPointsToCsv() {
    try {
        console.log('Fetching points from cfg_acupuncture_points...');
        const snapshot = await db.collection('cfg_acupuncture_points').get();
        console.log(`Found ${snapshot.size} points.`);

        const headers = [
            'id',
            'code',
            'label_en',
            'label_he',
            'description_en',
            'description_he',
            'longText_en',
            'longText_he',
            'x',
            'y',
            'z',
            'xbot-x',
            'xbot-y',
            'xbot-z',
            'corpo-x',
            'corpo-y',
            'corpo-z',
            'sensitivity',
            'imageURL',
            'documentUrl_en',
            'documentUrl_he',
            'status'
        ];

        const rows = [];

        snapshot.docs.forEach(doc => {
            const d = doc.data();
            const row = [
                escapeCsv(doc.id),
                escapeCsv(d.code),
                escapeCsv(getMlString(d.label, 'en')),
                escapeCsv(getMlString(d.label, 'he')),
                escapeCsv(getMlString(d.description, 'en')),
                escapeCsv(getMlString(d.description, 'he')),
                escapeCsv(getMlString(d.longText, 'en')),
                escapeCsv(getMlString(d.longText, 'he')),
                escapeCsv(d.position?.x),
                escapeCsv(d.position?.y),
                escapeCsv(d.position?.z),
                escapeCsv(d.positions?.xbot?.x),
                escapeCsv(d.positions?.xbot?.y),
                escapeCsv(d.positions?.xbot?.z),
                escapeCsv(d.positions?.corpo?.x),
                escapeCsv(d.positions?.corpo?.y),
                escapeCsv(d.positions?.corpo?.z),
                escapeCsv(d.sensitivity),
                escapeCsv(d.imageURL),
                escapeCsv(getMlString(d.documentUrl, 'en')),
                escapeCsv(getMlString(d.documentUrl, 'he')),
                escapeCsv(d.status)
            ];
            rows.push(row.join(','));
        });

        const csvContent = headers.join(',') + '\n' + rows.join('\n');

        const filename = 'exported_points_v2.csv';
        fs.writeFileSync(filename, csvContent, 'utf8');

        console.log(`\nSuccessfully exported points to ${filename}`);
        process.exit(0);

    } catch (error) {
        console.error('Error exporting points:', error);
        process.exit(1);
    }
}

exportPointsToCsv();
