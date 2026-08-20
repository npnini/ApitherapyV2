import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);
const MAIN_DATA = path.resolve(process.cwd(), 'emulator-data');
const MANUAL_BACKUP_DIR = path.resolve(process.cwd(), 'emulator-data-manual');

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

function isValidExport(dirPath) {
  return fs.existsSync(dirPath) && fs.existsSync(path.join(dirPath, 'firebase-export-metadata.json'));
}

// firebase-tools writes the export to its own internal tmp folder
// (firebase-export-<timestamp><random>) and then moves it to our target
// path. On Windows that move can EPERM even though the export itself
// completed — leaving a fully valid, orphaned export folder behind and
// the CLI command reporting failure. Look for one created no earlier than
// `sinceMs` so we only ever pick up *this* attempt's result, never a
// leftover from an unrelated earlier run.
function findFreshOrphan(sinceMs) {
  const candidates = fs.readdirSync('.')
    .filter(name => /^firebase-export-\d+/.test(name))
    .filter(name => fs.statSync(name).isDirectory())
    .filter(name => fs.statSync(name).mtimeMs >= sinceMs)
    .filter(name => isValidExport(name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates.length > 0 ? path.resolve(process.cwd(), candidates[0]) : null;
}

// Clean up only folders that predate this run entirely — leftovers from a
// previous, unrelated failed session. Never touches anything created
// during the attempt loop below, so a real result is never deleted before
// we've had a chance to recover it.
function cleanupStaleFolders(scriptStartMs) {
  for (const name of fs.readdirSync('.')) {
    if (/^firebase-export-\d+/.test(name) || /^emulator-data-manual-staging-\d+/.test(name)) {
      try {
        if (fs.statSync(name).mtimeMs < scriptStartMs) {
          fs.rmSync(`./${name}`, { recursive: true, force: true });
          console.log(`🧹 Cleaned up stale leftover folder from a previous run: ${name}`);
        }
      } catch (e) {
        // Ignore locks
      }
    }
  }
}

async function saveEmulatorData() {
  const maxRetries = 3;
  const scriptStartMs = Date.now();
  cleanupStaleFolders(scriptStartMs);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStartMs = Date.now();
    const stagingPath = path.resolve(process.cwd(), `emulator-data-manual-staging-${attemptStartMs}`);
    let execError = null;

    console.log(`💾 Exporting live emulator data (attempt ${attempt}/${maxRetries}) for project "${defaultProject}"...`);
    try {
      const { stderr } = await execPromise(
        `npx firebase emulators:export "${stagingPath}" --force --project ${defaultProject}`
      );
      if (stderr) console.warn('⚠️ Export warning:', stderr);
    } catch (e) {
      execError = e;
    }

    // Determine the real source of truth from disk, regardless of whether
    // the CLI command itself reported success — see findFreshOrphan above.
    let sourceDir = isValidExport(stagingPath) ? stagingPath : null;
    if (!sourceDir) {
      const orphan = findFreshOrphan(attemptStartMs);
      if (orphan) {
        console.warn(`⚠️ Export command reported an error, but recovered a complete export from: ${orphan}`);
        sourceDir = orphan;
      }
    }

    if (sourceDir) {
      try {
        // 1. Refresh the fixed, persistent recovery copy. This one is
        // never deleted at the end — if a later Ctrl+C ruins
        // `emulator-data`, copy this folder's contents back by hand.
        if (fs.existsSync(MANUAL_BACKUP_DIR)) {
          fs.rmSync(MANUAL_BACKUP_DIR, { recursive: true, force: true });
        }
        fs.cpSync(sourceDir, MANUAL_BACKUP_DIR, { recursive: true });

        // 2. Swap into the live emulator-data dir (copy+delete, Windows-safe).
        if (fs.existsSync(MAIN_DATA)) {
          fs.rmSync(MAIN_DATA, { recursive: true, force: true });
        }
        fs.cpSync(sourceDir, MAIN_DATA, { recursive: true });

        fs.rmSync(sourceDir, { recursive: true, force: true });

        console.log(`✅ Saved to ${MAIN_DATA}`);
        console.log(`✅ Recovery copy kept at ${MANUAL_BACKUP_DIR}`);
        console.log('Safe to Ctrl+C the emulator whenever you like.');
        return;
      } catch (copyError) {
        console.error(`❌ Attempt ${attempt}: export succeeded but copying it failed:`, copyError.message);
        console.error(`   The export itself is still intact at: ${sourceDir} — not deleted.`);
      }
    } else {
      console.error(`❌ Attempt ${attempt} failed — no export data found on disk.`);
      if (execError) {
        console.error('   ', execError.message);
        if (execError.stdout) console.error('   stdout:', execError.stdout.trim());
        if (execError.stderr) console.error('   stderr:', execError.stderr.trim());
      }
    }

    if (attempt < maxRetries) {
      console.log('⏳ Retrying in 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.error(`🛑 All ${maxRetries} attempts failed. emulator-data and ${MANUAL_BACKUP_DIR} were left unchanged — nothing was overwritten.`);
  console.error('   Check the project root for any leftover firebase-export-* or emulator-data-manual-staging-* folders before retrying — one of them may hold a usable export.');
  process.exitCode = 1;
}

saveEmulatorData();
