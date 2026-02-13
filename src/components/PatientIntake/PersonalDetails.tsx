
import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './PersonalDetails.module.css';
import { User, Mail, Phone, Calendar, Briefcase, Home, ArrowRight, Save } from 'lucide-react';

interface PersonalDetailsProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const PersonalDetails: React.FC<PersonalDetailsProps> = ({ patientData, onDataChange, onNext, onBack }) => {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

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

  useEffect(() => {
    if (age !== patientData.age) {
      onDataChange({ age: age });
    }
  }, [age, patientData.age, onDataChange]);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!patientData.fullName || patientData.fullName.trim() === '') newErrors.fullName = t('full_name_required');
    if (!patientData.email || !/^\S+@\S+\.\S+$/.test(patientData.email)) newErrors.email = t('valid_email_required');
    if (!patientData.mobile) newErrors.mobile = t('mobile_number_required');
    if (!patientData.birthDate) newErrors.birthDate = t('birth_date_required');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    onDataChange({ [name]: value });
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleNext = () => {
    if (validateForm()) {
      onNext();
    }
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.formRow} ${styles.fullWidth}`}>
        <div className={`${styles.section} ${styles.fullWidth}`}>
          <label className={styles.label} htmlFor='fullName'><User size={16} />{t('full_name')}</label>
          <input id='fullName' name='fullName' value={patientData.fullName || ''} onChange={handleChange} className={styles.input} />
          {errors.fullName && <div className={styles.error}>{errors.fullName}</div>}
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='email'><Mail size={16} />{t('email')}</label>
          <input id='email' name='email' type='email' value={patientData.email || ''} onChange={handleChange} className={styles.input} />
          {errors.email && <div className={styles.error}>{errors.email}</div>}
        </div>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='mobile'><Phone size={16} />{t('mobile')}</label>
          <input id='mobile' name='mobile' type='tel' value={patientData.mobile || ''} onChange={handleChange} className={styles.input} />
          {errors.mobile && <div className={styles.error}>{errors.mobile}</div>}
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='birthDate'><Calendar size={16} />{t('birth_date')}</label>
          <input id='birthDate' name='birthDate' type='date' value={patientData.birthDate || ''} onChange={handleChange} className={styles.input} placeholder={t('date_format_placeholder')}/>
          {errors.birthDate && <div className={styles.error}>{errors.birthDate}</div>}
        </div>
        <div className={styles.section}>
          <label className={styles.label} htmlFor='age'><User size={16} />{t('age')}</label>
          <input id='age' name='age' value={age} className={styles.input} readOnly />
        </div>
      </div>

      <div className={styles.formRow}>
          <div className={styles.section}>
            <label className={styles.label} htmlFor='profession'><Briefcase size={16} />{t('profession')}</label>
            <input id='profession' name='profession' value={patientData.profession || ''} onChange={handleChange} className={styles.input} />
          </div>
      </div>

      <div className={`${styles.formRow} ${styles.fullWidth}`}>
        <div className={`${styles.section} ${styles.fullWidth}`}>
          <label className={styles.label} htmlFor='address'><Home size={16} />{t('address')}</label>
          <textarea id='address' name='address' value={patientData.address || ''} onChange={handleChange} className={styles.textarea} rows={3}></textarea>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.buttonGroup}>
            <button type="button" onClick={() => {}} className={`${styles.button} ${styles.updateButton}`}><Save size={16} />{t('update')}</button>
            <button type="button" onClick={handleNext} className={`${styles.button} ${styles.nextButton}`}><ArrowRight size={16} />{t('next_step')}</button>
        </div>
      </div>
    </div>
  );
};

export default PersonalDetails;
