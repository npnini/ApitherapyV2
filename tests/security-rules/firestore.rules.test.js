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
async function seed() {
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
