import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";
import { randomUUID } from "crypto";

admin.initializeApp();
const db = admin.firestore();

/**
 * 1. Scheduled Sweeper
 * Runs daily at 5:00 AM to sweep yesterday's treatments, clean up old sessions,
 * and dispatch emails via SendGrid.
 */
export const dailyFeedbackSweeper = onSchedule("0 5 * * *", async () => {
  const now = admin.firestore.Timestamp.now();

  // A. Cleanup expired sessions
  const expiredQuery = await db.collection("feedback_sessions").where("expiresAt", "<", now).get();
  if (!expiredQuery.empty) {
    const batch = db.batch();
    expiredQuery.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    logger.info(`Cleaned up ${expiredQuery.size} expired feedback sessions.`);
  }

  // B. Sweeping treatments from yesterday
  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tsStart = admin.firestore.Timestamp.fromDate(yesterdayStart);
  const tsEnd = admin.firestore.Timestamp.fromDate(todayStart);

  const treatmentsSnapshot = await db.collection("treatments")
    .where("createdTimestamp", ">=", tsStart)
    .where("createdTimestamp", "<", tsEnd)
    .get();

  // Fetch Config
  const configDoc = await db.collection("cfg_app_config").doc("main").get();
  const configData = configDoc.data() || {};
  const feedbackConfig = configData.feedbackLoop || {};

  const retentionDays = feedbackConfig.feedbackRetentionDays || 7;
  const apiKey = (feedbackConfig.sendgridApiKey || "").trim();
  const templateIdHe = (feedbackConfig.feedbackEmailTemplateId_he || "").trim();
  const templateIdEn = (feedbackConfig.feedbackEmailTemplateId_en || "").trim();
  const senderEmail = (feedbackConfig.sendgridSenderEmail || "").trim() || "noreply@apitherapy-system.com";
  const defaultLang = configData.languageSettings?.defaultLanguage || "he";

  if (!apiKey || (!templateIdHe && !templateIdEn)) {
    logger.error("SendGrid configuration missing in cfg_app_config/main");
    return;
  }

  sgMail.setApiKey(apiKey);

  const newBatch = db.batch();
  const emailPromises: Promise<unknown>[] = [];
  let processedCount = 0;

  for (const doc of treatmentsSnapshot.docs) {
    const treatment = doc.data();

    // Skip if feedback was already provided
    if (treatment.patientFeedbackMeasureReadingId) continue;

    // Skip if a session already exists to avoid duplicates
    const existingSession = await db.collection("feedback_sessions")
      .where("treatmentId", "==", doc.id)
      .get();

    if (!existingSession.empty) continue;

    const patientId = treatment.patientId;
    const patientDoc = await db.collection("patients").doc(patientId).get();
    const patient = patientDoc.data();

    if (!patient || !patient.email) {
      logger.warn(`Patient ${patientId} has no email. Skipping feedback email.`);
      continue;
    }

    // Determine the caretaker's preferred language
    let preferredLang = defaultLang;
    if (patient.caretakerId) {
      const caretakerDoc = await db.collection("users").doc(patient.caretakerId).get();
      if (caretakerDoc.exists) {
        preferredLang = caretakerDoc.data()?.preferredLanguage || defaultLang;
      }
    }

    // Select the template ID based on language
    const templateId = preferredLang === "en" ?
      (templateIdEn || templateIdHe) :
      (templateIdHe || templateIdEn);

    if (!templateId) {
      logger.warn(`No SendGrid template found for language ${preferredLang}. Skipping email.`);
      continue;
    }

    const sessionId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(retentionDays));

    // Collect unique measure IDs from the patient's medical data treatment plan
    let measureIds: string[] = [];
    const medicalDataDoc = await db.collection("patient_medical_data").doc(patientId).get();
    const medicalData = medicalDataDoc.data();

    if (medicalData?.treatment_plan?.measureIds) {
      measureIds = medicalData.treatment_plan.measureIds;
    }
    measureIds = [...new Set(measureIds)];

    // Fetch the full measure definitions because unauthenticated users
    // cannot read from cfg_measures collection.
    const measuresData: Record<string, unknown>[] = [];
    for (const mId of measureIds) {
      const mDoc = await db.collection("cfg_measures").doc(mId).get();
      if (mDoc.exists) {
        const data = mDoc.data() || {};
        measuresData.push({
          id: mDoc.id,
          name: data.name || {},
          description: data.description || {},
          type: data.type,
          scale: data.scale || null,
          categories: data.categories || null,
        });
      }
    }

    const sessionRef = db.collection("feedback_sessions").doc(sessionId);
    newBatch.set(sessionRef, {
      treatmentId: doc.id,
      patientId: patientId,
      measures: measuresData, // Embedded array of objects
      status: "pending",
      language: preferredLang, // Store the caretaker's preference
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    });

    const frontendDomain = (feedbackConfig.frontendDomain || "beelive.biz").trim();
    const link = `https://${frontendDomain}/feedback/${sessionId}`;

    // Send Email
    const firstName = (patient.fullName || "").split(" ")[0] || "Patient";
    const fullName = patient.fullName || "Patient";

    emailPromises.push(
      sgMail.send({
        to: patient.email,
        from: senderEmail,
        templateId: templateId,
        dynamicTemplateData: {
          patientName: firstName, // Maintain backward compatibility if user uses this
          firstName: firstName, // More explicit
          fullName: fullName, // Full name as requested
          sessionId: sessionId,
          feedbackLink: link,
        },
      }).catch((err) => {
        logger.error(`SendGrid error for patient ${patientId}`, err.response?.body || err);
      })
    );
    processedCount++;
  }

  if (processedCount > 0) {
    await newBatch.commit();
    await Promise.all(emailPromises);
  }

  logger.info(`Feedback sweep complete. Generated sessions for ${processedCount} treatments.`);
});

/**
 * 2. Firestore Trigger
 * Fires when a feedback session is updated. If the status changes to 'completed',
 * it processes the data, saves it to measured_values, and updates the treatment document.
 */
export const onFeedbackSessionComplete = onDocumentUpdated("feedback_sessions/{sessionId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  // Only proceed if transition is exactly pending -> completed
  if (before.status === "pending" && after.status === "completed") {
    const patientId = after.patientId;
    const treatmentId = after.treatmentId;

    // 1. Create a measured_values document
    const timestamp = Date.now();
    const readingId = `${patientId}_${timestamp}`;

    const responses = after.responses || {};
    const sessionMeasures = after.measures || [];

    // Transform map to array of objects as expected by the frontend
    const readings = sessionMeasures.map((m: { id: string, type: string }) => ({
      measureId: m.id,
      type: m.type,
      value: responses[m.id],
    })).filter((r: { value: any }) => r.value !== undefined);

    await db.collection("measured_values").doc(readingId).set({
      patientId: patientId,
      readings: readings,
      note: after.feedbackText || "",
      createdTimestamp: admin.firestore.FieldValue.serverTimestamp(),
      updatedTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. Update the treatment document with the new reference
    await db.collection("treatments").doc(treatmentId).update({
      patientFeedbackMeasureReadingId: readingId,
      patientFeedback: after.feedbackText || "",
      updatedTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Processed completed feedback session: ${event.params.sessionId}`);
  }
});
