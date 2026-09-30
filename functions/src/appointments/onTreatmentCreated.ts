/**
 * onTreatmentCreated — automatic attendance (plan §1.3, spec §2).
 *
 * Fires once when a treatment document is created, i.e. when the caretaker finishes the
 * first page of the treatment flow (decided 2026-09-29), however the treatment was started.
 * In the caretaker's time zone, for that patient and that day:
 *   1. a Booked appointment          → Attended, linked (treatmentId), statusSetBy 'auto';
 *   2. else one the caretaker already marked Attended without a treatment → link it only;
 *   3. else a walk-in: a new Attended appointment at the treatment time (source 'walk_in'),
 *      and +1 to the patient's planned sessions when a plan is set, so the walk-in does not
 *      use up a planned session. A second treatment on the same day also lands here.
 * Idempotent: a treatment already linked is skipped, and the walk-in's document id is
 * derived from the treatment id, so a retried event cannot create a second one.
 * Walk-ins send no invitation (onAppointmentWritten ignores source 'walk_in').
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getEffectiveAppointmentPrefs } from "./prefs.js";
import { startOfNextZonedDay, startOfZonedDay } from "./zone.js";

export const onTreatmentCreated = onDocumentCreated("treatments/{treatmentId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const treatment = snap.data();
  const treatmentId = snap.id;
  const patientId = String(treatment.patientId || "");
  if (!patientId) return;

  const db = getFirestore();
  const appointments = db.collection("appointments");

  // Already handled (a retried event, or linked by the nightly safety net)?
  const linked = await appointments.where("treatmentId", "==", treatmentId).limit(1).get();
  if (!linked.empty) return;

  const patientRef = db.collection("patients").doc(patientId);
  const [patientSnap, configSnap] = await Promise.all([
    patientRef.get(),
    db.collection("cfg_app_config").doc("main").get(),
  ]);
  const patient = patientSnap.data() || {};
  const caretakerId = String(treatment.caretakerId || patient.caretakerId || "");
  if (!caretakerId) {
    logger.warn(`Treatment ${treatmentId}: no caretaker; attendance not recorded.`);
    return;
  }
  const caretaker = (await db.collection("users").doc(caretakerId).get()).data() || {};
  const prefs = getEffectiveAppointmentPrefs(caretaker, configSnap.data() || {});

  const treatedAt = treatment.createdTimestamp instanceof Timestamp ?
    treatment.createdTimestamp.toDate() : new Date(event.time);
  const dayStart = Timestamp.fromDate(startOfZonedDay(treatedAt, prefs.timezone));
  const dayEnd = Timestamp.fromDate(startOfNextZonedDay(treatedAt, prefs.timezone));

  const sameDay = (status: string) => appointments
    .where("patientId", "==", patientId)
    .where("status", "==", status)
    .where("start", ">=", dayStart)
    .where("start", "<", dayEnd)
    .orderBy("start")
    .get();

  // 1. Booked that day → Attended.
  const booked = await sameDay("booked");
  if (!booked.empty) {
    const ref = booked.docs[0].ref;
    const done = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.data()?.status !== "booked") return false; // Changed meanwhile: fall through to a walk-in check.
      tx.update(ref, { status: "attended", treatmentId, statusSetBy: "auto", updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (done) {
      logger.info(`Treatment ${treatmentId}: appointment ${ref.id} marked Attended.`);
      return;
    }
  }

  // 2. Marked Attended by hand, not yet linked to a treatment → link it (no walk-in).
  const attended = await sameDay("attended");
  const unlinked = attended.docs.find((d) => !d.data().treatmentId);
  if (unlinked) {
    await unlinked.ref.update({ treatmentId, updatedAt: FieldValue.serverTimestamp() });
    logger.info(`Treatment ${treatmentId}: linked to manually attended appointment ${unlinked.id}.`);
    return;
  }

  // 3. Walk-in: new Attended appointment + 1 planned session (when a plan is set).
  const walkInRef = appointments.doc(`walkin_${treatmentId}`);
  const created = await db.runTransaction(async (tx) => {
    const [existing, patientNow] = await Promise.all([tx.get(walkInRef), tx.get(patientRef)]);
    if (existing.exists) return false;
    tx.create(walkInRef, {
      caretakerId,
      patientId,
      start: Timestamp.fromDate(treatedAt),
      end: Timestamp.fromDate(new Date(treatedAt.getTime() + prefs.defaultMeetingMinutes * 60_000)),
      status: "attended",
      source: "walk_in",
      treatmentId,
      notifyPatient: false,
      statusSetBy: "auto",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const planned = patientNow.data()?.appointmentPlan?.plannedSessions;
    if (typeof planned === "number") {
      tx.update(patientRef, { "appointmentPlan.plannedSessions": FieldValue.increment(1) });
    }
    return true;
  });
  if (created) logger.info(`Treatment ${treatmentId}: walk-in appointment ${walkInRef.id} created.`);
});
