import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PatientData } from '../../types/patient';
import styles from './PersonalDetails.module.css';

interface PersonalDetailsProps {
    patientData: Partial<PatientData>;
    onDataChange: (data: Partial<PatientData>) => void;
}

const PersonalDetails: React.FC<PersonalDetailsProps> = ({ patientData, onDataChange }) => {
    const { t } = useTranslation();
    const [age, setAge] = useState<string>('');

    useEffect(() => {
        if (patientData.birthDate) {
            const birthDate = new Date(patientData.birthDate);
            const today = new Date();
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                calculatedAge--;
            }
            setAge(calculatedAge >= 0 ? calculatedAge.toString() : '');
        } else {
            setAge('');
        }
    }, [patientData.birthDate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        onDataChange({ ...patientData, [name]: value });
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        onDataChange({ ...patientData, birthDate: value });
    };

    return (
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="fullName" className={styles.label}>{t('full_name')} <span className="text-red-500">*</span></label>
                <input type="text" id="fullName" name="fullName" value={patientData.fullName || ''} onChange={handleChange} className={styles.input} required />
            </div>

            <div>
                <label htmlFor="identityNumber" className={styles.label}>{t('identity_number')} <span className="text-red-500">*</span></label>
                <input type="text" id="identityNumber" name="identityNumber" value={patientData.identityNumber || ''} onChange={handleChange} className={styles.input} required />
            </div>

            <div>
                <label htmlFor="email" className={styles.label}>{t('email')} <span className="text-red-500">*</span></label>
                <input type="email" id="email" name="email" value={patientData.email || ''} onChange={handleChange} className={styles.input} required />
            </div>

            <div>
                <label htmlFor="mobile" className={styles.label}>{t('mobile')} <span className="text-red-500">*</span></label>
                <input type="tel" id="mobile" name="mobile" value={patientData.mobile || ''} onChange={handleChange} className={styles.input} required />
            </div>

            <div>
                <label htmlFor="birthDate" className={styles.label}>{t('birth_date')} <span className="text-red-500">*</span></label>
                <input type="date" id="birthDate" name="birthDate" value={patientData.birthDate || ''} onChange={handleDateChange} className={styles.input} required />
            </div>

            <div>
                <label htmlFor="age" className={styles.label}>{t('age')}</label>
                <input type="text" id="age" name="age" value={age} className={styles.input} disabled />
            </div>

            <div className="md:col-span-2">
                <label htmlFor="profession" className={styles.label}>{t('profession')} <span className="text-red-500">*</span></label>
                <input type="text" id="profession" name="profession" value={patientData.profession || ''} onChange={handleChange} className={styles.input} required />
            </div>
            
            <div className="md:col-span-2">
                <label htmlFor="address" className={styles.label}>{t('address')} <span className="text-red-500">*</span></label>
                <textarea id="address" name="address" value={patientData.address || ''} onChange={handleChange} className={styles.textarea} required />
            </div>
        </form>
    );
};

export default PersonalDetails;
