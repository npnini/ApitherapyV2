import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Appointment, WorkingWeek } from '../../types/appointments';
import { AppUser } from '../../types/user';
import { T, useT, useTranslationContext } from '../T';
import { TimeSelect } from './WorkingWeekEditor';
import * as appointmentService from '../../services/appointmentService';
import { logAction } from '../../services/auditLogService';
import { addMinutes, atTime, formatDayDateTime, isOutsideWorkingHours, toHHmm } from '../../utils/appointments/time';
import DateField from './DateField';
import { findOverlaps } from '../../utils/appointments/clashes';
import { STATUS_LABELS, canMarkCancelled, isChangeable } from '../../utils/appointments/status';
import styles from './Appointments.module.css';

const MIN_MINUTES = 5;
const MAX_MINUTES = 480;

export interface PatientOption {
    id: string;
    fullName: string;
    mobile?: string;
    identityNumber?: string;
    /** Needed for "Notify patient": no email → no patient invitation. */
    email?: string;
}

interface AppointmentEditorProps {
    mode: 'create' | 'edit';
    /** The appointment being edited (mode 'edit'). */
    appointment?: Appointment;
    /** Create: the clicked/selected start. Edit: ignored (the appointment's start is used). */
    initialStart: Date;
    /** Create: selected length or the caretaker's default meeting length. */
    initialMinutes: number;
    patients: PatientOption[];
    caretakerId: string;
    workingWeek: WorkingWeek;
    readOnly: boolean;
    /** The signed-in user, for the activity log. */
    actor: AppUser;
    onClose: () => void;
    /** Optional: called after any successful change (the Calendar and the tab are live, so they need no reload). */
    onChanged?: () => void;
}

type Warnings = { overlaps: Appointment[]; outside: boolean };

/**
 * Create / edit dialog for one appointment (spec §7). Before saving a new or moved time it
 * checks overlaps with the caretaker's other appointments and working hours, and asks for
 * "Book anyway". An appointment that has started can only be marked as cancelled, and only
 * when Missed or still Booked (spec §2).
 */
const AppointmentEditor: React.FC<AppointmentEditorProps> = ({
    mode, appointment, initialStart, initialMinutes, patients, caretakerId, workingWeek, readOnly, actor, onClose, onChanged,
}) => {
    const { language } = useTranslationContext();
    const tClose = useT('Close');
    const tDateInvalid = useT('Enter the date as dd/mm/yyyy');
    const tSearchPatient = useT('Search patient');
    const tChoosePatient = useT('Choose a patient');
    // Same text as in My Profile: shares its (reviewed) translation. A bare "Length ..." was
    // machine-translated to Hebrew as a *video* length.
    const tLengthInvalid = useT(`Meeting length must be between ${MIN_MINUTES} and ${MAX_MINUTES} minutes`);
    const tFutureOnly = useT('Choose a time in the future');
    const tSaveFailed = useT('Saving failed. Please try again.');

    const startValue = mode === 'edit' && appointment ? appointment.start : initialStart;
    const initialLength = mode === 'edit' && appointment
        ? Math.round((appointment.end.getTime() - appointment.start.getTime()) / 60_000)
        : initialMinutes;

    const [patientId, setPatientId] = useState(appointment?.patientId || '');
    const [search, setSearch] = useState('');
    const [day, setDay] = useState<Date | null>(atTime(startValue, '00:00'));
    const [time, setTime] = useState(toHHmm(startValue));
    const [minutes, setMinutes] = useState<number>(initialLength);
    const [notifyPatient, setNotifyPatient] = useState(appointment ? appointment.notifyPatient : true);
    const [warnings, setWarnings] = useState<Warnings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmingCancel, setConfirmingCancel] = useState(false);

    const canEditTime = !readOnly && (mode === 'create' || (!!appointment && isChangeable(appointment)));
    const canCancel = !readOnly && mode === 'edit' && !!appointment && isChangeable(appointment);
    // Started, and Missed or still Booked: "Mark as cancelled" (patient cancelled in advance).
    const canMark = !readOnly && mode === 'edit' && !!appointment && canMarkCancelled(appointment);

    const patientName = (id: string) => patients.find(p => p.id === id)?.fullName || '—';

    // No email → the patient cannot get an invitation: the box is off and disabled (spec §12).
    const patientHasEmail = !!patients.find(p => p.id === patientId)?.email?.trim();
    const effectiveNotify = notifyPatient && patientHasEmail;

    const filteredPatients = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? patients.filter(p => [p.fullName, p.mobile, p.identityNumber].some(v => v?.toLowerCase().includes(q)))
            : patients;
        return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [patients, search]);

    // Escape closes the dialog (unless a save is running).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, saving]);

    const start = day ? atTime(day, time) : null;
    const end = start && Number.isFinite(minutes) ? addMinutes(start, minutes) : null;
    const timeChanged = mode === 'create' || (!!appointment && !!start && !!end &&
        (start.getTime() !== appointment.start.getTime() || end.getTime() !== appointment.end.getTime()));

    const log = (action: 'create' | 'update', id: string, pid: string, detail: string) => logAction(actor, {
        category: 'patient', action, entityType: 'appointment', entityId: id, entityName: patientName(pid), detail,
    });

    const handleSave = async (bookAnyway = false) => {
        setError(null);
        if (mode === 'create' && !patientId) { setError(tChoosePatient); return; }

        if (canEditTime && timeChanged) {
            if (!start) { setError(tDateInvalid); return; }
            if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) { setError(tLengthInvalid); return; }
            if (!end || start <= new Date()) { setError(tFutureOnly); return; }

            if (!bookAnyway) {
                setSaving(true);
                try {
                    const dayStart = atTime(start, '00:00');
                    const sameDay = await appointmentService.listByCaretakerRange(caretakerId, dayStart, addMinutes(dayStart, 24 * 60));
                    const found: Warnings = {
                        overlaps: findOverlaps(start, end, sameDay, appointment?.id),
                        outside: isOutsideWorkingHours(start, end, workingWeek),
                    };
                    if (found.overlaps.length > 0 || found.outside) {
                        setWarnings(found);
                        setSaving(false);
                        return;
                    }
                } catch (err) {
                    console.error('Clash check failed:', err);
                    setError(tSaveFailed);
                    setSaving(false);
                    return;
                }
            }
        }

        setSaving(true);
        try {
            if (mode === 'create' && start && end) {
                const id = await appointmentService.book({ caretakerId, patientId, start, end, notifyPatient: effectiveNotify });
                log('create', id, patientId, `booked ${start.toISOString()}`);
            } else if (appointment) {
                if (canEditTime && timeChanged && start && end) {
                    await appointmentService.move(appointment.id, start, end);
                    log('update', appointment.id, appointment.patientId, `moved to ${start.toISOString()}`);
                }
                if (canEditTime && effectiveNotify !== appointment.notifyPatient) {
                    await appointmentService.setNotifyPatient(appointment.id, effectiveNotify);
                }
            }
            onChanged?.();
            onClose();
        } catch (err) {
            console.error('Saving appointment failed:', err);
            setError(tSaveFailed);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelAppointment = async () => {
        if (!appointment) return;
        setSaving(true);
        setError(null);
        try {
            await appointmentService.cancel(appointment.id);
            log('update', appointment.id, appointment.patientId, canMark ? `marked cancelled (was ${appointment.status})` : 'cancelled');
            onChanged?.();
            onClose();
        } catch (err) {
            console.error('Cancelling appointment failed:', err);
            setError(tSaveFailed);
        } finally {
            setSaving(false);
        }
    };

    const title = mode === 'create' ? 'New appointment' : readOnly ? 'Appointment' : 'Edit appointment';
    const hasChanges = mode === 'create' || timeChanged
        || (!!appointment && effectiveNotify !== appointment.notifyPatient);

    return (
        <div className={styles.overlay} role="presentation" onClick={() => !saving && onClose()}>
            <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="appointmentEditorTitle"
                onClick={e => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h2 id="appointmentEditorTitle" className={styles.modalTitle}><T>{title}</T></h2>
                    <button type="button" className={styles.modalCloseButton} onClick={onClose} aria-label={tClose} disabled={saving}>
                        <X className={styles.modalCloseIcon} aria-hidden="true" />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    {/* ── Patient ─────────────────────────────────── */}
                    <div className={styles.field}>
                        {mode === 'create' && patientId ? (
                            // A patient is chosen: show it plainly, with a way to pick another.
                            <>
                                <span className={styles.label}><T>Patient</T></span>
                                <div className={styles.selectedPatient}>
                                    <span className={styles.selectedPatientName}>
                                        <span aria-hidden="true">✓ </span>{patientName(patientId)}
                                    </span>
                                    <button type="button" className={styles.linkButton}
                                        onClick={() => { setPatientId(''); setSearch(''); }}>
                                        <T>Change</T>
                                    </button>
                                </div>
                            </>
                        ) : mode === 'create' ? (
                            // No patient yet: type to filter, click a name to choose it.
                            <>
                                <label className={styles.label} htmlFor="apptPatientSearch">
                                    <T>Patient</T><span className={styles.required} aria-hidden="true">*</span>
                                </label>
                                <input
                                    id="apptPatientSearch"
                                    type="text"
                                    className={styles.input}
                                    placeholder={tSearchPatient}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => {
                                        // Enter picks the only / first match.
                                        if (e.key === 'Enter' && filteredPatients.length > 0) {
                                            e.preventDefault();
                                            setPatientId(filteredPatients[0].id);
                                        }
                                    }}
                                    aria-required="true"
                                    aria-describedby="apptPatientHint"
                                    autoFocus
                                />
                                <p id="apptPatientHint" className={styles.hint}><T>Click a patient to choose them.</T></p>
                                <ul className={styles.patientList} aria-label={tChoosePatient}>
                                    {filteredPatients.map(p => (
                                        <li key={p.id}>
                                            <button type="button" className={styles.patientOption} onClick={() => setPatientId(p.id)}>
                                                <span className={styles.patientOptionName}>{p.fullName}</span>
                                                {p.mobile && <span className={styles.patientOptionMeta}>{p.mobile}</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                {filteredPatients.length === 0 && (
                                    <p className={styles.hint}><T>No matching patients.</T></p>
                                )}
                            </>
                        ) : (
                            <>
                                <span className={styles.label}><T>Patient</T></span>
                                <p className={styles.readOnlyValue}>{patientName(appointment!.patientId)}</p>
                            </>
                        )}
                    </div>

                    {/* ── Date, time, length ──────────────────────── */}
                    {canEditTime ? (
                        <div className={styles.row3}>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="apptDate"><T>Date</T></label>
                                <DateField id="apptDate" value={day}
                                    onChange={d => { setDay(d); setWarnings(null); }} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="apptTime"><T>Start time</T></label>
                                <TimeSelect id="apptTime" className={styles.input} value={time}
                                    onChange={v => { setTime(v); setWarnings(null); }} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="apptMinutes"><T>Length (minutes)</T></label>
                                <input id="apptMinutes" type="number" min={MIN_MINUTES} max={MAX_MINUTES} step={5} className={styles.input}
                                    value={Number.isFinite(minutes) ? minutes : ''}
                                    onChange={e => { setMinutes(e.target.value === '' ? NaN : Number(e.target.value)); setWarnings(null); }} />
                            </div>
                        </div>
                    ) : appointment && (
                        <div className={styles.field}>
                            <span className={styles.label}><T>When</T></span>
                            <p className={styles.readOnlyValue}>
                                {formatDayDateTime(appointment.start, language)}–{toHHmm(appointment.end)}
                            </p>
                        </div>
                    )}

                    {/* ── Notify patient: a calendar invitation by email (server-side trigger) ── */}
                    {(mode === 'create' || canEditTime) && (
                        <div className={styles.field}>
                            <label className={`${styles.checkboxRow} ${patientId && !patientHasEmail ? styles.unavailable : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={effectiveNotify}
                                    disabled={!!patientId && !patientHasEmail}
                                    onChange={e => setNotifyPatient(e.target.checked)}
                                    aria-describedby={patientId && !patientHasEmail ? 'apptNoEmailNote' : undefined}
                                />
                                <span><T>Notify patient</T></span>
                            </label>
                            {patientId && !patientHasEmail && (
                                <p id="apptNoEmailNote" className={styles.hint}>
                                    <T>Appointments will be booked, but the patient will not receive calendar invitations.</T>
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Status (set by the app; see canMarkCancelled for the one manual change) ── */}
                    {appointment && (
                        <div className={styles.field}>
                            <span className={styles.label}><T>Status</T></span>
                            <p className={styles.readOnlyValue}><T>{STATUS_LABELS[appointment.status]}</T></p>
                        </div>
                    )}

                    {readOnly && (
                        <p className={styles.infoNote}><T>View only: you are viewing another caretaker's calendar.</T></p>
                    )}

                    {/* ── Clash / working-hours warnings ─────────── */}
                    {warnings && (
                        <div className={styles.warningBox} role="alert">
                            <p className={styles.warningTitle}><span aria-hidden="true">⚠ </span><T>Please check before booking</T></p>
                            <ul className={styles.warningList}>
                                {warnings.overlaps.map(o => (
                                    <li key={o.id}>
                                        <T>Overlaps with the appointment of</T> {patientName(o.patientId)} ({toHHmm(o.start)}–{toHHmm(o.end)})
                                    </li>
                                ))}
                                {warnings.outside && <li><T>Outside your working hours</T></li>}
                            </ul>
                        </div>
                    )}

                    {confirmingCancel && (
                        <div className={styles.warningBox} role="alert">
                            {canMark ? (
                                <>
                                    <p className={styles.warningTitle}><T>Mark this appointment as cancelled?</T></p>
                                    <p><T>Use this when the patient cancelled in advance. It will not count as missed.</T></p>
                                </>
                            ) : (
                                <p className={styles.warningTitle}><T>Cancel this appointment?</T></p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Actions (errors sit here so they are always in view) ── */}
                <div className={styles.actions}>
                    {error && (
                        <p className={`${styles.errorText} ${styles.actionsError}`} role="alert">
                            <span aria-hidden="true">⚠ </span>{error}
                        </p>
                    )}
                    {confirmingCancel ? (
                        <>
                            <button type="button" className={styles.btnSecondary} onClick={() => setConfirmingCancel(false)} disabled={saving}>
                                {canMark ? <T>Keep as is</T> : <T>Keep appointment</T>}
                            </button>
                            <button type="button" className={styles.btnDanger} onClick={handleCancelAppointment} disabled={saving}>
                                {canMark ? <T>Mark as cancelled</T> : <T>Cancel appointment</T>}
                            </button>
                        </>
                    ) : (
                        <>
                            {(canCancel || canMark) && (
                                <button type="button" className={`${styles.btnDangerOutline} ${styles.actionsStart}`}
                                    onClick={() => setConfirmingCancel(true)} disabled={saving}>
                                    {canMark ? <T>Mark as cancelled</T> : <T>Cancel appointment</T>}
                                </button>
                            )}
                            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
                                <T>Close</T>
                            </button>
                            {!readOnly && canEditTime && (
                                warnings ? (
                                    <button type="button" className={styles.btnPrimary} onClick={() => handleSave(true)} disabled={saving}>
                                        <T>Book anyway</T>
                                    </button>
                                ) : (
                                    <button type="button" className={styles.btnPrimary} onClick={() => handleSave(false)} disabled={saving || !hasChanges}>
                                        {mode === 'create' ? <T>Book</T> : <T>Save</T>}
                                    </button>
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AppointmentEditor;
