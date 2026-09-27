// src/types/appointments.ts

/** Day of week, 0 = Sunday … 6 = Saturday (the week starts on Sunday). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Working hours for one weekday. Times are "HH:mm" (24h). */
export interface WorkingDay {
    on: boolean;
    start: string;
    end: string;
}

/** Working hours per weekday. Firestore stores the keys as strings "0".."6". */
export type WorkingWeek = Record<WeekdayIndex, WorkingDay>;

export type PatientNameLevel = 'initials' | 'first' | 'full';

export type ReminderChannel = 'email' | 'whatsapp' | 'sms';

/**
 * A caretaker's own appointment preferences, stored in users/{uid}.appointmentPrefs.
 * Missing on users created before the feature: read them through getEffectiveAppointmentPrefs.
 */
export interface AppointmentPrefs {
    sendInvitesToMe: boolean;
    inviteEmail: string;
    workingWeek: WorkingWeek;
    defaultMeetingMinutes: number;
    patientNameLevel: PatientNameLevel;
    /** IANA time zone, e.g. "Asia/Jerusalem". */
    timezone: string;
}

/**
 * App-wide appointment defaults, stored in cfg_app_config/main.appointmentSettings.
 * They are copied into new caretakers and patients; existing profiles keep their values.
 */
export interface AppointmentSettings {
    workingWeek: WorkingWeek;
    defaultMeetingMinutes: number;
    patientRemindersDefault: boolean;
    /** "HH:mm", in 15-minute steps. */
    reminderSendTime: string;
    reminderChannels: Record<ReminderChannel, boolean>;
    appNameInInvites: string;
    patientNameLevel: PatientNameLevel;
    startTreatmentLeadMinutes: number;
}
