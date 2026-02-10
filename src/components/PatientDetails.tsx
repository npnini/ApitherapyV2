import React, { useState, useEffect, useRef } from 'react';
import { PatientData } from '../types/patient';
import { ChevronLeft, ChevronDown, Calendar } from 'lucide-react';
import { AppUser } from '../types/user';
import { useTranslation } from 'react-i18next';
import styles from './PatientDetails.module.css';

const formatDateForDisplay = (isoDate: string) => {
  if (!isoDate || !/\d{4}-\d{2}-\d{2}/.test(isoDate)) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

const DateInput = ({ value, onChange, ...props }) => {
  const { t } = useTranslation();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleContainerClick = () => {
      dateInputRef.current?.showPicker();
  };

  return (
    <div className={styles.dateInputContainer} onClick={handleContainerClick}>
      <input
        type="text"
        value={formatDateForDisplay(value)}
        readOnly
        placeholder={t('dd/mm/yyyy')}
        className={styles.dateInputDisplay}
      />
      <Calendar size={18} className={styles.dateInputIcon} />
      <input
          {...props}
          ref={dateInputRef}
          type="date"
          value={value || ''}
          onChange={onChange}
          className={styles.dateInputHidden}
          tabIndex={-1}
      />
    </div>
  );
};

interface PatientDetailsProps {
  patient: PatientData;
  user: AppUser;
  onSave: (patient: PatientData) => void;
  onBack: () => void;
  onStartTreatment: () => void;
  saveStatus: 'idle' | 'saving' | 'success' | 'error';
  errorMessage?: string;
}

const PatientDetails: React.FC<PatientDetailsProps> = ({ patient, user, onSave, onBack, onStartTreatment, saveStatus, errorMessage }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<PatientData>({ ...patient });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const caretakerName = patient.caretakerId ? user.fullName : t('not_assigned');

  const calculateAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(formData.birthDate);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.email || !/^\S+@\S+\.\S+$/.test(formData.email)) {
        newErrors.email = t('valid_email_required');
    }

    if (!formData.birthDate) {
        newErrors.birthDate = t('birth_date_required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
        setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
        onSave(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
        <div className={styles.header}>
            <h2 className={styles.title}>{t('patient_information')}</h2>
            <button type="button" onClick={onBack} className={styles.backButton}><ChevronLeft size={16} /> {t('back')}</button>
        </div>
        
        <div className={styles.grid}>
            <div className={styles.inputGroup}>
                <InputField label={t('full_name')} id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} required />
                <div className={styles.fieldContainer}>
                    <InputField label={t('email_address')} id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
                    {errors.email && <p className={styles.errorText}>{errors.email}</p>}
                </div>
                <InputField label={t('mobile_number')} id="mobile" name="mobile" value={formData.mobile} onChange={handleChange} required />
                <InputField label={t('identity_number')} id="identityNumber" name="identityNumber" value={formData.identityNumber} onChange={handleChange} required />
            </div>

            <div className={styles.inputGroup}>
                <div className={styles.fieldContainer}>
                    <label className={styles.label} htmlFor="condition">{t('condition')} <span className={styles.requiredAsterisk}>*</span></label>
                    <textarea id="condition" name="condition" value={formData.condition} onChange={handleChange} className={styles.textarea} required />
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
                    <label className={styles.label} htmlFor="birthDate">{t('birth_date')} <span className={styles.requiredAsterisk}>*</span></label>
                    <DateInput
                        id="birthDate"
                        name="birthDate"
                        value={formData.birthDate || ''}
                        onChange={handleChange}
                        required
                    />
                    {errors.birthDate && <p className={styles.errorText}>{errors.birthDate}</p>}
                </div>
                <LockedField label={t('age')} value={age !== null ? age : t('not_available')} />
                <LockedField label={t('caretaker')} value={caretakerName} />
            </div>
        </div>
        
        {saveStatus === 'error' && errorMessage && (
            <div className={styles.errorMessage}>
                {errorMessage}
            </div>
        )}

        <div className={styles.footer}>
             <button type="button" onClick={onStartTreatment} className={`${styles.button} ${styles.startButton}`}>{t('start_treatment')}</button>
            <div className={styles.buttonGroup}>
                <button type="button" onClick={onBack} className={`${styles.button} ${styles.cancelButton}`}>{t('cancel')}</button>
                <button type="submit" className={`${styles.button} ${styles.saveButton}`}>{saveStatus === 'saving' ? t('saving') : t('save_changes')}</button>
            </div>
        </div>
    </form>
  );
};

const InputField = ({ label, id, required, ...props }) => (
  <div className={styles.fieldContainer}>
    <label className={styles.label} htmlFor={id}>
        {label}
        {required && <span className={styles.requiredAsterisk}>*</span>}
    </label>
    <input id={id} {...props} required={required} className={styles.input} />
  </div>
);

const LockedField = ({ label, value }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.fieldContainer}>
      <label className={styles.label}>{label}</label>
      <p className={styles.lockedField}>{value || t('not_assigned')}</p>
    </div>
  );
};

export default PatientDetails;
