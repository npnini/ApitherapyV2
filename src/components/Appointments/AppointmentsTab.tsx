import React, { useMemo } from 'react';
import { AppointmentPlan, ReminderChannel, WeekdayIndex, WeeklySlot } from '../../types/appointments';
import { JoinedPatientData } from '../../types/patient';
import { AppUser } from '../../types/user';
import { T, useT } from '../T';
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
}

/**
 * Patient intake "Appointments" tab, top part (spec §8): treatment plan and reminders.
 * Saved by the intake's standard Update button, which writes patients/{id}.appointmentPlan.
 * The appointment list and suggestions are added in Step 7.
 */
const AppointmentsTab: React.FC<AppointmentsTabProps> = ({ patientData, onDataChange, appConfig, user, fallbackLanguage, showErrors, sessionsDone }) => {
    const tRemoveSlot = useT('Remove slot');
    const tSlot = useT('Slot');
    const tWeekday = useT('Weekday');
    const tTime = useT('Time');

    const plan = getEffectiveAppointmentPlan(patientData, appConfig, fallbackLanguage);
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

    return (
        <div className={styles.container}>
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
                    {plan.plannedSessions !== null && !errors.plannedSessions && sessionsDone !== null && (
                        <p className={styles.progress} aria-live="polite">
                            <T>Sessions done</T>: {sessionsDone} / {plan.plannedSessions} · <T>Remaining</T>: {Math.max(plan.plannedSessions - sessionsDone, 0)}
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
    );
};

export default AppointmentsTab;
