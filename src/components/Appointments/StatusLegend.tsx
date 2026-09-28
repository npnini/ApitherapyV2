import React from 'react';
import { T, useT } from '../T';
import { CALENDAR_LEGEND_STATUSES, STATUS_LABELS } from '../../utils/appointments/status';
import styles from './Appointments.module.css';

/** Status legend for the calendar pages (spec §2). Each swatch repeats the event's text marker. */
const StatusLegend: React.FC = () => {
    const tLegend = useT('Legend');
    return (
        <ul className={styles.legend} aria-label={tLegend}>
            {CALENDAR_LEGEND_STATUSES.map(status => (
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
