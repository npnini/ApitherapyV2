import React, { useState, useEffect, useCallback } from 'react';
import { PatientData, MedicalRecord as MedicalRecordType } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './MedicalRecord.module.css';
import { Stethoscope, ShieldAlert, Thermometer, ArrowRight, ArrowLeft, Save } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface MedicalRecordProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
  onNext: () => void;
  onBack: () => void;
  onUpdate: () => void;
  saveStatus: SaveStatus;
}

const MedicalRecord: React.FC<MedicalRecordProps> = ({ patientData, onDataChange, onNext, onBack, onUpdate, saveStatus }) => {
  const { t } = useTranslation();
  const [isModified, setIsModified] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    setIsModified(false);
  }, [patientData.id]);

  useEffect(() => {
    if (saveStatus === 'success') {
      setIsModified(false);
    }
  }, [saveStatus]);

  const validateForm = useCallback(() => {
    const newErrors: { [key: string]: string } = {};
    if (!patientData.medicalRecord?.condition) newErrors.condition = t('condition_required');
    if (!patientData.medicalRecord?.severity) newErrors.severity = t('severity_required');
    if (!patientData.medicalRecord?.lastTreatment) newErrors.lastTreatment = t('last_treatment_required');
    setErrors(newErrors);
    setIsFormValid(Object.keys(newErrors).length === 0);
  }, [patientData.medicalRecord, t]);

  useEffect(() => {
    validateForm();
  }, [patientData.medicalRecord, validateForm]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const updatedMedicalRecord = { ...patientData.medicalRecord, [name]: value };
    onDataChange({ medicalRecord: updatedMedicalRecord as MedicalRecordType });
    setIsModified(true);
  };

  const handleNext = () => {
    if (isFormValid) {
      onNext();
    }
  };

  const handleUpdateClick = () => {
    if (isFormValid) {
      onUpdate();
    }
  };

  const isSaving = saveStatus === 'saving';
  const showUpdate = patientData.id;
  const canUpdate = isModified && !isSaving && isFormValid;

  return (
    <div className={styles.container}>
      <div className={`${styles.section} ${styles.fullWidth}`}>
        <label className={styles.label} htmlFor="condition"><Stethoscope size={16} />{t('condition')}<span className={styles.required}>*</span></label>
        <textarea id="condition" name="condition" className={styles.textarea} value={patientData.medicalRecord?.condition || ''} onChange={handleChange} placeholder={t('describe_overall_health_status')} required></textarea>
        {errors.condition && <div className={styles.error}>{errors.condition}</div>}
      </div>

      <div className={styles.formRow}>
        <div className={styles.section}>
            <label className={styles.label} htmlFor="severity"><ShieldAlert size={16} />{t('severity')}<span className={styles.required}>*</span></label>
            <select id="severity" name="severity" className={styles.select} value={patientData.medicalRecord?.severity || ''} onChange={handleChange} required>
              <option value="">{t('select_severity')}</option>
              <option value="Mild">{t('mild')}</option>
              <option value="Moderate">{t('moderate')}</option>
              <option value="Severe">{t('severe')}</option>
            </select>
            {errors.severity && <div className={styles.error}>{errors.severity}</div>}
        </div>
        <div className={styles.section}>
            <label className={styles.label} htmlFor="lastTreatment"><Thermometer size={16} />{t('last_treatment')}<span className={styles.required}>*</span></label>
            <input id="lastTreatment" name="lastTreatment" type="date" className={styles.input} value={patientData.medicalRecord?.lastTreatment || ''} onChange={handleChange} required readOnly/>
            {errors.lastTreatment && <div className={styles.error}>{errors.lastTreatment}</div>}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" onClick={onBack} className={`${styles.button} ${styles.previousButton}`}><ArrowLeft size={16} />{t('previous')}</button>
        <div className={styles.buttonGroup}>
        {showUpdate && (
            <button
              type="button"
              onClick={handleUpdateClick}
              className={`${styles.button} ${styles.updateButton} ${canUpdate ? styles.updateButtonActive : ''}`}
              disabled={!canUpdate}
            >
              <Save size={16} />
              {isSaving ? t('saving') : t('update')}
            </button>
          )}
          <button type="button" onClick={handleNext} className={`${styles.button} ${styles.nextButton}`} disabled={!isFormValid}>{t('next_step')}<ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
};

export default MedicalRecord;
