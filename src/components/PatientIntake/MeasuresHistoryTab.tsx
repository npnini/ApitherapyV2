import React from 'react';
import { T } from '../T';
import styles from './PatientIntake.module.css';

const MeasuresHistoryTab: React.FC = () => {
    return (
        <div className={styles.placeholderTab}>
            <h2><T>Measures History</T></h2>
            <p><T>History of clinical measurements and vital signs over time.</T></p>
            <div style={{ marginTop: '2rem', height: '150px', background: '#f8fafc', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
                <T>Measures Progress Chart Mock-up</T>
            </div>
        </div>
    );
};

export default MeasuresHistoryTab;
