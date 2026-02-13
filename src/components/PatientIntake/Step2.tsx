import React from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import styles from './Questionnaire.module.css';
import stepStyles from './Step.module.css';

interface Step2Props {
  patientData: any;
  handleInputChange: (field: string, value: any) => void;
}

const Step2: React.FC<Step2Props> = ({ patientData, handleInputChange }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.formStep}>
      <div className={styles.formGroup}>
        <h2><Heart size={20} /> {t('medical_conditions')}</h2>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.heartDisease || false} onChange={(e) => handleInputChange('heartDisease', e.target.checked)} />
            {t('heart_disease')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.liverDisease || false} onChange={(e) => handleInputChange('liverDisease', e.target.checked)} />
            {t('liver_disease')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.kidneyDisease || false} onChange={(e) => handleInputChange('kidneyDisease', e.target.checked)} />
            {t('kidney_disease')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.diabetes || false} onChange={(e) => handleInputChange('diabetes', e.target.checked)} />
            {t('diabetes')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.asthma || false} onChange={(e) => handleInputChange('asthma', e.target.checked)} />
            {t('asthma')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.highBloodPressure || false} onChange={(e) => handleInputChange('highBloodPressure', e.target.checked)} />
            {t('high_blood_pressure')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.lymphNodeInflammation || false} onChange={(e) => handleInputChange('lymphNodeInflammation', e.target.checked)} />
            {t('inflammation_of_lymph_nodes')}
          </label>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={patientData.medicalRecord?.questionnaire?.steroidMedication || false}
            onChange={(e) => handleInputChange('steroidMedication', e.target.checked)}
          />
          {t('are_you_taking_steroid_medication')}
        </label>
        {patientData.medicalRecord?.questionnaire?.steroidMedication && (
          <div className={stepStyles.conditionalInput}>
            <input
              type="text"
              className={stepStyles.input}
              value={patientData.medicalRecord?.questionnaire?.steroidMedicationNames || ''}
              onChange={(e) => handleInputChange('steroidMedicationNames', e.target.value)}
              placeholder={t('steroid_medication_names')}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Step2;
