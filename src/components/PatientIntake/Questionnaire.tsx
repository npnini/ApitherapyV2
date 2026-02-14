import React, { useState, useEffect } from 'react';
import { PatientData } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './Questionnaire.module.css';
import { ArrowLeft, Save } from 'lucide-react';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import Step5 from './Step5';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface QuestionnaireProps {
    patientData: Partial<PatientData>;
    onDataChange: (data: Partial<PatientData>) => void;
    onSave: () => void;
    onUpdate: () => void;
    onBack: () => void;
    saveStatus: SaveStatus;
}

const TOTAL_STEPS = 5;

const Questionnaire: React.FC<QuestionnaireProps> = ({ patientData, onDataChange, onSave, onUpdate, onBack, saveStatus }) => {
    const { t } = useTranslation();
    const [currentStep, setCurrentStep] = useState(1);
    const [isModified, setIsModified] = useState(false);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        setIsModified(false);
    }, [patientData.id]);

    useEffect(() => {
        if (saveStatus === 'success') {
            setIsModified(false);
        }
    }, [saveStatus]);

    const validate = (step: number) => {
        const newErrors: { [key: string]: string } = {};
        const questionnaire = patientData.medicalRecord?.questionnaire;

        if (step === 1) {
            if (!questionnaire?.mainComplaint) newErrors.mainComplaint = t('validation_main_complaint_required');
            if (!questionnaire?.symptoms) newErrors.symptoms = t('validation_symptoms_required');
        }

        if (step === 2) {
            if (questionnaire?.steroidMedication && !questionnaire?.steroidMedicationNames) {
                newErrors.steroidMedicationNames = t('validation_steroid_medication_names_required');
            }
        }

        if (step === 5) {
            if (questionnaire?.stungByBee && !questionnaire?.beeStingDetails) {
                newErrors.beeStingDetails = t('validation_bee_sting_details_required');
            }
            if (!questionnaire?.consent) {
                newErrors.consent = t('validation_consent_required');
            }
            if (!questionnaire?.signature) {
                newErrors.signature = t('validation_signature_required');
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleInputChange = (field: string, value: any) => {
        const questionnaire = { ...patientData.medicalRecord?.questionnaire, [field]: value };
        onDataChange({ medicalRecord: { ...patientData.medicalRecord, questionnaire } });
        setIsModified(true);
    };

    const handleSaveSignature = (signature: string) => {
        handleInputChange('signature', signature);
    };

    const handleNext = () => {
        if (validate(currentStep)) {
            setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
        }
    };

    const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const progress = (currentStep / TOTAL_STEPS) * 100;

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <Step1 patientData={patientData} handleInputChange={handleInputChange} errors={errors} />;
            case 2:
                return <Step2 patientData={patientData} handleInputChange={handleInputChange} errors={errors} />;
            case 3:
                return <Step3 patientData={patientData} handleInputChange={handleInputChange} errors={errors} />;
            case 4:
                return <Step4 patientData={patientData} handleInputChange={handleInputChange} errors={errors} />;
            case 5:
                return <Step5 patientData={patientData} handleInputChange={handleInputChange} handleSaveSignature={handleSaveSignature} errors={errors} />;
            default:
                return null;
        }
    };

    const isSaving = saveStatus === 'saving';
    const showUpdate = patientData.id;
    const canUpdate = isModified && !isSaving;

    return (
        <div className={styles.questionnaireContainer}>
            <div className={styles.stepIndicator}>
                <div className={styles.stepLabel}>{t('step', { current: currentStep, total: TOTAL_STEPS })}</div>
                <div className={styles.progressContainer}>
                    <div className={styles.progressBar}>
                        <div className={styles.progress} style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className={styles.progressPercentage}>{Math.round(progress)}% {t('complete')}</div>
                </div>
            </div>

            {renderStep()}

            <div className={styles.navigation}>
                {currentStep > 1 ? (
                    <button type="button" onClick={handleBack} className={`${styles.navButton} ${styles.backButton}`}>
                        <ArrowLeft size={16} />{t('back')}
                    </button>
                ) : (
                    <button type="button" onClick={onBack} className={`${styles.navButton} ${styles.backButton}`}>
                        <ArrowLeft size={16} />{t('back')}
                    </button>
                )}

                <div className={styles.mainActions}>
                    {showUpdate && (
                        <button
                            type="button"
                            onClick={onUpdate}
                            className={`${styles.navButton} ${styles.updateButton} ${canUpdate ? styles.updateButtonActive : ''}`}
                            disabled={!canUpdate}
                        >
                            <Save size={16} />
                            {isSaving ? t('saving') : t('update')}
                        </button>
                    )}

                    {currentStep < TOTAL_STEPS ? (
                        <button type="button" onClick={handleNext} className={`${styles.navButton} ${styles.continueButton}`}>
                            {t('continue')}
                        </button>
                    ) : (
                        <button type="button" onClick={onSave} className={`${styles.navButton} ${styles.completeButton}`} disabled={isSaving || !patientData.medicalRecord?.questionnaire?.consent}>
                            {isSaving ? t('saving') : t('complete_submission')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Questionnaire;
