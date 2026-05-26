import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🧹 Cleaning up hanging emulator ports...');
const ports = new Set([4000, 4400, 5001, 8080, 8085, 9000, 9099, 9199]);
try {
  // Run netstat once and scan all ports in a single pass
  const result = execSync('netstat -ano', { encoding: 'utf8', timeout: 8000 });
  const pidsToKill = new Set();
  for (const line of result.split('\n')) {
    if (!line.includes('LISTENING')) continue;
    const match = line.match(/:(\d+)\s+.*LISTENING\s+(\d+)/);
    if (match && ports.has(Number(match[1]))) {
      pidsToKill.add(match[2]);
    }
  }
  for (const pid of pidsToKill) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 3000 });
      console.log(`  ✓ Killed process tree ${pid}`);
    } catch (e) {
      // Process may have already exited
    }
  }

  // Verify all ports are actually free after killing
  const stillLocked = [];
  const verify = execSync('netstat -ano', { encoding: 'utf8', timeout: 8000 });
  for (const line of verify.split('\n')) {
    if (!line.includes('LISTENING')) continue;
    const match = line.match(/:(\d+)\s+.*LISTENING\s+(\d+)/);
    if (match && ports.has(Number(match[1]))) {
      stillLocked.push(match[1]);
    }
  }
  if (stillLocked.length > 0) {
    console.warn(`⚠️  Ports still locked: ${stillLocked.join(', ')}. Please close any terminal windows running Firebase emulators and try again.`);
    process.exit(1);
  }
} catch (e) {
  console.warn('⚠️ Could not check ports, proceeding anyway...');
}
console.log('✨ Ports cleared.');

console.log('🔄 Setting active Firebase project to "default" (dev env)...');
try {
  execSync('npx firebase use default', { stdio: 'inherit', shell: true });
} catch (e) {
  console.warn('⚠️ Could not switch project automatically. Proceeding anyway...');
}

// Build TypeScript functions before starting emulators
console.log('🔨 Building Cloud Functions (TypeScript)...');
try {
  execSync('npm run build', { stdio: 'inherit', shell: true, cwd: './functions' });
  console.log('✅ Functions built successfully.');
} catch (e) {
  console.warn('⚠️ Functions build failed. Emulators will start but functions may not work.');
}

// Ensure the data directory exists (required by --import)
const MAIN_DATA = './emulator-data';
if (!fs.existsSync(MAIN_DATA)) {
  console.log('📂 Creating blank emulator data directory...');
  fs.mkdirSync(MAIN_DATA);
}

console.log('🚀 Starting Firebase Emulators (data will be saved on Ctrl+C)...');
console.log('🌐 Emulator web console will be available at: http://localhost:5000');

const emulators = spawn('npx', ['firebase', 'emulators:start', '--import=./emulator-data', '--export-on-exit=./emulator-data'], {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    GOOGLE_APPLICATION_CREDENTIALS: path.resolve('./service-account.json')
  }
});

emulators.on('close', (code) => {
  console.log(`\n🛑 Emulators stopped with code ${code}`);
  process.exit(code);
});
