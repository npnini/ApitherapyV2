// src/utils/appointments/clashes.ts
//
// Warnings the app gives before booking or moving (spec principle 6): overlaps with the
// caretaker's other app appointments, and times outside working hours. Clashes with the
// caretaker's private calendar are the caretaker's responsibility (principle 5).

import { Appointment, WorkingWeek } from '../../types/appointments';
import { addMinutes, atTime, isOutsideWorkingHours } from './time';

const STEP_MINUTES = 15;
const SEARCH_HOURS = 6;

/** Non-cancelled appointments overlapping [start, end), excluding `excludeId` (the one being moved). */
export const findOverlaps = (start: Date, end: Date, appointments: Appointment[], excludeId?: string): Appointment[] =>
    appointments.filter(a =>
        a.id !== excludeId &&
        a.status !== 'cancelled' &&
        a.start < end && start < a.end
    );

/**
 * Nearest free start on the same day, in 15-minute steps alternating later / earlier
 * (spec §9 "Try 17:00?"). Prefers times inside working hours; falls back to any free time
 * that day. Never returns a time in the past. Null when nothing is free within 6 hours.
 */
export const nearestFreeStart = (
    start: Date, minutes: number, dayAppointments: Appointment[], week: WorkingWeek, now: Date = new Date(), excludeId?: string,
): Date | null => {
    const dayStart = atTime(start, '00:00');
    const dayEnd = addMinutes(dayStart, 24 * 60);
    const candidates: Date[] = [];
    for (let step = 1; step <= (SEARCH_HOURS * 60) / STEP_MINUTES; step++) {
        candidates.push(addMinutes(start, step * STEP_MINUTES), addMinutes(start, -step * STEP_MINUTES));
    }
    const isFree = (c: Date) => {
        const end = addMinutes(c, minutes);
        return c > now && c >= dayStart && end <= dayEnd && findOverlaps(c, end, dayAppointments, excludeId).length === 0;
    };
    return candidates.find(c => isFree(c) && !isOutsideWorkingHours(c, addMinutes(c, minutes), week))
        ?? candidates.find(isFree)
        ?? null;
};
