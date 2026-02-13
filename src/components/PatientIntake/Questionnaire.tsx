import React, { useState } from 'react';
import { PatientData } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './Questionnaire.module.css';
import { ArrowLeft } from 'lucide-react';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import Step5 from './Step5';

interface QuestionnaireProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
}

const TOTAL_STEPS = 5;

const Questionnaire: React.FC<QuestionnaireProps> = ({ patientData, onDataChange, onSave, onBack, isSaving }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);

  const handleInputChange = (field: string, value: any) => {
    const questionnaire = { ...patientData.medicalRecord?.questionnaire, [field]: value };
    onDataChange({ medicalRecord: { ...patientData.medicalRecord, questionnaire } });
  };

  const handleSaveSignature = (signature: string) => {
    handleInputChange('signature', signature);
  };

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const progress = (currentStep / TOTAL_STEPS) * 100;

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1 patientData={patientData} handleInputChange={handleInputChange} />;
      case 2:
        return <Step2 patientData={patientData} handleInputChange={handleInputChange} />;
      case 3:
        return <Step3 patientData={patientData} handleInputChange={handleInputChange} />;
      case 4:
        return <Step4 patientData={patientData} handleInputChange={handleInputChange} />;
      case 5:
        return <Step5 patientData={patientData} handleInputChange={handleInputChange} handleSaveSignature={handleSaveSignature} />;
      default:
        return null;
    }
  };

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
            ) : <div />}
            
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
  );
};

export default Questionnaire;
