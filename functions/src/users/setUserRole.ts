/**
 * setUserRole — F4 promotion, F5 demotion, F6 admin roles (spec §6; decided 19/11/2026:
 * only a superadmin changes roles, including learner ↔ caretaker).
 *
 * Rules:
 * - the caller is a superadmin with valid User Terms acceptance;
 * - nobody changes their own role;
 * - a user who owns patients (patients.caretakerId) cannot become a learner;
 * - at least one superadmin must remain.
 * Promotion needs no new acceptance (learners and caretakers accept the same User Terms).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { ALL_ROLES, CALLABLE_OPTIONS, Role, requireActive, writeAudit } from "./access.js";

export const setUserRole = onCall(CALLABLE_OPTIONS, async (request) => {
  const { uid: actorId } = await requireActive(request, ["superadmin"], "setUserRole");

  const targetId = String(request.data?.uid || "");
  const newRole = String(request.data?.role || "") as Role;
  if (!targetId || !ALL_ROLES.includes(newRole)) {
    throw new HttpsError("invalid-argument", "Missing user or invalid role.");
  }
  if (targetId === actorId) {
    throw new HttpsError("failed-precondition", "You cannot change your own role.");
  }

  const db = getFirestore();
  const targetRef = db.collection("users").doc(targetId);

  const oldRole = await db.runTransaction(async (tx) => {
    const targetSnap = await tx.get(targetRef);
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    const current = String(targetSnap.data()?.role || "");
    if (current === newRole) return current;

    if (newRole === "learner") {
      const owned = await tx.get(db.collection("patients").where("caretakerId", "==", targetId).limit(1));
      if (!owned.empty) {
        throw new HttpsError("failed-precondition", "This caretaker has patients and cannot be demoted.");
      }
    }
    if (current === "superadmin") {
      const supers = await tx.get(db.collection("users").where("role", "==", "superadmin"));
      if (supers.size <= 1) {
        throw new HttpsError("failed-precondition", "At least one superadmin must remain.");
      }
    }
    tx.update(targetRef, { role: newRole, updatedTimestamp: FieldValue.serverTimestamp() });
    return current;
  }).catch(async (err) => {
    if (err instanceof HttpsError && err.message.startsWith("This caretaker has patients")) {
      await writeAudit({ actorId, actorRole: "superadmin", action: "demotionBlocked", entityType: "user", entityId: targetId });
    }
    throw err;
  });

  if (oldRole !== newRole) {
    await writeAudit({ actorId, actorRole: "superadmin", action: "roleChanged", entityType: "user", entityId: targetId, detail: `${oldRole} -> ${newRole}` });
  }
  return { success: true, oldRole, role: newRole };
});
