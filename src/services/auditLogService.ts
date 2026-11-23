import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { AppUser } from '../types/user';

/**
 * Activity log storage rules (decided 21/11/2026):
 * - Users and caretakers are stored by userId only, never by name.
 * - Patients are stored by patientId only; no patient PII (name, ID number, phone...).
 * - Knowledge-base and config items (points, problems, protocols, measures...) may keep their name in entityName.
 * - No clinical values, notes or treatment data in any field, including detail.
 * The Activity Log viewer resolves user and patient names from the IDs when it displays a record.
 */
export interface AuditEntry {
  category: 'patient' | 'patientIntake' | 'config';
  action: 'create' | 'update' | 'view' | 'delete' | 'export';
  entityType: string;
  entityId: string;
  /** Only for knowledge-base / config entities. Dropped for patient-related and user records. */
  entityName?: string;
  /** The patient the record relates to (patient, treatment, document, appointment records). */
  patientId?: string;
  /** No names, clinical values or free text typed by users. */
  detail?: string;
}

interface MinimalUser {
  uid: string;
  displayName?: string | null;
}

/** True when entityName must not be stored: the entity is a patient's data or a user. */
function isPersonalRecord(entry: AuditEntry): boolean {
  return entry.category === 'patient' || entry.category === 'patientIntake' || entry.entityType === 'user';
}

export function logAction(user: AppUser | MinimalUser, entry: AuditEntry): void {
  const appUser = user as AppUser;
  const logData: Record<string, unknown> = {
    timestamp: serverTimestamp(),
    userId: user.uid,
    userRole: appUser.role || 'caretaker',
    category: entry.category,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    // Safety net: even if a caller passes a name for a patient or user record, it is not stored
    entityName: isPersonalRecord(entry) ? '' : (entry.entityName || ''),
    detail: entry.detail || '',
  };
  if (entry.patientId) logData.patientId = entry.patientId;

  if (appUser.role) {
    addDoc(collection(db, 'app_audit_log'), logData).catch((err) => {
      console.error('Audit log write failed:', err);
    });
  } else {
    // Role not known from the caller: read it from the user record
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) {
        logData.userRole = snap.data().role || 'caretaker';
      }
      addDoc(collection(db, 'app_audit_log'), logData).catch((err) => {
        console.error('Audit log write failed:', err);
      });
    }).catch((err) => {
      console.error('Audit log user lookup failed:', err);
    });
  }
}
