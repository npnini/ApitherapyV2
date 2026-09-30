// src/config/appointmentDefaults.ts
//
// Single source of the appointment default values. Used by the app settings schema
// (what the admin sees before saving) and by the prefs helpers (fallback when
// cfg_app_config/main has no appointmentSettings yet).

import { AppointmentSettings, PatientNameLevel } from '../types/appointments';

export const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
    workingWeek: {
        0: { on: true, start: '09:00', end: '17:00' },
        1: { on: true, start: '09:00', end: '17:00' },
        2: { on: true, start: '09:00', end: '17:00' },
        3: { on: true, start: '09:00', end: '17:00' },
        4: { on: true, start: '09:00', end: '17:00' },
        5: { on: false, start: '09:00', end: '17:00' },
        6: { on: false, start: '09:00', end: '17:00' },
    },
    defaultMeetingMinutes: 30,
    patientRemindersDefault: true,
    reminderSendTime: '18:00',
    reminderChannels: { whatsapp: false, sms: false, email: true },
    appNameInInvites: 'Apitherapy',
    patientNameLevel: 'first',
    startTreatmentLeadMinutes: 15,
    missedCheckTime: '00:15',
};

/** Labels are English source text, translated in the UI. */
export const PATIENT_NAME_LEVEL_OPTIONS: { value: PatientNameLevel; label: string }[] = [
    { value: 'initials', label: 'Initials' },
    { value: 'first', label: 'First name' },
    { value: 'full', label: 'Full name' },
];
