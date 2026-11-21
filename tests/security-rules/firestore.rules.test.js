// Regression tests for config/firestore/firestore.rules, run against the local
// Firebase emulator via @firebase/rules-unit-testing (never against real cloud data).
//
// Covers the appointments feature (docs/Future/Appointments-Implementation-Plan.md §1.4):
//   - appointments/{id}: owner-only create/update, impersonator read-only, no deletes,
//     clients may only create 'booked' appointments, immutable owner/patient/source/invite.
//   - users/{uid}.appointmentPrefs and patients/{id}.appointmentPlan (Steps 2 and 3)
//     stay writable by their owner only, and role/canImpersonate stay protected.
//   - patients/{id}: never deleted, by anyone (Step 15).
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
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, Timestamp,
} from 'firebase/firestore';

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    // Deliberately NOT 'apitherapyv2': `node --test` runs the test files in parallel against
    // the same emulator, and each file clears Firestore before seeding. A separate projectId
    // gives this file its own emulator namespace, so it cannot wipe storage.rules.test.js's
    // fixtures (which must stay on 'apitherapyv2' for Storage's cross-service lookups) or vice versa.
    projectId: 'apitherapyv2-firestore-rules-test',
    firestore: {
      rules: fs.readFileSync(
        path.resolve(import.meta.dirname, '../../config/firestore/firestore.rules'),
        'utf8'
      ),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

const at = (iso) => Timestamp.fromDate(new Date(iso));
const START = at('2026-10-04T09:00:00Z');
const END = at('2026-10-04T09:30:00Z');

// A valid client-side booking by caretakerA for patientA; tests override single fields.
const newBooking = (overrides = {}) => ({
  caretakerId: 'caretakerA-uid',
  patientId: 'patientA',
  start: START,
  end: END,
  status: 'booked',
  source: 'booked',
  notifyPatient: true,
  statusSetBy: 'manual',
  ...overrides,
});

// Clears fixture state and reseeds. Called once at the start of each top-level test()
// block (not via a global beforeEach, which would also fire before every nested t.test()).
// `extra(db)` adds block-specific fixtures in the same rules-disabled context: a second
// withSecurityRulesDisabled call after the block's authenticated reads can fail with
// "Firestore has already been started".
async function seed(extra) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/caretakerA-uid'), { role: 'caretaker', fullName: 'A' });
    await setDoc(doc(db, 'users/caretakerB-uid'), { role: 'caretaker', fullName: 'B' });
    await setDoc(doc(db, 'users/impersonator-uid'), { role: 'admin', canImpersonate: true });

    await setDoc(doc(db, 'patients/patientA'), { caretakerId: 'caretakerA-uid', fullName: 'Patient A' });
    await setDoc(doc(db, 'patients/patientB'), { caretakerId: 'caretakerB-uid', fullName: 'Patient B' });

    // An existing appointment of caretakerA, including the functions-owned 'invite' field.
    await setDoc(doc(db, 'appointments/apptA'), {
      ...newBooking(),
      invite: { sequence: 0, lastSentStatus: 'booked' },
    });

    // Block-specific fixtures, after the base ones so they can extend them
    if (extra) await extra(db);
  });
}

const dbAs = (uid) => testEnv.authenticatedContext(uid).firestore();

test('firestore.rules: appointments create', async (t) => {
  await seed();

  await t.test('1. a caretaker can create a booked appointment for their own patient', async () => {
    await assertSucceeds(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new1'), newBooking()));
  });

  await t.test("2a. a caretaker cannot create one for another caretaker's patient", async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new2'), newBooking({ patientId: 'patientB' })));
  });

  await t.test('2b. a caretaker cannot create one with a different caretakerId', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerB-uid'), 'appointments/new3'), newBooking()));
  });

  await t.test('3a. a caretaker cannot create with status other than booked', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new4'), newBooking({ status: 'attended' })));
  });

  await t.test('3b. a caretaker cannot create with source other than booked', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new5'), newBooking({ source: 'walk_in' })));
  });

  await t.test('a caretaker cannot create with an invite field (functions-owned)', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new6'), newBooking({ invite: { sequence: 5 } })));
  });

  await t.test('a caretaker cannot create with end before start', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new7'), newBooking({ start: END, end: START })));
  });

  await t.test('a caretaker cannot create with an unknown field', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'appointments/new8'), newBooking({ diagnosis: 'x' })));
  });
});

test('firestore.rules: appointments read', async (t) => {
  await seed();

  await t.test('4a. a caretaker can read their own appointment', async () => {
    await assertSucceeds(getDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA')));
  });

  await t.test('4b. a caretaker can list their own appointments (filtered by caretakerId)', async () => {
    const db = dbAs('caretakerA-uid');
    await assertSucceeds(getDocs(query(collection(db, 'appointments'), where('caretakerId', '==', 'caretakerA-uid'))));
  });

  await t.test("4c. a caretaker cannot read another caretaker's appointment", async () => {
    await assertFails(getDoc(doc(dbAs('caretakerB-uid'), 'appointments/apptA')));
  });

  await t.test("4d. a caretaker cannot list another caretaker's appointments", async () => {
    const db = dbAs('caretakerB-uid');
    await assertFails(getDocs(query(collection(db, 'appointments'), where('caretakerId', '==', 'caretakerA-uid'))));
  });

  await t.test('4e. a list query without a caretakerId filter is rejected', async () => {
    const db = dbAs('caretakerA-uid');
    await assertFails(getDocs(query(collection(db, 'appointments'), where('patientId', '==', 'patientA'))));
  });

  await t.test('5a. an impersonating user can read and list', async () => {
    const db = dbAs('impersonator-uid');
    await assertSucceeds(getDoc(doc(db, 'appointments/apptA')));
    await assertSucceeds(getDocs(query(collection(db, 'appointments'), where('caretakerId', '==', 'caretakerA-uid'))));
  });
});

test('firestore.rules: appointments update and delete', async (t) => {
  await seed();

  await t.test('5b. an impersonating user cannot update', async () => {
    await assertFails(updateDoc(doc(dbAs('impersonator-uid'), 'appointments/apptA'), { status: 'cancelled' }));
  });

  await t.test('5c. an impersonating user cannot create', async () => {
    await assertFails(setDoc(doc(dbAs('impersonator-uid'), 'appointments/imp1'), newBooking({ caretakerId: 'impersonator-uid' })));
  });

  await t.test('6a. the owner can move an appointment', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), {
      start: at('2026-10-05T10:00:00Z'), end: at('2026-10-05T10:30:00Z'),
    }));
  });

  // Step 6-pre (spec §2, 2026-09-29): Cancelled is the only status set by hand.
  await t.test('6b. the owner cannot set Attended or Missed by hand', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { status: 'attended', statusSetBy: 'manual' }));
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { status: 'missed', statusSetBy: 'manual' }));
  });

  await t.test('6c. the owner can cancel', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), {
      status: 'cancelled', cancelledAt: Timestamp.now(),
    }));
  });

  await t.test('6d. an invalid status value is rejected', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { status: 'deleted' }));
  });

  await t.test('6e. moving to an end before the start is rejected', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), {
      start: at('2026-10-05T10:00:00Z'), end: at('2026-10-05T09:00:00Z'),
    }));
  });

  await t.test('7a. the owner cannot change caretakerId', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { caretakerId: 'caretakerB-uid' }));
  });

  await t.test('7b. the owner cannot change patientId', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { patientId: 'patientB' }));
  });

  await t.test('7c. the owner cannot change invite', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { 'invite.sequence': 9 }));
  });

  await t.test('7d. the owner cannot change source', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA'), { source: 'walk_in' }));
  });

  await t.test("a different caretaker cannot update the appointment", async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerB-uid'), 'appointments/apptA'), { status: 'cancelled' }));
  });

  await t.test('8a. the owner cannot delete an appointment', async () => {
    await assertFails(deleteDoc(doc(dbAs('caretakerA-uid'), 'appointments/apptA')));
  });

  await t.test('8b. an impersonating user cannot delete an appointment', async () => {
    await assertFails(deleteDoc(doc(dbAs('impersonator-uid'), 'appointments/apptA')));
  });
});

test('firestore.rules: unauthenticated access to appointments', async (t) => {
  await seed();
  const anon = testEnv.unauthenticatedContext().firestore();

  await t.test('9a. cannot read', async () => {
    await assertFails(getDoc(doc(anon, 'appointments/apptA')));
  });

  await t.test('9b. cannot create', async () => {
    await assertFails(setDoc(doc(anon, 'appointments/anon1'), newBooking()));
  });

  await t.test('9c. cannot update', async () => {
    await assertFails(updateDoc(doc(anon, 'appointments/apptA'), { status: 'cancelled' }));
  });

  await t.test('9d. cannot delete', async () => {
    await assertFails(deleteDoc(doc(anon, 'appointments/apptA')));
  });
});

test('firestore.rules: missed_check_runs is functions-only (Step 6)', async (t) => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'missed_check_runs/2026-10-04'), { attended: 0, missed: 1 });
  });

  await t.test('a caretaker cannot read a guard document', async () => {
    await assertFails(getDoc(doc(dbAs('caretakerA-uid'), 'missed_check_runs/2026-10-04')));
  });

  await t.test('a caretaker cannot create one (would block that day\'s check)', async () => {
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'missed_check_runs/2026-10-05'), { startedAt: Timestamp.now() }));
  });

  await t.test('an impersonating admin cannot delete one', async () => {
    await assertFails(deleteDoc(doc(dbAs('impersonator-uid'), 'missed_check_runs/2026-10-04')));
  });

  await t.test('an unauthenticated user cannot read one', async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'missed_check_runs/2026-10-04')));
  });
});

test('firestore.rules: walk-in appointments (Step 6)', async (t) => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // As onTreatmentCreated writes it.
    await setDoc(doc(ctx.firestore(), 'appointments/walkin_patientA_3'), {
      ...newBooking(), status: 'attended', source: 'walk_in', treatmentId: 'patientA_3', notifyPatient: false, statusSetBy: 'auto',
    });
  });

  await t.test('the owner cannot change a walk-in status by hand (Step 6-pre)', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/walkin_patientA_3'), { status: 'missed', statusSetBy: 'manual' }));
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/walkin_patientA_3'), { status: 'cancelled', statusSetBy: 'manual' }));
  });

  await t.test('the owner cannot turn a walk-in into a booking', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'appointments/walkin_patientA_3'), { source: 'booked' }));
  });
});

test('firestore.rules: manual status changes (Step 6-pre)', async (t) => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // As the nightly check / attendance trigger leave them.
    const db = ctx.firestore();
    await setDoc(doc(db, 'appointments/missedA'), { ...newBooking(), status: 'missed', statusSetBy: 'auto' });
    await setDoc(doc(db, 'appointments/attendedA'), { ...newBooking(), status: 'attended', treatmentId: 'patientA_2', statusSetBy: 'auto' });
    await setDoc(doc(db, 'appointments/cancelledA'), { ...newBooking(), status: 'cancelled', cancelledAt: Timestamp.now() });
  });
  const owner = dbAs('caretakerA-uid');

  await t.test('the owner cannot set a Missed appointment to Attended or Booked', async () => {
    await assertFails(updateDoc(doc(owner, 'appointments/missedA'), { status: 'attended', statusSetBy: 'manual' }));
    await assertFails(updateDoc(doc(owner, 'appointments/missedA'), { status: 'booked', statusSetBy: 'manual' }));
  });

  await t.test('the owner cannot change an Attended appointment', async () => {
    await assertFails(updateDoc(doc(owner, 'appointments/attendedA'), { status: 'missed', statusSetBy: 'manual' }));
    await assertFails(updateDoc(doc(owner, 'appointments/attendedA'), { status: 'cancelled', statusSetBy: 'manual' }));
  });

  await t.test('the owner cannot un-cancel an appointment', async () => {
    await assertFails(updateDoc(doc(owner, 'appointments/cancelledA'), { status: 'booked', statusSetBy: 'manual' }));
  });

  await t.test('another caretaker cannot mark a Missed appointment as cancelled', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerB-uid'), 'appointments/missedA'), { status: 'cancelled' }));
  });

  await t.test('the owner can mark a Missed appointment as cancelled', async () => {
    await assertSucceeds(updateDoc(doc(owner, 'appointments/missedA'), {
      status: 'cancelled', statusSetBy: 'manual', cancelledAt: Timestamp.now(),
    }));
  });
});

test('firestore.rules: Step 2 and Step 3 regression (appointmentPrefs, appointmentPlan)', async (t) => {
  await seed();

  await t.test('10a. a user can update their own appointmentPrefs', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('caretakerA-uid'), 'users/caretakerA-uid'), {
      appointmentPrefs: { sendInvitesToMe: true, inviteEmail: 'a@example.com', defaultMeetingMinutes: 30 },
    }));
  });

  await t.test('10b. a user cannot change their own role', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'users/caretakerA-uid'), { role: 'superadmin' }));
  });

  await t.test('10c. a user cannot give themselves canImpersonate', async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'users/caretakerA-uid'), { canImpersonate: true }));
  });

  await t.test("10d. a user cannot update another user's appointmentPrefs", async () => {
    await assertFails(updateDoc(doc(dbAs('caretakerB-uid'), 'users/caretakerA-uid'), {
      appointmentPrefs: { sendInvitesToMe: false },
    }));
  });

  await t.test('10e. the caretaker can update appointmentPlan on their own patient', async () => {
    await assertSucceeds(setDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA'), {
      appointmentPlan: { plannedSessions: 10, weeklySlots: [], remindersOn: true, reminderChannel: 'email', preferredLanguage: 'he' },
    }, { merge: true }));
  });

  await t.test("10f. a caretaker cannot update appointmentPlan on another caretaker's patient", async () => {
    await assertFails(setDoc(doc(dbAs('caretakerB-uid'), 'patients/patientA'), {
      appointmentPlan: { plannedSessions: 1 },
    }, { merge: true }));
  });

  await t.test('10g. an impersonating user cannot update a patient appointmentPlan', async () => {
    await assertFails(setDoc(doc(dbAs('impersonator-uid'), 'patients/patientA'), {
      appointmentPlan: { plannedSessions: 1 },
    }, { merge: true }));
  });
});

// Step 15 (decided 2026-09-29): patients are never deleted, by anyone.
test('firestore.rules: patients are never deleted', async (t) => {
  await seed();
  // A patient owned by an admin: "owner" alone must not allow a delete either.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'patients/patientAdmin'), { caretakerId: 'impersonator-uid', fullName: 'Admin Patient' });
  });

  await t.test('15a. the owning caretaker cannot delete their patient', async () => {
    await assertFails(deleteDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
  });

  await t.test('15b. an admin cannot delete their own patient', async () => {
    await assertFails(deleteDoc(doc(dbAs('impersonator-uid'), 'patients/patientAdmin')));
  });

  await t.test("15c. an impersonating admin cannot delete another caretaker's patient", async () => {
    await assertFails(deleteDoc(doc(dbAs('impersonator-uid'), 'patients/patientA')));
  });

  await t.test("15d. a caretaker cannot delete another caretaker's patient", async () => {
    await assertFails(deleteDoc(doc(dbAs('caretakerB-uid'), 'patients/patientA')));
  });

  await t.test('15e. an unauthenticated user cannot delete a patient', async () => {
    await assertFails(deleteDoc(doc(testEnv.unauthenticatedContext().firestore(), 'patients/patientA')));
  });

  await t.test('15f. the owner can still update the patient (e.g. Extend course)', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA'), { 'appointmentPlan.plannedSessions': 12 }));
  });
});

// Registration, roles, plans and User Terms (Functional Spec – Registration, Roles, Plans and
// User Terms §3, §5, §7, §10 tests 3 and 8). role/plan/terms fields and the acceptance history are
// written by Cloud Functions only; a learner, or a user without valid acceptance, reaches no patient data.
test('firestore.rules: roles, plans and User Terms', async (t) => {
  await seed(async (db) => {
    await setDoc(doc(db, 'users/learner-uid'), { role: 'learner', plan: 'free', fullName: 'L' });
    await setDoc(doc(db, 'users/super-uid'), { role: 'superadmin', fullName: 'S' });
    await setDoc(doc(db, 'users/caretakerA-uid/termsAcceptances/acc1'), { version: '1.0', language: 'he', acceptedTimestamp: START });
  });

  await t.test('a learner cannot read a patient or list patients (test 3)', async () => {
    await assertFails(getDoc(doc(dbAs('learner-uid'), 'patients/patientA')));
    await assertFails(getDocs(query(collection(dbAs('learner-uid'), 'patients'), where('caretakerId', '==', 'learner-uid'))));
  });

  await t.test('a learner cannot create a patient', async () => {
    await assertFails(setDoc(doc(dbAs('learner-uid'), 'patients/newL'), { caretakerId: 'learner-uid', fullName: 'X' }));
  });

  await t.test('a learner cannot read or create appointments, treatments or medical data', async () => {
    await assertFails(getDocs(query(collection(dbAs('learner-uid'), 'appointments'), where('caretakerId', '==', 'learner-uid'))));
    await assertFails(getDoc(doc(dbAs('learner-uid'), 'patient_medical_data/patientA')));
    await assertFails(setDoc(doc(dbAs('learner-uid'), 'treatments/t1'), { patientId: 'patientA' }));
  });

  await t.test('a learner can read the Knowledge Base configuration', async () => {
    await assertSucceeds(getDocs(collection(dbAs('learner-uid'), 'cfg_protocols')));
  });

  await t.test('nobody creates a user record from the app (registerUser function only)', async () => {
    await assertFails(setDoc(doc(dbAs('new-uid'), 'users/new-uid'), { role: 'learner' }));
    await assertFails(setDoc(doc(dbAs('new-uid'), 'users/new-uid'), { role: 'caretaker' }));
  });

  await t.test('a user cannot change their own role, plan or User Terms fields', async () => {
    await assertFails(updateDoc(doc(dbAs('learner-uid'), 'users/learner-uid'), { role: 'caretaker' }));
    await assertFails(updateDoc(doc(dbAs('learner-uid'), 'users/learner-uid'), { plan: 'level3' }));
    await assertFails(updateDoc(doc(dbAs('learner-uid'), 'users/learner-uid'), { termsVersion: '1.0' }));
    await assertFails(updateDoc(doc(dbAs('learner-uid'), 'users/learner-uid'), { termsAcceptedTimestamp: START }));
    await assertFails(updateDoc(doc(dbAs('learner-uid'), 'users/learner-uid'), { createdTimestamp: START }));
  });

  await t.test('a user can still edit the rest of their own profile', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('learner-uid'), 'users/learner-uid'), { mobile: '050', updatedTimestamp: START }));
  });

  await t.test('a superadmin cannot change a role or plan from the app (Cloud Functions only)', async () => {
    await assertFails(updateDoc(doc(dbAs('super-uid'), 'users/learner-uid'), { role: 'caretaker' }));
    await assertFails(updateDoc(doc(dbAs('super-uid'), 'users/learner-uid'), { plan: 'level1' }));
  });

  await t.test('a superadmin can still set the impersonation flag', async () => {
    await assertSucceeds(updateDoc(doc(dbAs('super-uid'), 'users/caretakerB-uid'), { canImpersonate: true }));
  });

  await t.test('acceptance records: owner and superadmin read, nobody writes or deletes (test 8)', async () => {
    const accPath = 'users/caretakerA-uid/termsAcceptances/acc1';
    await assertSucceeds(getDoc(doc(dbAs('caretakerA-uid'), accPath)));
    await assertSucceeds(getDoc(doc(dbAs('super-uid'), accPath)));
    await assertFails(getDoc(doc(dbAs('caretakerB-uid'), accPath)));
    await assertFails(setDoc(doc(dbAs('caretakerA-uid'), 'users/caretakerA-uid/termsAcceptances/acc2'), { version: '9' }));
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), accPath), { version: '9' }));
    await assertFails(deleteDoc(doc(dbAs('super-uid'), accPath)));
  });

  await t.test('cfg_app_config/userTerms: everyone reads, nobody writes from the app', async () => {
    await assertSucceeds(getDoc(doc(dbAs('learner-uid'), 'cfg_app_config/userTerms')));
    await assertFails(setDoc(doc(dbAs('super-uid'), 'cfg_app_config/userTerms'), { currentVersion: '1.0' }));
    await assertFails(setDoc(doc(dbAs('impersonator-uid'), 'cfg_app_config/userTerms'), { currentVersion: '1.0' }));
  });

  await t.test('other cfg_app_config documents stay admin-writable', async () => {
    await assertSucceeds(setDoc(doc(dbAs('impersonator-uid'), 'cfg_app_config/main'), { x: 1 }, { merge: true }));
  });
});

test('firestore.rules: no User Terms published yet — existing users keep working (spec §5)', async (t) => {
  await seed();

  await t.test('no userTerms document: existing caretakers keep working', async () => {
    await assertSucceeds(getDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
  });
});

test('firestore.rules: userTerms without currentVersion — check not applied (spec §5)', async (t) => {
  await seed(async (db) => {
    await setDoc(doc(db, 'cfg_app_config/userTerms'), { versions: {} });
  });

  await t.test('userTerms without currentVersion: the check is not applied', async () => {
    await assertSucceeds(getDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
  });
});

test('firestore.rules: valid User Terms acceptance gates patient data (spec §5)', async (t) => {
  await seed(async (db) => {
    await setDoc(doc(db, 'cfg_app_config/userTerms'), {
      currentVersion: '1.0',
      versions: { '1.0': { status: 'published', files: {} } },
    });
    // caretakerB has accepted 1.0; caretakerA has not
    await setDoc(doc(db, 'users/caretakerB-uid'), { termsVersion: '1.0' }, { merge: true });
  });

  await t.test('a caretaker who has not accepted the current version is refused', async () => {
    await assertFails(getDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
    await assertFails(updateDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA'), { 'appointmentPlan.plannedSessions': 3 }));
    await assertFails(getDocs(query(collection(dbAs('caretakerA-uid'), 'appointments'), where('caretakerId', '==', 'caretakerA-uid'))));
  });

  await t.test('a caretaker who accepted the current version works as before', async () => {
    await assertSucceeds(getDoc(doc(dbAs('caretakerB-uid'), 'patients/patientB')));
  });

  await t.test('without acceptance, the user can still read and edit their own profile', async () => {
    await assertSucceeds(getDoc(doc(dbAs('caretakerA-uid'), 'users/caretakerA-uid')));
    await assertSucceeds(updateDoc(doc(dbAs('caretakerA-uid'), 'users/caretakerA-uid'), { mobile: '052' }));
  });
});

// Grace period (decided 21/11/2026): after a publish, the previous version stays valid for 24 hours;
// the app signs open sessions out at 2 AM local time, always within that window.
test('firestore.rules: previous User Terms version valid during the grace period', async (t) => {
  await seed(async (db) => {
    await setDoc(doc(db, 'cfg_app_config/userTerms'), {
      currentVersion: '2.0',
      previousVersion: '1.0',
      previousValidUntil: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      versions: {},
    });
    // caretakerA accepted the previous version; caretakerB an older one
    await setDoc(doc(db, 'users/caretakerA-uid'), { termsVersion: '1.0' }, { merge: true });
    await setDoc(doc(db, 'users/caretakerB-uid'), { termsVersion: '0.9' }, { merge: true });
  });

  await t.test('a caretaker who accepted the previous version keeps access during the grace period', async () => {
    await assertSucceeds(getDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
    await assertSucceeds(updateDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA'), { 'appointmentPlan.plannedSessions': 3 }));
  });

  await t.test('an older version than the previous one is refused', async () => {
    await assertFails(getDoc(doc(dbAs('caretakerB-uid'), 'patients/patientB')));
  });
});

test('firestore.rules: previous User Terms version refused after the grace period', async (t) => {
  await seed(async (db) => {
    await setDoc(doc(db, 'cfg_app_config/userTerms'), {
      currentVersion: '2.0',
      previousVersion: '1.0',
      previousValidUntil: Timestamp.fromMillis(Date.now() - 60 * 1000),
      versions: {},
    });
    await setDoc(doc(db, 'users/caretakerA-uid'), { termsVersion: '1.0' }, { merge: true });
  });

  await t.test('after the grace period the previous version no longer gives access', async () => {
    await assertFails(getDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
  });
});

test('firestore.rules: first publish gives no grace to users who never accepted', async (t) => {
  await seed(async (db) => {
    // First publish: no earlier version, previousVersion is ''
    await setDoc(doc(db, 'cfg_app_config/userTerms'), {
      currentVersion: '1.0',
      previousVersion: '',
      previousValidUntil: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      versions: {},
    });
  });

  await t.test('a caretaker with no termsVersion is refused even inside the window', async () => {
    await assertFails(getDoc(doc(dbAs('caretakerA-uid'), 'patients/patientA')));
  });
});
