import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXPORT_PATH = './emulator-data';

async function saveEmulatorData() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] 💾 Auto-saving emulator data to ${EXPORT_PATH}...`);
    const { stdout, stderr } = await execPromise(`npx firebase emulators:export ${EXPORT_PATH} --project apitherapyv2 --force`);
    if (stderr) console.warn('⚠️ Export warning:', stderr);
    console.log('✅ Auto-save completed.');
  } catch (error) {
    console.error('❌ Auto-save failed (Are the emulators running?):', error.message);
  }
}

console.log(`🚀 Auto-save service started (Interval: ${SAVE_INTERVAL_MS / 60000} minutes)`);

// Run immediately on start
saveEmulatorData();

// Then run periodically
setInterval(saveEmulatorData, SAVE_INTERVAL_MS);
