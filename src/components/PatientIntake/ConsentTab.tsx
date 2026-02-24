import React from 'react';
import { T } from '../T';
import styles from './PatientIntake.module.css';

const ConsentTab: React.FC = () => {
    return (
        <div className={styles.placeholderTab}>
            <h2><T>Consent</T></h2>
            <p><T>This section will allow managing patient consent forms and digital signatures.</T></p>
            <div style={{ marginTop: '2rem', padding: '2rem', border: '2px dashed #e2e8f0', borderRadius: '0.5rem', textAlign: 'center', color: '#64748b' }}>
                <T>Digital Consent Form Placeholder</T>
            </div>
        </div>
    );
};

export default ConsentTab;
