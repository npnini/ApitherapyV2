
import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './PatientForms.module.css';
import { MedicalRecord } from '../types/patient';

interface PatientMedicalRecordProps {
  medicalRecord: MedicalRecord;
  onSave: (medicalData: MedicalRecord) => void;
  onBack: () => void;
  isSaving: boolean;
}

const PatientMedicalRecord: React.FC<PatientMedicalRecordProps> = ({ medicalRecord, onSave, onBack, isSaving }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<MedicalRecord>(medicalRecord);
  const [error, setError] = useState('');

  useEffect(() => {
    setFormData(medicalRecord);
  }, [medicalRecord]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target as { name: keyof MedicalRecord; value: string };
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.condition.trim()) {
        setError('Condition is a required field.');
        return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <div className={styles.grid}>
        <div className={styles.fieldContainer} style={{ gridColumn: 'span 2' }}>
          <label className={styles.label} htmlFor="condition">{t('condition')} <span className={styles.requiredAsterisk}>*</span></label>
          <textarea id="condition" name="condition" value={formData.condition} onChange={handleChange} className={styles.textarea} required />
          {error && <p className={styles.errorText}>{t(error)}</p>}
        </div>
        <div className={styles.fieldContainer}>
          <label className={styles.label} htmlFor="severity">{t('severity')} <span className={styles.requiredAsterisk}>*</span></label>
          <div className={styles.selectContainer}>
            <select id="severity" name="severity" value={formData.severity} onChange={handleChange} className={styles.select} required>
              <option value="Mild">{t('mild')}</option>
              <option value="Moderate">{t('moderate')}</option>
              <option value="Severe">{t('severe')}</option>
            </select>
            <ChevronDown size={16} className={styles.selectIcon} />
          </div>
        </div>
        <div className={styles.fieldContainer}>
            <label className={styles.label} htmlFor="lastTreatment">{t('last_treatment')}</label>
            <input id="lastTreatment" name="lastTreatment" type="text" value={formData.lastTreatment ? new Date(formData.lastTreatment).toLocaleDateString() : 'N/A'} readOnly className={styles.input} />
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.buttonGroup}>
          <button type="button" onClick={onBack} className={`${styles.button} ${styles.cancelButton}`}>{t('back')}</button>
          <button type="submit" className={`${styles.button} ${styles.saveButton}`} disabled={isSaving}>
            {isSaving ? t('saving') : t('save_patient')}
          </button>
        </div>
      </div>
    </form>
  );
};

export default PatientMedicalRecord;
