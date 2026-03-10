
const fs = require('fs');
const coords = JSON.parse(fs.readFileSync('corpo_coords.json', 'utf8'));

let min = { x: Infinity, y: Infinity, z: Infinity };
let max = { x: -Infinity, y: -Infinity, z: -Infinity };

Object.values(coords).forEach(p => {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
});

console.log('Min:', min);
console.log('Max:', max);
console.log('Size:', { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z });
console.log('Center:', { x: (max.x + min.x) / 2, y: (max.y + min.y) / 2, z: (max.z + min.z) / 2 });
