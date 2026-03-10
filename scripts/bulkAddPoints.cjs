
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Load extracted Corpo coordinates
const corpoCoords = JSON.parse(fs.readFileSync('corpo_coords.json', 'utf8'));

// Common Name Mapping
const POINT_NAMES = {
    "LU1": "Zhongfu", "LU2": "Yunmen", "LU3": "Tianfu", "LU4": "Xiabai", "LU5": "Chize", "LU6": "Kongzui", "LU7": "Lieque", "LU8": "Jingqu", "LU9": "Taiyuan", "LU10": "Yuji", "LU11": "Shaoshang",
    "LI1": "Shangyang", "LI2": "Erjian", "LI3": "Sanjian", "LI4": "Hegu", "LI5": "Yangxi", "LI6": "Pianli", "LI7": "Wenliu", "LI8": "Xialian", "LI9": "Shanglian", "LI10": "Shousanli", "LI11": "Quchi", "LI12": "Zhouliao", "LI13": "Shouwuli", "LI14": "Binao", "LI15": "Jianyu", "LI16": "Jugu", "LI17": "Tianding", "LI18": "Futuo", "LI19": "Kouheliao", "LI20": "Yingxiang",
    "ST1": "Chengqi", "ST2": "Sibai", "ST3": "Juliao", "ST4": "Dicang", "ST5": "Daying", "ST6": "Jiache", "ST7": "Xiaguan", "ST8": "Touwei", "ST9": "Renying", "ST10": "Shuitu", "ST11": "Qishe", "ST12": "Quepen", "ST13": "Qihu", "ST14": "Kufang", "ST15": "Wuyi", "ST16": "Yingchuang", "ST17": "Ruzhong", "ST18": "Rugen", "ST19": "Burong", "ST20": "Chengman", "ST21": "Liangmen", "ST22": "Guanmen", "ST23": "Taiyi", "ST24": "Huaroumen", "ST25": "Tianshu", "ST26": "Wailing", "ST27": "Daju", "ST28": "Shuidao", "ST29": "Guilai", "ST30": "Qichong", "ST31": "Biguan", "ST32": "Futu", "ST33": "Yinshi", "ST34": "Liangqiu", "ST35": "Dubi", "ST36": "Zusanli", "ST37": "Shangjuxu", "ST38": "Tiaokou", "ST39": "Xiajuxu", "ST40": "Fenglong", "ST41": "Jiexi", "ST42": "Chongyang", "ST43": "Xiangu", "ST44": "Neiting", "ST45": "Lidui",
    "CV1": "Huiyin", "CV2": "Qugu", "CV3": "Zhongji", "CV4": "Guanyuan", "CV5": "Shimen", "CV6": "Qihai", "CV7": "Yinjiao", "CV8": "Shenque", "CV9": "Shuifen", "CV10": "Xiawan", "CV11": "Jianli", "CV12": "Zhongwan", "CV13": "Shangwan", "CV14": "Juque", "CV15": "Jiuwei", "CV16": "Zhongting", "CV17": "Danzhong", "CV18": "Yutang", "CV19": "Zigong", "CV20": "Huagai", "CV21": "Xuanji", "CV22": "Tiantu", "CV23": "Lianquan", "CV24": "Chengjiang"
};

// Coordinate Mapping Constants (Same as mapper)
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

const CODE_MAP = {
    'P': 'LU',
    'IG': 'LI',
    'E': 'ST',
    'VC': 'CV'
};

async function bulkAdd() {
    const pointsRef = db.collection('cfg_acupuncture_points');
    const snapshot = await pointsRef.get();

    const existingPointsByCode = {};
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        existingPointsByCode[data.code.toUpperCase()] = { id: doc.id, ...data };
    });

    console.log(`Analyzing ${Object.keys(corpoCoords).length} potential points...`);

    let addedCount = 0;
    let updatedCount = 0;

    for (let [origCode, pos] of Object.entries(corpoCoords)) {
        origCode = origCode.toUpperCase();

        // Translate code to standard
        let prefix = origCode.match(/^[A-Z]+/)[0];
        let number = origCode.match(/[0-9]+$/)[0];
        let stdCode = (CODE_MAP[prefix] || prefix) + number;

        const xbotPos = mapCorpoToXbot(pos);
        const existing = existingPointsByCode[stdCode] || existingPointsByCode[origCode];

        const dataToSave = {
            code: stdCode,
            label: existing?.label || { en: POINT_NAMES[stdCode] || stdCode },
            description: existing?.description || {},
            status: 'active',
            reference_count: existing?.reference_count || 0,
            positions: {
                xbot: xbotPos,
                corpo: pos
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (existing) {
            await db.collection('cfg_acupuncture_points').doc(existing.id).update(dataToSave);
            updatedCount++;
        } else {
            await db.collection('cfg_acupuncture_points').add({
                ...dataToSave,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            addedCount++;
        }
    }

    console.log(`Bulk processing complete! Added: ${addedCount}, Updated: ${updatedCount}`);
    process.exit(0);
}

bulkAdd().catch(console.error);
