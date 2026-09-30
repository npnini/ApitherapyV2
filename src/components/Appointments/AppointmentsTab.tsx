import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Appointment, AppointmentPlan, ReminderChannel, WeekdayIndex, WeeklySlot } from '../../types/appointments';
import AppointmentList from './AppointmentList';
import { TreatmentSession } from '../../types/treatmentSession';
import PatternChangeDialog from './PatternChangeDialog';
import * as appointmentService from '../../services/appointmentService';
import { offPatternBooked, slotsKey, upcomingBooked } from '../../utils/appointments/suggestions';
import { JoinedPatientData } from '../../types/patient';
import { AppUser } from '../../types/user';
import { T, useT, useTranslationContext } from '../T';
import { TimeSelect } from './WorkingWeekEditor';
import { WEEKDAY_NAMES } from '../../utils/appointments/time';
import { getEffectiveAppointmentPrefs } from '../../utils/appointments/prefs';
import {
    MAX_PLANNED_SESSIONS, REMINDER_CHANNEL_LABELS,
    getEffectiveAppointmentPlan, getReminderChannelOptions, validateAppointmentPlan,
} from '../../utils/appointments/plan';
import { getLanguageName } from '../../utils/languageNames';
import styles from './AppointmentsTab.module.css';

interface AppointmentsTabProps {
    patientData: Partial<JoinedPatientData>;
    onDataChange: (data: Partial<JoinedPatientData>) => void;
    appConfig: any;
    user: AppUser;
    /** Caretaker's language: the default for the patient's preferred language. */
    fallbackLanguage: string;
    showErrors: boolean;
    /**
     * Treatments recorded for the patient (null while counting): "sessions done", including
     * treatments from before the appointments feature. Planned sessions may not be fewer.
     */
    sessionsDone: number | null;
    /** The plan as last saved (patients/{id}.appointmentPlan): a pattern change is detected after Update. */
    savedPlan?: Partial<AppointmentPlan>;
    /** "View As" another caretaker's patient: see only (spec §14). */
    readOnly: boolean;
    /** Opens the Calendar on the week of `date` (with "Back to patient"). */
    onOpenCalendar: (date: Date) => void;
}

type SubTab = 'plan' | 'list';
const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'plan', label: 'Treatment plan' },
    { key: 'list', label: 'Appointments' },
];

/**
 * Patient intake "Appointments" tab (spec §8, §9): treatment plan with progress, reminders,
 * and the appointment list with suggestions. The plan is saved by the intake's standard
 * Update button, which writes patients/{id}.appointmentPlan; appointments are saved directly.
 */
const AppointmentsTab: React.FC<AppointmentsTabProps> = ({
    patientData, onDataChange, appConfig, user, fallbackLanguage, showErrors, sessionsDone, savedPlan, readOnly, onOpenCalendar,
}) => {
    const tRemoveSlot = useT('Remove slot');
    const tSlot = useT('Slot');
    const tWeekday = useT('Weekday');
    const tTime = useT('Time');
    const tLoadFailed = useT('Could not load appointments.');
    const { direction } = useTranslationContext();

    // ── The patient's appointments, live: bookings made elsewhere and the functions' changes
    // (walk-in, Attended, Missed) appear without reopening the tab ─────────────────────
    const caretakerId = patientData.caretakerId || user.uid;
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    useEffect(() => {
        if (!patientData.id) return;
        return appointmentService.watchByPatient(caretakerId, patientData.id,
            list => { setAppointments(list); setLoadError(null); },
            err => { console.error('Loading patient appointments failed:', err); setLoadError(tLoadFailed); });
    }, [caretakerId, patientData.id, tLoadFailed]);

    // The patient's treatments by id: session numbers and "View treatment" on attended rows.
    // Reloaded with the appointments and whenever the treatment count changes.
    const [treatmentsById, setTreatmentsById] = useState<Map<string, TreatmentSession>>(new Map());
    useEffect(() => {
        if (!patientData.id) return;
        let cancelled = false;
        appointmentService.listPatientTreatments(patientData.id)
            .then(list => { if (!cancelled) setTreatmentsById(new Map(list.map(t => [t.id as string, t]))); })
            .catch(err => console.error('Loading treatments failed:', err));
        return () => { cancelled = true; };
    }, [patientData.id, sessionsDone, appointments]);

    // ── Weekly pattern changed and saved: offer to move off-pattern bookings (spec §8) ──
    const savedSlots = savedPlan?.weeklySlots || [];
    const savedKey = slotsKey(savedSlots);
    const previousSavedKey = useRef(savedKey);
    const [patternChange, setPatternChange] = useState<Appointment[] | null>(null);
    const [patternResult, setPatternResult] = useState<{ moved: number; notMoved: number } | null>(null);
    useEffect(() => {
        if (previousSavedKey.current === savedKey) return;
        previousSavedKey.current = savedKey;
        if (readOnly || savedSlots.length === 0) return;
        const off = offPatternBooked(appointments, savedSlots);
        if (off.length > 0) setPatternChange(off);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedKey]);

    const plan = getEffectiveAppointmentPlan(patientData, appConfig, fallbackLanguage);
    const prefs = getEffectiveAppointmentPrefs(user, appConfig);
    const progress = sessionsDone === null || plan.plannedSessions === null ? null : {
        done: sessionsDone,
        planned: plan.plannedSessions,
        missed: appointments.filter(a => a.status === 'missed').length,
        cancelled: appointments.filter(a => a.status === 'cancelled').length,
        remaining: Math.max(plan.plannedSessions - sessionsDone, 0),
        booked: upcomingBooked(appointments).length,
    };
    const channelOptions = getReminderChannelOptions(appConfig, patientData);
    const errors = validateAppointmentPlan(plan, channelOptions, sessionsDone);

    const supportedLanguages: string[] = useMemo(() => {
        const langs: string[] = appConfig?.languageSettings?.supportedLanguages || ['en'];
        return langs.includes(plan.preferredLanguage) ? langs : [plan.preferredLanguage, ...langs];
    }, [appConfig, plan.preferredLanguage]);

    const updatePlan = (patch: Partial<AppointmentPlan>) => {
        onDataChange({ ...patientData, appointmentPlan: { ...plan, ...patch } });
    };

    const updateSlot = (index: number, patch: Partial<WeeklySlot>) => {
        updatePlan({ weeklySlots: plan.weeklySlots.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
    };

    // A new slot starts on the caretaker's first working day not yet in the pattern, at that day's start time.
    const addSlot = () => {
        const prefs = getEffectiveAppointmentPrefs(user, appConfig);
        const usedDays = new Set(plan.weeklySlots.map(s => s.weekday));
        const workingDays = ([0, 1, 2, 3, 4, 5, 6] as WeekdayIndex[]).filter(d => prefs.workingWeek[d].on);
        const weekday = workingDays.find(d => !usedDays.has(d)) ?? workingDays[0] ?? 0;
        updatePlan({ weeklySlots: [...plan.weeklySlots, { weekday, time: prefs.workingWeek[weekday].start || '09:00' }] });
    };

    const hasAvailableChannel = channelOptions.some(o => o.available);

    // ── Sub-tabs: "Treatment plan" (plan + reminders) and "Appointments" (the list) ──
    // Opens on the list once a plan exists (daily use); on the plan for first setup.
    const [subTab, setSubTab] = useState<SubTab>(() => (plan.plannedSessions !== null ? 'list' : 'plan'));
    // A failed Update must show its errors: switch to the plan when it has any.
    const hasPlanErrors = Object.keys(errors).length > 0;
    useEffect(() => {
        if (showErrors && hasPlanErrors) setSubTab('plan');
    }, [showErrors, hasPlanErrors]);

    const handleSubTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const index = SUB_TABS.findIndex(t => t.key === subTab);
        const forward = (e.key === 'ArrowRight') !== (direction === 'rtl');
        const next = SUB_TABS[(index + (forward ? 1 : SUB_TABS.length - 1)) % SUB_TABS.length].key;
        setSubTab(next);
        document.getElementById(`appt-subtab-${next}`)?.focus();
    };

    const panelProps = (key: SubTab) => ({
        role: 'tabpanel',
        id: `appt-subpanel-${key}`,
        'aria-labelledby': `appt-subtab-${key}`,
        hidden: subTab !== key, // Hidden, not unmounted: unsaved edits in either tab survive switching.
        className: styles.subPanel,
    });

    return (
        <div className={styles.container}>
            {/* ── Progress (spec §8), visible in both sub-tabs ──────────── */}
            {progress && !errors.plannedSessions && (
                // "6 of 10 sessions done · 1 missed · …" as label: value pairs (clean Hebrew word order).
                <p className={styles.progress} aria-live="polite">
                    {/* Isolated LTR: in Hebrew the spaced "/" would otherwise swap the two numbers. */}
                    <T>Sessions done</T>: <bdi dir="ltr">{progress.done} / {progress.planned}</bdi>
                    {' · '}<T>Missed</T>: {progress.missed}
                    {' · '}<T>Cancelled</T>: {progress.cancelled}
                    {' · '}<T>Remaining</T>: {progress.remaining}
                    {' · '}<T>Booked</T>: {progress.booked}
                </p>
            )}
            {patternResult && (
                <p className={styles.infoNote} role="status">
                    <T>Moved to the new pattern</T>: {patternResult.moved}
                    {patternResult.notMoved > 0 && <> · <T>Not moved (no free slot)</T>: {patternResult.notMoved}</>}
                </p>
            )}

            <div className={styles.subTabButtons} role="tablist" onKeyDown={handleSubTabKeyDown}>
                {SUB_TABS.map(t => (
                    <button
                        key={t.key}
                        id={`appt-subtab-${t.key}`}
                        type="button"
                        role="tab"
                        aria-selected={subTab === t.key}
                        aria-controls={`appt-subpanel-${t.key}`}
                        tabIndex={subTab === t.key ? 0 : -1}
                        className={`${styles.subTabButton} ${subTab === t.key ? styles.subTabButtonActive : ''}`}
                        onClick={() => setSubTab(t.key)}
                    >
                        <T>{t.label}</T>
                    </button>
                ))}
            </div>

            <div {...panelProps('plan')}>
            {/* ── Treatment plan ─────────────────────────────────────── */}
            <section className={styles.card} aria-labelledby="apptPlanTitle">
                <h3 id="apptPlanTitle" className={styles.sectionHeader}><T>Treatment plan</T></h3>

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="plannedSessions"><T>Planned sessions</T></label>
                    <input
                        id="plannedSessions"
                        type="number"
                        min={1}
                        max={MAX_PLANNED_SESSIONS}
                        step={1}
                        className={`${styles.input} ${styles.narrowInput} ${showErrors && errors.plannedSessions ? styles.inputError : ''}`}
                        value={plan.plannedSessions ?? ''}
                        onChange={e => updatePlan({ plannedSessions: e.target.value === '' ? null : Number(e.target.value) })}
                        aria-invalid={showErrors && !!errors.plannedSessions}
                        aria-describedby={showErrors && errors.plannedSessions ? 'plannedSessionsError' : undefined}
                    />
                    {showErrors && errors.plannedSessions && (
                        <p id="plannedSessionsError" className={styles.fieldError}>
                            <span aria-hidden="true">⚠ </span><T>{errors.plannedSessions}</T>
                        </p>
                    )}
                </div>

                <div className={styles.field}>
                    <span className={styles.label} id="weeklySlotsLabel"><T>Weekly pattern</T></span>
                    <div role="group" aria-labelledby="weeklySlotsLabel" className={styles.slotList}>
                        {plan.weeklySlots.length === 0 && (
                            <p className={styles.emptyNote}><T>No weekly slots yet.</T></p>
                        )}
                        {plan.weeklySlots.map((slot, index) => (
                            <div key={index} className={styles.slotRow}>
                                <select
                                    className={`${styles.input} ${styles.weekdaySelect}`}
                                    value={slot.weekday}
                                    onChange={e => updateSlot(index, { weekday: Number(e.target.value) as WeekdayIndex })}
                                    aria-label={`${tSlot} ${index + 1}: ${tWeekday}`}
                                >
                                    {WEEKDAY_NAMES.map((name, d) => <option key={d} value={d}><T>{name}</T></option>)}
                                </select>
                                <TimeSelect
                                    id={`weeklySlot-${index}-time`}
                                    value={slot.time}
                                    onChange={time => updateSlot(index, { time })}
                                    ariaLabel={`${tSlot} ${index + 1}: ${tTime}`}
                                />
                                <button
                                    type="button"
                                    className={styles.removeButton}
                                    onClick={() => updatePlan({ weeklySlots: plan.weeklySlots.filter((_, i) => i !== index) })}
                                    aria-label={`${tRemoveSlot} ${index + 1}`}
                                >
                                    <span aria-hidden="true">✕</span>
                                </button>
                            </div>
                        ))}
                    </div>
                    {showErrors && errors.weeklySlots && (
                        <p className={styles.fieldError}>
                            <span aria-hidden="true">⚠ </span><T>{errors.weeklySlots}</T>
                        </p>
                    )}
                    <button type="button" className={styles.addButton} onClick={addSlot}>
                        + <T>Add slot</T>
                    </button>
                </div>
            </section>

            {/* ── Reminders ──────────────────────────────────────────── */}
            <section className={styles.card} aria-labelledby="apptRemindersTitle">
                <h3 id="apptRemindersTitle" className={styles.sectionHeader}><T>Reminders</T></h3>

                <div className={styles.field}>
                    <label className={styles.checkboxRow}>
                        <input
                            type="checkbox"
                            checked={plan.remindersOn}
                            onChange={e => updatePlan({ remindersOn: e.target.checked })}
                        />
                        <span><T>Send reminders</T></span>
                    </label>
                </div>

                {plan.remindersOn && (
                    <fieldset className={styles.fieldset}>
                        <legend className={styles.label}><T>Channel</T></legend>
                        {channelOptions.length === 0 && (
                            <p className={styles.emptyNote}><T>No reminder channels are enabled in the application settings.</T></p>
                        )}
                        {channelOptions.map(option => (
                            <div key={option.channel} className={styles.radioRow}>
                                <label className={`${styles.checkboxRow} ${!option.available ? styles.unavailable : ''}`}>
                                    <input
                                        type="radio"
                                        name="reminderChannel"
                                        value={option.channel}
                                        checked={plan.reminderChannel === option.channel}
                                        disabled={!option.available}
                                        onChange={() => updatePlan({ reminderChannel: option.channel as ReminderChannel })}
                                        aria-describedby={option.hint ? `channelHint-${option.channel}` : undefined}
                                    />
                                    <span><T>{REMINDER_CHANNEL_LABELS[option.channel]}</T></span>
                                </label>
                                {option.hint && (
                                    <span id={`channelHint-${option.channel}`} className={styles.hint}><T>{option.hint}</T></span>
                                )}
                            </div>
                        ))}
                        {channelOptions.length > 0 && !hasAvailableChannel && (
                            <p className={styles.warning}>
                                <span aria-hidden="true">⚠ </span><T>Reminders cannot be sent until the patient has contact details for one of these channels.</T>
                            </p>
                        )}
                        {showErrors && errors.reminderChannel && (
                            <p className={styles.fieldError}>
                                <span aria-hidden="true">⚠ </span><T>{errors.reminderChannel}</T>
                            </p>
                        )}
                    </fieldset>
                )}

                <div className={styles.field}>
                    <label className={styles.label} htmlFor="apptPreferredLanguage"><T>Language for invitations and reminders</T></label>
                    <select
                        id="apptPreferredLanguage"
                        className={`${styles.input} ${styles.narrowInput}`}
                        value={plan.preferredLanguage}
                        onChange={e => updatePlan({ preferredLanguage: e.target.value })}
                    >
                        {supportedLanguages.map(lang => (
                            <option key={lang} value={lang}><T>{getLanguageName(lang)}</T></option>
                        ))}
                    </select>
                </div>
            </section>

            </div>

            {/* ── Appointment list with suggestions (spec §9) ─────────── */}
            <div {...panelProps('list')}>
            {loadError && <p className={styles.fieldError} role="alert"><span aria-hidden="true">⚠ </span>{loadError}</p>}
            {patientData.id && (
                <AppointmentList
                    patient={{ id: patientData.id, fullName: patientData.fullName || '', email: patientData.email, mobile: patientData.mobile }}
                    caretakerId={caretakerId}
                    appointments={appointments}
                    treatmentsById={treatmentsById}
                    plan={plan}
                    sessionsDone={sessionsDone ?? 0}
                    meetingMinutes={prefs.defaultMeetingMinutes}
                    workingWeek={prefs.workingWeek}
                    readOnly={readOnly}
                    actor={user}
                    onOpenCalendar={onOpenCalendar}
                />
            )}
            </div>

            {patternChange && (
                <PatternChangeDialog
                    offPattern={patternChange}
                    newSlots={savedSlots}
                    caretakerId={caretakerId}
                    patientName={patientData.fullName || ''}
                    actor={user}
                    onClose={() => setPatternChange(null)}
                    onMoved={result => {
                        setPatternChange(null);
                        setPatternResult(result);
                        setSubTab('list'); // Show the moved bookings.
                    }}
                />
            )}
        </div>
    );
};

export default AppointmentsTab;
