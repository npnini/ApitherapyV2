import React, { useEffect } from 'react';
import { WorkingDay, WorkingWeek } from '../../types/appointments';
import { WEEKDAY_NAMES, TIME_OPTIONS_15_MIN, isWorkingDayInvalid } from '../../utils/appointments/time';
import { T, useTranslationContext } from '../T';
import styles from './WorkingWeekEditor.module.css';

const WORKING_DAY_ERROR = 'End time must be after start time.';

interface TimeSelectProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
}

/** Time of day in 15-minute steps. An off-grid stored value stays selectable. */
export const TimeSelect: React.FC<TimeSelectProps> = ({ id, value, onChange, ariaLabel, disabled, className }) => {
    const options = !value || TIME_OPTIONS_15_MIN.includes(value) ? TIME_OPTIONS_15_MIN : [value, ...TIME_OPTIONS_15_MIN];
    return (
        <select
            id={id}
            className={className || styles.timeSelect}
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-label={ariaLabel}
            disabled={disabled}
        >
            {options.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
    );
};

interface WorkingWeekEditorProps {
    idPrefix: string;
    value: WorkingWeek;
    onChange: (week: WorkingWeek) => void;
}

/** Seven rows, Sunday first: working on/off, start and end time. Shows a per-row error when end ≤ start. */
const WorkingWeekEditor: React.FC<WorkingWeekEditorProps> = ({ idPrefix, value, onChange }) => {
    const { getTranslation, registerString } = useTranslationContext();

    useEffect(() => {
        ['Working day', 'Start time', 'End time'].forEach(s => registerString(s));
    }, [registerString]);

    return (
        <div className={styles.list}>
            {WEEKDAY_NAMES.map((dayName, dayIndex) => {
                const day: WorkingDay = (value as Record<number, WorkingDay>)[dayIndex] || { on: false, start: '09:00', end: '17:00' };
                const dayLabel = getTranslation(dayName);
                const updateDay = (patch: Partial<WorkingDay>) =>
                    onChange({ ...value, [dayIndex]: { ...day, ...patch } });
                return (
                    <div key={dayIndex} className={styles.row}>
                        <label className={styles.toggle}>
                            <input
                                type="checkbox"
                                checked={!!day.on}
                                onChange={e => updateDay({ on: e.target.checked })}
                                aria-label={`${dayLabel}: ${getTranslation('Working day')}`}
                            />
                            <span><T>{dayName}</T></span>
                        </label>
                        <TimeSelect
                            id={`${idPrefix}-${dayIndex}-start`}
                            value={day.start || ''}
                            onChange={v => updateDay({ start: v })}
                            ariaLabel={`${dayLabel}: ${getTranslation('Start time')}`}
                            disabled={!day.on}
                        />
                        <span aria-hidden="true">–</span>
                        <TimeSelect
                            id={`${idPrefix}-${dayIndex}-end`}
                            value={day.end || ''}
                            onChange={v => updateDay({ end: v })}
                            ariaLabel={`${dayLabel}: ${getTranslation('End time')}`}
                            disabled={!day.on}
                        />
                        {isWorkingDayInvalid(day) && (
                            <p className={styles.rowError} role="alert">
                                <span aria-hidden="true">⚠ </span><T>{WORKING_DAY_ERROR}</T>
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default WorkingWeekEditor;
