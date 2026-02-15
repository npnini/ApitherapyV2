import React from 'react';
import { useTranslation } from 'react-i18next';
import { PatientData } from '../../types/patient';
import styles from './Questionnaire.module.css';
import { ChevronDown } from 'lucide-react';

interface Step2Props {
    data: Partial<PatientData>;
    setData: (data: Partial<PatientData>) => void;
    hasAttemptedSubmit: boolean;
}

const Step2: React.FC<Step2Props> = ({ data, setData, hasAttemptedSubmit }) => {
  const { t } = useTranslation();

  const handleMedicalRecordChange = (field: string, value: any) => {
    setData({
        ...data,
        medicalRecord: {
            ...data.medicalRecord,
            [field]: value,
        },
    });
  };

  const handleQuestionnaireChange = (field: string, value: any) => {
    setData({
        ...data,
        medicalRecord: {
            ...data.medicalRecord,
            questionnaire: {
                ...data.medicalRecord?.questionnaire,
                [field]: value,
            },
        },
    });
  };

  const medicalConditions = [
    'heartDisease',
    'liverDisease',
    'kidneyDisease',
    'diabetes',
    'asthma',
    'highBloodPressure',
    'lymphNodeInflammation'
  ];

  // Defensively ensure medicalRecord and questionnaire objects exist to prevent crashes
  const medicalRecord = data.medicalRecord || {};
  const questionnaire = medicalRecord.questionnaire || {};

  return (
    <div className={styles.formGrid}>
        <div className={styles.fieldGroup} style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="condition" className={styles.fieldLabel}>{t('condition')}</label>
            <textarea
                id="condition"
                className={styles.textarea}
                value={medicalRecord.condition || ''}
                onChange={(e) => handleMedicalRecordChange('condition', e.target.value)}
                placeholder={t('condition_placeholder')}
            />
        </div>

        <div className={styles.fieldGroup}>
            <label htmlFor="severity" className={styles.fieldLabel}>{t('severity')}</label>
            <div className={styles.selectContainer}>
                <select
                    id="severity"
                    className={styles.select}
                    value={medicalRecord.severity || 'Mild'}
                    onChange={(e) => handleMedicalRecordChange('severity', e.target.value)}
                >
                    <option value="Low">{t('low')}</option>
                    <option value="Mild">{t('mild')}</option>
                    <option value="Moderate">{t('moderate')}</option>
                    <option value="Severe">{t('severe')}</option>
                </select>
                <ChevronDown size={16} className={styles.selectIcon} />
            </div>
        </div>

        <div className={styles.fieldGroup}>
            <label htmlFor="lastTreatment" className={styles.fieldLabel}>{t('last_treatment')}</label>
            <input
                id="lastTreatment"
                type="text"
                className={styles.input}
                value={medicalRecord.lastTreatment ? new Date(medicalRecord.lastTreatment).toLocaleDateString() : t('n_a')}
                readOnly
            />
        </div>


      <div className={styles.fieldGroup} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.fieldLabel}>{t('medical_conditions_label')}</label>
        <div className={styles.radioGroup} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            {medicalConditions.map(condition => (
                <label key={condition} className={styles.checkboxLabel}>
                    <input
                        type="checkbox"
                        checked={questionnaire[condition] || false}
                        onChange={(e) => handleQuestionnaireChange(condition, e.target.checked)}
                    />
                    {t(condition.replace(/([A-Z])/g, '_$1').toLowerCase())}
                </label>
            ))}
            <label className={styles.checkboxLabel}>
                <input
                type="checkbox"
                checked={questionnaire.steroidMedication || false}
                onChange={(e) => handleQuestionnaireChange('steroidMedication', e.target.checked)}
                />
                {t('are_you_taking_steroid_medication')}
            </label>
            {questionnaire.steroidMedication && (
            <div style={{ marginLeft: '1.8rem', marginTop: '0.5rem' }}>
                <input
                type="text"
                className={`${styles.input} ${hasAttemptedSubmit && !questionnaire.steroidMedicationNames ? styles.errorBorder : ''}`}
                value={questionnaire.steroidMedicationNames || ''}
                onChange={(e) => handleQuestionnaireChange('steroidMedicationNames', e.target.value)}
                placeholder={t('steroid_medication_names_placeholder')}
                required
                />
                {hasAttemptedSubmit && !questionnaire.steroidMedicationNames && <div className={styles.error}>{t('steroid_medication_names_required')}</div>}
            </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Step2;
