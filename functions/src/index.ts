import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";
import { randomUUID } from "crypto";
import { BigQuery } from "@google-cloud/bigquery";

setGlobalOptions({ region: "me-west1" });

admin.initializeApp();
const db = admin.firestore();

/**
 * 1. Scheduled Sweeper
 * Runs daily at 5:00 AM to sweep yesterday's treatments, clean up old sessions,
 * and dispatch emails via SendGrid.
 */
export const dailyFeedbackSweeper = onSchedule({ schedule: "0 5 * * *", region: "europe-west1" }, async () => {
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
    const readings = sessionMeasures.map((m: { id: string; type: string; categories?: Record<string, unknown>[] }) => {
      const value = responses[m.id];
      let numericValue: number | undefined = undefined;

      if (m.type === "Category") {
        const category = (m.categories || []).find((cat: Record<string, unknown>) => {
          // Check all languages for match since we don't know which one the patient used exactly
          return Object.values(cat).some((v) => v === value);
        });
        numericValue = (category as { numericValue?: number })?.numericValue;
      } else {
        numericValue = typeof value === "number" ? value : undefined;
      }

      return {
        measureId: m.id,
        type: m.type,
        value: value,
        numericValue: numericValue,
      };
    }).filter((r: { value: unknown }) => r.value !== undefined && r.value !== "");

    const usedMeasureIds = readings.map((r: { measureId: string }) => r.measureId);

    await db.collection("measured_values").doc(readingId).set({
      patientId: patientId,
      treatmentId: treatmentId,
      readings: readings,
      usedMeasureIds: usedMeasureIds, // Added
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

/**
 * 3. Callable: sendDocumentEmail
 * Sends a signed document to a patient via SendGrid.
 */
export const sendDocumentEmail = onCall(async (request) => {
  // Check authentication
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Only authenticated users can send documents."
    );
  }

  const { patientId, documentUrl, language } = request.data;

  if (!patientId || !documentUrl || !language) {
    throw new HttpsError(
      "invalid-argument",
      "Missing required parameters: patientId, documentUrl, or language."
    );
  }

  try {
    // 1. Fetch Config
    const configDoc = await db.collection("cfg_app_config").doc("main").get();
    const configData = configDoc.data() || {};
    const feedbackConfig = configData.feedbackLoop || {};
    const sendDocsConfig = configData.sendPatientDocuments || {};

    const apiKey = (feedbackConfig.sendgridApiKey || "").trim();
    const senderEmail = (feedbackConfig.sendgridSenderEmail || "").trim() || "noreply@apitherapy-system.com";
    const templateId = (sendDocsConfig.templateId?.[language] || "").trim();

    if (!apiKey || !templateId) {
      throw new HttpsError(
        "failed-precondition",
        "SendGrid or Template configuration missing."
      );
    }

    // 2. Fetch Patient Data
    const patientDoc = await db.collection("patients").doc(patientId).get();
    if (!patientDoc.exists) {
      throw new HttpsError("not-found", "Patient not found.");
    }
    const patientData = patientDoc.data() || {};
    const patientEmail = patientData.email;

    if (!patientEmail) {
      throw new HttpsError("failed-precondition", "Patient has no email address.");
    }

    // 3. Fetch Caretaker (Sender) Data
    const caretakerId = request.auth.uid;
    const caretakerDoc = await db.collection("users").doc(caretakerId).get();
    const caretakerData = caretakerDoc.data() || {};
    const caretakerName = caretakerData.fullName || caretakerData.displayName || "Your Caretaker";

    // 4. Send Email
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: patientEmail,
      from: senderEmail,
      templateId: templateId,
      dynamicTemplateData: {
        fullName: patientData.fullName || "Patient",
        caretakerName: caretakerName,
        documentUrl: documentUrl,
      },
    });

    logger.info(`Document email sent to patient ${patientId} by user ${caretakerId}`);
    return { success: true };
  } catch (error) {
    logger.error("Error sending document email:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to send email.");
  }
});

/**
 * 4. BigQuery Sync - Data Exclusion (PII Filter)
 * Target Region: europe-west1 (Belgium)
 * This function serves as a transform hook for the Firestore-to-BigQuery extension.
 */
export const filterPiiTransform = onRequest({ region: "europe-west1" }, (req, res) => {
  const payload = req.body;

  if (!payload || !payload.data) {
    res.status(200).send({ data: [] });
    return;
  }

  // The extension sends data in an array called 'data'
  const transformedData = payload.data.map((record: { insertId: string; json: { data: Record<string, unknown> } }) => {
    // 1. Get the raw Firestore data from the record
    const docData = record.json.data;

    // 2. Define the PII fields to exclude
    const piiFields = [
      "identityNumber",
      "email",
      "mobile",
      "address",
      "fullName",
      "profession",
    ];

    // 3. Remove the sensitive fields
    piiFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(docData, field)) {
        delete docData[field];
      }
    });

    // 4. Return the record with the modified 'data' stringified
    return {
      insertId: record.insertId,
      json: {
        ...record.json,
        data: docData,
      },
    };
  });

  // Send the batch back to the extension
  res.status(200).send({ data: transformedData });
});

/**
 * 5. Data Analysis: Treatment Effectiveness
 * Securely queries the BigQuery view based on user role and drill-down level.
 */
export const getTreatmentEffectiveness = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "User must be authenticated to run analytics."
    );
  }

  const {
    startDate,
    endDate,
    viewLevel,
    caretakerId,
    ageLow,
    ageHigh,
    problemNameEn,
    measureNameEn,
    gender,
    patientId,
  } = request.data;

  if (!startDate || !endDate || !viewLevel) {
    throw new HttpsError(
      "invalid-argument",
      "Missing required parameters: startDate, endDate, viewLevel."
    );
  }

  // Determine user role and data access restriction
  const uid = request.auth.uid;
  const userDoc = await db.collection("users").doc(uid).get();
  const userData = userDoc.data();

  if (!userData) {
    throw new HttpsError("internal", "User data not found.");
  }

  const role = userData.role; // 'admin', 'superadmin', 'caretaker', etc.
  const isAdmin = role === "admin" || role === "superadmin";

  let actualCaretakerId = null;
  if (!isAdmin) {
    // Caretakers can only query their own data
    actualCaretakerId = uid;
  } else if (caretakerId) {
    // Admin is drilling down into a specific caretaker
    actualCaretakerId = caretakerId;
  }

  const bq = new BigQuery();
  let query = "";
  const queryParams: Record<string, unknown> = {
    startDate: startDate,
    endDate: endDate,
  };

  if (actualCaretakerId) queryParams.caretakerId = actualCaretakerId;
  if (ageLow !== undefined) queryParams.ageLow = ageLow;
  if (ageHigh !== undefined) queryParams.ageHigh = ageHigh;
  if (problemNameEn) queryParams.problemNameEn = problemNameEn;
  if (measureNameEn) queryParams.measureNameEn = measureNameEn;
  if (gender) queryParams.gender = gender;
  if (patientId) queryParams.patientId = patientId;

  // Build Filter Clauses
  const filters = [];
  filters.push("(initial_session_start BETWEEN @startDate AND @endDate OR final_session_start BETWEEN @startDate AND @endDate)");

  if (actualCaretakerId) {
    filters.push("(caretaker_id = @caretakerId OR @caretakerId IS NULL)");
  }
  if (ageLow !== undefined && ageHigh !== undefined) {
    filters.push("patient_age BETWEEN @ageLow AND @ageHigh");
  } else if (ageLow !== undefined) {
    filters.push("patient_age >= @ageLow");
  } else if (ageHigh !== undefined) {
    filters.push("patient_age <= @ageHigh");
  }

  if (problemNameEn) filters.push("problem_name_en = @problemNameEn");
  if (measureNameEn) filters.push("measure_name_en = @measureNameEn");
  if (gender) filters.push("patient_gender = @gender");
  if (patientId) filters.push("patient_id = @patientId");

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  switch (viewLevel) {
    case "high-level":
      query = `
      SELECT
        problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness 
      FROM \`apitherapy_clinical_analytics_dev.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4
      ORDER BY problem_name_en ASC, measure_name_en ASC
    `;
      break;

    case "caretaker":
      if (!isAdmin) {
        throw new HttpsError("permission-denied", "Only admins can group by caretaker.");
      }
      query = `
      SELECT
        caretaker_id, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`apitherapy_clinical_analytics_dev.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY problem_name_en ASC, measure_name_en ASC, caretaker_id ASC
    `;
      break;

    case "patient":
      query = `
      SELECT
        patient_id, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        initial_reading, final_reading, effectiveness_value AS effectiveness,
        initial_session_start, final_session_start
      FROM \`apitherapy_clinical_analytics_dev.view_treatment_effectiveness\`
      ${whereClause}
      ORDER BY patient_id ASC, problem_name_en ASC, measure_name_en ASC
    `;
      break;

    case "gender":
      query = `
      SELECT
        patient_gender, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`apitherapy_clinical_analytics_dev.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY problem_name_en ASC, measure_name_en ASC, patient_gender ASC
    `;
      break;

    case "age_group":
      query = `
      SELECT
        CAST(FLOOR(patient_age / 10) * 10 AS STRING) || '-' || CAST(FLOOR(patient_age / 10) * 10 + 9 AS STRING) AS age_group,
        problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`apitherapy_clinical_analytics_dev.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY problem_name_en ASC, measure_name_en ASC, age_group ASC
    `;
      break;

    case "age_group_drilldown":
      // Note: age_group_drilldown is now mostly covered by ageLow/ageHigh logic in the main filters,
      // but we'll keep the specific query structure if needed.
      query = `
      SELECT
        patient_age, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`apitherapy_clinical_analytics_dev.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY problem_name_en ASC, measure_name_en ASC, patient_age ASC
    `;
      break;

    default:
      throw new HttpsError("invalid-argument", "Invalid viewLevel specified.");
  }

  try {
    const options = {
      query: query,
      params: queryParams,
    };
    logger.info("Executing BigQuery query", { query, params: queryParams });
    const [rows] = await bq.query(options);
    return { data: rows };
  } catch (err) {
    logger.error("Error executing BigQuery query:", err);
    throw new HttpsError("internal", "Error fetching analysis data.");
  }
});
