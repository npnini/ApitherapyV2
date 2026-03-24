const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const projectId = "apitherapyv2";
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');

let adminConfig = { projectId };
if (fs.existsSync(serviceAccountPath)) {
    adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
}
admin.initializeApp(adminConfig);
const db = admin.firestore();

async function computeAverageSizes() {
    console.log("Fetching root collections...");
    const collections = await db.listCollections();

    console.log(`Found ${collections.length} root collections.`);

    for (const collection of collections) {
        console.log(`\nProcessing collection: ${collection.id}...`);

        let totalBytes = 0;
        let documentCount = 0;

        // Use a cursor to fetch documents in batches to avoid high memory usage
        let query = collection.orderBy(admin.firestore.FieldPath.documentId());
        let snapshot = await query.limit(500).get();
        let lastDoc = null;

        while (!snapshot.empty) {
            snapshot.forEach(doc => {
                const data = doc.data();
                // Approximate size: stringify to JSON and count UTF-8 bytes
                const jsonString = JSON.stringify(data);
                const bytes = Buffer.byteLength(jsonString, 'utf8');

                totalBytes += bytes;
                documentCount++;
                lastDoc = doc;
            });

            // Get the next batch
            snapshot = await query.startAfter(lastDoc).limit(500).get();
        }

        if (documentCount === 0) {
            console.log(`- Collection '${collection.id}' is empty.`);
        } else {
            const avgBytes = totalBytes / documentCount;
            // Format nice numbers
            const avgStr = avgBytes > 1024 ? `${(avgBytes / 1024).toFixed(2)} KB` : `${avgBytes.toFixed(2)} bytes`;
            const totalStr = totalBytes > 1024 * 1024 ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB` :
                totalBytes > 1024 ? `${(totalBytes / 1024).toFixed(2)} KB` :
                    `${totalBytes} bytes`;

            console.log(`==========================================`);
            console.log(`Collection: ${collection.id}`);
            console.log(`Total Documents: ${documentCount}`);
            console.log(`Total Size: ${totalStr} (${totalBytes} bytes)`);
            console.log(`Average Document Size: ${avgStr} (${avgBytes.toFixed(2)} bytes)`);
            console.log(`==========================================`);
        }
    }

    console.log("\nDone computing sizes.");
    process.exit(0);
}

computeAverageSizes().catch(err => {
    console.error("Error computing sizes:", err);
    process.exit(1);
});
