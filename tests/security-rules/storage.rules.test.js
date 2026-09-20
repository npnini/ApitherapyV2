// Regression tests for storage.rules, run against the local Firebase emulator
// via @firebase/rules-unit-testing (never against real cloud data).
//
// Covers exactly what storage.rules changes for Finding 1:
//   - Patients/{patientId}/**: ownership-gated read/write (mirrors Firestore's
//     isPatientCaretaker/canReadPatientData). Admins are NOT blanket-allowed
//     here — they must also be that patient's own caretaker to write.
//   - Points/, Protocols/, Measures/, Problems/, App_config/: read open to any
//     authenticated user, write restricted to admin/superadmin.
//
// Run via: npm run test:rules (wraps this in `firebase emulators:exec`).

import { test, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { ref, getBytes, uploadBytes } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';

const REFERENCE_DATA_FOLDERS = ['Points', 'Protocols', 'Measures', 'Problems', 'App_config'];

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    // Must match the emulator hub's active project (the "default" alias in
    // .firebaserc) - Storage Rules' cross-service firestore.get() resolves
    // against the hub's project context, not a per-test namespace, so a
    // mismatched projectId here causes firestore.get() to silently find
    // nothing even though the Firestore writes succeeded.
    projectId: 'apitherapyv2',
    firestore: {
      rules: fs.readFileSync(
        path.resolve(import.meta.dirname, '../../config/firestore/firestore.rules'),
        'utf8'
      ),
    },
    storage: {
      rules: fs.readFileSync(path.resolve(import.meta.dirname, '../../storage.rules'), 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

// Clears fixture state and reseeds. Called once at the start of each
// top-level test() block (not via a global beforeEach, which would also fire
// before every nested t.test() subtest and wipe fixture data mid-block).
async function seedUsersAndPatient() {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const firestore = ctx.firestore();
    const storage = ctx.storage();

    await setDoc(doc(firestore, 'users/caretakerA-uid'), { role: 'caretaker' });
    await setDoc(doc(firestore, 'users/caretakerB-uid'), { role: 'caretaker' });
    await setDoc(doc(firestore, 'users/admin-uid'), { role: 'admin' });
    await setDoc(doc(firestore, 'users/superadmin-uid'), { role: 'superadmin' });

    await setDoc(doc(firestore, 'patients/patientA'), {
      caretakerId: 'caretakerA-uid',
      fullName: 'Test Patient',
    });

    await uploadBytes(ref(storage, 'Patients/patientA/consent.pdf'), Buffer.from('dummy pdf bytes'));
  });
}

test('storage.rules: Patients/{patientId} ownership enforcement', async (t) => {
  await seedUsersAndPatient();

  await t.test('unauthenticated user cannot read the file', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getBytes(ref(anon.storage(), 'Patients/patientA/consent.pdf')));
  });

  await t.test('a different caretaker cannot read the file (IDOR guard)', async () => {
    const caretakerB = testEnv.authenticatedContext('caretakerB-uid');
    await assertFails(getBytes(ref(caretakerB.storage(), 'Patients/patientA/consent.pdf')));
  });

  await t.test('the owning caretaker can read the file', async () => {
    const caretakerA = testEnv.authenticatedContext('caretakerA-uid');
    await assertSucceeds(getBytes(ref(caretakerA.storage(), 'Patients/patientA/consent.pdf')));
  });

  await t.test('the owning caretaker can overwrite the file', async () => {
    const caretakerA = testEnv.authenticatedContext('caretakerA-uid');
    await assertSucceeds(
      uploadBytes(
        ref(caretakerA.storage(), 'Patients/patientA/consent.pdf'),
        Buffer.from('updated pdf bytes')
      )
    );
  });

  await t.test('a different caretaker cannot overwrite the file (IDOR guard)', async () => {
    const caretakerB = testEnv.authenticatedContext('caretakerB-uid');
    await assertFails(
      uploadBytes(
        ref(caretakerB.storage(), 'Patients/patientA/consent.pdf'),
        Buffer.from('malicious overwrite')
      )
    );
  });

  await t.test('superadmin can read the file', async () => {
    const superadmin = testEnv.authenticatedContext('superadmin-uid');
    await assertSucceeds(getBytes(ref(superadmin.storage(), 'Patients/patientA/consent.pdf')));
  });

  await t.test(
    'an admin who is NOT this patient\'s caretaker cannot write the file (blanket-admin regression guard)',
    async () => {
      const admin = testEnv.authenticatedContext('admin-uid');
      await assertFails(
        uploadBytes(
          ref(admin.storage(), 'Patients/patientA/consent.pdf'),
          Buffer.from('admin should not be able to do this')
        )
      );
    }
  );
});

for (const folder of REFERENCE_DATA_FOLDERS) {
  test(`storage.rules: ${folder}/ read-open, write-admin-only`, async (t) => {
    await seedUsersAndPatient();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), `${folder}/seed.json`), Buffer.from('{}'));
    });

    await t.test('a non-admin authenticated caretaker can read', async () => {
      const caretakerA = testEnv.authenticatedContext('caretakerA-uid');
      await assertSucceeds(getBytes(ref(caretakerA.storage(), `${folder}/seed.json`)));
    });

    await t.test('a non-admin authenticated caretaker cannot write', async () => {
      const caretakerA = testEnv.authenticatedContext('caretakerA-uid');
      await assertFails(
        uploadBytes(ref(caretakerA.storage(), `${folder}/seed.json`), Buffer.from('{"hacked":true}'))
      );
    });

    await t.test('an admin can write', async () => {
      const admin = testEnv.authenticatedContext('admin-uid');
      await assertSucceeds(
        uploadBytes(ref(admin.storage(), `${folder}/seed.json`), Buffer.from('{"updated":true}'))
      );
    });

    await t.test('a superadmin can write', async () => {
      const superadmin = testEnv.authenticatedContext('superadmin-uid');
      await assertSucceeds(
        uploadBytes(ref(superadmin.storage(), `${folder}/seed.json`), Buffer.from('{"updated":true}'))
      );
    });

    await t.test('unauthenticated cannot read', async () => {
      const anon = testEnv.unauthenticatedContext();
      await assertFails(getBytes(ref(anon.storage(), `${folder}/seed.json`)));
    });
  });
}
