import { useEffect, useMemo, useState } from 'react';
import { Appointment } from '../types/appointments';
import * as appointmentService from '../services/appointmentService';

/**
 * Each patient's next booked appointment (the first one not yet ended), live: the patient list's
 * "Next meeting" column (spec §10). One subscription for all the caretaker's appointments from
 * the start of today on; a meeting in progress still counts until its end.
 */
export const useNextAppointments = (caretakerId: string | undefined, now: Date): Map<string, Appointment> => {
    const [appointments, setAppointments] = useState<Appointment[]>([]);

    useEffect(() => {
        if (!caretakerId) { setAppointments([]); return; }
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return appointmentService.watchUpcomingByCaretaker(caretakerId, from,
            list => setAppointments(list),
            err => console.error('Loading upcoming appointments failed:', err));
    }, [caretakerId]);

    return useMemo(() => {
        const next = new Map<string, Appointment>();
        // The list is ordered by start, so the first match per patient is the next one.
        for (const a of appointments) {
            if (a.status === 'booked' && a.end > now && !next.has(a.patientId)) next.set(a.patientId, a);
        }
        return next;
    }, [appointments, now]);
};
