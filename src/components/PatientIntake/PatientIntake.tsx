import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PersonalDetails from './PersonalDetails';
import QuestionnaireStep from './QuestionnaireStep';
import { PatientData } from '../../types/patient';
import styles from './PatientIntake.module.css';

interface PatientIntakeProps {
    patient: Partial<PatientData>;
    onSave: (patientData: PatientData) => void;
    onUpdate: (patientData: PatientData) => void;
    onBack: () => void;
    saveStatus: 'idle' | 'saving' | 'success' | 'error';
    errorMessage: string;
}

const PatientIntake: React.FC<PatientIntakeProps> = ({ patient, onSave, onUpdate, onBack, saveStatus, errorMessage }) => {
    const { t } = useTranslation();
    const [currentStep, setCurrentStep] = useState(1);

    const initializePatientData = (p: Partial<PatientData>): Partial<PatientData> => {
        return {
            ...p,
            fullName: p.fullName ?? '',
            identityNumber: p.identityNumber ?? '',
            email: p.email ?? '',
            mobile: p.mobile ?? '',
            birthDate: p.birthDate ?? '',
            profession: p.profession ?? '',
            address: p.address ?? '',
            medicalRecord: p.medicalRecord ?? {},
            questionnaireResponse: p.questionnaireResponse ?? {},
        };
    };

    const [patientData, setPatientData] = useState<Partial<PatientData>>(initializePatientData(patient));
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

    const totalSteps = 2; // Reduced to 2 steps

    useEffect(() => {
        setPatientData(initializePatientData(patient));
    }, [patient]);

    const isStepValid = useCallback(() => {
        switch (currentStep) {
            case 1:
                return !!(patientData.fullName && patientData.identityNumber && patientData.email && patientData.mobile && patientData.birthDate && patientData.profession && patientData.address);
            case 2:
                // Step 2 now includes the signature
                return !!patientData.questionnaireResponse?.signature;
            default:
                return true;
        }
    }, [currentStep, patientData]);

    const handleNext = useCallback(() => {
        setHasAttemptedSubmit(true);
        if (isStepValid()) {
            if (currentStep < totalSteps) {
                setCurrentStep(currentStep + 1);
            }
        }
    }, [currentStep, isStepValid, totalSteps]);

    const handleBack = () => {
        setHasAttemptedSubmit(false);
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleUpdate = () => {
        onUpdate(patientData as PatientData);
    };

    const handleCompleteSubmission = () => {
        setHasAttemptedSubmit(true);
        if (isStepValid()) {
            onSave(patientData as PatientData);
        }
    }

    const handleDataChange = (data: Partial<PatientData>) => {
        setPatientData(data);
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <PersonalDetails patientData={patientData} onDataChange={handleDataChange} />;
            case 2:
                // No more signature step, it's part of the questionnaire now
                return <QuestionnaireStep 
                            patientData={patientData} 
                            onDataChange={handleDataChange}
                        />;
            default:
                return <div>{t('unknown_step')}</div>;
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex justify-center items-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-full overflow-hidden">
                <div className={`${styles.modalHeader} bg-blue-600 text-white`}>
                    <h3 className="text-lg font-semibold">
                        {patient.id ? `${t('patient_details')} - ${patientData.fullName}` : t('patient_intake_process')}
                    </h3>
                    <div className={styles.headerRight}>
                        <button type="button" onClick={onBack} className="text-gray-200 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center">
                            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                            </svg>
                            <span className="sr-only">{t('close_modal')}</span>
                        </button>
                    </div>
                </div>

                {/* This outer div handles the external scroll for the whole modal content */}
                <div className="p-6 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    {renderStep()}
                </div>

                <div className="flex items-center justify-between p-4 md:p-5 border-t border-gray-200 rounded-b">
                    <div>
                        {currentStep > 1 && (
                            <button onClick={handleBack} className="text-gray-900 bg-white border border-gray-300 focus:outline-none hover:bg-gray-100 focus:ring-4 focus:ring-gray-100 font-medium rounded-lg text-sm px-5 py-2.5">
                                {t('back')}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center">
                        {saveStatus === 'saving' && <div className="text-sm text-gray-500">{t('saving')}...</div>}
                        {saveStatus === 'success' && <div className="text-sm text-green-500">{t('saved_successfully')}</div>}
                        {saveStatus === 'error' && errorMessage && <div className="text-sm text-red-500">{errorMessage}</div>}

                        <button onClick={handleUpdate} disabled={saveStatus === 'saving'} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50 me-4">
                            {t('update')}
                        </button>
                        
                        {currentStep < totalSteps ? (
                            <button onClick={handleNext} disabled={!isStepValid() && hasAttemptedSubmit} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50">
                                {t('next_step')}
                            </button>
                        ) : (
                            <button onClick={handleCompleteSubmission} disabled={!isStepValid() || saveStatus === 'saving'} className="text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50">
                                {t('complete_submission')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PatientIntake;