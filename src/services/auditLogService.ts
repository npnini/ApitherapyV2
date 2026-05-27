import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { AppUser } from '../types/user';

export interface AuditEntry {
  category: 'patient' | 'patientIntake' | 'config';
  action: 'create' | 'update' | 'view' | 'delete';
  entityType: string;
  entityId: string;
  entityName: string;
  detail?: string;
}

interface MinimalUser {
  uid: string;
  displayName?: string | null;
}

export function logAction(user: AppUser | MinimalUser, entry: AuditEntry): void {
  const appUser = user as AppUser;
  const logData = {
    timestamp: serverTimestamp(),
    userId: user.uid,
    userName: appUser.fullName || user.displayName || 'Unknown',
    userRole: appUser.role || 'caretaker',
    category: entry.category,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityName: entry.entityName,
    detail: entry.detail || '',
  };

  if (appUser.role) {
    addDoc(collection(db, 'app_audit_log'), logData).catch((err) => {
      console.error('Audit log write failed:', err);
    });
  } else {
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        logData.userName = data.fullName || logData.userName;
        logData.userRole = data.role || 'caretaker';
      }
      addDoc(collection(db, 'app_audit_log'), logData).catch((err) => {
        console.error('Audit log write failed:', err);
      });
    }).catch((err) => {
      console.error('Audit log user lookup failed:', err);
    });
  }
}
