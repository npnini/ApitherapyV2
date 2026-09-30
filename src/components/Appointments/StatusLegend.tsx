import React from 'react';
import { T, useT } from '../T';
import { AppointmentStatus } from '../../types/appointments';
import { CALENDAR_LEGEND_STATUSES, STATUS_LABELS } from '../../utils/appointments/status';
import styles from './Appointments.module.css';

/**
 * Status legend for the calendar pages (spec §2). Each swatch repeats the event's text marker.
 * The Calendar hides cancelled appointments; the Today page shows them, so it passes all four.
 */
const StatusLegend: React.FC<{ statuses?: AppointmentStatus[] }> = ({ statuses = CALENDAR_LEGEND_STATUSES }) => {
    const tLegend = useT('Legend');
    return (
        <ul className={styles.legend} aria-label={tLegend}>
            {statuses.map(status => (
                <li key={status} className={styles.legendItem}>
                    <span className={`${styles.legendSwatch} ${styles[`status_${status}`]}`} aria-hidden="true">
                        {status === 'attended' ? '✓' : status === 'missed' ? '✕' : ''}
                    </span>
                    <span><T>{STATUS_LABELS[status]}</T></span>
                </li>
            ))}
        </ul>
    );
};

export default StatusLegend;
