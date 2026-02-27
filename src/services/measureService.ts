import { format, startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';
import { MeasuredValueReading } from '../types/patient';
import { Measure } from '../types/measure';

export type DateDensity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface GroupedReading {
    date: string; // The ID/Key used for X-Axis
    label: string; // The human readable label (e.g. "2025-45 (2025-11-02)")
    displayDate?: string; // Optional secondary label
    timestamp: number;
    [key: string]: any; // measureId: value
}

export const groupReadingsByDensity = (
    readings: MeasuredValueReading[],
    density: DateDensity,
    validMeasureIds: Set<string> = new Set()
): GroupedReading[] => {
    const groups: Map<string, GroupedReading> = new Map();

    readings.forEach(reading => {
        if (!reading.timestamp) return;
        const date = reading.timestamp.toDate ? reading.timestamp.toDate() : new Date(reading.timestamp);

        let groupDate: Date;
        let mainKey: string;
        let labelText: string;

        switch (density) {
            case 'day':
                groupDate = startOfDay(date);
                mainKey = format(groupDate, 'yyyy-MM-dd');
                labelText = mainKey;
                break;
            case 'week':
                groupDate = startOfWeek(date);
                mainKey = format(groupDate, 'yyyy-II'); // ISO year-week for consistency
                labelText = `${mainKey} (${format(groupDate, 'yyyy-MM-dd')})`;
                break;
            case 'month':
                groupDate = startOfMonth(date);
                mainKey = format(groupDate, 'yyyy-MM');
                labelText = mainKey;
                break;
            case 'quarter':
                groupDate = startOfQuarter(date);
                mainKey = format(groupDate, 'yyyy-Qq');
                labelText = mainKey;
                break;
            case 'year':
                groupDate = startOfYear(date);
                mainKey = format(groupDate, 'yyyy');
                labelText = mainKey;
                break;
            default:
                groupDate = startOfDay(date);
                mainKey = format(groupDate, 'yyyy-MM-dd');
                labelText = mainKey;
        }

        if (!groups.has(mainKey)) {
            groups.set(mainKey, {
                date: mainKey,
                label: labelText,
                timestamp: groupDate.getTime(),
            });
        }

        const group = groups.get(mainKey)!;
        reading.readings.forEach(r => {
            // Only include if it's a known measure
            if (validMeasureIds.size > 0 && !validMeasureIds.has(r.measureId)) return;

            // For scale, we take the value. For multiples in same slot, take latest.
            group[r.measureId] = r.value;
        });
    });

    return Array.from(groups.values()).sort((a, b) => a.timestamp - b.timestamp);
};

export const getMeasureColor = (index: number): string => {
    const colors = [
        '#3b82f6', // blue-500
        '#ef4444', // red-500
        '#10b981', // emerald-500
        '#f59e0b', // amber-500
        '#8b5cf6', // violet-500
        '#ec4899', // pink-500
        '#06b6d4', // cyan-500
        '#f97316', // orange-500
    ];
    return colors[index % colors.length];
};
