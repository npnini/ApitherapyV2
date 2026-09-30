import { useEffect, useState } from 'react';
import { Appointment } from '../types/appointments';
import * as appointmentService from '../services/appointmentService';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Today's appointments of a caretaker (all statuses), live: used by the Today page and the
 * sidebar badge from one subscription. Switches to the new day at local midnight.
 */
export const useTodayAppointments = (caretakerId: string | undefined) => {
    const [dayStart, setDayStart] = useState(() => startOfDay(new Date()));
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [error, setError] = useState<Error | null>(null);

    // One timer to the next midnight (not a clock tick: this hook lives in App).
    useEffect(() => {
        const next = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
        const timer = setTimeout(() => setDayStart(startOfDay(new Date())), next.getTime() - Date.now() + 1000);
        return () => clearTimeout(timer);
    }, [dayStart]);

    useEffect(() => {
        if (!caretakerId) { setAppointments([]); return; }
        const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
        return appointmentService.watchByCaretakerRange(caretakerId, dayStart, dayEnd,
            list => { setAppointments(list); setError(null); },
            err => { console.error("Loading today's appointments failed:", err); setError(err); });
    }, [caretakerId, dayStart]);

    return { appointments, error };
};
