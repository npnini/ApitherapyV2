import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, WeeklySlot } from '../../types/appointments';
import { AppUser } from '../../types/user';
import { T, useT, useTranslationContext } from '../T';
import AppointmentEditor, { PatientOption } from './AppointmentEditor';
import * as appointmentService from '../../services/appointmentService';
import { logAction } from '../../services/auditLogService';
import { findOverlaps, nearestFreeStart } from '../../utils/appointments/clashes';
import { getEffectiveAppointmentPrefs } from '../../utils/appointments/prefs';
import { MAX_PLANNED_SESSIONS } from '../../utils/appointments/plan';
import { proposeNextSession } from '../../utils/appointments/suggestions';
import { addMinutes, atTime, formatDayDateTime, isOutsideWorkingHours } from '../../utils/appointments/time';
import tabStyles from './AppointmentsTab.module.css';
import styles from './BookNextSession.module.css';

interface BookNextSessionProps {
    patient: PatientOption & { caretakerId?: string };
    user: AppUser;
    appConfig: any;
    /** After "Extend course": the new planned sessions, so the intake's copy of the plan stays current. */
    onPlannedSessionsChanged?: (planned: number) => void;
}

type Proposal = {
    start: Date;
    /** The first choice clashed: its start and the other patient's name. */
    clashedStart?: Date;
    clashWith?: string;
    /** The first choice clashed and no free time was found that day. */
    noFreeTime?: boolean;
    outside: boolean;
    fromPattern: boolean;
};

/**
 * "Book next session" inside the "treatment saved" confirmation (spec §11). Shows, in order:
 * the next session if already booked (with Change); "course complete" with Extend course;
 * otherwise a proposed time (next pattern slot after today, or the same time next week), moved
 * to the nearest free time on a clash, with Book / Change / Skip.
 */
const BookNextSession: React.FC<BookNextSessionProps> = ({ patient, user, appConfig, onPlannedSessionsChanged }) => {
    const { language } = useTranslationContext();
    const tFailed = useT('Saving failed. Please try again.');
    const tSessionsToAdd = useT('Sessions to add');
    const caretakerId = patient.caretakerId || user.uid;
    const readOnly = caretakerId !== user.uid;
    const prefs = getEffectiveAppointmentPrefs(user, appConfig);
    const hasEmail = !!patient.email?.trim();

    // The patient's appointments, live: a booking (here or in the editor) shows at once.
    const [appointments, setAppointments] = useState<Appointment[] | null>(null);
    useEffect(() => appointmentService.watchByPatient(caretakerId, patient.id,
        list => setAppointments(list),
        err => console.error('Loading patient appointments failed:', err)), [caretakerId, patient.id]);

    // Treatments done (this one included) and the stored plan, read fresh: a walk-in has
    // already added 1 to planned sessions on the server when the treatment was opened.
    const [sessionsDone, setSessionsDone] = useState<number | null>(null);
    const [planned, setPlanned] = useState<number | null>(null);
    const [slots, setSlots] = useState<WeeklySlot[]>([]);
    const [planLoaded, setPlanLoaded] = useState(false);
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            appointmentService.countPatientTreatments(patient.id),
            getDoc(doc(db, 'patients', patient.id)),
        ]).then(([count, snap]) => {
            if (cancelled) return;
            const plan = snap.data()?.appointmentPlan || {};
            setSessionsDone(count);
            setPlanned(typeof plan.plannedSessions === 'number' ? plan.plannedSessions : null);
            setSlots(Array.isArray(plan.weeklySlots) ? plan.weeklySlots : []);
            setPlanLoaded(true);
        }).catch(err => console.error('Loading the treatment plan failed:', err));
        return () => { cancelled = true; };
    }, [patient.id]);

    const now = new Date();
    // Today's booked appointment is already Attended by now: the trigger links it when the
    // treatment is opened (page 1), well before this confirmation.
    const nextBooked = appointments
        ?.filter(a => a.status === 'booked' && a.start > now)
        .sort((a, b) => +a.start - +b.start)[0];
    const courseComplete = planned !== null && sessionsDone !== null && sessionsDone >= planned;
    const needsProposal = appointments !== null && planLoaded && !nextBooked && !courseComplete;

    // Session time for "same time next week": today's appointment of this patient, else now.
    const todayAppointment = appointments?.find(a => a.status !== 'cancelled' && a.start.toDateString() === now.toDateString());
    const sessionTimeKey = todayAppointment ? todayAppointment.start.getTime() : 0;

    const [proposal, setProposal] = useState<Proposal | null>(null);
    const computeProposal = async (): Promise<Proposal> => {
        const first = proposeNextSession(slots, todayAppointment?.start ?? new Date());
        const minutes = prefs.defaultMeetingMinutes;
        const dayStart = atTime(first, '00:00');
        const dayAppointments = await appointmentService.listByCaretakerRange(caretakerId, dayStart, addMinutes(dayStart, 24 * 60));
        const overlaps = findOverlaps(first, addMinutes(first, minutes), dayAppointments);
        let start = first;
        let clash: Pick<Proposal, 'clashedStart' | 'clashWith' | 'noFreeTime'> = {};
        if (overlaps.length > 0) {
            const other = overlaps[0].patientId;
            const name = other === patient.id ? patient.fullName
                : String((await getDoc(doc(db, 'patients', other))).data()?.fullName || '—');
            const free = nearestFreeStart(first, minutes, dayAppointments, prefs.workingWeek);
            clash = { clashedStart: first, clashWith: name, noFreeTime: !free };
            if (free) start = free;
        }
        return {
            start, ...clash,
            outside: isOutsideWorkingHours(start, addMinutes(start, minutes), prefs.workingWeek),
            fromPattern: slots.length > 0,
        };
    };

    const slotsKey = useMemo(() => JSON.stringify(slots), [slots]);
    useEffect(() => {
        if (!needsProposal) { setProposal(null); return; }
        let cancelled = false;
        computeProposal()
            .then(p => { if (!cancelled) setProposal(p); })
            .catch(err => console.error('Preparing the next session failed:', err));
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needsProposal, slotsKey, sessionTimeKey, caretakerId]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [skipped, setSkipped] = useState(false);
    const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; start: Date; appointment?: Appointment } | null>(null);
    const [extendOpen, setExtendOpen] = useState(false);
    const [extendBy, setExtendBy] = useState('');

    // Book the proposal. The day is checked again first; a new clash shows instead of booking.
    const bookProposal = async () => {
        if (!proposal) return;
        setBusy(true);
        setError(null);
        try {
            const fresh = await computeProposal();
            if (+fresh.start !== +proposal.start || !!fresh.clashWith !== !!proposal.clashWith || fresh.noFreeTime) {
                setProposal(fresh);
                return;
            }
            const end = addMinutes(proposal.start, prefs.defaultMeetingMinutes);
            const id = await appointmentService.book({ caretakerId, patientId: patient.id, start: proposal.start, end, notifyPatient: hasEmail });
            logAction(user, {
                category: 'patient', action: 'create', entityType: 'appointment', entityId: id, entityName: patient.fullName,
                detail: `booked ${proposal.start.toISOString()} (book next session)`,
            });
        } catch (err) {
            console.error('Booking the next session failed:', err);
            setError(tFailed);
        } finally {
            setBusy(false);
        }
    };

    const maxExtend = planned === null ? 0 : MAX_PLANNED_SESSIONS - planned;
    const extendValue = Number(extendBy);
    const extendValid = Number.isInteger(extendValue) && extendValue >= 1 && extendValue <= maxExtend;

    // "Extend course": adds sessions to the stored plan (the only plan field written here).
    const saveExtension = async () => {
        if (planned === null || !extendValid) return;
        const next = planned + extendValue;
        setBusy(true);
        setError(null);
        try {
            await updateDoc(doc(db, 'patients', patient.id), { 'appointmentPlan.plannedSessions': next });
            logAction(user, {
                category: 'patient', action: 'update', entityType: 'patient', entityId: patient.id, entityName: patient.fullName,
                detail: `planned sessions ${planned} → ${next} (extend course)`,
            });
            setPlanned(next);
            setExtendOpen(false);
            onPlannedSessionsChanged?.(next);
        } catch (err) {
            console.error('Extending the course failed:', err);
            setError(tFailed);
        } finally {
            setBusy(false);
        }
    };

    if (readOnly || skipped) return null;

    const renderBody = () => {
        if (appointments === null || !planLoaded) return <p className={styles.muted}><T>Loading...</T></p>;

        if (nextBooked) {
            return (
                <div className={styles.row}>
                    <p className={styles.value}>
                        <T>Next session</T>: {formatDayDateTime(nextBooked.start, language)} <span aria-hidden="true">✓</span>
                    </p>
                    <div className={styles.actions}>
                        <button type="button" className={tabStyles.linkButton}
                            onClick={() => setEditor({ mode: 'edit', start: nextBooked.start, appointment: nextBooked })}>
                            <T>Change</T>
                        </button>
                    </div>
                </div>
            );
        }

        if (courseComplete) {
            return (
                <>
                    <p className={styles.value}><T>Treatment course complete</T> <span aria-hidden="true">🎉</span></p>
                    {!extendOpen ? (
                        <div className={styles.actions}>
                            <button type="button" className={tabStyles.primaryButtonSmall}
                                onClick={() => { setExtendBy(String(Math.max(slots.length, 1))); setExtendOpen(true); }}>
                                <T>Extend course</T>
                            </button>
                        </div>
                    ) : (
                        <div className={styles.extendRow}>
                            <label className={tabStyles.label} htmlFor="bookNextExtendBy">{tSessionsToAdd}</label>
                            <input id="bookNextExtendBy" type="number" min={1} max={maxExtend} step={1}
                                className={`${tabStyles.input} ${tabStyles.narrowInput} ${extendBy && !extendValid ? tabStyles.inputError : ''}`}
                                value={extendBy} onChange={e => setExtendBy(e.target.value)} aria-invalid={!!extendBy && !extendValid} />
                            <div className={styles.actions}>
                                <button type="button" className={tabStyles.primaryButtonSmall} onClick={saveExtension} disabled={busy || !extendValid}>
                                    <T>Save</T>
                                </button>
                                <button type="button" className={tabStyles.linkButton} onClick={() => setExtendOpen(false)} disabled={busy}>
                                    <T>Cancel</T>
                                </button>
                            </div>
                        </div>
                    )}
                </>
            );
        }

        if (!proposal) return <p className={styles.muted}><T>Loading...</T></p>;
        return (
            <>
                {!proposal.fromPattern && (
                    <p className={styles.muted}><T>No weekly pattern is set, so the same time next week is suggested.</T></p>
                )}
                {proposal.clashedStart && (
                    <p className={tabStyles.clashText}>
                        <span aria-hidden="true">⚠ </span>{formatDayDateTime(proposal.clashedStart, language)}: <T>Clashes with the appointment of</T> {proposal.clashWith}
                    </p>
                )}
                {proposal.noFreeTime ? (
                    <p className={tabStyles.clashText}><T>No free time was found on that day. Use Change to choose another time.</T></p>
                ) : (
                    <p className={styles.value}>
                        {proposal.clashedStart ? <T>Nearest free time</T> : <T>Suggested time</T>}: {formatDayDateTime(proposal.start, language)}
                    </p>
                )}
                {!proposal.noFreeTime && proposal.outside && (
                    <p className={tabStyles.clashText}><span aria-hidden="true">⚠ </span><T>Outside your working hours</T></p>
                )}
                <div className={styles.actions}>
                    {!proposal.noFreeTime && (
                        <button type="button" className={tabStyles.primaryButtonSmall} onClick={bookProposal} disabled={busy}><T>Book</T></button>
                    )}
                    <button type="button" className={tabStyles.linkButton} onClick={() => setEditor({ mode: 'create', start: proposal.start })} disabled={busy}>
                        <T>Change</T>
                    </button>
                    <button type="button" className={tabStyles.linkButton} onClick={() => setSkipped(true)} disabled={busy}><T>Skip</T></button>
                </div>
            </>
        );
    };

    return (
        <section className={styles.section} aria-labelledby="bookNextSessionTitle">
            <h4 id="bookNextSessionTitle" className={styles.title}><T>Book next session</T></h4>
            <div aria-live="polite">{renderBody()}</div>
            {!hasEmail && !courseComplete && (
                <p className={styles.muted}><T>Appointments will be booked, but the patient will not receive calendar invitations.</T></p>
            )}
            {error && <p className={tabStyles.fieldError} role="alert"><span aria-hidden="true">⚠ </span>{error}</p>}

            {editor && (
                <AppointmentEditor
                    mode={editor.mode}
                    appointment={editor.appointment}
                    initialStart={editor.start}
                    initialMinutes={prefs.defaultMeetingMinutes}
                    initialPatientId={patient.id}
                    patients={[patient]}
                    caretakerId={caretakerId}
                    workingWeek={prefs.workingWeek}
                    readOnly={false}
                    actor={user}
                    onClose={() => setEditor(null)}
                />
            )}
        </section>
    );
};

export default BookNextSession;
