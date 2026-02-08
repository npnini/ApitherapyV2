import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { useTranslation } from 'react-i18next';
import styles from './UserDetails.module.css';

interface UserDetailsProps {
    user: AppUser;
    onSave: (updatedUser: AppUser) => void;
    onBack: () => void;
}

const UserDetails: React.FC<UserDetailsProps> = ({ user, onSave, onBack }) => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'he';
    const [formData, setFormData] = useState<AppUser>(user);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (!formData.fullName.trim()) {
            setError(t('full_name_required'));
            return;
        }
        if (!formData.mobile.trim()) {
            setError(t('mobile_number_required'));
            return;
        }
        setError(null);
        onSave(formData);
    };

    return (
        <div className={styles.container} dir={isRtl ? 'rtl' : 'ltr'}>
            <h2 className={styles.title}>{t('my_profile')}</h2>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.grid}>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="fullName">{t('full_name')}</label>
                    <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} className={styles.input} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="email">{t('email')}</label>
                    <p className={styles.readOnlyField}>{formData.email}</p>
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="mobile">{t('mobile')}</label>
                    <input id="mobile" name="mobile" type="text" value={formData.mobile} onChange={handleChange} className={styles.input} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="userId">{t('username')}</label>
                    <p className={styles.readOnlyField}>{formData.userId}</p>
                </div>
                 <div className={styles.field}>
                    <label className={styles.label}>{t('role')}</label>
                    <p className={`${styles.readOnlyField} ${styles.capitalize}`}>{t(formData.role)}</p>
                </div>
            </div>
            <div className={styles.actions}>
                <button onClick={onBack} className={styles.backButton}>{t('back_to_dashboard')}</button>
                <button onClick={handleSave} className={styles.saveButton}>{t('save_changes')}</button>
            </div>
        </div>
    );
};

export default UserDetails;
