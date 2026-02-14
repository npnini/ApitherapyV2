import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import Step5 from './Step5';
import { PatientData } from '../../types/patient';

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
    const [patientData, setPatientData] = useState<Partial<PatientData>>({ ...patient });
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

    const totalSteps = 5;

    const isStepValid = useCallback(() => {
        switch (currentStep) {
            case 1:
                return !!(patientData.fullName && patientData.email && patientData.mobile && patientData.birthDate && patientData.profession && patientData.address);
            // Add cases for other steps as needed
            default:
                return true;
        }
    }, [currentStep, patientData]);

    const handleNext = useCallback(() => {
        setHasAttemptedSubmit(true);
        if (isStepValid()) {
            if (currentStep < totalSteps) {
                setCurrentStep(currentStep + 1);
            } else {
                onSave(patientData as PatientData);
            }
        }
    }, [currentStep, onSave, patientData, isStepValid]);

    const handleBack = () => {
        setHasAttemptedSubmit(false); // Reset submit attempt on navigating back
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleUpdate = () => {
        setHasAttemptedSubmit(true);
        if (isStepValid()) {
            onUpdate(patientData as PatientData);
        }
    };

    useEffect(() => {
        setPatientData(patient);
    }, [patient]);

    const renderStep = () => {
        const stepProps = { data: patientData, setData: setPatientData, hasAttemptedSubmit };
        switch (currentStep) {
            case 1: return <Step1 {...stepProps} />;
            case 2: return <Step2 {...stepProps} />;
            case 3: return <Step3 {...stepProps} />;
            case 4: return <Step4 {...stepProps} />;
            case 5: return <Step5 {...stepProps} />;
            default: return <div>{t('unknown_step')}</div>;
        }
    };

    const progress = (currentStep / totalSteps) * 100;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex justify-center items-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-full overflow-hidden">
                <div className="flex justify-between items-center p-4 md:p-5 border-b rounded-t dark:border-gray-600 bg-blue-600 text-white">
                    <h3 className="text-lg font-semibold">
                        {patient.id ? `${t('patient_details')} - ${patientData.fullName}` : t('patient_intake_process')}
                    </h3>
                    <button type="button" onClick={onBack} className="text-gray-200 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white">
                        <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                        </svg>
                        <span className="sr-only">{t('close_modal')}</span>
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    
                    <div className="flex justify-between items-center mb-4">
                        {[...Array(3)].map((_, i) => (
                            <React.Fragment key={i}>
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                                    currentStep > i + 1 ? 'bg-green-500 text-white' : 
                                    currentStep === i + 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                                }`}>
                                    {i + 1}
                                </div>
                                {i < 2 && <div className="flex-1 h-0.5 bg-gray-200 mx-2"></div>}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="text-center text-sm text-gray-500 mb-4">STEP {currentStep} OF {totalSteps} - {Math.round(progress)}% Complete</div>

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
                    <div className="flex items-center space-x-4">
                        {saveStatus === 'saving' && <div className="text-sm text-gray-500">{t('saving')}...</div>}
                        {saveStatus === 'success' && <div className="text-sm text-green-500">{t('saved_successfully')}</div>}
                        {saveStatus === 'error' && errorMessage && <div className="text-sm text-red-500">{errorMessage}</div>}

                        <button onClick={handleUpdate} disabled={saveStatus === 'saving' || (hasAttemptedSubmit && !isStepValid())} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50">
                            {t('update')}
                        </button>
                        
                        {currentStep === totalSteps ? (
                            <button onClick={() => onSave(patientData as PatientData)} disabled={!isStepValid() || saveStatus === 'saving'} className="text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:outline-none focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50">
                                {t('complete_submission')}
                            </button>
                        ) : (
                            <button onClick={handleNext} disabled={hasAttemptedSubmit && !isStepValid()} className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50">
                                {t('next_step')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PatientIntake;
