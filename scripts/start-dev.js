import { spawn } from 'child_process';
import path from 'path';

console.log('🚀 Starting Firebase Emulators...');

// 1. Start the emulators
const emulators = spawn('npx', ['firebase', 'emulators:start', '--import=./emulator-data', '--export-on-exit=./emulator-data'], {
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

    // 3. Kick off the autosave script in a NEW PowerShell window
    // This command opens a new terminal so you can see the auto-save logs separately
    spawn('powershell', ['-NoExit', '-Command', 'npm run emulators:autosave'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }
});

emulators.on('close', (code) => {
  console.log(`\n🛑 Emulators stopped with code ${code}`);
  process.exit(code);
});
