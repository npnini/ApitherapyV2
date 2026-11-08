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
  role: 'admin' | 'superadmin' | 'caretaker' | 'patient';
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
}