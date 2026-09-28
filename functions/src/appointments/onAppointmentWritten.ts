/**
 * onAppointmentWritten — sends calendar invitation emails (plan §1.2, spec §12).
 *
 * Idempotent: it sends only when (start, end, status) differs from what the
 * `invite` bookkeeping says was last sent, then records the new state. Its own
 * write-back, retries and unrelated field changes therefore send nothing.
 *   - booked, never sent / time changed / re-booked  → METHOD:REQUEST (SEQUENCE+1)
 *   - cancelled after an invitation was sent         → METHOD:CANCEL  (SEQUENCE+1)
 *   - attended / missed / walk-in                    → nothing
 * One email per recipient (titles and languages differ): the patient when
 * notifyPatient is on and they have an email; the caretaker when "send
 * invitations to me" is on. The client never sends email.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
// Modular imports: `admin.firestore.FieldValue` / `.Timestamp` are undefined when reached
// through `import * as admin` from this module (firebase-admin 13), which crashed the
// write-back after the emails were sent.
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { Resend } from "resend";
import { buildIcs, IcsMethod } from "./ics.js";
import { caretakerEmail, EmailContent, formatWhen, InviteKind, patientEmail, toLang } from "./emails.js";
import { getAppointmentSettings, getEffectiveAppointmentPrefs, patientNameAtLevel } from "./prefs.js";

interface Recipient {
  role: "patient" | "caretaker";
  email: string;
  name: string;
  content: EmailContent;
}

const sameInstant = (a: unknown, b: Timestamp) =>
  a instanceof Timestamp && a.toMillis() === b.toMillis();

export const onAppointmentWritten = onDocumentWritten("appointments/{appointmentId}", async (event) => {
  const afterSnap = event.data?.after;
  if (!afterSnap?.exists) return; // Deletes are not allowed; nothing to send.

  // Decide from the current document, not the event snapshot, so two quick edits
  // processed together don't both send the same SEQUENCE.
  const ref = afterSnap.ref;
  const current = await ref.get();
  const a = current.data();
  if (!a || a.source === "walk_in") return;

  const start = a.start as Timestamp;
  const end = a.end as Timestamp;
  const invite = (a.invite || null) as {
    sequence?: number; lastSentStart?: unknown; lastSentEnd?: unknown; lastSentStatus?: string;
  } | null;

  let method: IcsMethod | null = null;
  let kind: InviteKind = "booked";
  if (a.status === "booked") {
    if (!invite || invite.lastSentStatus !== "booked") {
      method = "REQUEST";
      kind = "booked";
    } else if (!sameInstant(invite.lastSentStart, start) || !sameInstant(invite.lastSentEnd, end)) {
      method = "REQUEST";
      kind = "moved";
    }
  } else if (a.status === "cancelled" && invite?.lastSentStatus === "booked") {
    method = "CANCEL";
    kind = "cancelled";
  }
  if (!method) return;

  const sequence = invite ? (invite.sequence ?? 0) + 1 : 0;
  const appointmentId = current.id;
  const db = getFirestore();

  const [configSnap, secretsSnap, caretakerSnap, patientSnap] = await Promise.all([
    db.collection("cfg_app_config").doc("main").get(),
    db.collection("cfg_secrets").doc("main").get(),
    db.collection("users").doc(String(a.caretakerId)).get(),
    db.collection("patients").doc(String(a.patientId)).get(),
  ]);
  const config = configSnap.data() || {};
  const notificationSettings = (config.notificationSettings || {}) as Record<string, unknown>;
  const apiKey = String(secretsSnap.data()?.emailApiKey || "").trim();
  const senderEmail = String(notificationSettings.senderEmail || "").trim() || "noreply@beelive.biz";
  const frontendDomain = String(notificationSettings.frontendDomain || "beelive.biz").trim();
  const caretaker = caretakerSnap.data() || {};
  const patient = patientSnap.data() || {};

  if (!apiKey) {
    logger.error(`Appointment ${appointmentId}: email API key missing in cfg_secrets/main; no invitation sent.`);
    return;
  }

  const settings = getAppointmentSettings(config);
  const prefs = getEffectiveAppointmentPrefs(caretaker, config);
  const caretakerName = String(caretaker.fullName || caretaker.displayName || "");
  const caretakerLang = toLang(caretaker.preferredLanguage);
  const startDate = start.toDate();
  const endDate = end.toDate();
  const recipients: Recipient[] = [];

  // Patient: only when "Notify patient" is on and they have an email.
  const patientEmailAddress = String(patient.email || "").trim();
  if (a.notifyPatient === true && patientEmailAddress) {
    const plan = (patient.appointmentPlan || {}) as Record<string, unknown>;
    const lang = toLang(plan.preferredLanguage || caretaker.preferredLanguage);
    recipients.push({
      role: "patient",
      email: patientEmailAddress,
      name: String(patient.fullName || ""),
      content: patientEmail({
        lang,
        kind,
        appName: settings.appNameInInvites,
        caretakerName,
        caretakerPhone: String(caretaker.mobile || ""),
        address: [caretaker.address, caretaker.city].filter(Boolean).map(String).join(", "),
        when: formatWhen(startDate, endDate, prefs.timezone, lang),
      }),
    });
  }

  // Caretaker: when "Send invitations to me" is on; the patient at the chosen name level.
  if (prefs.sendInvitesToMe && prefs.inviteEmail) {
    recipients.push({
      role: "caretaker",
      email: prefs.inviteEmail,
      name: caretakerName,
      content: caretakerEmail({
        lang: caretakerLang,
        kind,
        appName: settings.appNameInInvites,
        patientLabel: patientNameAtLevel(String(patient.fullName || ""), prefs.patientNameLevel),
        when: formatWhen(startDate, endDate, prefs.timezone, caretakerLang),
        patientLink: `https://${frontendDomain}/?patientId=${encodeURIComponent(String(a.patientId))}`,
      }),
    });
  }

  const resend = new Resend(apiKey);
  let sentCount = 0;
  let failedCount = 0;
  for (const r of recipients) {
    // Separate UID per recipient: if the patient and caretaker share a mailbox
    // (e.g. while testing), their two entries don't overwrite each other.
    const ics = buildIcs({
      uid: `${appointmentId}-${r.role}@apitherapy`,
      sequence,
      method,
      start: startDate,
      end: endDate,
      summary: r.content.summary,
      description: r.content.description,
      location: r.role === "patient" ? [caretaker.address, caretaker.city].filter(Boolean).map(String).join(", ") : undefined,
      organizerEmail: senderEmail,
      organizerName: settings.appNameInInvites,
      attendeeEmail: r.email,
      attendeeName: r.name || r.email,
    });
    const { error } = await resend.emails.send({
      from: `${settings.appNameInInvites} <${senderEmail}>`,
      to: r.email,
      subject: r.content.subject,
      html: r.content.html,
      text: r.content.text,
      attachments: [{
        filename: method === "CANCEL" ? "cancel.ics" : "invite.ics",
        content: Buffer.from(ics, "utf8"),
        contentType: `text/calendar; charset=utf-8; method=${method}`,
      }],
    });
    if (error) {
      failedCount++;
      logger.error(`Appointment ${appointmentId}: ${method} to ${r.role} failed:`, error);
    } else {
      sentCount++;
    }
  }

  // Record what was sent. If every send failed, leave the state unchanged so a later
  // change retries. With no recipients at all, still record it (nothing is owed).
  if (recipients.length > 0 && sentCount === 0) return;
  await ref.update({
    invite: {
      sequence,
      lastSentStart: start,
      lastSentEnd: end,
      lastSentStatus: a.status,
      lastSentAt: FieldValue.serverTimestamp(),
    },
  });
  logger.info(`Appointment ${appointmentId}: ${method} (${kind}) seq ${sequence}, sent ${sentCount}, failed ${failedCount}.`);
});
