
import React, { useState, useEffect, InputHTMLAttributes, ChangeEvent } from 'react';
import { PatientData } from '../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './PatientForms.module.css';

interface PatientPIIDetailsProps {
  patient: Partial<PatientData>;
  onNext: (piiData: Partial<PatientData>) => void;
  onBack: () => void;
  errorMessage?: string;
}

const PatientPIIDetails: React.FC<PatientPIIDetailsProps> = ({ patient, onNext, onBack, errorMessage }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<PatientData>>(patient);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    setFormData(patient);
  }, [patient]);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.fullName) newErrors.fullName = t('full_name_required');
    if (!formData.email || !/^\S+@\S+\.\S+$/.test(formData.email)) newErrors.email = t('valid_email_required');
    if (!formData.mobile) newErrors.mobile = t('mobile_number_required');
    if (!formData.identityNumber) newErrors.identityNumber = t('identity_number_required');
    if (!formData.birthDate) newErrors.birthDate = t('birth_date_required');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
        onNext(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <div className={styles.grid}>
        <InputField label={t('full_name')} id="fullName" name="fullName" value={formData.fullName || ''} onChange={handleChange} required error={errors.fullName} />
        <InputField label={t('mobile_number')} id="mobile" name="mobile" type="tel" value={formData.mobile || ''} onChange={handleChange} required error={errors.mobile} />
        <InputField label={t('email_address')} id="email" name="email" type="email" value={formData.email || ''} onChange={handleChange} required error={errors.email} />
        <InputField label={t('identity_number')} id="identityNumber" name="identityNumber" value={formData.identityNumber || ''} onChange={handleChange} required error={errors.identityNumber} />
        <InputField label={t('birth_date')} id="birthDate" name="birthDate" type="date" value={formData.birthDate || ''} onChange={handleChange} required error={errors.birthDate} />
      </div>
      {errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}
      <div className={styles.footer}>
        <div className={styles.buttonGroup}>
          <button type="button" onClick={onBack} className={`${styles.button} ${styles.cancelButton}`}>{t('cancel')}</button>
          <button type="submit" className={`${styles.button} ${styles.saveButton}`}>{t('next')}</button>
        </div>
      </div>
    </form>
  );
};

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    id: string;
    required?: boolean;
    error?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, id, required, error, ...props }) => (
  <div className={styles.fieldContainer}>
    <label className={styles.label} htmlFor={id}>
      {label}
      {required && <span className={styles.requiredAsterisk}>*</span>}
    </label>
    <input id={id} {...props} required={required} className={`${styles.input} ${error ? styles.inputError : ''}`} />
    {error && <p className={styles.errorText}>{error}</p>}
  </div>
);

export default PatientPIIDetails;
