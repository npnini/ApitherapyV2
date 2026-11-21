export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt?: any;
  updatedAt?: any;
}

import { AppointmentPrefs } from './appointments';

export interface AppUser {
  uid: string;
  email: string;
  fullName: string;
  displayName: string;
  mobile: string;
  /** learner: Knowledge Base only, until a superadmin promotes them to caretaker. Written by Cloud Functions only. */
  role: 'admin' | 'superadmin' | 'caretaker' | 'learner' | 'patient';
  /** Plan; 'free' for everyone until paid plans exist. Written by Cloud Functions only. */
  plan?: string;
  /** User Terms version accepted most recently. Written by the acceptUserTerms Cloud Function only. */
  termsVersion?: string;
  /** Firestore Timestamp of the most recent User Terms acceptance. */
  termsAcceptedTimestamp?: any;
  preferredLanguage?: string;
  canImpersonate?: boolean;
  address?: string;
  city?: string;
  country?: string;
  /** Missing on users created before the appointments feature; read via getEffectiveAppointmentPrefs. */
  appointmentPrefs?: AppointmentPrefs;
  /** Optional patient-list columns this caretaker shows (see config/patientListFields). Missing = all offered. */
  patientListFields?: string[];
  /** 'sideBySide' = show the treatment history next to the treatment on wide screens. Missing = 'single'. */
  treatmentLayout?: 'single' | 'sideBySide';
  /** 'todayAndPatients' = show the patient list next to today's agenda on wide screens. Missing = 'todayOnly'. */
  homeLayout?: 'todayOnly' | 'todayAndPatients';
  /** Firestore Timestamp. Set when the user doc is created; older users get it from the version-upgrade script (U1). */
  createdTimestamp?: any;
  /** Firestore Timestamp. Set on every save of the user doc. */
  updatedTimestamp?: any;
}