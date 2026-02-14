import React from 'react';
import { useTranslation } from 'react-i18next';
import CheckboxGroup from './CheckboxGroup';
import { PatientData } from '../../types/patient';
import styles from './Questionnaire.module.css';

interface Step4Props {
    data: Partial<PatientData>;
    setData: (data: Partial<PatientData>) => void;
}

const Step4: React.FC<Step4Props> = ({ data, setData }) => {
  const { t } = useTranslation();

  const allergyOptions = [
    'aspirinAllergy',
    'iodineAllergy',
    'nutsAllergy',
    'shellfishAllergy',
    'otherAllergy',
  ];

  const chronicDiseaseOptions = [
    'chronicHepatitis',
    'hiv',
    'otherChronicDisease',
  ];

  return (
    <div className={styles.formGrid}>
      <CheckboxGroup
        title={t('if_so_to_what')}
        options={allergyOptions}
        data={data}
        setData={setData}
      />
      <CheckboxGroup
        title={t('chronic_diseases')}
        options={chronicDiseaseOptions}
        data={data}
        setData={setData}
      />
    </div>
  );
};

export default Step4;
