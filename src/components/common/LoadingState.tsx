import React from 'react';
import styles from './LoadingState.module.css';

interface LoadingStateProps {
    /** What is loading, e.g. <T>Loading treatment history...</T> (reuse the screen's existing text). */
    label: React.ReactNode;
    /** How many placeholder rows to show (default 4). */
    rows?: number;
    /** Full-height page (centred in the screen) instead of a block inside a page. */
    fullPage?: boolean;
}

/**
 * Loading placeholder (UI redesign Tier 2): soft rows with a gentle shimmer and the loading text,
 * announced to screen readers. The shimmer stops when the user prefers reduced motion.
 */
const LoadingState: React.FC<LoadingStateProps> = ({ label, rows = 4, fullPage = false }) => (
    <div className={`${styles.loadingState} ${fullPage ? styles.fullPage : ''}`} role="status" aria-live="polite">
        <div className={styles.rows} aria-hidden="true">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className={styles.row}>
                    <span className={`${styles.bar} ${styles.avatar}`} />
                    <span className={styles.lines}>
                        <span className={`${styles.bar} ${styles.lineLong}`} />
                        <span className={`${styles.bar} ${styles.lineShort}`} />
                    </span>
                </div>
            ))}
        </div>
        <p className={styles.label}>{label}</p>
    </div>
);

export default LoadingState;
