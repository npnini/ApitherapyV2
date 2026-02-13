import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Questionnaire.module.css';
import stepStyles from './Step.module.css';

interface Step4Props {
  patientData: any;
  handleInputChange: (field: string, value: any) => void;
}

const Step4: React.FC<Step4Props> = ({ patientData, handleInputChange }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.formStep}>
      <div className={styles.formGroup}>
        <h2>{t('lifestyle_recovery')}</h2>
        <div className={stepStyles.formGroup}>
          <label className={stepStyles.label}>{t('how_did_the_problem_requiring_healing_arise')}</label>
          <textarea
            className={stepStyles.textarea}
            value={patientData.medicalRecord?.questionnaire?.problemOrigin || ''}
            onChange={(e) => handleInputChange('problemOrigin', e.target.value)}
          />
        </div>
        <div className={stepStyles.formGroup}>
          <label className={stepStyles.label}>{t('tell_us_about_your_diet')}</label>
          <textarea
            className={stepStyles.textarea}
            value={patientData.medicalRecord?.questionnaire?.diet || ''}
            onChange={(e) => handleInputChange('diet', e.target.value)}
          />
        </div>
      </div>

      <div className={`${styles.formGroup} ${stepStyles.gynecologySection}`}>
        <h2>{t('gynecology_if_applicable')}</h2>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.birthControlPills || false} onChange={(e) => handleInputChange('birthControlPills', e.target.checked)} />
            {t('birth_control_pills')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.regularMenstrualCycle || false} onChange={(e) => handleInputChange('regularMenstrualCycle', e.target.checked)} />
            {t('regular_menstrual_cycle')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.menstrualPain || false} onChange={(e) => handleInputChange('menstrualPain', e.target.checked)} />
            {t('pain_during_cycle')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.currentlyPregnant || false} onChange={(e) => handleInputChange('currentlyPregnant', e.target.checked)} />
            {t('currently_pregnant')}
          </label>
        </div>
      </div>
    </div>
  );
};

export default Step4;
