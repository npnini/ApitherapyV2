const fs = require('fs');
const path = require('path');

const extDir = path.join(process.cwd(), 'extensions');
const files = fs.readdirSync(extDir).filter(f => f.endsWith('.env') && !f.endsWith('.local'));

files.forEach(file => {
    const filePath = path.join(extDir, file);
    const localPath = filePath + '.local';
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Create .env.local if it doesn't exist (copy of current dev config)
    if (!fs.existsSync(localPath)) {
        fs.writeFileSync(localPath, content);
        console.log(`Created ${file}.local`);
    }

    // Update original .env to staging
    const newContent = content.replace(
        /DATASET_ID=apitherapy_clinical_analytics_dev/g, 
        'DATASET_ID=apitherapy_clinical_analytics_stage'
    );
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Updated ${file} to staging`);
    } else {
        console.log(`Skipped ${file} (already updated or no match)`);
    }
});
