/**
 * acceptUserTerms — F3 User Terms acceptance (spec §3, §6).
 *
 * In one transaction: adds a record to users/{uid}/termsAcceptances (history, legal evidence,
 * never changed) and updates termsVersion / termsAcceptedTimestamp on the user document
 * (current status). Only the current published version can be accepted, in a language that
 * has a file in that version.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { CALLABLE_OPTIONS, UserTermsConfig, ownValue, writeAudit } from "./access.js";

export const acceptUserTerms = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  const uid = request.auth.uid;
  const version = String(request.data?.version || "");
  const language = String(request.data?.language || "");
  if (!version || !language) {
    throw new HttpsError("invalid-argument", "Missing version or language.");
  }

  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const cfgRef = db.collection("cfg_app_config").doc("userTerms");

  const role = await db.runTransaction(async (tx) => {
    const [userSnap, cfgSnap] = await Promise.all([tx.get(userRef), tx.get(cfgRef)]);
    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "User record not found.");
    }
    const cfg = (cfgSnap.data() || {}) as UserTermsConfig;
    if (!cfg.currentVersion || cfg.currentVersion !== version) {
      throw new HttpsError("failed-precondition", "This is not the current User Terms version.");
    }
    const versionData = ownValue(cfg.versions, version);
    if (versionData?.status !== "published" || !ownValue(versionData.files, language)?.path) {
      throw new HttpsError("invalid-argument", "No published User Terms file for this language.");
    }
    tx.create(userRef.collection("termsAcceptances").doc(), {
      version,
      language,
      acceptedTimestamp: FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      termsVersion: version,
      termsAcceptedTimestamp: FieldValue.serverTimestamp(),
      updatedTimestamp: FieldValue.serverTimestamp(),
    });
    return String(userSnap.data()?.role || "");
  });

  await writeAudit({ actorId: uid, actorRole: role, action: "termsAccepted", entityType: "userTerms", entityId: version, detail: `language ${language}` });
  return { success: true };
});

/**
 * logUserTermsDeclined — F3 decline. The app signs the user out right after; this only
 * records the event (IDs only), since the activity log is written server-side for users events.
 */
export const logUserTermsDeclined = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  const uid = request.auth.uid;
  const version = String(request.data?.version || "");
  const userSnap = await getFirestore().collection("users").doc(uid).get();
  await writeAudit({
    actorId: uid, actorRole: String(userSnap.data()?.role || ""),
    action: "termsDeclined", entityType: "userTerms", entityId: version || "unknown",
  });
  return { success: true };
});
