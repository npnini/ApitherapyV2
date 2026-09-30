/**
 * markMissedAppointments — the daily Missed check (plan §1.3, spec §2).
 *
 * A schedule cannot be read from Firestore, so this ticks every 15 minutes and does its work
 * once a day, at the first tick at or after `appointmentSettings.missedCheckTime` (Israel time,
 * default 00:15; user decision 2026-09-28). The day is claimed by creating
 * `missed_check_runs/{yyyy-mm-dd}` first, so overlapping ticks cannot both run it.
 *
 * Every appointment still Booked whose end is before today (only days that have ended, so
 * never while the caretaker can still record the treatment):
 *   - a treatment was recorded for the patient that day → Attended (safety net if the
 *     attendance trigger failed), linked to that treatment;
 *   - otherwise → Missed.
 * Only Booked appointments are touched: a manual status always wins. To re-run on the same
 * day (testing), delete that day's missed_check_runs document.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { DEFAULT_TIMEZONE, getAppointmentSettings } from "./prefs.js";
import { startOfNextZonedDay, startOfZonedDay, zonedDateKey, zonedHHmm } from "./zone.js";

const ALREADY_EXISTS = 6; // gRPC status code
const BATCH_SIZE = 400;

export const markMissedAppointments = onSchedule(
  { schedule: "*/15 * * * *", timeZone: DEFAULT_TIMEZONE, timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const tz = DEFAULT_TIMEZONE;

    const settings = getAppointmentSettings((await db.collection("cfg_app_config").doc("main").get()).data() || {});
    if (zonedHHmm(now, tz) < settings.missedCheckTime) return;

    // Claim today's run; a tick that finds it claimed does nothing.
    const guardRef = db.collection("missed_check_runs").doc(zonedDateKey(now, tz));
    try {
      await guardRef.create({ startedAt: FieldValue.serverTimestamp(), checkTime: settings.missedCheckTime });
    } catch (err) {
      if ((err as { code?: number }).code === ALREADY_EXISTS) return;
      throw err;
    }

    const todayStart = Timestamp.fromDate(startOfZonedDay(now, tz));
    const due = await db.collection("appointments")
      .where("status", "==", "booked")
      .where("end", "<=", todayStart)
      .get();

    // Each patient's treatments, loaded once: [{ id, at }].
    const treatmentsByPatient = new Map<string, { id: string; at: Date }[]>();
    const treatmentsOf = async (patientId: string) => {
      const cached = treatmentsByPatient.get(patientId);
      if (cached) return cached;
      const snap = await db.collection("treatments").where("patientId", "==", patientId).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, created: d.data().createdTimestamp }))
        .filter((t): t is { id: string; created: Timestamp } => t.created instanceof Timestamp)
        .map((t) => ({ id: t.id, at: t.created.toDate() }));
      treatmentsByPatient.set(patientId, list);
      return list;
    };

    let attended = 0;
    let missed = 0;
    let batch = db.batch();
    let pending = 0;
    for (const doc of due.docs) {
      const a = doc.data();
      const start = (a.start as Timestamp).toDate();
      const dayStart = startOfZonedDay(start, tz);
      const dayEnd = startOfNextZonedDay(start, tz);
      const treatment = (await treatmentsOf(String(a.patientId))).find((t) => t.at >= dayStart && t.at < dayEnd);

      batch.update(doc.ref, treatment ?
        { status: "attended", treatmentId: treatment.id, statusSetBy: "auto", updatedAt: FieldValue.serverTimestamp() } :
        { status: "missed", statusSetBy: "auto", updatedAt: FieldValue.serverTimestamp() });
      if (treatment) attended++; else missed++;

      if (++pending === BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();

    await guardRef.update({ finishedAt: FieldValue.serverTimestamp(), attended, missed });
    logger.info(`Missed check ${guardRef.id}: ${missed} marked Missed, ${attended} marked Attended.`);
  },
);
