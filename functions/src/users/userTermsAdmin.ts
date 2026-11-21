/**
 * User Terms document management (spec §4). Superadmin only.
 *
 * - saveUserTermsFile: records an uploaded PDF for a version and language. A new version
 *   starts as draft. A published version can never be changed (acceptance records point to it).
 * - publishUserTerms: allowed only when the version has a file in every supported language.
 *   Sets status, publishedTimestamp and currentVersion; every user must then accept it (F7).
 *
 * The file itself is uploaded by the app to App_config/user_documents/ (storage rules: superadmin
 * may only create new files there, never replace or delete).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { CALLABLE_OPTIONS, TERMS_GRACE_MS, UserTermsConfig, requireActive, writeAudit } from "./access.js";

const USER_DOCUMENTS_PREFIX = "App_config/user_documents/";
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,19}$/;

/**
 * Reads the supported languages from cfg_app_config/main.
 * @return {Promise<string[]>} Language codes.
 */
async function getSupportedLanguages(): Promise<string[]> {
  const snap = await getFirestore().collection("cfg_app_config").doc("main").get();
  const langs = snap.data()?.languageSettings?.supportedLanguages;
  return Array.isArray(langs) && langs.length ? langs.map(String) : ["en", "he"];
}

export const saveUserTermsFile = onCall(CALLABLE_OPTIONS, async (request) => {
  const { uid } = await requireActive(request, ["superadmin"], "saveUserTermsFile");
  const version = String(request.data?.version || "").trim();
  const language = String(request.data?.language || "");
  const path = String(request.data?.path || "");

  if (!VERSION_PATTERN.test(version)) {
    throw new HttpsError("invalid-argument", "Invalid version number.");
  }
  const languages = await getSupportedLanguages();
  if (!languages.includes(language)) {
    throw new HttpsError("invalid-argument", `Unsupported language: ${language}.`);
  }
  if (!path.startsWith(USER_DOCUMENTS_PREFIX) || path.includes("..") || !path.toLowerCase().endsWith(".pdf")) {
    throw new HttpsError("invalid-argument", "The file must be a PDF under App_config/user_documents/.");
  }

  const db = getFirestore();
  const cfgRef = db.collection("cfg_app_config").doc("userTerms");
  await db.runTransaction(async (tx) => {
    const cfg = ((await tx.get(cfgRef)).data() || {}) as UserTermsConfig;
    const existing = cfg.versions?.[version];
    if (existing?.status === "published") {
      throw new HttpsError("failed-precondition", "This version is published and cannot be changed.");
    }
    tx.set(cfgRef, {
      versions: {
        [version]: {
          status: "draft",
          files: { [language]: { path, uploadedTimestamp: FieldValue.serverTimestamp() } },
        },
      },
    }, { merge: true });
  });

  await writeAudit({
    actorId: uid, actorRole: "superadmin", action: "termsUploaded",
    entityType: "userTerms", entityId: version, detail: `language ${language}`,
  });
  return { success: true };
});

export const publishUserTerms = onCall(CALLABLE_OPTIONS, async (request) => {
  const { uid } = await requireActive(request, ["superadmin"], "publishUserTerms");
  const version = String(request.data?.version || "").trim();
  if (!version) {
    throw new HttpsError("invalid-argument", "Missing version.");
  }
  const languages = await getSupportedLanguages();

  const db = getFirestore();
  const cfgRef = db.collection("cfg_app_config").doc("userTerms");
  await db.runTransaction(async (tx) => {
    const cfg = ((await tx.get(cfgRef)).data() || {}) as UserTermsConfig;
    const v = cfg.versions?.[version];
    if (!v) {
      throw new HttpsError("not-found", "Version not found.");
    }
    if (v.status === "published") {
      throw new HttpsError("failed-precondition", "This version is already published.");
    }
    const missing = languages.filter((l) => !v.files?.[l]?.path);
    if (missing.length) {
      throw new HttpsError("failed-precondition", `A file is missing for: ${missing.join(", ")}.`);
    }
    // Grace period: users who accepted the version current until now keep access for 24 hours.
    // The app signs every open session out at the first 2 AM (local time) after the publish, which is
    // always within those 24 hours, so nobody is interrupted during a treatment. With no earlier
    // version (first publish), there is no grace: only acceptance of this version is valid.
    const previousVersion = cfg.currentVersion || "";
    const previousValidUntil = Timestamp.fromMillis(Date.now() + TERMS_GRACE_MS);
    // FieldPath, not a dotted string: version numbers such as "1.0" contain dots
    tx.update(cfgRef,
      new FieldPath("versions", version, "status"), "published",
      new FieldPath("versions", version, "publishedTimestamp"), FieldValue.serverTimestamp(),
      "currentVersion", version,
      "previousVersion", previousVersion,
      "previousValidUntil", previousValidUntil,
    );
  });

  await writeAudit({ actorId: uid, actorRole: "superadmin", action: "termsPublished", entityType: "userTerms", entityId: version });
  return { success: true };
});
