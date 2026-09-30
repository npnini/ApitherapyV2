// src/services/appointmentService.ts
//
// Firestore access for appointments/{id}. Rules (config/firestore/firestore.rules):
// list queries must filter on caretakerId; clients create only status/source 'booked';
// no deletes (cancel sets status 'cancelled'). Invitation emails are sent by a
// Cloud Function trigger from Step 5 on, never from here.

import {
    addDoc, collection, doc, getDocs, onSnapshot, orderBy, query, QuerySnapshot, serverTimestamp, Timestamp,
    Unsubscribe, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Appointment } from '../types/appointments';
import { TreatmentSession } from '../types/treatmentSession';
import { isTodayLocal } from '../utils/appointments/time';

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

const toList = (snap: QuerySnapshot): Appointment[] => snap.docs.map(d => fromDoc(d.id, d.data()));

const caretakerRangeQuery = (caretakerId: string, from: Date, to: Date) => query(
    appointmentsRef,
    where('caretakerId', '==', caretakerId),
    where('start', '>=', Timestamp.fromDate(from)),
    where('start', '<', Timestamp.fromDate(to)),
    orderBy('start'),
);

/** Appointments of a caretaker whose start is in [from, to), all statuses, ordered by start. */
export const listByCaretakerRange = async (caretakerId: string, from: Date, to: Date): Promise<Appointment[]> =>
    toList(await getDocs(caretakerRangeQuery(caretakerId, from, to)));

/**
 * Live version of listByCaretakerRange (the Calendar week): `onData` gets the list now and
 * after every change, including those written by the Cloud Functions (walk-in, Attended,
 * Missed) or from another browser tab. Returns the function that stops listening.
 */
export const watchByCaretakerRange = (
    caretakerId: string, from: Date, to: Date,
    onData: (list: Appointment[]) => void, onError: (err: Error) => void,
): Unsubscribe => onSnapshot(caretakerRangeQuery(caretakerId, from, to), snap => onData(toList(snap)), onError);

/**
 * All appointments of one patient (all statuses), ordered by start, live (see
 * watchByCaretakerRange). The caretakerId filter is required by the read rule; pass the
 * patient's caretakerId (also correct under "View As").
 */
export const watchByPatient = (
    caretakerId: string, patientId: string,
    onData: (list: Appointment[]) => void, onError: (err: Error) => void,
): Unsubscribe => onSnapshot(query(
    appointmentsRef,
    where('caretakerId', '==', caretakerId),
    where('patientId', '==', patientId),
    orderBy('start'),
), snap => onData(toList(snap)), onError);

/**
 * True when the patient already has a treatment created today (local date): the "start another
 * one?" warning. Reads all the patient's treatments rather than a "latest" one, because
 * treatment ids ("<patient>_<n>") do not sort by number as text.
 */
export const hasTreatmentToday = async (patientId: string): Promise<boolean> =>
    (await listPatientTreatments(patientId)).some(t => isTodayLocal(t.createdTimestamp));

/** All treatments of a patient (any order), with their ids. For session numbers and "View treatment". */
export const listPatientTreatments = async (patientId: string): Promise<TreatmentSession[]> => {
    const snap = await getDocs(query(collection(db, 'treatments'), where('patientId', '==', patientId)));
    return snap.docs.map(d => ({ ...d.data(), id: d.id }) as unknown as TreatmentSession);
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

/**
 * Cancels an appointment (never deleted): a future booked one, or "Mark as cancelled" on one
 * that has started (see canMarkCancelled). The only status a caretaker sets by hand.
 */
export const cancel = async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'appointments', id), {
        status: 'cancelled',
        statusSetBy: 'manual',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
};
