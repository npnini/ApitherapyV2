const fs = require('fs');

async function extractCoordinates() {
    const htmlContent = fs.readFileSync('acu.html', 'utf8');
    const points = {};

    // Regex to match the object definitions
    // var object = new THREE.Mesh... object.name = 'name'; ... object.position.x = x; ...
    const regex = /object\.name = '([^']+)';\s*(?:object\.view = [^;]+;\s*)?object\.position\.x = ([^;]+);\s*object\.position\.y = ([^;]+);\s*object\.position\.z = ([^;]+);/g;

    let match;
    while ((match = regex.exec(htmlContent)) !== null) {
        const [_, name, x, y, z] = match;
        points[name.toUpperCase()] = {
            x: parseFloat(x),
            y: parseFloat(y),
            z: parseFloat(z)
        };
    }

    fs.writeFileSync('corpo_coords.json', JSON.stringify(points, null, 2));
    console.log(`Extracted ${Object.keys(points).length} points.`);
}

extractCoordinates();
