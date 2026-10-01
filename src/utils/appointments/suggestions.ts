// src/utils/appointments/suggestions.ts
//
// Suggested rows of the patient's Appointments tab (spec §9) and the weekly-pattern change
// (spec §8). Suggestions are never stored: they are recalculated on every render.

import { Appointment, AppointmentPlan, WeeklySlot } from '../../types/appointments';
import { addMinutes, atTime, toHHmm } from './time';

/** How far ahead to look for pattern slots. */
const HORIZON_DAYS = 400;

export interface Suggestion {
    /** Stable while the inputs are the same (used as the row key). */
    key: string;
    start: Date;
    end: Date;
}

const sortSlots = (slots: WeeklySlot[]) =>
    [...slots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));

/** Booked appointments from today on: they are the upcoming sessions (a due one today included). */
export const upcomingBooked = (appointments: Appointment[], now: Date = new Date()): Appointment[] => {
    const today = atTime(now, '00:00');
    return appointments.filter(a => a.status === 'booked' && a.start >= today).sort((a, b) => +a.start - +b.start);
};

/**
 * Pattern slot starts strictly after `after`, in time order, up to `count` of them.
 * `skip` lets a caller pass over starts it cannot use.
 */
export const nextPatternStarts = (
    slots: WeeklySlot[], after: Date, count: number, skip: (start: Date) => boolean = () => false,
): Date[] => {
    const sorted = sortSlots(slots);
    const result: Date[] = [];
    if (sorted.length === 0 || count <= 0) return result;
    for (let i = 0; i < HORIZON_DAYS && result.length < count; i++) {
        // Built from the calendar date, not by adding 24 h (DST days are 23 or 25 h long).
        const localDay = new Date(after.getFullYear(), after.getMonth(), after.getDate() + i);
        for (const slot of sorted) {
            if (slot.weekday !== localDay.getDay()) continue;
            const start = atTime(localDay, slot.time);
            if (start > after && !skip(start)) {
                result.push(start);
                if (result.length === count) break;
            }
        }
    }
    return result;
};

/**
 * Suggested sessions (spec §9, rule changed 2026-09-29): enough to cover Remaining − Booked,
 * on the weekly pattern's slots from now on, one session per day: a day on which the patient
 * already has a Booked or Attended appointment is skipped. So a booking made off the pattern
 * (e.g. from the Calendar) takes the place of one suggestion without pushing the others later.
 */
export const buildSuggestions = (p: {
    plan: AppointmentPlan;
    /** Treatments recorded (= sessions done, spec §8). */
    sessionsDone: number;
    /** The patient's appointments, all statuses. */
    appointments: Appointment[];
    meetingMinutes: number;
    now?: Date;
}): Suggestion[] => {
    const now = p.now ?? new Date();
    if (p.plan.plannedSessions === null || p.plan.weeklySlots.length === 0) return [];
    const remaining = Math.max(p.plan.plannedSessions - p.sessionsDone, 0);
    const need = remaining - upcomingBooked(p.appointments, now).length;
    if (need <= 0) return [];

    const usedDays = new Set(p.appointments
        .filter(a => a.status === 'booked' || a.status === 'attended')
        .map(a => a.start.toDateString()));
    // Also one suggestion per day, if the pattern has two slots on the same weekday.
    // (nextPatternStarts calls skip once per candidate and takes it when it returns false.)
    const skip = (start: Date) => {
        const day = start.toDateString();
        if (usedDays.has(day)) return true;
        usedDays.add(day);
        return false;
    };

    return nextPatternStarts(p.plan.weeklySlots, now, need, skip).map(start => ({
        key: `${start.getTime()}`,
        start,
        end: addMinutes(start, p.meetingMinutes),
    }));
};

/**
 * "Book next session" after a treatment (spec §11), before the clash check: the first weekly
 * pattern slot after today; with no pattern, the same weekday and time next week (`sessionTime`
 * = today's appointment start or the treatment time, rounded down to the quarter hour).
 */
export const proposeNextSession = (slots: WeeklySlot[], sessionTime: Date, now: Date = new Date()): Date => {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const fromPattern = nextPatternStarts(slots, endOfToday, 1)[0];
    if (fromPattern) return fromPattern;
    const nextWeek = new Date(sessionTime.getFullYear(), sessionTime.getMonth(), sessionTime.getDate() + 7);
    nextWeek.setHours(sessionTime.getHours(), Math.floor(sessionTime.getMinutes() / 15) * 15, 0, 0);
    return nextWeek;
};

/** Future booked appointments whose weekday and time are not a slot of `slots` (spec §8). */
export const offPatternBooked = (appointments: Appointment[], slots: WeeklySlot[], now: Date = new Date()): Appointment[] =>
    appointments
        .filter(a => a.status === 'booked' && a.start > now)
        .filter(a => !slots.some(s => s.weekday === a.start.getDay() && s.time === toHHmm(a.start)))
        .sort((a, b) => +a.start - +b.start);

/** Weekly slots as a comparable string (order-independent). */
export const slotsKey = (slots: WeeklySlot[]): string =>
    sortSlots(slots).map(s => `${s.weekday}-${s.time}`).join('|');
