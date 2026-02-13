
import React from 'react';
import { PatientData, MedicalRecord as MedicalRecordType } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './MedicalRecord.module.css';
import { Stethoscope, ShieldAlert, Thermometer, ArrowRight, ArrowLeft, Save } from 'lucide-react';

interface MedicalRecordProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const MedicalRecord: React.FC<MedicalRecordProps> = ({ patientData, onDataChange, onNext, onBack }) => {
  const { t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    const updatedMedicalRecord: MedicalRecordType = {
      ...patientData.medicalRecord,
      condition: name === 'condition' ? value : patientData.medicalRecord?.condition || '',
      severity: name === 'severity' ? value as 'Mild' | 'Moderate' | 'Severe' : patientData.medicalRecord?.severity || 'Mild',
      lastTreatment: name === 'lastTreatment' ? value : patientData.medicalRecord?.lastTreatment
    };

    onDataChange({ medicalRecord: updatedMedicalRecord });
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.section} ${styles.fullWidth}`}>
        <label className={styles.label} htmlFor="condition"><Stethoscope size={16} />{t('condition')}</label>
        <textarea id="condition" name="condition" className={styles.textarea} value={patientData.medicalRecord?.condition || ''} onChange={handleChange} placeholder={t('describe_overall_health_status')}></textarea>
      </div>

      <div className={styles.formRow}>
        <div className={styles.section}>
            <label className={styles.label} htmlFor="severity"><ShieldAlert size={16} />{t('severity')}</label>
            <select id="severity" name="severity" className={styles.select} value={patientData.medicalRecord?.severity || 'Mild'} onChange={handleChange}>
              <option value="Mild">{t('mild')}</option>
              <option value="Moderate">{t('moderate')}</option>
              <option value="Severe">{t('severe')}</option>
            </select>
        </div>
        <div className={styles.section}>
            <label className={styles.label} htmlFor="lastTreatment"><Thermometer size={16} />{t('last_treatment')}</label>
            <input id="lastTreatment" name="lastTreatment" type="date" className={styles.input} value={patientData.medicalRecord?.lastTreatment || ''} onChange={handleChange} />
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" onClick={onBack} className={`${styles.button} ${styles.previousButton}`}><ArrowLeft size={16} />{t('previous')}</button>
        <div className={styles.buttonGroup}>
          <button type="button" onClick={() => {}} className={`${styles.button} ${styles.updateButton}`}><Save size={16} />{t('update')}</button>
          <button type="button" onClick={onNext} className={`${styles.button} ${styles.nextButton}`}>{t('next_step')}<ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
};

export default MedicalRecord;
