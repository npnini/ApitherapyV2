import React, { useState, useEffect } from 'react';
import { AppUser } from '../types/user';
import { useTranslation } from 'react-i18next';
import styles from './UserDetails.module.css';

interface UserDetailsProps {
    user: AppUser;
    onSave: (updatedUser: AppUser) => void;
    onBack?: () => void; // onBack is now optional
    isOnboarding?: boolean; // New prop to control the mode
}

const UserDetails: React.FC<UserDetailsProps> = ({ user, onSave, onBack, isOnboarding = false }) => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'he';
    const [formData, setFormData] = useState<AppUser>(user);
    const [error, setError] = useState<string | null>(null);

    const supportedLanguages = ['en', 'he'];
    const countryToLang: { [key: string]: string } = {
        'israel': 'he',
    };

    useEffect(() => {
        // Set initial language for new and existing users
        if (user.preferredLanguage) {
            setFormData(prev => ({...prev, preferredLanguage: user.preferredLanguage}));
        } else if (supportedLanguages.includes(i18n.language)) {
            setFormData(prev => ({...prev, preferredLanguage: i18n.language}));
        } else {
            setFormData(prev => ({...prev, preferredLanguage: 'en'}));
        }
    }, [user.preferredLanguage, i18n.language]);

    useEffect(() => {
        // This effect runs when a NEW user types in the country field
        if (isOnboarding) { 
            const lang = countryToLang[formData.country?.toLowerCase() || ''] || 'en';
            if (supportedLanguages.includes(lang)) {
                setFormData(prev => ({...prev, preferredLanguage: lang}));
            }
        }
    }, [formData.country, isOnboarding]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
        if (!formData.address?.trim()) {
            setError(t('address_required'));
            return;
        }
        if (!formData.city?.trim()) {
            setError(t('city_required'));
            return;
        }
        if (!formData.country?.trim()) {
            setError(t('country_required'));
            return;
        }
        if (!formData.preferredLanguage) {
            setError(t('language_required'));
            return;
        }
        setError(null);
        onSave(formData);
    };

    return (
        <div className={styles.container} dir={isRtl ? 'rtl' : 'ltr'}>
            <h2 className={styles.title}>{isOnboarding ? t('your_profile_details') : t('my_profile')}</h2>
            <p className={styles.subtitle}>{isOnboarding ? t('update_your_information_below') : ''}</p>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.grid}>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="fullName">
                        {t('full_name')}
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} className={styles.input} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="email">{t('email')}</label>
                    <p className={styles.readOnlyField}>{formData.email}</p>
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="mobile">
                        {t('mobile')}
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="mobile" name="mobile" type="text" value={formData.mobile} onChange={handleChange} className={styles.input} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="userId">
                        {t('username')}
                        <span className={styles.requiredAsterisk}>*</span>
                        </label>
                    <p className={styles.readOnlyField}>{formData.userId}</p>
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="address">
                        {t('address')}
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="address" name="address" type="text" value={formData.address || ''} onChange={handleChange} className={styles.input} placeholder={t('address_placeholder')} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="city">
                        {t('city')}
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="city" name="city" type="text" value={formData.city || ''} onChange={handleChange} className={styles.input} placeholder={t('city_placeholder')} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="country">
                        {t('country')}
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="country" name="country" type="text" value={formData.country || ''} onChange={handleChange} className={styles.input} placeholder={t('country_placeholder')} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="preferredLanguage">{t('preferred_language')}</label>
                    <select id="preferredLanguage" name="preferredLanguage" value={formData.preferredLanguage || ''} onChange={handleChange} className={styles.input}>
                        <option value="">{t('select_language')}</option>
                        {supportedLanguages.map(lang => <option key={lang} value={lang}>{t(lang)}</option>)}
                    </select>
                </div>
                 <div className={styles.field}>
                    <label className={styles.label}>{t('role')}</label>
                    <p className={`${styles.readOnlyField} ${styles.capitalize}`}>{t(formData.role)}</p>
                </div>
            </div>
            <div className={styles.actions}>
                {!isOnboarding && onBack && <button onClick={onBack} className={styles.backButton}>{t('back_to_dashboard')}</button>}
                <button onClick={handleSave} className={styles.saveButton}>{isOnboarding ? t('save_and_continue') : t('save_changes')}</button>
            </div>
        </div>
    );
};

export default UserDetails;
