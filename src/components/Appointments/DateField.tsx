import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useT, useTranslationContext } from '../T';
import { formatDate, formatWeekday, parseDate } from '../../utils/appointments/time';
import styles from './Appointments.module.css';

interface DateFieldProps {
    id: string;
    value: Date | null;
    /** Called with the new date, or null while the typed text is not a valid date. */
    onChange: (date: Date | null) => void;
    ariaDescribedBy?: string;
}

const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Date input that always shows dd/mm/yyyy. The browser's own date input formats by the
 * browser's language (mm/dd/yyyy on an English-US browser), which the app cannot change.
 * A button opens the browser's calendar picker for convenience.
 */
const DateField: React.FC<DateFieldProps> = ({ id, value, onChange, ariaDescribedBy }) => {
    const { language } = useTranslationContext();
    const tPick = useT('Choose from calendar');
    const tInvalid = useT('Enter the date as dd/mm/yyyy');
    const [text, setText] = useState(value ? formatDate(value) : '');
    const pickerRef = useRef<HTMLInputElement>(null);

    // Follow outside changes (e.g. the picker), but keep what the user is typing.
    useEffect(() => {
        if (value && parseDate(text)?.getTime() !== value.getTime()) setText(formatDate(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const invalid = text.trim() !== '' && !parseDate(text);

    const openPicker = () => {
        const input = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        try {
            input?.showPicker?.();
        } catch {
            input?.focus();
        }
    };

    return (
        <div>
            <div className={styles.dateFieldRow}>
                <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    placeholder="dd/mm/yyyy"
                    className={`${styles.input} ${invalid ? styles.inputError : ''}`}
                    value={text}
                    onChange={e => { setText(e.target.value); onChange(parseDate(e.target.value)); }}
                    aria-invalid={invalid}
                    aria-describedby={ariaDescribedBy}
                    dir="ltr"
                />
                <button type="button" className={styles.iconButton} onClick={openPicker} aria-label={tPick} title={tPick}>
                    <CalendarDays size={18} aria-hidden="true" />
                </button>
                {/* Hidden native input: only used to show the browser's calendar picker. */}
                <input
                    ref={pickerRef}
                    type="date"
                    className={styles.hiddenPicker}
                    tabIndex={-1}
                    aria-hidden="true"
                    value={value ? toIso(value) : ''}
                    onChange={e => {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        if (y && m && d) onChange(new Date(y, m - 1, d));
                    }}
                />
            </div>
            <p className={invalid ? styles.fieldErrorSmall : styles.hint}>
                {invalid ? <><span aria-hidden="true">⚠ </span>{tInvalid}</> : value ? formatWeekday(value, language) : ' '}
            </p>
        </div>
    );
};

export default DateField;
