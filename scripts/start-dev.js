import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

console.log('🧹 Cleaning up hanging emulator ports...');
try {
  // Kill processes holding common Firebase emulator ports to prevent "port taken" errors
  const ports = [4000, 4400, 5001, 8080, 8085, 9000, 9099, 9199];
  const psCommand = `Get-NetTCPConnection -LocalPort ${ports.join(',')} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`;
  execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'ignore' });
  console.log('✨ Ports cleared.');
} catch (e) {
  // Ignore errors (usually means no processes were found, which is fine)
}

console.log('🔄 Setting active Firebase project to "default" (dev env)...');
try {
  execSync('npx firebase use default', { stdio: 'inherit', shell: true });
} catch (e) {
  console.warn('⚠️ Could not switch project automatically. Proceeding anyway...');
}

console.log('🚀 Starting Firebase Emulators...');

// 0. Process any pending auto-saves to bypass Windows file locks
const TEMP_DATA = './emulator-data-temp';
const MAIN_DATA = './emulator-data';
if (fs.existsSync(TEMP_DATA)) {
  console.log('📦 Promoting auto-saved data to main directory...');
  if (fs.existsSync(MAIN_DATA)) {
    try {
      fs.rmSync(MAIN_DATA, { recursive: true, force: true });
    } catch (e) {
      console.warn('⚠️ Could not fully clear main-data, proceeding anyway...');
    }
  }
  
  try {
    // Try fast rename first
    fs.renameSync(TEMP_DATA, MAIN_DATA);
  } catch (err) {
    // Fallback for Windows EPERM issues: Copy and then Delete
    console.log('⚠️ Rename locked by Windows. Using Copy-Delete fallback...');
    try {
      fs.cpSync(TEMP_DATA, MAIN_DATA, { recursive: true });
      fs.rmSync(TEMP_DATA, { recursive: true, force: true });
    } catch (fallbackErr) {
      console.error('❌ Failed to promote data:', fallbackErr.message);
    }
  }
}

// 1. Start the emulators
const emulators = spawn('npx', ['firebase', 'emulators:start', '--import=./emulator-data'], {
  shell: true,
  stdio: ['inherit', 'pipe', 'inherit']
});

emulators.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output); // Print emulator logs to current terminal

  // 2. Look for the "Ready" message
  if (output.includes('All emulators ready')) {
    console.log('\n✨ Emulators are ready!');
    console.log('📂 Launching Auto-Save service in a new window...');

    // 3. Kick off the autosave script as an attached process
    // This ensures it dies cleanly when the main process dies
    const autoSave = spawn('npm', ['run', 'emulators:autosave'], {
      shell: true,
      stdio: 'inherit'
    });

    // Make sure we kill the autosave script when emulators close
    emulators.on('close', (code) => {
      autoSave.kill();
    });
  }
});

emulators.on('close', (code) => {
  console.log(`\n🛑 Emulators stopped with code ${code}`);
  process.exit(code);
});
