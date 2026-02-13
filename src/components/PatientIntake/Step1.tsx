import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import styles from './Questionnaire.module.css';
import stepStyles from './Step.module.css';

interface Step1Props {
  patientData: any;
  handleInputChange: (field: string, value: any) => void;
}

const Step1: React.FC<Step1Props> = ({ patientData, handleInputChange }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.formStep}>
      <div className={styles.warning}>
        <AlertTriangle size={20} />
        <span>{t('safety_warning')}</span>
      </div>

      <div className={styles.formGroup}>
        <label className={stepStyles.label}>{t('how_long_has_this_imbalance_existed')}</label>
        <div className={stepStyles.durationContainer}>
          <input
            type="number"
            className={stepStyles.input}
            value={patientData.medicalRecord?.questionnaire?.imbalanceDuration || ''}
            onChange={(e) => handleInputChange('imbalanceDuration', parseInt(e.target.value))}
            placeholder={t('value')}
          />
          <select
            className={stepStyles.select}
            value={patientData.medicalRecord?.questionnaire?.imbalanceDurationUnit || 'W'}
            onChange={(e) => handleInputChange('imbalanceDurationUnit', e.target.value)}
          >
            <option value="W">{t('weeks')}</option>
            <option value="M">{t('months')}</option>
          </select>
        </div>
      </div>

      <div className={styles.checkboxGrid}>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={patientData.medicalRecord?.questionnaire?.takingMedications || false}
            onChange={(e) => handleInputChange('takingMedications', e.target.checked)}
          />
          {t('are_you_taking_medications_to_treat_this_issue')}
        </label>
        {patientData.medicalRecord?.questionnaire?.takingMedications && (
          <div className={stepStyles.conditionalInput}>
            <input
              type="text"
              className={stepStyles.input}
              value={patientData.medicalRecord?.questionnaire?.medicationNames || ''}
              onChange={(e) => handleInputChange('medicationNames', e.target.value)}
              placeholder={t('medication_names')}
            />
          </div>
        )}
      </div>

      <div className={styles.checkboxGrid}>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={patientData.medicalRecord?.questionnaire?.histamineSensitivity || false}
            onChange={(e) => handleInputChange('histamineSensitivity', e.target.checked)}
          />
          {t('sensitivity_to_histamine')}
        </label>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={patientData.medicalRecord?.questionnaire?.sufferFromAllergies || false}
            onChange={(e) => handleInputChange('sufferFromAllergies', e.target.checked)}
          />
          {t('suffer_from_allergies')}
        </label>
        {patientData.medicalRecord?.questionnaire?.sufferFromAllergies && (
          <div className={stepStyles.conditionalInput}>
            <input
              type="text"
              className={stepStyles.input}
              value={patientData.medicalRecord?.questionnaire?.allergies || ''}
              onChange={(e) => handleInputChange('allergies', e.target.value)}
              placeholder={t('allergies')}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Step1;
