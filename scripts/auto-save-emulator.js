import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execPromise = promisify(exec);
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXPORT_PATH = './emulator-data-temp'; // Export to a temp dir so we don't hit Windows file lock on the active import dir

// Load default project ID dynamically from .firebaserc
let defaultProject = 'apitherapyv2';
try {
  const rc = JSON.parse(fs.readFileSync('./.firebaserc', 'utf8'));
  if (rc.projects && rc.projects.default) {
    defaultProject = rc.projects.default;
  }
} catch (e) {
  console.warn('⚠️ Could not read .firebaserc, defaulting project to "apitherapyv2":', e.message);
}

function cleanupOrphanedRootFolders() {
  try {
    const rootFiles = fs.readdirSync('.');
    rootFiles.forEach(file => {
      if (file.startsWith('firebase-export-') || (file.startsWith('emulator-data-temp-') && file !== 'emulator-data-temp')) {
        const fullPath = `./${file}`;
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`🧹 Cleaned up orphaned root export folder: ${file}`);
        } catch (e) {
          // Ignore locks
        }
      }
    });
  } catch (err) {
    console.warn('⚠️ Could not read root directory during cleanup:', err.message);
  }
}

async function saveEmulatorData(reason = 'scheduled') {
  const maxRetries = 3;
  let attempt = 0;
  let success = false;

  while (attempt < maxRetries && !success) {
    attempt++;
    const timestamp = Date.now();
    const UNIQUE_EXPORT_PATH = path.resolve(process.cwd(), `emulator-data-temp-${timestamp}`);

    try {
      console.log(`[${new Date().toLocaleTimeString()}] 💾 Auto-saving emulator data (${reason}) for project "${defaultProject}" (Attempt ${attempt}/${maxRetries})...`);

      // Cleanup any pre-existing orphaned folders in the project root to prevent lock conflicts
      cleanupOrphanedRootFolders();

      // 1. Export to a UNIQUE folder in the project directory (completely ignored by VS Code watcher)
      const { stderr } = await execPromise(
        `npx firebase emulators:export "${UNIQUE_EXPORT_PATH}" --force --project ${defaultProject}`
      );
      if (stderr) console.warn('⚠️ Export warning:', stderr);

      // 2. Move to the official temp location using Copy-Delete (Windows safe)
      if (fs.existsSync(EXPORT_PATH)) {
        fs.rmSync(EXPORT_PATH, { recursive: true, force: true });
      }
      fs.cpSync(UNIQUE_EXPORT_PATH, EXPORT_PATH, { recursive: true });
      fs.rmSync(UNIQUE_EXPORT_PATH, { recursive: true, force: true });

      success = true;
      console.log('✅ Auto-save completed successfully.');
    } catch (error) {
      console.error(`❌ Auto-save attempt ${attempt} failed:`, error.message);
      
      // Cleanup UNIQUE_EXPORT_PATH if we failed partway
      if (fs.existsSync(UNIQUE_EXPORT_PATH)) {
        try { fs.rmSync(UNIQUE_EXPORT_PATH, { recursive: true, force: true }); } catch (e) {}
      }

      if (attempt < maxRetries) {
        console.log(`⏳ Waiting 3 seconds before retrying next attempt...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  // Final sweep of the root folder
  cleanupOrphanedRootFolders();
}

// On Ctrl+C/termination, let the main emulator process handle export-on-exit gracefully.
// The autosave script will just log its exit and close.
function shutdown(signal) {
  console.log(`\n🛑 ${signal} received. Exiting auto-save service gracefully.`);
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log(`🚀 Auto-save service started for project "${defaultProject}" (Interval: ${SAVE_INTERVAL_MS / 60000} minutes)`);

// Run immediately on start
saveEmulatorData('startup');

// Then run periodically
setInterval(saveEmulatorData, SAVE_INTERVAL_MS);
