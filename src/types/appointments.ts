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

export type AppointmentStatus = 'booked' | 'attended' | 'missed' | 'cancelled';

export type AppointmentSource = 'booked' | 'walk_in';

/** An appointment in appointments/{id}, with Firestore Timestamps converted to Date. */
export interface Appointment {
    id: string;
    caretakerId: string;
    patientId: string;
    start: Date;
    end: Date;
    status: AppointmentStatus;
    source: AppointmentSource;
    treatmentId?: string;
    /** Send the patient a calendar invitation (used from Step 5). */
    notifyPatient: boolean;
    statusSetBy?: 'auto' | 'manual';
    createdAt?: Date;
    updatedAt?: Date;
    cancelledAt?: Date;
}

/** One slot of a patient's weekly pattern, e.g. Sunday 10:00. */
export interface WeeklySlot {
    weekday: WeekdayIndex;
    /** "HH:mm". */
    time: string;
}

/**
 * A patient's treatment plan and reminder preferences, stored in patients/{id}.appointmentPlan.
 * Missing on patients created before the feature: read it through getEffectiveAppointmentPlan.
 */
export interface AppointmentPlan {
    /** Null until the caretaker sets it. */
    plannedSessions: number | null;
    weeklySlots: WeeklySlot[];
    remindersOn: boolean;
    /** Null when no channel is chosen or none is available for this patient. */
    reminderChannel: ReminderChannel | null;
    /** Language code for invitations and reminders. */
    preferredLanguage: string;
}

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
