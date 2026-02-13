
import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../common/Modal';
import styles from './PatientIntake.module.css';
import PatientIntakeNav from './PatientIntakeNav';
import PersonalDetails from './PersonalDetails';
import MedicalRecord from './MedicalRecord';
import Questionnaire from './Questionnaire';
import { PatientData } from '../../types/patient';
import { useTranslation } from 'react-i18next';

interface PatientIntakeProps {
    patient: Partial<PatientData>;
    onSave: (patientData: PatientData) => void;
    onBack: () => void;
    isSaving: boolean;
    errorMessage: string;
}

const PatientIntake: React.FC<PatientIntakeProps> = ({ patient, onSave, onBack, isSaving, errorMessage }) => {
    const { t } = useTranslation();
    const [activePage, setActivePage] = useState('Personal');
    const [patientData, setPatientData] = useState<Partial<PatientData>>(patient);

    useEffect(() => {
        setPatientData(patient);
        setActivePage('Personal');
    }, [patient]);

    const handleDataChange = useCallback((data: Partial<PatientData>) => {
        setPatientData(prev => ({ ...prev, ...data }));
    }, []);

    const handleNext = () => {
        if (activePage === 'Personal') setActivePage('Medical Record');
        else if (activePage === 'Medical Record') setActivePage('Questionnaire');
    };

    const handleBackClick = () => {
        if (activePage === 'Questionnaire') setActivePage('Medical Record');
        else if (activePage === 'Medical Record') setActivePage('Personal');
        else onBack();
    };
    
    const handleSave = () => {
        onSave(patientData as PatientData);
    };

    const renderPage = () => {
        switch (activePage) {
            case 'Personal':
                return <PersonalDetails patientData={patientData} onDataChange={handleDataChange} onNext={handleNext} onBack={handleBackClick} />;
            case 'Medical Record':
                return <MedicalRecord patientData={patientData} onDataChange={handleDataChange} onNext={handleNext} onBack={handleBackClick} />;
            case 'Questionnaire':
                return <Questionnaire patientData={patientData} onDataChange={handleDataChange} onSave={handleSave} onBack={handleBackClick} isSaving={isSaving} />;
            default:
                return <PersonalDetails patientData={patientData} onDataChange={handleDataChange} onNext={handleNext} onBack={handleBackClick}/>;
        }
    };

    return (
        <Modal 
            isOpen={true} 
            onClose={onBack} 
            title={t('patient_intake_system')} 
            subtitle={t('new_onboarding_session')}
        >
            <div className={styles.patientIntakeContainer}>
                <PatientIntakeNav activePage={activePage} setActivePage={setActivePage} />
                {errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}
                <div className={styles.pageContent}>
                    {renderPage()}
                </div>
            </div>
        </Modal>
    );
};

export default PatientIntake;
