/**
 * Shared helpers for roles, plans and User Terms
 * (docs: Functional Spec – Registration, Roles, Plans and User Terms, §3, §5, §7, §8).
 *
 * - termsValid: a user has valid acceptance when no User Terms version is published yet
 *   (no currentVersion), or when users/{uid}.termsVersion equals currentVersion, or during the
 *   24-hour grace period after a publish, when it equals previousVersion (decided 21/11/2026:
 *   open sessions are signed out at 2 AM local time instead of being interrupted).
 * - requireActive: the guard every patient-data callable runs; refuses (and logs) a caller
 *   whose role is not allowed or whose acceptance is not valid.
 * - writeAudit: activity-log events with user IDs only, no names (no clinical values).
 */

import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

export const CALLABLE_OPTIONS = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" };

export type Role = "learner" | "caretaker" | "admin" | "superadmin";
export const ALL_ROLES: Role[] = ["learner", "caretaker", "admin", "superadmin"];
/** Roles with access to patient data (admin/superadmin keep today's access, decided 19/11/2026). */
export const PATIENT_ROLES: Role[] = ["caretaker", "admin", "superadmin"];

export interface UserTermsFile {
  path: string;
  uploadedTimestamp?: unknown;
}
export interface UserTermsVersion {
  status: "draft" | "published";
  publishedTimestamp?: unknown;
  files?: Record<string, UserTermsFile>;
}
export interface UserTermsConfig {
  currentVersion?: string;
  /** The version that was current before the last publish; still valid until previousValidUntil. */
  previousVersion?: string;
  /** End of the grace period (publish time + 24 hours): open sessions are signed out before it, at 2 AM local time. */
  previousValidUntil?: Timestamp;
  versions?: Record<string, UserTermsVersion>;
}

/**
 * Reads map[key] for a key that comes from a request (a version number, a language code) - own
 * entries only, so a key such as "constructor" or "__proto__" never reaches a built-in property.
 * Uses a Map of the object's own entries instead of map[key] (SAST: security/detect-object-injection).
 * @param {Record<string, T> | undefined | null} map The object, e.g. cfg.versions or a version's files.
 * @param {string} key The key from the request.
 * @return {T | undefined} The value, or undefined when the object has no such own key.
 */
export function ownValue<T>(map: Record<string, T> | undefined | null, key: string): T | undefined {
  return map ? new Map(Object.entries(map)).get(key) : undefined;
}

/** Grace period after a publish: users who accepted the previous version keep access this long. */
export const TERMS_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Reads cfg_app_config/userTerms.
 * @return {Promise<UserTermsConfig>} The config, or {} when it does not exist.
 */
export async function getUserTermsConfig(): Promise<UserTermsConfig> {
  const snap = await getFirestore().collection("cfg_app_config").doc("userTerms").get();
  return (snap.exists ? snap.data() : {}) as UserTermsConfig;
}

/**
 * Valid acceptance rule (spec §5).
 * @param {Record<string, unknown>} user The user document data.
 * @param {UserTermsConfig} cfg The User Terms config.
 * @return {boolean} True when the user may use the app.
 */
export function termsValid(user: Record<string, unknown>, cfg: UserTermsConfig): boolean {
  if (!cfg.currentVersion) return true;
  if (user.termsVersion === cfg.currentVersion) return true;
  // Grace period: sessions open before a publish keep working until they are signed out at 2 AM
  return !!cfg.previousVersion && user.termsVersion === cfg.previousVersion &&
    !!cfg.previousValidUntil && Date.now() < cfg.previousValidUntil.toMillis();
}

export type AuditAction =
  | "register" | "notifyEmailSent" | "notifyEmailFailed"
  | "termsAccepted" | "termsDeclined" | "termsUploaded" | "termsPublished"
  | "roleChanged" | "demotionBlocked" | "accessRefused";

/**
 * Writes an activity-log event. Users are stored by ID only (no names): the Activity Log
 * viewer resolves names when it displays a record. entityName is kept only for entities that
 * are not people (a User Terms version, a function name). No clinical values.
 * A failure is logged and never thrown, so it cannot break the action.
 * @param {object} e The event.
 * @return {Promise<void>} Resolves when written (or failed and logged).
 */
export async function writeAudit(e: {
  actorId: string;
  actorRole?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  detail?: string;
}): Promise<void> {
  try {
    const entityName = e.entityType === "user" ? "" : e.entityId;
    await getFirestore().collection("app_audit_log").add({
      timestamp: FieldValue.serverTimestamp(),
      userId: e.actorId,
      userRole: e.actorRole || "",
      category: "user",
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      entityName,
      detail: e.detail || "",
    });
  } catch (err) {
    logger.error("Audit log write failed", { action: e.action, err });
  }
}

/**
 * Guard for callables: the caller must be signed in, have a user document, have one of
 * `roles`, and have valid User Terms acceptance. A refusal is written to the activity log.
 * @param {CallableRequest} request The callable request.
 * @param {Role[]} roles Allowed roles.
 * @param {string} functionName For the activity log.
 * @return {Promise<{uid: string, user: Record<string, unknown>}>} The caller.
 */
export async function requireActive(
  request: CallableRequest,
  roles: Role[],
  functionName: string,
): Promise<{ uid: string; user: Record<string, unknown> }> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  const uid = request.auth.uid;
  const [userSnap, cfg] = await Promise.all([
    getFirestore().collection("users").doc(uid).get(),
    getUserTermsConfig(),
  ]);
  const user = userSnap.data();
  if (!user) {
    await writeAudit({ actorId: uid, action: "accessRefused", entityType: "function", entityId: functionName, detail: "no user record" });
    throw new HttpsError("permission-denied", "User record not found.");
  }
  const actorRole = String(user.role || "");
  if (!roles.includes(user.role as Role)) {
    await writeAudit({ actorId: uid, actorRole, action: "accessRefused", entityType: "function", entityId: functionName, detail: "role" });
    throw new HttpsError("permission-denied", "Your role does not allow this action.");
  }
  if (!termsValid(user, cfg)) {
    await writeAudit({ actorId: uid, actorRole, action: "accessRefused", entityType: "function", entityId: functionName, detail: "terms not accepted" });
    throw new HttpsError("permission-denied", "The current User Terms have not been accepted.");
  }
  return { uid, user };
}

/**
 * Escapes a value for HTML text.
 * @param {string} value Raw value.
 * @return {string} HTML-safe value.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
