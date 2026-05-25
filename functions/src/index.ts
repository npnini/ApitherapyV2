import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Resend } from "resend";
import { randomUUID } from "crypto";
import { BigQuery } from "@google-cloud/bigquery";

import { v1 } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";

// Initialize the external clients right below your imports
const firestoreClient = new v1.FirestoreAdminClient();
const storage = new Storage();

setGlobalOptions({ region: "me-west1", memory: "512MiB" });

admin.initializeApp();
const db = admin.firestore();

// BigQuery Dataset Configuration
const projectId = process.env.GCLOUD_PROJECT;
const BQ_DATASET = process.env.FUNCTIONS_EMULATOR
  ? "apitherapy_clinical_analytics_dev"
  : (projectId === "apitherapy-c94a6"
    ? "apitherapy_clinical_analytics_prod"
    : "apitherapy_clinical_analytics_stage");

/**
 * 1. Scheduled Sweeper
 * Runs daily at 5:00 AM to sweep yesterday's treatments, clean up old sessions,
 * and dispatch emails via SendGrid.
 */
export const dailyFeedbackSweeper = onSchedule({ schedule: "0 5 * * *" }, async () => {
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
    .where("status", "==", "Completed")
    .get();

  // Fetch Config
  const configDoc = await db.collection("cfg_app_config").doc("main").get();
  const configData = configDoc.data() || {};
  const notificationSettings = configData.notificationSettings || {};

  const retentionDays = notificationSettings.feedbackRetentionDays || 7;
  const secretsDoc = await db.collection("cfg_secrets").doc("main").get();
  const apiKey = (secretsDoc.data()?.emailApiKey || "").trim();
  const senderEmail = (notificationSettings.senderEmail || "").trim() || "noreply@beelive.biz";
  const feedbackTemplates = notificationSettings.feedbackTemplateId || {};
  const defaultLang = configData.languageSettings?.defaultLanguage || "he";

  if (!apiKey) {
    logger.error("Email API Key missing in cfg_app_config/main");
    return;
  }

  const resend = new Resend(apiKey);

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
    const templateId = (feedbackTemplates[preferredLang] || feedbackTemplates[defaultLang] || Object.values(feedbackTemplates)[0] || "").trim();

    if (!templateId) {
      logger.warn(`No email template found for language ${preferredLang}. Skipping email.`);
      continue;
    }

    const sessionId = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(retentionDays));

    // Collect unique measure IDs from the problems linked to this treatment
    let measureIds: string[] = [];
    const problemIds = treatment.problemIds || [];

    for (const pId of problemIds) {
      const pDoc = await db.collection("cfg_problems").doc(pId).get();
      if (pDoc.exists) {
        const data = pDoc.data() || {};
        if (data.measureIds && Array.isArray(data.measureIds)) {
          measureIds.push(...data.measureIds);
        }
      }
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

    // Fetch protocol names for the summary
    const protocolNames: string[] = [];
    const protocolIds = treatment.protocolIds || [];
    for (const pId of protocolIds) {
      const pDoc = await db.collection("cfg_protocols").doc(pId).get();
      if (pDoc.exists) {
        const data = pDoc.data() || {};
        protocolNames.push(data.name?.[preferredLang] || data.name?.en || "Unknown Protocol");
      }
    }

    const sessionRef = db.collection("feedback_sessions").doc(sessionId);
    newBatch.set(sessionRef, {
      treatmentId: doc.id,
      patientId: patientId,
      measures: measuresData, // Embedded array of objects
      status: "pending",
      language: preferredLang, // Store the caretaker's preference
      treatmentDate: treatment.createdTimestamp || admin.firestore.FieldValue.serverTimestamp(),
      treatmentSummary: protocolNames.join(", "),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    });

    const frontendDomain = (notificationSettings.frontendDomain || "beelive.biz").trim();
    const link = `https://${frontendDomain}/feedback/${sessionId}`;

    // Send Email
    const firstName = (patient.fullName || "").split(" ")[0] || "Patient";
    const fullName = patient.fullName || "Patient";

    emailPromises.push(
      resend.emails.send({
        to: patient.email,
        from: senderEmail,
        template: {
          id: templateId,
          variables: {
            patientName: firstName, // Maintain backward compatibility if user uses this
            firstName: firstName, // More explicit
            fullName: fullName, // Full name as requested
            sessionId: sessionId,
            feedbackLink: link,
          },
        }
      } as any).catch((err) => {
        logger.error(`Resend error for patient ${patientId}`, err);
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
      return {
        measureId: m.id,
        value: value,
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
export const sendDocumentEmail = onCall({ enforceAppCheck: true }, async (request) => {
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
    // 1. Fetch Patient Data
    const patientDoc = await db.collection("patients").doc(patientId).get();
    if (!patientDoc.exists) {
      throw new HttpsError("not-found", "Patient not found.");
    }
    const patientData = patientDoc.data() || {};

    // 2. Fetch Caretaker (Sender) Data
    const caretakerId = request.auth.uid;
    const caretakerDoc = await db.collection("users").doc(caretakerId).get();
    const caretakerData = caretakerDoc.data() || {};

    // 3. Authorization: only the patient's assigned caretaker may send documents.
    if (patientData.caretakerId !== caretakerId) {
      throw new HttpsError(
        "permission-denied",
        "Only the patient's assigned caretaker can send documents."
      );
    }

    const patientEmail = patientData.email;
    if (!patientEmail) {
      throw new HttpsError("failed-precondition", "Patient has no email address.");
    }

    const caretakerName = caretakerData.fullName || caretakerData.displayName || "Your Caretaker";

    // 4. Fetch Config
    const configDoc = await db.collection("cfg_app_config").doc("main").get();
    const configData = configDoc.data() || {};
    const notificationSettings = configData.notificationSettings || {};

    const secretsDoc = await db.collection("cfg_secrets").doc("main").get();
    const apiKey = (secretsDoc.data()?.emailApiKey || "").trim();
    const senderEmail = (notificationSettings.senderEmail || "").trim();
    const templateId = (notificationSettings.intakeDocumentsTemplateId?.[language] || "").trim();

    if (!apiKey || !templateId) {
      throw new HttpsError(
        "failed-precondition",
        "Email API Key or Template configuration missing."
      );
    }

    // 4. Send Email
    const resend = new Resend(apiKey);
    await resend.emails.send({
      to: patientEmail,
      from: senderEmail,
      template: {
        id: templateId,
        variables: {
          fullName: patientData.fullName || "Patient",
          caretakerName: caretakerName,
          documentUrl: documentUrl,
        },
      }
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
export const filterPiiTransform = onRequest(async (req, res) => {
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
export const getTreatmentEffectiveness = onCall({ enforceAppCheck: true }, async (request) => {
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
    isRtl,
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
  filters.push("treatment_date >= @startDate AND treatment_date < TIMESTAMP_ADD(CAST(@endDate AS TIMESTAMP), INTERVAL 1 DAY)");

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

  // Column names based on language/direction
  const pName = isRtl ? "problem_name_he" : "problem_name_en";
  const mName = isRtl ? "measure_name_he" : "measure_name_en";

  switch (viewLevel) {
    case "high-level":
      query = `
      SELECT
        problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness 
      FROM \`${BQ_DATASET}.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4
      ORDER BY ${pName} ASC, ${mName} ASC
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
      FROM \`${BQ_DATASET}.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY caretaker_id ASC, ${pName} ASC, ${mName} ASC
    `;
      break;

    case "patient":
      query = `
      SELECT
        patient_id, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        pre_value AS initial_reading, post_value AS final_reading, effectiveness_value AS effectiveness,
        pre_recorded_at AS initial_session_start, post_recorded_at AS final_session_start
      FROM \`${BQ_DATASET}.view_treatment_effectiveness\`
      ${whereClause}
      ORDER BY ${pName} ASC, ${mName} ASC, patient_id ASC
    `;
      break;

    case "gender":
      query = `
      SELECT
        patient_gender, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`${BQ_DATASET}.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY ${pName} ASC, ${mName} ASC, patient_gender ASC
    `;
      break;

    case "age_group":
      query = `
      SELECT
        CAST(FLOOR(patient_age / 10) * 10 AS STRING) || '-' || CAST(FLOOR(patient_age / 10) * 10 + 9 AS STRING) AS age_group,
        problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`${BQ_DATASET}.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY ${pName} ASC, ${mName} ASC, age_group ASC
    `;
      break;

    case "age_group_drilldown":
      query = `
      SELECT
        patient_age, problem_name_en, problem_name_he, measure_name_en, measure_name_he,
        AVG(effectiveness_value) AS avg_effectiveness
      FROM \`${BQ_DATASET}.view_treatment_effectiveness\`
      ${whereClause}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY ${pName} ASC, ${mName} ASC, patient_age ASC
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

/**
 * 6. Callable: sendMissingProblemEmail
 * Notifies admin when a caretaker cannot find a specific problem in the system.
 */
export const sendMissingProblemEmail = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { problemName, patientId } = request.data;
  if (!problemName || !patientId) {
    throw new HttpsError("invalid-argument", "Missing problemName or patientId.");
  }

  try {
    // 1. Fetch Patient Data
    const patientDoc = await db.collection("patients").doc(patientId).get();
    if (!patientDoc.exists) {
      throw new HttpsError("not-found", "Patient not found.");
    }
    const patientData = patientDoc.data() || {};

    // 2. Fetch Caretaker (Sender) Data
    const caretakerId = request.auth.uid;
    const caretakerDoc = await db.collection("users").doc(caretakerId).get();
    const caretakerData = caretakerDoc.data() || {};

    // 3. Verify Caretaker Ownership or Admin Access
    const isOwner = patientData.caretakerId === caretakerId;
    const role = caretakerData.role;
    const canImpersonate = caretakerData.canImpersonate === true || role === "superadmin" || role === "admin";

    if (!isOwner && !canImpersonate) {
      throw new HttpsError(
        "permission-denied",
        "Caretaker does not own this patient."
      );
    }

    // 4. Fetch Config & Secrets
    const configDoc = await db.collection("cfg_app_config").doc("main").get();
    const configData = configDoc.data() || {};
    const notificationSettings = configData.notificationSettings || {};
    const secretsDoc = await db.collection("cfg_secrets").doc("main").get();
    const apiKey = (secretsDoc.data()?.emailApiKey || "").trim();
    const senderEmail = (notificationSettings.senderEmail || configData.senderEmail || "noreply@beelive.biz").trim();
    const adminEmail = senderEmail;

    if (!apiKey) {
      throw new HttpsError("failed-precondition", "Email API Key missing.");
    }

    const caretakerName = caretakerData.fullName || caretakerData.displayName || caretakerId;
    const preferredLang = caretakerData.preferredLanguage || configData.languageSettings?.defaultLanguage || "he";

    const addProblemTemplates = notificationSettings.addProblemTemplateId || {};
    const templateId = (addProblemTemplates[preferredLang] || addProblemTemplates["en"] || Object.values(addProblemTemplates)[0] || "").trim();

    const patientName = patientData.fullName || patientId;

    const resend = new Resend(apiKey);

    if (templateId) {
      await resend.emails.send({
        to: adminEmail,
        from: senderEmail,
        template: {
          id: templateId,
          variables: {
            problemName: problemName,
            problemDescription: problemName,
            caretakerName: caretakerName,
            caretakerEmail: caretakerData.email || "N/A",
            caretakerMobile: caretakerData.mobile || "N/A",
            patientName: patientName,
            caretakerId: caretakerId,
            patientId: patientId,
          },
        }
      } as any);
    } else {
      // Fallback to raw HTML if no template is configured
      await resend.emails.send({
        to: adminEmail,
        from: senderEmail,
        subject: `[ACTION REQUIRED] New Problem Report: ${problemName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Missing Problem Reported</h2>
            <p>A caretaker has reported that a required problem or protocol is missing from the system.</p>
            
            <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; background: #f9f9f9; font-weight: bold; width: 30%;">Missing Problem:</td>
                <td style="padding: 10px; background: #f9f9f9;">${problemName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Caretaker:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${caretakerName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Contact Email:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${caretakerData.email || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Contact Mobile:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${caretakerData.mobile || "N/A"}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Patient:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${patientName} (ID: ${patientId})</td>
              </tr>
            </table>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
              <p>This is an automated notification from your Apitherapy Management System.</p>
              <p>Admin Email: ${adminEmail}</p>
            </div>
          </div>
        `,
      });
    }

    logger.info(`Missing problem email sent for "${problemName}" by user ${caretakerId}`);
    return { success: true };
  } catch (error) {
    logger.error("Error sending missing problem email:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to send email.");
  }
});

/**
 * 7. Callable: translateText
 * Proxy for Google Translate API to avoid exposing the Translate API Key on the frontend.
 */
export const translateText = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Only authenticated users can call the translation service."
    );
  }

  const { q, target, source } = request.data;
  if (!q || !target) {
    throw new HttpsError(
      "invalid-argument",
      "Missing query (q) or target language (target)."
    );
  }

  if (!Array.isArray(q)) {
    throw new HttpsError(
      "invalid-argument",
      "Query (q) must be an array of strings."
    );
  }

  try {
    const secretsDoc = await db.collection("cfg_secrets").doc("main").get();
    const apiKey = (secretsDoc.data()?.googleTranslateApiKey || "").trim();

    if (!apiKey) {
      logger.error("Google Translate API Key missing in cfg_secrets/main");
      throw new HttpsError(
        "failed-precondition",
        "Translation API configuration is missing on the server."
      );
    }

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: q,
          target: target,
          source: source || "en",
          format: "text",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Translation API responded with error:", errorText);
      throw new Error(`Translation API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return { data };
  } catch (error: any) {
    logger.error("Error in translateText proxy:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      error.message || "Failed to execute translation proxy."
    );
  }
});

/**
 * Universal Unified Backup Engine
 * Triggered automatically via Cloud Scheduler or manually forced.
 * Adapts dynamically to Staging and Production via environment variables.
 */
export const runDailyUnifiedBackup = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Asia/Jerusalem",
    // region is automatically set to me-west1 by your setGlobalOptions
    timeoutSeconds: 1800, // 30 minutes window for heavy asset transfers
    memory: "512MiB",     // Breathing room to process large file arrays safely
  },
  async (event) => {
    // 1. Dynamic extraction of Project and Bucket coordinates from Environment variables
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    const sourceMediaBucket = process.env.SOURCE_MEDIA_BUCKET;
    const targetBackupBucket = process.env.TARGET_BACKUP_BUCKET;

    // Safety fallback guards
    if (!projectId) {
      logger.error("[Backup System] Failed to resolve Google Cloud Project ID.");
      return;
    }
    if (!targetBackupBucket) {
      logger.error("[Backup System] Missing TARGET_BACKUP_BUCKET configuration.");
      return;
    }

    // 2. Exact Israel Local Time structure calculation (Matches your old Cloud Shell script)
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    };

    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(new Date());

    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const timestampFolder = `${partMap.day}-${partMap.month}-${partMap.year}-${partMap.hour}-${partMap.minute}-${partMap.second}`;

    const baseDirectory = `ScheduledBackup/${timestampFolder}`;

    logger.info(`[Backup System] Starting operation for Project: ${projectId}`);
    logger.info(`[Backup System] Destination Root: gs://${targetBackupBucket}/${baseDirectory}`);

    try {
      // --- PART A: FIRESTORE DATABASE BACKUP ---
      const databaseName = firestoreClient.databasePath(projectId, "(default)");
      const firestoreOutputUri = `gs://${targetBackupBucket}/${baseDirectory}/Firestore`;

      logger.info(`[Backup System] Dispatching Firestore export to: ${firestoreOutputUri}`);

      await firestoreClient.exportDocuments({
        name: databaseName,
        outputUriPrefix: firestoreOutputUri,
        collectionIds: [] // Blank array instructs Firestore to dump all collections
      });

      logger.info("[Backup System] Firestore database export safely dispatched to background manager.");

      // --- PART B: APP STORAGE FILES BACKUP ---
      if (!sourceMediaBucket) {
        logger.warn("[Backup System] SOURCE_MEDIA_BUCKET variable omitted. Skipping Storage file backup step.");
      } else {
        logger.info(`[Backup System] Connecting to source media storage: gs://${sourceMediaBucket}`);
        const [files] = await storage.bucket(sourceMediaBucket).getFiles();

        if (files.length === 0) {
          logger.info("[Backup System] Source bucket is clean. No application media assets to replicate.");
        } else {
          logger.info(`[Backup System] Processing synchronization for ${files.length} binary assets...`);

          const copyPromises = files.map(file => {
            const destFile = storage.bucket(targetBackupBucket).file(`${baseDirectory}/Storage/${file.name}`);
            return file.copy(destFile);
          });

          // Await completion of all multi-threaded object file duplications
          await Promise.all(copyPromises);
          logger.info(`[Backup System] Storage payload synchronization complete. Moved ${files.length} files.`);
        }
      }

      logger.info(`[Backup System] Success: Unified backup workflow complete for ${timestampFolder}`);
    } catch (error) {
      logger.error("[Backup System] Critical environment backup layout execution error:", error);
      throw error;
    }
  }
);