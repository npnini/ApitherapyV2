// src/utils/appointments/clashes.ts
//
// Warnings the app gives before booking or moving (spec principle 6): overlaps with the
// caretaker's other app appointments, and times outside working hours. Clashes with the
// caretaker's private calendar are the caretaker's responsibility (principle 5).

import { Appointment } from '../../types/appointments';

/** Non-cancelled appointments overlapping [start, end), excluding `excludeId` (the one being moved). */
export const findOverlaps = (start: Date, end: Date, appointments: Appointment[], excludeId?: string): Appointment[] =>
    appointments.filter(a =>
        a.id !== excludeId &&
        a.status !== 'cancelled' &&
        a.start < end && start < a.end
    );
