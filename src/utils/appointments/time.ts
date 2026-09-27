// src/utils/appointments/time.ts

import { WorkingDay } from '../../types/appointments';

/** Index = weekday (0 = Sunday), matching the workingWeek keys. English source text. */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "HH:mm" values in 15-minute steps, 00:00 … 23:45. */
export const TIME_OPTIONS_15_MIN: string[] = Array.from({ length: 96 }, (_, i) =>
    `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`
);

/** A working day whose end is not after its start ("HH:mm" compares correctly as text). */
export const isWorkingDayInvalid = (day: Partial<WorkingDay> | undefined): boolean =>
    !!day?.on && !(typeof day.start === 'string' && typeof day.end === 'string' && day.start < day.end);
