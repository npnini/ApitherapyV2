import React, { useEffect, useMemo, useState } from 'react';
import { Appointment, WeekdayIndex } from '../../types/appointments';
import { JoinedPatientData } from '../../types/patient';
import { AppUser } from '../../types/user';
import { TreatmentSession } from '../../types/treatmentSession';
import { T, useT, useTranslationContext } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import Modal from '../common/Modal';
import TreatmentSummary from '../PatientIntake/TreatmentSummary';
import StatusLegend from './StatusLegend';
import AppointmentEditor from './AppointmentEditor';
import * as appointmentService from '../../services/appointmentService';
import { logAction } from '../../services/auditLogService';
import { useNow } from '../../hooks/useNow';
import { getAppointmentSettings, getEffectiveAppointmentPrefs } from '../../utils/appointments/prefs';
import { nextPatternStarts } from '../../utils/appointments/suggestions';
import { findOverlaps } from '../../utils/appointments/clashes';
import { STATUS_LABELS, canMarkCancelled, canReschedule, isChangeable } from '../../utils/appointments/status';
import { addMinutes, atTime, formatDate, formatWeekday, toDateValue, toHHmm } from '../../utils/appointments/time';
import styles from './Appointments.module.css';
import listStyles from './AppointmentsTab.module.css';
import todayStyles from './TodayPage.module.css';

interface TodayPageProps {
    /** Whose day: the signed-in caretaker, or the one being viewed with "View As". */
    caretaker: AppUser;
    /** The signed-in user (activity log). */
    actor: AppUser;
    appConfig: any;
    /** Today's appointments, live (useTodayAppointments in App: one subscription with the badge). */
    appointments: Appointment[];
    loadError: boolean;
    patients: JoinedPatientData[];
    /** "View As" another caretaker: see only (spec §14). */
    readOnly: boolean;
    onStartTreatment: (patient: JoinedPatientData) => void;
    onOpenPatient: (patient: JoinedPatientData) => void;
}

/** The card's state (spec §6): a booked appointment is "due" from X minutes before its start. */
type CardState = 'upcoming' | 'due' | 'attended' | 'missed' | 'cancelled';

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * wa.me needs the number in international form without "+" or zeros in front. Caretakers and
 * patients are in Israel (plan §1.5), so a local number "05x…" gets the 972 country code.
 */
const whatsAppNumber = (mobile: string): string | null => {
    const trimmed = mobile.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return null;
    if (trimmed.startsWith('+')) return digits;
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('0')) return `972${digits.slice(1)}`;
    return digits;
};

/**
 * Today page (spec §6): the caretaker's appointments of today as an agenda, one row per hour
 * of today's working hours (stretched to include any appointment outside them), with a line
 * for the current time. Each appointment card carries the actions of its state.
 */
const TodayPage: React.FC<TodayPageProps> = ({
    caretaker, actor, appConfig, appointments, loadError, patients, readOnly, onStartTreatment, onOpenPatient,
}) => {
    const { language, direction } = useTranslationContext();
    const now = useNow(30_000);
    const tLoadFailed = useT('Could not load appointments.');
    const tFailed = useT('Saving failed. Please try again.');
    const tTreatmentSummary = useT('Treatment Summary');
    const tCallPatient = useT('Call patient');
    const tOpenPatient = useT('Open patient');
    const tBook = useT('Book');

    const prefs = useMemo(() => getEffectiveAppointmentPrefs(caretaker, appConfig), [caretaker, appConfig]);
    const leadMinutes = getAppointmentSettings(appConfig).startTreatmentLeadMinutes;

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmEarly, setConfirmEarly] = useState<Appointment | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<Appointment | null>(null);
    const [editor, setEditor] = useState<
        { mode: 'edit'; appointment: Appointment } | { mode: 'create'; patientId?: string; start: Date } | null
    >(null);
    const [viewTreatment, setViewTreatment] = useState<TreatmentSession | null>(null);

    const patientOf = (id: string) => patients.find(p => p.id === id);
    const nameOf = (id: string) => patientOf(id)?.fullName || '—';

    // Each patient's treatments: session numbers and "View treatment". Reloaded when today's
    // patients change or an appointment gets linked to a treatment.
    const patientIdsKey = Array.from(new Set(appointments.map(a => a.patientId))).sort().join(',');
    const linkKey = appointments.map(a => a.treatmentId || '').join(',');
    const [treatments, setTreatments] = useState<Map<string, TreatmentSession[]>>(new Map());
    useEffect(() => {
        const ids = patientIdsKey ? patientIdsKey.split(',') : [];
        let cancelled = false;
        Promise.all(ids.map(id => appointmentService.listPatientTreatments(id).then(list => [id, list] as const)))
            .then(pairs => { if (!cancelled) setTreatments(new Map(pairs)); })
            .catch(err => console.error('Loading treatments failed:', err));
        return () => { cancelled = true; };
    }, [patientIdsKey, linkKey]);

    const linkedTreatment = (a: Appointment) =>
        a.treatmentId ? treatments.get(a.patientId)?.find(t => t.id === a.treatmentId) : undefined;

    // "Session n / N" (plan §1.1): attended = the linked treatment's number; booked = treatments
    // recorded so far + 1. Missed and cancelled meetings are not sessions.
    const sessionText = (a: Appointment): string | null => {
        let n: number | undefined;
        if (a.status === 'attended') n = linkedTreatment(a)?.treatmentNumber;
        else if (a.status === 'booked') {
            const list = treatments.get(a.patientId);
            n = list ? list.length + 1 : undefined;
        }
        if (n === undefined) return null;
        const planned = patientOf(a.patientId)?.appointmentPlan?.plannedSessions;
        return typeof planned === 'number' ? `${n} / ${planned}` : String(n);
    };

    const stateOf = (a: Appointment): CardState =>
        a.status === 'booked' ? (now >= addMinutes(a.start, -leadMinutes) ? 'due' : 'upcoming') : a.status;

    // A cancelled meeting stays on the page only until it is replaced: once the same patient has
    // a booking (or a walk-in) made after the cancellation, on any day from today on, it is hidden
    // (user decision, 2026-09-30). Loaded only while today has a cancelled meeting.
    const hasCancelled = appointments.some(a => a.status === 'cancelled');
    const [fromToday, setFromToday] = useState<Appointment[]>([]);
    useEffect(() => {
        if (!hasCancelled) { setFromToday([]); return; }
        const today = new Date();
        return appointmentService.watchUpcomingByCaretaker(caretaker.uid, new Date(today.getFullYear(), today.getMonth(), today.getDate()),
            list => setFromToday(list),
            err => console.error('Loading upcoming appointments failed:', err));
    }, [caretaker.uid, hasCancelled]);
    const isReplaced = (a: Appointment) => !!a.cancelledAt && fromToday.some(b =>
        b.patientId === a.patientId && b.status !== 'cancelled' && !!b.createdAt && b.createdAt > a.cancelledAt!);

    // ── Hour rows: today's working hours, stretched to include every appointment ──
    const sorted = useMemo(
        () => appointments.filter(a => !(a.status === 'cancelled' && isReplaced(a))).sort((a, b) => +a.start - +b.start),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [appointments, fromToday],
    );
    const workDay = prefs.workingWeek[now.getDay() as WeekdayIndex];
    const bounds: number[] = workDay?.on ? [toMinutes(workDay.start), toMinutes(workDay.end)] : [];
    for (const a of sorted) {
        bounds.push(minutesOfDay(a.start));
        // An appointment running past midnight fills the day.
        bounds.push(a.end.toDateString() === now.toDateString() ? minutesOfDay(a.end) : 24 * 60);
    }
    const firstHour = bounds.length ? Math.floor(Math.min(...bounds) / 60) : 0;
    const lastHour = bounds.length ? Math.min(24, Math.ceil(Math.max(...bounds) / 60)) : 0;
    const hours = Array.from({ length: Math.max(lastHour - firstHour, 0) }, (_, i) => firstHour + i);
    const nowMinutes = minutesOfDay(now);
    const showNowLine = hours.length > 0 && nowMinutes >= firstHour * 60 && nowMinutes < lastHour * 60;

    // Free time from now on, so a patient who calls can be booked right here (like the Calendar):
    // the first quarter hour in hour `h`, after now, where a default-length meeting overlaps no
    // appointment (cancelled ones do not count). The editor still warns outside working hours.
    const freeStartIn = (h: number): Date | null => {
        for (let m = 0; m < 60; m += 15) {
            const start = atTime(now, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            if (start <= now) continue;
            if (findOverlaps(start, addMinutes(start, prefs.defaultMeetingMinutes), sorted).length === 0) return start;
        }
        return null;
    };

    // ── Actions ──
    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await work();
        } catch (err) {
            console.error('Appointment action failed:', err);
            setError(tFailed);
        } finally {
            setBusy(false);
        }
    };

    const startTreatment = (a: Appointment) => {
        const patient = patientOf(a.patientId);
        if (patient) onStartTreatment(patient);
    };

    // Cancel before the start; once started, "Mark as cancelled" (no cancellation email).
    const cancelAppointment = async (a: Appointment) => {
        setConfirmCancel(null);
        const marking = !isChangeable(a);
        await run(async () => {
            await appointmentService.cancel(a.id);
            logAction(actor, {
                category: 'patient', action: 'update', entityType: 'appointment', entityId: a.id, entityName: nameOf(a.patientId),
                detail: marking ? `marked cancelled (was ${a.status})` : 'cancelled',
            });
        });
    };

    // "Book replacement": the patient's next pattern slot after today, else the next working day's start.
    const replacementStart = (patientId: string): Date => {
        const slots = patientOf(patientId)?.appointmentPlan?.weeklySlots || [];
        const [patternStart] = nextPatternStarts(slots, atTime(now, '23:59'), 1);
        if (patternStart) return patternStart;
        for (let i = 1; i <= 7; i++) {
            const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
            const wd = prefs.workingWeek[day.getDay() as WeekdayIndex];
            if (wd?.on) return atTime(day, wd.start);
        }
        return atTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), '09:00');
    };

    const renderCard = (a: Appointment) => {
        const state = stateOf(a);
        const patient = patientOf(a.patientId);
        const mobile = patient?.mobile?.trim();
        const waNumber = mobile ? whatsAppNumber(mobile) : null;
        const session = sessionText(a);
        const treatment = a.status === 'attended' ? linkedTreatment(a) : undefined;
        const lostSession = a.status === 'missed' || a.status === 'cancelled';
        const booked = state === 'upcoming' || state === 'due';

        return (
            <article
                key={a.id}
                className={`${todayStyles.card} ${styles[`status_${a.status}`]} ${state === 'due' ? todayStyles.cardDue : ''}`}
                aria-label={`${toHHmm(a.start)} ${nameOf(a.patientId)}`}
            >
                <div className={todayStyles.cardHead}>
                    <span className={todayStyles.cardTime} dir="ltr">{toHHmm(a.start)}–{toHHmm(a.end)}</span>
                    {/* The name always opens the patient (spec §6: past appointments are never "dead");
                        it is the card's only "Open patient". Not struck through: the status badge says it. */}
                    <button
                        type="button"
                        className={todayStyles.patientName}
                        onClick={() => patient && onOpenPatient(patient)}
                        disabled={!patient}
                        title={tOpenPatient}
                    >
                        {nameOf(a.patientId)}
                    </button>
                    <span className={`${listStyles.badge} ${listStyles[`badge_${a.status}`]}`}>
                        {a.status === 'attended' && <span aria-hidden="true">✓ </span>}
                        {a.status === 'missed' && <span aria-hidden="true">✕ </span>}
                        <T>{STATUS_LABELS[a.status]}</T>
                    </span>
                    {state === 'due' && <span className={todayStyles.dueTag}><T>Due now</T></span>}
                    {a.source === 'walk_in' && <span className={todayStyles.meta}><T>Walk-in</T></span>}
                </div>

                {session && (
                    <p className={todayStyles.meta}>
                        <T>Session number</T>: <bdi dir="ltr">{session}</bdi>
                    </p>
                )}

                <div className={todayStyles.cardActions}>
                    {booked && !readOnly && patient && (
                        <button
                            type="button"
                            className={state === 'due' ? listStyles.primaryButtonSmall : listStyles.linkButton}
                            onClick={() => (state === 'upcoming' ? setConfirmEarly(a) : startTreatment(a))}
                            disabled={busy}
                        >
                            <T>Start New Treatment</T>
                        </button>
                    )}
                    {booked && mobile && (
                        <a className={listStyles.linkButton} href={`tel:${mobile}`} aria-label={`${tCallPatient}: ${nameOf(a.patientId)}`}>
                            {tCallPatient}
                        </a>
                    )}
                    {booked && waNumber && (
                        <a className={listStyles.linkButton} href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer"
                            aria-label={`WhatsApp: ${nameOf(a.patientId)}`}>
                            WhatsApp
                        </a>
                    )}
                    {booked && !readOnly && canReschedule(a, now) && (
                        <button type="button" className={listStyles.linkButton} onClick={() => setEditor({ mode: 'edit', appointment: a })} disabled={busy}>
                            <T>Reschedule</T>
                        </button>
                    )}
                    {booked && !readOnly && (
                        <button type="button" className={listStyles.linkButtonDanger} onClick={() => setConfirmCancel(a)} disabled={busy}>
                            {isChangeable(a, now) ? <T>Cancel</T> : <T>Mark as cancelled</T>}
                        </button>
                    )}

                    {treatment && (
                        <button type="button" className={listStyles.linkButton} onClick={() => setViewTreatment(treatment)}>
                            <T>View treatment</T>
                        </button>
                    )}
                    {!readOnly && a.status === 'missed' && canMarkCancelled(a, now) && (
                        <button type="button" className={listStyles.linkButton} onClick={() => setConfirmCancel(a)} disabled={busy}>
                            <T>Mark as cancelled</T>
                        </button>
                    )}
                    {!readOnly && lostSession && patient && (
                        <button type="button" className={listStyles.linkButton}
                            onClick={() => setEditor({ mode: 'create', patientId: a.patientId, start: replacementStart(a.patientId) })} disabled={busy}>
                            <T>Book a replacement session</T>
                        </button>
                    )}
                </div>
            </article>
        );
    };

    const nowLine = (
        <div className={todayStyles.nowLine} role="note">
            <span className={todayStyles.nowLabel}><T>Now</T> <span dir="ltr">{toHHmm(now)}</span></span>
        </div>
    );

    const confirmCancelMarking = confirmCancel ? !isChangeable(confirmCancel, now) : false;

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>
                    <T>Today</T>
                    <span className={styles.weekTitle}>{formatWeekday(now, language)} <span dir="ltr">{formatDate(now)}</span></span>
                </h1>
                <StatusLegend statuses={['booked', 'attended', 'missed', 'cancelled']} />
            </div>

            {readOnly && (
                <p className={styles.infoNote}><T>View only: you are viewing another caretaker's calendar.</T></p>
            )}
            {loadError && <p className={styles.errorText} role="alert"><span aria-hidden="true">⚠ </span>{tLoadFailed}</p>}
            {error && <p className={styles.errorText} role="alert"><span aria-hidden="true">⚠ </span>{error}</p>}

            <section className={todayStyles.agendaCard}>
                {/* Also on a working day with nothing booked: the hour rows still show, for "+ Book". */}
                {sorted.length === 0 && <p className={todayStyles.empty}><T>No appointments today.</T></p>}
                {hours.length > 0 && (
                    <ol className={todayStyles.agenda}>
                        {hours.map(h => {
                            const inHour = sorted.filter(a => a.start.getHours() === h);
                            const nowHere = showNowLine && now.getHours() === h;
                            const before = nowHere ? inHour.filter(a => a.start <= now) : inHour;
                            const after = nowHere ? inHour.filter(a => a.start > now) : [];
                            const free = readOnly ? null : freeStartIn(h);
                            return (
                                <li key={h} className={todayStyles.hourRow}>
                                    <span className={todayStyles.hourLabel} dir="ltr">{`${String(h).padStart(2, '0')}:00`}</span>
                                    <div className={todayStyles.hourContent}>
                                        {before.map(renderCard)}
                                        {nowHere && nowLine}
                                        {after.map(renderCard)}
                                        {free && (
                                            <button type="button" className={todayStyles.bookFree}
                                                onClick={() => setEditor({ mode: 'create', start: free })} disabled={busy}
                                                aria-label={`${tBook} ${toHHmm(free)}`}>
                                                <span aria-hidden="true">+ </span><T>Book</T> <span dir="ltr">{toHHmm(free)}</span>
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </section>

            {editor && (
                <AppointmentEditor
                    mode={editor.mode}
                    appointment={editor.mode === 'edit' ? editor.appointment : undefined}
                    initialStart={editor.mode === 'create' ? editor.start : editor.appointment.start}
                    initialMinutes={prefs.defaultMeetingMinutes}
                    initialPatientId={editor.mode === 'create' ? editor.patientId : undefined}
                    patients={patients.filter(p => p.id).map(p => ({ id: p.id as string, fullName: p.fullName, mobile: p.mobile, identityNumber: p.identityNumber, email: p.email }))}
                    caretakerId={caretaker.uid}
                    workingWeek={prefs.workingWeek}
                    readOnly={readOnly}
                    actor={actor}
                    onClose={() => setEditor(null)}
                />
            )}

            {viewTreatment && (
                <Modal
                    isOpen={true}
                    onClose={() => setViewTreatment(null)}
                    title={`${tTreatmentSummary}${viewTreatment.treatmentNumber ? ` #${viewTreatment.treatmentNumber}` : ''}`}
                    subtitle={formatDate(toDateValue(viewTreatment.createdTimestamp) || new Date())}
                >
                    <TreatmentSummary treatment={viewTreatment} language={language} direction={direction} />
                </Modal>
            )}

            <ConfirmationModal
                isOpen={!!confirmEarly}
                title={<T>Start the treatment before the appointment time?</T>}
                message={confirmEarly ? `${nameOf(confirmEarly.patientId)} · ${toHHmm(confirmEarly.start)}` : ''}
                confirmLabel={<T>Start now</T>}
                cancelLabel={<T>Not yet</T>}
                onConfirm={() => {
                    const a = confirmEarly;
                    setConfirmEarly(null);
                    if (a) startTreatment(a);
                }}
                onCancel={() => setConfirmEarly(null)}
            />

            <ConfirmationModal
                isOpen={!!confirmCancel}
                title={confirmCancelMarking ? <T>Mark this appointment as cancelled?</T> : <T>Cancel this appointment?</T>}
                message={confirmCancel ? (
                    <div>
                        <p>{nameOf(confirmCancel.patientId)} · <span dir="ltr">{toHHmm(confirmCancel.start)}</span></p>
                        {confirmCancelMarking && <p><T>Use this when the patient cancelled in advance. It will not count as missed.</T></p>}
                    </div>
                ) : ''}
                confirmLabel={confirmCancelMarking ? <T>Mark as cancelled</T> : <T>Cancel appointment</T>}
                cancelLabel={confirmCancelMarking ? <T>Keep as is</T> : <T>Keep appointment</T>}
                onConfirm={() => confirmCancel && cancelAppointment(confirmCancel)}
                onCancel={() => setConfirmCancel(null)}
            />
        </div>
    );
};

export default TodayPage;
