// src/services/appointmentService.ts
//
// Firestore access for appointments/{id}. Rules (config/firestore/firestore.rules):
// list queries must filter on caretakerId; clients create only status/source 'booked';
// no deletes (cancel sets status 'cancelled'). Invitation emails are sent by a
// Cloud Function trigger from Step 5 on, never from here.

import {
    addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Appointment, AppointmentStatus } from '../types/appointments';

const appointmentsRef = collection(db, 'appointments');

const toDate = (value: any): Date | undefined =>
    value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : undefined;

const fromDoc = (id: string, data: any): Appointment => ({
    id,
    caretakerId: data.caretakerId,
    patientId: data.patientId,
    start: toDate(data.start) as Date,
    end: toDate(data.end) as Date,
    status: data.status,
    source: data.source,
    treatmentId: data.treatmentId,
    notifyPatient: !!data.notifyPatient,
    statusSetBy: data.statusSetBy,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    cancelledAt: toDate(data.cancelledAt),
});

/** Appointments of a caretaker whose start is in [from, to), all statuses, ordered by start. */
export const listByCaretakerRange = async (caretakerId: string, from: Date, to: Date): Promise<Appointment[]> => {
    const q = query(
        appointmentsRef,
        where('caretakerId', '==', caretakerId),
        where('start', '>=', Timestamp.fromDate(from)),
        where('start', '<', Timestamp.fromDate(to)),
        orderBy('start'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => fromDoc(d.id, d.data()));
};

/**
 * All appointments of one patient (all statuses), ordered by start. The caretakerId filter is
 * required by the read rule; pass the patient's caretakerId (also correct under "View As").
 */
export const listByPatient = async (caretakerId: string, patientId: string): Promise<Appointment[]> => {
    const q = query(
        appointmentsRef,
        where('caretakerId', '==', caretakerId),
        where('patientId', '==', patientId),
        orderBy('start'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => fromDoc(d.id, d.data()));
};

export interface NewAppointment {
    caretakerId: string;
    patientId: string;
    start: Date;
    end: Date;
    notifyPatient: boolean;
}

/** Books one appointment. Returns its id. */
export const book = async (a: NewAppointment): Promise<string> => {
    const ref = await addDoc(appointmentsRef, newBookingData(a));
    return ref.id;
};

const newBookingData = (a: NewAppointment) => ({
    caretakerId: a.caretakerId,
    patientId: a.patientId,
    start: Timestamp.fromDate(a.start),
    end: Timestamp.fromDate(a.end),
    status: 'booked',
    source: 'booked',
    notifyPatient: a.notifyPatient,
    statusSetBy: 'manual',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
});

/** Books several appointments in one batch: all are created, or none. Returns their ids. */
export const bookMany = async (list: NewAppointment[]): Promise<string[]> => {
    const batch = writeBatch(db);
    const ids = list.map(a => {
        const ref = doc(appointmentsRef);
        batch.set(ref, newBookingData(a));
        return ref.id;
    });
    await batch.commit();
    return ids;
};

/** Moves (or resizes) an appointment. */
export const move = async (id: string, start: Date, end: Date): Promise<void> => {
    await updateDoc(doc(db, 'appointments', id), {
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        updatedAt: serverTimestamp(),
    });
};

/** Updates the "notify patient" choice. */
export const setNotifyPatient = async (id: string, notifyPatient: boolean): Promise<void> => {
    await updateDoc(doc(db, 'appointments', id), { notifyPatient, updatedAt: serverTimestamp() });
};

/** Cancels an appointment (never deleted). */
export const cancel = async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'appointments', id), {
        status: 'cancelled',
        statusSetBy: 'manual',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
};

/** Sets a status by hand (the caretaker's choice always wins over the automation). */
export const setStatus = async (id: string, status: Exclude<AppointmentStatus, 'cancelled'>): Promise<void> => {
    await updateDoc(doc(db, 'appointments', id), {
        status,
        statusSetBy: 'manual',
        updatedAt: serverTimestamp(),
    });
};
