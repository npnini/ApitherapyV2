import React from 'react';
import { useTranslation } from 'react-i18next';
import CheckboxGroup from './CheckboxGroup';
import { PatientData } from '../../types/patient';
import styles from './Questionnaire.module.css';

interface Step3Props {
    data: Partial<PatientData>;
    setData: (data: Partial<PatientData>) => void;
}

const Step3: React.FC<Step3Props> = ({ data, setData }) => {
  const { t } = useTranslation();

  const pastMedicalHistoryOptions = [
    'pastTuberculosis',
    'pastSyphilis',
    'pastGonorrhea',
  ];

  const currentSupervisionOptions = [
    'medicalSupervision',
    'psychiatricSupervision',
  ];

  const surgeryOptions = [
    'pastSurgery',
    'plannedSurgery',
  ];

  return (
    <div className={styles.formGrid}>
      <CheckboxGroup
        title={t('past_medical_history')}
        options={pastMedicalHistoryOptions}
        data={data}
        setData={setData}
      />
      <CheckboxGroup
        title={t('current_supervision')}
        options={currentSupervisionOptions}
        data={data}
        setData={setData}
      />
      <CheckboxGroup
        title={t('surgery_affected_area')}
        options={surgeryOptions}
        data={data}
        setData={setData}
      />
    </div>
  );
};

export default Step3;
