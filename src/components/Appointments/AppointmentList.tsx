import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, AppointmentPlan, WorkingWeek } from '../../types/appointments';
import { AppUser } from '../../types/user';
import { T, useT, useTranslationContext } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import AppointmentEditor, { PatientOption } from './AppointmentEditor';
import DateField from './DateField';
import { TimeSelect } from './WorkingWeekEditor';
import * as appointmentService from '../../services/appointmentService';
import { logAction } from '../../services/auditLogService';
import { buildSuggestions, Suggestion, upcomingBooked } from '../../utils/appointments/suggestions';
import { findOverlaps, nearestFreeStart } from '../../utils/appointments/clashes';
import { STATUS_LABELS, hasStarted, isChangeable } from '../../utils/appointments/status';
import { addMinutes, atTime, formatDate, formatWeekday, isOutsideWorkingHours, toDateValue, toHHmm } from '../../utils/appointments/time';
import { TreatmentSession } from '../../types/treatmentSession';
import Modal from '../common/Modal';
import TreatmentSummary from '../PatientIntake/TreatmentSummary';
import styles from './AppointmentsTab.module.css';

interface AppointmentListProps {
    patient: PatientOption;
    /** The patient's caretaker (list queries must filter on it; correct under "View As"). */
    caretakerId: string;
    /** The patient's appointments, all statuses (loaded by the tab). */
    appointments: Appointment[];
    /** The patient's treatments by id: session number and "View treatment" of attended rows. */
    treatmentsById: Map<string, TreatmentSession>;
    plan: AppointmentPlan;
    sessionsDone: number;
    meetingMinutes: number;
    workingWeek: WorkingWeek;
    readOnly: boolean;
    actor: AppUser;
    onChanged: () => void;
    onOpenCalendar: (date: Date) => void;
}

type RowEdit = { day: Date | null; time: string };
type Clash = { overlaps: Appointment[]; outside: boolean; tryStart: Date | null };

/**
 * The patient's appointment list with suggestions (spec §9): upcoming first (booked and
 * suggested, in time order), then past and cancelled, newest first. Suggestions follow the
 * weekly pattern and are never stored; "Book all" books only suggestions without a clash.
 */
const AppointmentList: React.FC<AppointmentListProps> = ({
    patient, caretakerId, appointments, treatmentsById, plan, sessionsDone, meetingMinutes, workingWeek, readOnly, actor, onChanged, onOpenCalendar,
}) => {
    const { language, direction } = useTranslationContext();
    const tTreatmentSummary = useT('Treatment Summary');
    const [viewTreatment, setViewTreatment] = useState<TreatmentSession | null>(null);
    const tFailed = useT('Saving failed. Please try again.');
    const tOpenInCalendar = useT('Open in calendar');
    const tFutureOnly = useT('Choose a time in the future');
    const [edits, setEdits] = useState<Record<string, RowEdit>>({});
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [rangeAppointments, setRangeAppointments] = useState<Appointment[]>([]);
    const [otherNames, setOtherNames] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editor, setEditor] = useState<Appointment | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<Appointment | null>(null);
    const [confirmBookAnyway, setConfirmBookAnyway] = useState<{ start: Date; end: Date; clash: Clash } | null>(null);
    const [bookAllResult, setBookAllResult] = useState<{ booked: number; skipped: number } | null>(null);

    const now = new Date();
    const hasEmail = !!patient.email?.trim();

    const suggestions = useMemo(
        () => buildSuggestions({ plan, sessionsDone, appointments, meetingMinutes }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [plan.plannedSessions, JSON.stringify(plan.weeklySlots), sessionsDone, appointments, meetingMinutes],
    );

    // A suggestion's time, after any change the caretaker made in its row.
    const suggestionTime = (s: Suggestion): { start: Date; end: Date } | null => {
        const e = edits[s.key];
        if (!e) return { start: s.start, end: s.end };
        if (!e.day) return null;
        const start = atTime(e.day, e.time);
        return { start, end: addMinutes(start, meetingMinutes) };
    };

    // Caretaker's appointments over the suggestions' days, for clash marking.
    const suggestionTimes = suggestions.map(suggestionTime).filter((t): t is { start: Date; end: Date } => !!t);
    const rangeKey = suggestionTimes.map(t => t.start.getTime()).join(',');
    useEffect(() => {
        if (suggestionTimes.length === 0) { setRangeAppointments([]); return; }
        const from = atTime(new Date(Math.min(...suggestionTimes.map(t => +t.start))), '00:00');
        const lastDay = atTime(new Date(Math.max(...suggestionTimes.map(t => +t.start))), '00:00');
        const to = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
        let cancelled = false;
        appointmentService.listByCaretakerRange(caretakerId, from, to)
            .then(list => { if (!cancelled) setRangeAppointments(list); })
            .catch(err => console.error('Loading appointments for clash check failed:', err));
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [caretakerId, rangeKey]);

    const clashFor = (start: Date, end: Date, pool: Appointment[] = rangeAppointments): Clash => {
        const overlaps = findOverlaps(start, end, pool);
        const outside = isOutsideWorkingHours(start, end, workingWeek);
        const dayPool = pool.filter(a => a.start.toDateString() === start.toDateString());
        return { overlaps, outside, tryStart: overlaps.length > 0 ? nearestFreeStart(start, meetingMinutes, dayPool, workingWeek) : null };
    };

    // Names of other patients in clash messages ("Clashes with Dana's appointment").
    const clashPatientIds = useMemo(() => Array.from(new Set(rangeAppointments.map(a => a.patientId)))
        .filter(id => id !== patient.id), [rangeAppointments, patient.id]);
    useEffect(() => {
        const missing = clashPatientIds.filter(id => !(id in otherNames));
        if (missing.length === 0) return;
        Promise.all(missing.map(id => getDoc(doc(db, 'patients', id)).then(s => [id, String(s.data()?.fullName || '—')] as const)))
            .then(pairs => setOtherNames(prev => ({ ...prev, ...Object.fromEntries(pairs) })))
            .catch(err => console.error('Loading patient names failed:', err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clashPatientIds.join(',')]);
    const nameOf = (id: string) => (id === patient.id ? patient.fullName : otherNames[id] || '—');

    const log = (id: string, detail: string) => logAction(actor, {
        category: 'patient', action: 'create', entityType: 'appointment', entityId: id, entityName: patient.fullName, detail,
    });

    const run = async (work: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await work();
            onChanged();
        } catch (err) {
            console.error('Appointment action failed:', err);
            setError(tFailed);
        } finally {
            setBusy(false);
        }
    };

    // Book one suggestion. Re-checks that day first; a clash or outside-hours asks "Book anyway".
    const bookOne = async (start: Date, end: Date, anyway = false) => {
        if (start <= new Date()) { setError(tFutureOnly); return; }
        if (!anyway) {
            const dayStart = atTime(start, '00:00');
            const fresh = await appointmentService.listByCaretakerRange(caretakerId, dayStart, addMinutes(dayStart, 24 * 60));
            const clash = clashFor(start, end, fresh);
            if (clash.overlaps.length > 0 || clash.outside) { setConfirmBookAnyway({ start, end, clash }); return; }
        }
        await run(async () => {
            const id = await appointmentService.book({ caretakerId, patientId: patient.id, start, end, notifyPatient: hasEmail });
            log(id, `booked ${start.toISOString()} (from suggestion)`);
            setEditingKey(null);
        });
    };

    // Book every suggestion without a clash, in one batch (spec §9). Re-checks with fresh data.
    const bookAll = async () => {
        const times = suggestionTimes.filter(t => t.start > new Date());
        if (times.length === 0) return;
        await run(async () => {
            const from = atTime(new Date(Math.min(...times.map(t => +t.start))), '00:00');
            const lastDay = atTime(new Date(Math.max(...times.map(t => +t.start))), '00:00');
            const fresh = await appointmentService.listByCaretakerRange(caretakerId, from, new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1));
            const accepted: { start: Date; end: Date }[] = [];
            for (const t of times) {
                // Also check against the ones accepted in this batch.
                const pool = [...fresh, ...accepted.map((a, i) => ({ id: `new-${i}`, start: a.start, end: a.end, status: 'booked' } as Appointment))];
                if (findOverlaps(t.start, t.end, pool).length === 0) accepted.push(t);
            }
            if (accepted.length > 0) {
                const ids = await appointmentService.bookMany(accepted.map(t => ({
                    caretakerId, patientId: patient.id, start: t.start, end: t.end, notifyPatient: hasEmail,
                })));
                ids.forEach((id, i) => log(id, `booked ${accepted[i].start.toISOString()} (book all)`));
            }
            setEdits({});
            setBookAllResult({ booked: accepted.length, skipped: times.length - accepted.length });
        });
    };

    const cancelAppointment = async (a: Appointment) => {
        setConfirmCancel(null);
        await run(async () => {
            await appointmentService.cancel(a.id);
            logAction(actor, { category: 'patient', action: 'update', entityType: 'appointment', entityId: a.id, entityName: patient.fullName, detail: 'cancelled' });
        });
    };

    // ── Rows ────────────────────────────────────────────────────────────────
    const upcoming = upcomingBooked(appointments, now);
    const upcomingIds = new Set(upcoming.map(a => a.id));
    const history = appointments.filter(a => !upcomingIds.has(a.id)).sort((a, b) => +b.start - +a.start);
    type Row = { kind: 'booked'; a: Appointment } | { kind: 'suggested'; s: Suggestion };
    const upcomingRows: Row[] = [
        ...upcoming.map(a => ({ kind: 'booked' as const, a })),
        ...suggestions.map(s => ({ kind: 'suggested' as const, s })),
    ].sort((x, y) => {
        const xs = x.kind === 'booked' ? x.a.start : (suggestionTime(x.s)?.start ?? x.s.start);
        const ys = y.kind === 'booked' ? y.a.start : (suggestionTime(y.s)?.start ?? y.s.start);
        return +xs - +ys;
    });

    const dayCell = (d: Date) => (
        <>
            <span className={styles.cellMain}>{formatDate(d)}</span>
            <span className={styles.cellSub}>{formatWeekday(d, language)}</span>
        </>
    );
    const timeCell = (start: Date, end: Date) => <span dir="ltr">{toHHmm(start)}–{toHHmm(end)}</span>;
    const statusBadge = (status: Appointment['status'] | 'suggested') => (
        <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
            {status === 'attended' && <span aria-hidden="true">✓ </span>}
            {status === 'missed' && <span aria-hidden="true">✕ </span>}
            <T>{status === 'suggested' ? 'Suggested' : STATUS_LABELS[status]}</T>
        </span>
    );
    const calendarButton = (d: Date) => (
        <button type="button" className={styles.linkButton} onClick={() => onOpenCalendar(d)} aria-label={`${tOpenInCalendar} ${formatDate(d)}`}>
            <T>Open in calendar</T>
        </button>
    );

    const bookableSuggestions = suggestionTimes.filter(t => t.start > now && clashFor(t.start, t.end).overlaps.length === 0).length;
    let sessionNumber = sessionsDone;

    return (
        <section className={styles.card} aria-labelledby="apptListTitle">
            <div className={styles.listHeader}>
                <h3 id="apptListTitle" className={styles.sectionHeaderInline}><T>Appointments</T></h3>
                {!readOnly && suggestions.length > 0 && (
                    <button type="button" className={styles.primaryButton} onClick={bookAll} disabled={busy || bookableSuggestions === 0}>
                        <T>Book all</T> ({bookableSuggestions})
                    </button>
                )}
            </div>

            {!hasEmail && (
                <p className={styles.infoNote}><T>Appointments will be booked, but the patient will not receive calendar invitations.</T></p>
            )}
            {plan.plannedSessions === null && (
                <p className={styles.emptyNote}><T>Set the planned sessions and weekly pattern above to get suggested appointments.</T></p>
            )}
            {plan.plannedSessions !== null && plan.weeklySlots.length === 0 && (
                <p className={styles.emptyNote}><T>Add weekly slots above to get suggested appointments.</T></p>
            )}
            {bookAllResult && (
                <p className={styles.infoNote} role="status">
                    <T>Booked</T>: {bookAllResult.booked}
                    {bookAllResult.skipped > 0 && <> · <T>Left to resolve (clash)</T>: {bookAllResult.skipped}</>}
                </p>
            )}
            {error && <p className={styles.fieldError} role="alert"><span aria-hidden="true">⚠ </span>{error}</p>}

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col"><T>Date</T></th>
                            <th scope="col"><T>Time</T></th>
                            <th scope="col"><T>Status</T></th>
                            <th scope="col"><T>Actions</T></th>
                        </tr>
                    </thead>
                    <tbody>
                        {upcomingRows.map(row => {
                            if (row.kind === 'booked') {
                                const a = row.a;
                                sessionNumber++;
                                return (
                                    <tr key={a.id}>
                                        <td>{sessionNumber}</td>
                                        <td>{dayCell(a.start)}</td>
                                        <td>{timeCell(a.start, a.end)}</td>
                                        <td>{statusBadge(a.status)}</td>
                                        <td className={styles.actionsCell}>
                                            {!readOnly && isChangeable(a) && (
                                                <>
                                                    <button type="button" className={styles.linkButton} onClick={() => setEditor(a)} disabled={busy}><T>Reschedule</T></button>
                                                    <button type="button" className={styles.linkButtonDanger} onClick={() => setConfirmCancel(a)} disabled={busy}><T>Cancel</T></button>
                                                </>
                                            )}
                                            {!readOnly && !isChangeable(a) && hasStarted(a) && (
                                                <button type="button" className={styles.linkButton} onClick={() => setEditor(a)} disabled={busy}><T>Change status</T></button>
                                            )}
                                            {calendarButton(a.start)}
                                        </td>
                                    </tr>
                                );
                            }
                            const s = row.s;
                            const t = suggestionTime(s);
                            const clash = t ? clashFor(t.start, t.end) : null;
                            const edit = edits[s.key] ?? { day: atTime(s.start, '00:00'), time: toHHmm(s.start) };
                            sessionNumber++;
                            return (
                                <React.Fragment key={s.key}>
                                    <tr className={styles.suggestedRow}>
                                        <td>{sessionNumber}</td>
                                        <td>{t ? dayCell(t.start) : '—'}</td>
                                        <td>{t ? timeCell(t.start, t.end) : '—'}</td>
                                        <td>
                                            {statusBadge('suggested')}
                                            {clash && clash.overlaps.length > 0 && (
                                                <p className={styles.clashText}>
                                                    <span aria-hidden="true">⚠ </span><T>Clashes with the appointment of</T> {nameOf(clash.overlaps[0].patientId)}
                                                    {clash.tryStart && !readOnly && (
                                                        <button type="button" className={styles.linkButton}
                                                            onClick={() => setEdits(prev => ({ ...prev, [s.key]: { day: atTime(clash.tryStart!, '00:00'), time: toHHmm(clash.tryStart!) } }))}>
                                                            <T>Try</T> {toHHmm(clash.tryStart)}?
                                                        </button>
                                                    )}
                                                </p>
                                            )}
                                            {clash && clash.overlaps.length === 0 && clash.outside && (
                                                <p className={styles.clashText}><span aria-hidden="true">⚠ </span><T>Outside your working hours</T></p>
                                            )}
                                        </td>
                                        <td className={styles.actionsCell}>
                                            {!readOnly && t && (
                                                <button type="button" className={styles.primaryButtonSmall} onClick={() => bookOne(t.start, t.end)} disabled={busy}><T>Book</T></button>
                                            )}
                                            {!readOnly && (
                                                <button type="button" className={styles.linkButton} onClick={() => setEditingKey(editingKey === s.key ? null : s.key)}
                                                    aria-expanded={editingKey === s.key}>
                                                    <T>Change</T>
                                                </button>
                                            )}
                                            {t && calendarButton(t.start)}
                                        </td>
                                    </tr>
                                    {editingKey === s.key && (
                                        <tr className={styles.suggestedEditRow}>
                                            <td />
                                            <td colSpan={4}>
                                                <div className={styles.inlineEditor}>
                                                    <DateField id={`sug-${s.key}-date`} value={edit.day}
                                                        onChange={day => setEdits(prev => ({ ...prev, [s.key]: { ...edit, day } }))} />
                                                    <TimeSelect id={`sug-${s.key}-time`} value={edit.time}
                                                        onChange={time => setEdits(prev => ({ ...prev, [s.key]: { ...edit, time } }))} />
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        {history.length > 0 && (
                            <tr className={styles.groupRow}><td colSpan={5}><T>Past and cancelled</T></td></tr>
                        )}
                        {history.map(a => {
                            // Attended rows: the linked treatment's number and summary (set from Step 6 on).
                            const treatment = a.status === 'attended' && a.treatmentId ? treatmentsById.get(a.treatmentId) : undefined;
                            return (
                                <tr key={a.id} className={a.status === 'cancelled' ? styles.cancelledRow : undefined}>
                                    <td>{treatment?.treatmentNumber ?? '—'}</td>
                                    <td>{dayCell(a.start)}</td>
                                    <td>{timeCell(a.start, a.end)}</td>
                                    <td>
                                        {statusBadge(a.status)}
                                        {a.source === 'walk_in' && <span className={styles.cellSub}><T>Walk-in</T></span>}
                                    </td>
                                    <td className={styles.actionsCell}>
                                        {treatment && (
                                            <button type="button" className={styles.linkButton} onClick={() => setViewTreatment(treatment)}><T>View treatment</T></button>
                                        )}
                                        {!readOnly && a.status !== 'cancelled' && hasStarted(a) && (
                                            <button type="button" className={styles.linkButton} onClick={() => setEditor(a)} disabled={busy}><T>Change status</T></button>
                                        )}
                                        {a.status !== 'cancelled' && calendarButton(a.start)}
                                    </td>
                                </tr>
                            );
                        })}

                        {upcomingRows.length === 0 && history.length === 0 && (
                            <tr><td colSpan={5} className={styles.emptyCell}><T>No appointments yet.</T></td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {editor && (
                <AppointmentEditor
                    mode="edit"
                    appointment={editor}
                    initialStart={editor.start}
                    initialMinutes={meetingMinutes}
                    patients={[patient]}
                    caretakerId={caretakerId}
                    workingWeek={workingWeek}
                    readOnly={readOnly}
                    actor={actor}
                    onClose={() => setEditor(null)}
                    onChanged={onChanged}
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
                isOpen={!!confirmCancel}
                title={<T>Cancel this appointment?</T>}
                message={confirmCancel ? `${formatWeekday(confirmCancel.start, language)} ${formatDate(confirmCancel.start)} ${toHHmm(confirmCancel.start)}` : ''}
                confirmLabel={<T>Cancel appointment</T>}
                cancelLabel={<T>Keep appointment</T>}
                onConfirm={() => confirmCancel && cancelAppointment(confirmCancel)}
                onCancel={() => setConfirmCancel(null)}
            />

            <ConfirmationModal
                isOpen={!!confirmBookAnyway}
                title={<T>Please check before booking</T>}
                message={confirmBookAnyway ? (
                    <div>
                        <p>{formatWeekday(confirmBookAnyway.start, language)} {formatDate(confirmBookAnyway.start)} {toHHmm(confirmBookAnyway.start)}</p>
                        {confirmBookAnyway.clash.overlaps.map(o => (
                            <p key={o.id} className={styles.clashText}>
                                <span aria-hidden="true">⚠ </span><T>Overlaps with the appointment of</T> {nameOf(o.patientId)} ({toHHmm(o.start)}–{toHHmm(o.end)})
                            </p>
                        ))}
                        {confirmBookAnyway.clash.outside && (
                            <p className={styles.clashText}><span aria-hidden="true">⚠ </span><T>Outside your working hours</T></p>
                        )}
                    </div>
                ) : ''}
                confirmLabel={<T>Book anyway</T>}
                onConfirm={() => {
                    const c = confirmBookAnyway;
                    setConfirmBookAnyway(null);
                    if (c) bookOne(c.start, c.end, true);
                }}
                onCancel={() => setConfirmBookAnyway(null)}
            />
        </section>
    );
};

export default AppointmentList;
