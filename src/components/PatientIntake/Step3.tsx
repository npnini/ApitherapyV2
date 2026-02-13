import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clipboard, UserCheck, Shield } from 'lucide-react';
import styles from './Questionnaire.module.css';

interface Step3Props {
  patientData: any;
  handleInputChange: (field: string, value: any) => void;
}

const Step3: React.FC<Step3Props> = ({ patientData, handleInputChange }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.formStep}>
      <div className={styles.formGroup}>
        <h2><Clipboard size={20} /> {t('past_medical_history')}</h2>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.pastTuberculosis || false} onChange={(e) => handleInputChange('pastTuberculosis', e.target.checked)} />
            {t('past_tuberculosis')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.pastSyphilis || false} onChange={(e) => handleInputChange('pastSyphilis', e.target.checked)} />
            {t('past_syphilis')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.pastGonorrhea || false} onChange={(e) => handleInputChange('pastGonorrhea', e.target.checked)} />
            {t('past_gonorrhea')}
          </label>
        </div>
      </div>

      <div className={styles.formGroup}>
        <h2><UserCheck size={20} /> {t('current_supervision')}</h2>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.medicalSupervision || false} onChange={(e) => handleInputChange('medicalSupervision', e.target.checked)} />
            {t('under_medical_supervision')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.psychiatricSupervision || false} onChange={(e) => handleInputChange('psychiatricSupervision', e.target.checked)} />
            {t('under_psychiatric_supervision')}
          </label>
        </div>
      </div>

      <div className={styles.formGroup}>
        <h2><Shield size={20} /> {t('surgery_affected_area')}</h2>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.pastSurgery || false} onChange={(e) => handleInputChange('pastSurgery', e.target.checked)} />
            {t('past_surgery_in_the_affected_area')}
          </label>
          <label className={styles.checkboxOption}>
            <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.plannedSurgery || false} onChange={(e) => handleInputChange('plannedSurgery', e.target.checked)} />
            {t('planned_surgery_in_the_affected_area')}
          </label>
        </div>
      </div>
    </div>
  );
};

export default Step3;
