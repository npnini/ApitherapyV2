import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execPromise = promisify(exec);
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXPORT_PATH = './emulator-data-temp'; // Export to a temp dir so we don't hit Windows file lock on the active import dir

async function saveEmulatorData(reason = 'scheduled') {
  const timestamp = Date.now();
  const UNIQUE_EXPORT_PATH = `./.firebase-exports/export-${timestamp}`;
  
  try {
    console.log(`[${new Date().toLocaleTimeString()}] 💾 Auto-saving emulator data (${reason})...`);

    // Ensure the hidden directory exists
    if (!fs.existsSync('./.firebase-exports')) {
      fs.mkdirSync('./.firebase-exports');
    }

    // 1. Export to a UNIQUE folder (this avoids the EPERM rename lock)
    const { stderr } = await execPromise(
      `npx firebase emulators:export ${UNIQUE_EXPORT_PATH} --force`
    );
    if (stderr) console.warn('⚠️ Export warning:', stderr);

    // 2. Move to the official temp location using Copy-Delete (Windows safe)
    if (fs.existsSync(EXPORT_PATH)) {
      fs.rmSync(EXPORT_PATH, { recursive: true, force: true });
    }
    fs.cpSync(UNIQUE_EXPORT_PATH, EXPORT_PATH, { recursive: true });
    fs.rmSync(UNIQUE_EXPORT_PATH, { recursive: true, force: true });

    // 3. Cleanup any orphaned folders left by failed CLI attempts
    const files = fs.readdirSync('./.firebase-exports');
    files.forEach(file => {
      const fullPath = `./.firebase-exports/${file}`;
      if (fullPath !== UNIQUE_EXPORT_PATH) {
        try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch (e) {}
      }
    });

    console.log('✅ Auto-save completed.');
  } catch (error) {
    console.error('❌ Auto-save failed:', error.message);
    // Cleanup if we failed partway
    if (fs.existsSync(UNIQUE_EXPORT_PATH)) fs.rmSync(UNIQUE_EXPORT_PATH, { recursive: true, force: true });
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
