/**
 * registerUser — F2 first registration (spec §6).
 *
 * Called by the app at sign-in when users/{uid} does not exist. Creates the user record as a
 * learner on the free plan, then emails every admin and superadmin the new user's sign-in email,
 * name (when the sign-in account has one) and sign-up time (no other data). An email failure does not block registration; it is logged.
 * Idempotent: an existing record is returned untouched ({created: false}).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { Resend } from "resend";
import { CALLABLE_OPTIONS, escapeHtml, writeAudit } from "./access.js";

/**
 * Formats a date as dd/mm/yyyy HH:mm in Israel time.
 * @param {Date} d The date.
 * @return {string} Formatted date.
 */
function formatSignUpTime(d: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const part = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

/**
 * Emails every admin and superadmin about a new registration.
 * @param {string} uid New user's ID.
 * @param {string} email New user's sign-in email.
 * @param {string} name New user's name from the sign-in account (may be empty).
 * @param {Date} signUpTime Registration time.
 * @return {Promise<void>} Resolves when done; never throws.
 */
async function notifyAdmins(uid: string, email: string, name: string, signUpTime: Date): Promise<void> {
  const db = getFirestore();
  try {
    const [adminsSnap, configSnap, secretsSnap] = await Promise.all([
      db.collection("users").where("role", "in", ["admin", "superadmin"]).get(),
      db.collection("cfg_app_config").doc("main").get(),
      db.collection("cfg_secrets").doc("main").get(),
    ]);
    const recipients = adminsSnap.docs.map((d) => String(d.data().email || "").trim()).filter(Boolean);
    const apiKey = String(secretsSnap.data()?.emailApiKey || "").trim();
    const configData = configSnap.data() || {};
    const senderEmail = String(configData.notificationSettings?.senderEmail || configData.senderEmail || "noreply@beelive.biz").trim();

    if (!apiKey || recipients.length === 0) {
      const reason = !apiKey ? "email API key missing" : "no admin email addresses";
      logger.warn(`registerUser: admin notification not sent (${reason})`, { uid });
      await writeAudit({ actorId: uid, actorRole: "learner", action: "notifyEmailFailed", entityType: "user", entityId: uid, detail: reason });
      return;
    }

    const when = formatSignUpTime(signUpTime);
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      to: recipients,
      from: senderEmail,
      subject: "New user registration",
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto;">
          <h2 style="color: #2c3e50;">New user registration</h2>
          <p>A new user signed up as a learner.</p>
          <p><strong>Email:</strong> ${escapeHtml(email || "(none)")}<br/>
          ${name ? `<strong>Name:</strong> ${escapeHtml(name)}<br/>` : ""}
          <strong>Sign-up time:</strong> ${escapeHtml(when)}</p>
          <p>To give access to patient features, promote the user to caretaker in User Management.</p>
        </div>`,
    });
    if (result.error) throw new Error(result.error.message);
    await writeAudit({
      actorId: uid, actorRole: "learner", action: "notifyEmailSent",
      entityType: "user", entityId: uid, detail: `${recipients.length} recipient(s)`,
    });
  } catch (err) {
    logger.error("registerUser: admin notification failed", { uid, err });
    await writeAudit({ actorId: uid, actorRole: "learner", action: "notifyEmailFailed", entityType: "user", entityId: uid, detail: "send error" });
  }
}

export const registerUser = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  const uid = request.auth.uid;
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);

  const authUser = await getAuth().getUser(uid);
  const email = authUser.email || "";
  // The sign-in account may have no name (the user enters it later in My Profile)
  const authName = (authUser.displayName || "").trim();
  const name = authName || "New User";

  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (snap.exists) return false;
    tx.set(userRef, {
      email,
      fullName: name,
      displayName: name,
      mobile: "",
      role: "learner",
      plan: "free",
      createdTimestamp: FieldValue.serverTimestamp(),
      updatedTimestamp: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!created) return { created: false };

  await writeAudit({ actorId: uid, actorRole: "learner", action: "register", entityType: "user", entityId: uid });
  await notifyAdmins(uid, email, authName, new Date());
  return { created: true };
});
