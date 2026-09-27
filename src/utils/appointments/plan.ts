// src/utils/appointments/plan.ts
//
// A patient's treatment plan and reminder preferences (patients/{id}.appointmentPlan).
// Readers must go through getEffectiveAppointmentPlan: patients created before the
// feature have no plan until it is first saved.

import { AppointmentPlan, ReminderChannel } from '../../types/appointments';
import { getAppointmentSettings } from './prefs';

export const MAX_PLANNED_SESSIONS = 200;

/** Spec order: WhatsApp, SMS, Email. */
const CHANNEL_ORDER: ReminderChannel[] = ['whatsapp', 'sms', 'email'];

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    email: 'Email',
};

export interface ReminderChannelOption {
    channel: ReminderChannel;
    /** Possible for this patient (has the needed contact detail). */
    available: boolean;
    /** English source text shown when not available. */
    hint?: string;
}

type PatientContact = { email?: string; mobile?: string };

/** Channels enabled in app settings, each marked available or not for this patient. */
export const getReminderChannelOptions = (appConfig: any, patient: PatientContact): ReminderChannelOption[] => {
    const enabled = getAppointmentSettings(appConfig).reminderChannels;
    const hasEmail = !!patient.email?.trim();
    const hasMobile = !!patient.mobile?.trim();
    return CHANNEL_ORDER.filter(c => enabled[c]).map(channel => {
        if (channel === 'email') {
            return hasEmail ? { channel, available: true } : { channel, available: false, hint: 'Add an email address to use Email' };
        }
        const hint = channel === 'whatsapp' ? 'Add a mobile number to use WhatsApp' : 'Add a mobile number to use SMS';
        return hasMobile ? { channel, available: true } : { channel, available: false, hint };
    });
};

/** The patient's plan; missing fields fall back to the app defaults. */
export const getEffectiveAppointmentPlan = (
    patient: PatientContact & { appointmentPlan?: Partial<AppointmentPlan> },
    appConfig: any,
    fallbackLanguage: string
): AppointmentPlan => {
    const settings = getAppointmentSettings(appConfig);
    const p: Partial<AppointmentPlan> = patient.appointmentPlan || {};
    const firstAvailable = getReminderChannelOptions(appConfig, patient).find(o => o.available)?.channel ?? null;
    return {
        plannedSessions: typeof p.plannedSessions === 'number' ? p.plannedSessions : null,
        weeklySlots: Array.isArray(p.weeklySlots) ? p.weeklySlots : [],
        remindersOn: typeof p.remindersOn === 'boolean' ? p.remindersOn : settings.patientRemindersDefault,
        reminderChannel: p.reminderChannel !== undefined ? p.reminderChannel : firstAvailable,
        preferredLanguage: p.preferredLanguage || fallbackLanguage,
    };
};

export interface AppointmentPlanErrors {
    plannedSessions?: string;
    weeklySlots?: string;
    reminderChannel?: string;
}

/**
 * English source-text messages per field; empty object when the plan is valid.
 * sessionsDone = treatments already recorded (null while unknown): planned may not be fewer.
 */
export const validateAppointmentPlan = (plan: AppointmentPlan, channelOptions: ReminderChannelOption[], sessionsDone: number | null): AppointmentPlanErrors => {
    const errors: AppointmentPlanErrors = {};
    const n = plan.plannedSessions;
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= MAX_PLANNED_SESSIONS)) {
        errors.plannedSessions = `Planned sessions must be a whole number between 1 and ${MAX_PLANNED_SESSIONS}`;
    } else if (n !== null && sessionsDone !== null && n < sessionsDone) {
        errors.plannedSessions = 'Planned sessions cannot be fewer than the treatments already recorded';
    }
    const slotKeys = plan.weeklySlots.map(s => `${s.weekday}-${s.time}`);
    if (plan.weeklySlots.some(s => !s.time)) {
        errors.weeklySlots = 'Every weekly slot needs a time';
    } else if (new Set(slotKeys).size !== slotKeys.length) {
        errors.weeklySlots = 'The same weekly slot appears twice';
    }
    const availableChannels = channelOptions.filter(o => o.available).map(o => o.channel);
    if (plan.remindersOn && availableChannels.length > 0
        && !(plan.reminderChannel && availableChannels.includes(plan.reminderChannel))) {
        errors.reminderChannel = 'Choose an available reminder channel';
    }
    return errors;
};
