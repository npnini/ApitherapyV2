import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execPromise = promisify(exec);
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXPORT_PATH = './emulator-data-temp'; // Export to a temp dir so we don't hit Windows file lock on the active import dir

async function saveEmulatorData(reason = 'scheduled') {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] 💾 Auto-saving emulator data (${reason})...`);

    // We export to emulator-data-temp. The start-dev.js script will merge this into emulator-data on next boot.
    // This entirely bypasses the Windows EPERM file lock issue.
    if (fs.existsSync(EXPORT_PATH)) {
      fs.rmSync(EXPORT_PATH, { recursive: true, force: true });
    }

    const { stderr } = await execPromise(
      `npx firebase emulators:export ${EXPORT_PATH} --project apitherapyv2 --force`
    );
    if (stderr) console.warn('⚠️ Export warning:', stderr);
    console.log('✅ Auto-save completed.');
  } catch (error) {
    console.error('❌ Auto-save failed (Are the emulators running?):', error.message);
  }
}

// Save on graceful shutdown (Ctrl+C / process kill)
async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received. Saving emulator data before exit...`);
  await saveEmulatorData('shutdown');
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log(`🚀 Auto-save service started (Interval: ${SAVE_INTERVAL_MS / 60000} minutes)`);

// Run immediately on start
saveEmulatorData('startup');

// Then run periodically
setInterval(saveEmulatorData, SAVE_INTERVAL_MS);
