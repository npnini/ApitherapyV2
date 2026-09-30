// src/utils/appointments/time.ts

import { WeekdayIndex, WorkingDay, WorkingWeek } from '../../types/appointments';

const WEEKDAYS: WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** Local "HH:mm" of a date (the client shows browser-local time, plan §1.5). */
export const toHHmm = (date: Date): string =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "dd/mm/yyyy" in every language (user decision, 2026-09-28). */
export const formatDate = (date: Date): string =>
    `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;

/** "dd/mm" (calendar column headers). */
export const formatDayMonth = (date: Date): string => `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;

/** Parses "d/m/yyyy" or "dd/mm/yyyy" to a local date; null when invalid (e.g. 31/02/2026). */
export const parseDate = (text: string): Date | null => {
    const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
};

/** Weekday name in the UI language, e.g. "Sunday" / "יום ראשון". */
export const formatWeekday = (date: Date, language: string, width: 'long' | 'short' = 'long'): string =>
    date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', { weekday: width });

/** A stored time (Firestore Timestamp, Date, millis or ISO string) as a Date; null if absent. */
export const toDateValue = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') return (value as { toDate: () => Date }).toDate();
    if (typeof value === 'number' || typeof value === 'string') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
};

/** True when a stored time falls on today's local date (e.g. "already had a treatment today"). */
export const isTodayLocal = (value: unknown, now: Date = new Date()): boolean =>
    toDateValue(value)?.toDateString() === now.toDateString();

/** "Sunday 04/10/2026 10:00". */
export const formatDayDateTime = (date: Date, language: string): string =>
    `${formatWeekday(date, language)} ${formatDate(date)} ${toHHmm(date)}`;

/** A new Date on the same local day as `day`, at local "HH:mm". */
export const atTime = (day: Date, hhmm: string): Date => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
};

/** True when [start, end) is not fully inside that day's working hours (or the day is off). */
export const isOutsideWorkingHours = (start: Date, end: Date, week: WorkingWeek): boolean => {
    const day = week[start.getDay() as WeekdayIndex];
    if (!day?.on) return true;
    const sameDay = start.toDateString() === new Date(end.getTime() - 1).toDateString();
    return !sameDay || toHHmm(start) < day.start || toHHmm(end) > day.end || (toHHmm(end) === '00:00');
};

/** FullCalendar businessHours: one entry per working day. */
export const toBusinessHours = (week: WorkingWeek) =>
    WEEKDAYS.filter(d => week[d]?.on).map(d => ({ daysOfWeek: [d], startTime: week[d].start, endTime: week[d].end }));

/** Earliest working start in the week ("HH:mm"), for the calendar's initial scroll position. */
export const earliestWorkingStart = (week: WorkingWeek): string => {
    const starts = WEEKDAYS.filter(d => week[d]?.on).map(d => week[d].start).sort();
    return starts[0] || '08:00';
};

/** Index = weekday (0 = Sunday), matching the workingWeek keys. English source text. */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "HH:mm" values in 15-minute steps, 00:00 … 23:45. */
export const TIME_OPTIONS_15_MIN: string[] = Array.from({ length: 96 }, (_, i) =>
    `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`
);

/** A working day whose end is not after its start ("HH:mm" compares correctly as text). */
export const isWorkingDayInvalid = (day: Partial<WorkingDay> | undefined): boolean =>
    !!day?.on && !(typeof day.start === 'string' && typeof day.end === 'string' && day.start < day.end);
