import React from 'react';
import { T } from '../T';
import styles from './PatientIntake.module.css';

const InstructionsTab: React.FC = () => {
    return (
        <div className={styles.placeholderTab}>
            <h2><T>Instructions</T></h2>
            <p><T>Patient-specific instructions and aftercare guidelines.</T></p>
            <ul style={{ marginTop: '1rem', textAlign: 'left', display: 'inline-block' }}>
                <li><T>General care instructions</T></li>
                <li><T>Treatment-specific guidelines</T></li>
            </ul>
        </div>
    );
};

export default InstructionsTab;
