import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './PersonalDetails.module.css';
import { User, Mail, Phone, Calendar, Briefcase, Home, ArrowRight, ArrowLeft, Save } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface PersonalDetailsProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
  onNext: () => void;
  onBack: () => void;
  onUpdate: () => void;
  saveStatus: SaveStatus;
}

const PersonalDetails: React.FC<PersonalDetailsProps> = ({ patientData, onDataChange, onNext, onBack, onUpdate, saveStatus }) => {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isModified, setIsModified] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);

  useEffect(() => {
    setIsModified(false);
  }, [patientData.id]);

  useEffect(() => {
    if (saveStatus === 'success') {
      setIsModified(false);
    }
  }, [saveStatus]);

  const calculateAge = useCallback((birthDate: string) => {
    if (!birthDate) return '';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDifference = today.getMonth() - birth.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age.toString();
  }, []);

  const age = calculateAge(patientData.birthDate || '');

  const validateForm = useCallback(() => {
    const newErrors: { [key: string]: string } = {};
    if (!patientData.fullName) newErrors.fullName = t('full_name_required');
    if (!patientData.email) newErrors.email = t('email_required');
    else if (!/^\S+@\S+\.\S+$/.test(patientData.email)) newErrors.email = t('valid_email_required');
    if (!patientData.mobile) newErrors.mobile = t('mobile_required');
    if (!patientData.birthDate) newErrors.birthDate = t('birth_date_required');
    if (!patientData.profession) newErrors.profession = t('profession_required');
    if (!patientData.address) newErrors.address = t('address_required');
    setErrors(newErrors);
    setIsFormValid(Object.keys(newErrors).length === 0);
  }, [patientData, t]);

  useEffect(() => {
    validateForm();
  }, [patientData, validateForm]);

  useEffect(() => {
    if (age !== patientData.age) {
      onDataChange({ age: age });
    }
  }, [age, patientData.age, onDataChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onDataChange({ [name]: value });
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
      <div className={`${styles.formRow} ${styles.fullWidth}`}>
        <div className={`${styles.section} ${styles.fullWidth}`}>
          <label className={styles.label} htmlFor='fullName'><User size={16} />{t('full_name')}<span className={styles.required}>*</span></label>
          <input id='fullName' name='fullName' value={patientData.fullName || ''} onChange={handleChange} className={styles.input} required />
          {errors.fullName && <div className={styles.error}>{errors.fullName}</div>}
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='email'><Mail size={16} />{t('email')}<span className={styles.required}>*</span></label>
          <input id='email' name='email' type='email' value={patientData.email || ''} onChange={handleChange} className={styles.input} required />
          {errors.email && <div className={styles.error}>{errors.email}</div>}
        </div>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='mobile'><Phone size={16} />{t('mobile')}<span className={styles.required}>*</span></label>
          <input id='mobile' name='mobile' type='tel' value={patientData.mobile || ''} onChange={handleChange} className={styles.input} required />
          {errors.mobile && <div className={styles.error}>{errors.mobile}</div>}
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='birthDate'><Calendar size={16} />{t('birth_date')}<span className={styles.required}>*</span></label>
          <input id='birthDate' name='birthDate' type='date' value={patientData.birthDate || ''} onChange={handleChange} className={styles.input} required />
          {errors.birthDate && <div className={styles.error}>{errors.birthDate}</div>}
        </div>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='age'><User size={16} />{t('age')}</label>
          <input id='age' name='age' value={age} className={styles.input} readOnly />
        </div>
      </div>

      <div className={styles.formRow}>
          <div className={styles.section}>
            <label className={styles.label} htmlFor='profession'><Briefcase size={16} />{t('profession')}<span className={styles.required}>*</span></label>
            <input id='profession' name='profession' value={patientData.profession || ''} onChange={handleChange} className={styles.input} required />
            {errors.profession && <div className={styles.error}>{errors.profession}</div>}
          </div>
      </div>

      <div className={`${styles.formRow} ${styles.fullWidth}`}>
        <div className={`${styles.section} ${styles.fullWidth}`}>
          <label className={styles.label} htmlFor='address'><Home size={16} />{t('address')}<span className={styles.required}>*</span></label>
          <textarea id='address' name='address' value={patientData.address || ''} onChange={handleChange} className={styles.textarea} rows={3} required></textarea>
          {errors.address && <div className={styles.error}>{errors.address}</div>}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.buttonGroup}>
          <button type="button" onClick={onBack} className={`${styles.button} ${styles.previousButton}`}><ArrowLeft size={16} />{t('back')}</button>
        </div>
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

export default PersonalDetails;
