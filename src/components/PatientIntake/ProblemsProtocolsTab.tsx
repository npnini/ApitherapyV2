import React from 'react';
import { T } from '../T';
import styles from './PatientIntake.module.css';

const ProblemsProtocolsTab: React.FC = () => {
    return (
        <div className={styles.placeholderTab}>
            <h2><T>Problems & Protocols</T></h2>
            <p><T>Overview of diagnosed problems and associated treatment protocols.</T></p>
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', width: '200px' }}>
                    <strong><T>Active Problems</T></strong>
                </div>
                <div style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', width: '200px' }}>
                    <strong><T>Assigned Protocols</T></strong>
                </div>
            </div>
        </div>
    );
};

export default ProblemsProtocolsTab;
