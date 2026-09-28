// src/utils/appointments/status.ts
//
// Status names, legend and rules shared by every appointments screen (spec §2).
// Colours live in the components' CSS; each status also carries a text marker so
// colour is never the only signal.

import { Appointment, AppointmentStatus } from '../../types/appointments';

/** English source text, translated in the UI. */
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
    booked: 'Booked',
    attended: 'Attended',
    missed: 'Missed',
    cancelled: 'Cancelled',
};

/** Statuses shown in the calendar legend (cancelled appointments are hidden from the calendar). */
export const CALENDAR_LEGEND_STATUSES: AppointmentStatus[] = ['booked', 'attended', 'missed'];

/** Statuses a caretaker can pick by hand for an appointment that has started. */
export const MANUAL_PAST_STATUSES: Exclude<AppointmentStatus, 'cancelled'>[] = ['booked', 'attended', 'missed'];

/** An appointment has started: its status can be corrected by hand. */
export const hasStarted = (a: Pick<Appointment, 'start'>, now: Date = new Date()): boolean => a.start <= now;

/** Only future booked appointments can be moved, resized or cancelled. */
export const isChangeable = (a: Pick<Appointment, 'status' | 'start'>, now: Date = new Date()): boolean =>
    a.status === 'booked' && a.start > now;
