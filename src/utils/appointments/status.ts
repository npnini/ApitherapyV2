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

export const hasStarted = (a: Pick<Appointment, 'start'>, now: Date = new Date()): boolean => a.start <= now;

/** Only future booked appointments can be moved, resized or cancelled. */
export const isChangeable = (a: Pick<Appointment, 'status' | 'start'>, now: Date = new Date()): boolean =>
    a.status === 'booked' && a.start > now;

/**
 * The date / time of a booked appointment can be changed in the editor: future ones, and
 * today's even after their start (a patient running late is moved to a later time today;
 * the editor still only accepts a new start in the future).
 */
export const canReschedule = (a: Pick<Appointment, 'status' | 'start'>, now: Date = new Date()): boolean =>
    a.status === 'booked' && (a.start > now || a.start.toDateString() === now.toDateString());

/**
 * "Mark as cancelled" (spec §2, decided 2026-09-29): the only manual change to an appointment
 * that has started, for a patient who did cancel in advance, so it does not count as missed.
 * Missed ones, and booked ones already past their start (before the nightly check marks them).
 * Past statuses are otherwise never set by hand: Attended always means a recorded treatment.
 */
export const canMarkCancelled = (a: Pick<Appointment, 'status' | 'start'>, now: Date = new Date()): boolean =>
    a.status === 'missed' || (a.status === 'booked' && hasStarted(a, now));
