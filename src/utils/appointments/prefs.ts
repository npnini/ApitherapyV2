// src/utils/appointments/prefs.ts
//
// Effective appointment settings and caretaker prefs. Readers must go through these
// helpers: cfg_app_config/main may have no appointmentSettings yet, and users created
// before the feature have no appointmentPrefs until their first profile save.

import { DEFAULT_APPOINTMENT_SETTINGS, DEFAULT_TIMEZONE } from '../../config/appointmentDefaults';
import { AppointmentPrefs, AppointmentSettings, PatientNameLevel, WeekdayIndex, WorkingWeek } from '../../types/appointments';
import { AppUser } from '../../types/user';

const PATIENT_NAME_LEVELS: PatientNameLevel[] = ['initials', 'first', 'full'];
const WEEKDAYS: WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** Per-day merge, so a stored week with a missing day still yields all 7 days. */
const mergeWorkingWeek = (base: WorkingWeek, override: any): WorkingWeek => {
    const week = {} as WorkingWeek;
    WEEKDAYS.forEach(d => {
        const stored = override?.[d];
        week[d] = stored && typeof stored === 'object' ? { ...base[d], ...stored } : { ...base[d] };
    });
    return week;
};

/** App-wide appointment defaults from cfg_app_config/main, filled in with the built-in defaults. */
export const getAppointmentSettings = (appConfig: any): AppointmentSettings => {
    const stored = appConfig?.appointmentSettings || {};
    const d = DEFAULT_APPOINTMENT_SETTINGS;
    return {
        workingWeek: mergeWorkingWeek(d.workingWeek, stored.workingWeek),
        defaultMeetingMinutes: typeof stored.defaultMeetingMinutes === 'number' ? stored.defaultMeetingMinutes : d.defaultMeetingMinutes,
        patientRemindersDefault: typeof stored.patientRemindersDefault === 'boolean' ? stored.patientRemindersDefault : d.patientRemindersDefault,
        reminderSendTime: typeof stored.reminderSendTime === 'string' ? stored.reminderSendTime : d.reminderSendTime,
        reminderChannels: { ...d.reminderChannels, ...(stored.reminderChannels || {}) },
        appNameInInvites: typeof stored.appNameInInvites === 'string' ? stored.appNameInInvites : d.appNameInInvites,
        patientNameLevel: PATIENT_NAME_LEVELS.includes(stored.patientNameLevel) ? stored.patientNameLevel : d.patientNameLevel,
        startTreatmentLeadMinutes: typeof stored.startTreatmentLeadMinutes === 'number' ? stored.startTreatmentLeadMinutes : d.startTreatmentLeadMinutes,
        missedCheckTime: typeof stored.missedCheckTime === 'string' ? stored.missedCheckTime : d.missedCheckTime,
    };
};

/** A caretaker's prefs; each missing field falls back to the app defaults. */
export const getEffectiveAppointmentPrefs = (user: Pick<AppUser, 'email' | 'appointmentPrefs'>, appConfig: any): AppointmentPrefs => {
    const settings = getAppointmentSettings(appConfig);
    const p: Partial<AppointmentPrefs> = user.appointmentPrefs || {};
    return {
        sendInvitesToMe: typeof p.sendInvitesToMe === 'boolean' ? p.sendInvitesToMe : true,
        inviteEmail: typeof p.inviteEmail === 'string' ? p.inviteEmail : (user.email || ''),
        workingWeek: mergeWorkingWeek(settings.workingWeek, p.workingWeek),
        defaultMeetingMinutes: typeof p.defaultMeetingMinutes === 'number' ? p.defaultMeetingMinutes : settings.defaultMeetingMinutes,
        patientNameLevel: p.patientNameLevel && PATIENT_NAME_LEVELS.includes(p.patientNameLevel) ? p.patientNameLevel : settings.patientNameLevel,
        timezone: p.timezone || DEFAULT_TIMEZONE,
    };
};
