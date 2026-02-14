import React from 'react';
import { useTranslation } from 'react-i18next';
import { PatientData } from '../../types/patient';
import styles from './Step.module.css';

interface Step1Props {
    data: Partial<PatientData>;
    setData: (data: Partial<PatientData>) => void;
    hasAttemptedSubmit: boolean;
}

const Step1: React.FC<Step1Props> = ({ data, setData, hasAttemptedSubmit }) => {
    const { t } = useTranslation();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setData({ ...data, [name]: value });
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        setData({ ...data, birthDate: value });
        if (value) {
            const birthDate = new Date(value);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            setData({ ...data, birthDate: value, age: age.toString() });
        } else {
            setData({ ...data, birthDate: value, age: '' });
        }
    };

    return (
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
                <label htmlFor="fullName" className={styles.label}>{t('full_name')} <span className="text-red-500">*</span></label>
                <input type="text" id="fullName" name="fullName" value={data.fullName || ''} onChange={handleChange} className={styles.input} required />
                {hasAttemptedSubmit && !data.fullName && <p className="text-red-500 text-sm mt-1">{t('full_name_required')}</p>}
            </div>

            <div>
                <label htmlFor="email" className={styles.label}>{t('email')} <span className="text-red-500">*</span></label>
                <input type="email" id="email" name="email" value={data.email || ''} onChange={handleChange} className={styles.input} required />
                {hasAttemptedSubmit && !data.email && <p className="text-red-500 text-sm mt-1">{t('email_required')}</p>}
            </div>

            <div>
                <label htmlFor="mobile" className={styles.label}>{t('mobile')} <span className="text-red-500">*</span></label>
                <input type="tel" id="mobile" name="mobile" value={data.mobile || ''} onChange={handleChange} className={styles.input} required />
                {hasAttemptedSubmit && !data.mobile && <p className="text-red-500 text-sm mt-1">{t('mobile_required')}</p>}
            </div>

            <div>
                <label htmlFor="birthDate" className={styles.label}>{t('birth_date')} <span className="text-red-500">*</span></label>
                <input type="date" id="birthDate" name="birthDate" value={data.birthDate || ''} onChange={handleDateChange} className={styles.input} required />
                {hasAttemptedSubmit && !data.birthDate && <p className="text-red-500 text-sm mt-1">{t('birth_date_required')}</p>}
            </div>

            <div>
                <label htmlFor="age" className={styles.label}>{t('age')}</label>
                <input type="text" id="age" name="age" value={data.age || ''} className={styles.input} disabled />
            </div>

            <div className="md:col-span-2">
                <label htmlFor="profession" className={styles.label}>{t('profession')} <span className="text-red-500">*</span></label>
                <input type="text" id="profession" name="profession" value={data.profession || ''} onChange={handleChange} className={styles.input} required />
                {hasAttemptedSubmit && !data.profession && <p className="text-red-500 text-sm mt-1">{t('profession_required')}</p>}
            </div>
            
            <div className="md:col-span-2">
                <label htmlFor="address" className={styles.label}>{t('address')} <span className="text-red-500">*</span></label>
                <textarea id="address" name="address" value={data.address || ''} onChange={handleChange} className={styles.textarea} required />
                {hasAttemptedSubmit && !data.address && <p className="text-red-500 text-sm mt-1">{t('address_required')}</p>}
            </div>
        </form>
    );
};

export default Step1;
