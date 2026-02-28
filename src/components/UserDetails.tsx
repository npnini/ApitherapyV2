import React, { useState, useEffect } from 'react';
import { AppUser } from '../types/user';
import styles from './UserDetails.module.css';
import { T, useT, useTranslationContext } from './T';

interface UserDetailsProps {
    user: AppUser;
    onSave: (updatedUser: AppUser) => void;
    onBack?: () => void; // onBack is now optional
    isOnboarding?: boolean; // New prop to control the mode
}

const UserDetails: React.FC<UserDetailsProps> = ({ user, onSave, onBack, isOnboarding = false }) => {
    const { language, registerString } = useTranslationContext();
    const isRtl = language === 'he';
    const [formData, setFormData] = useState<AppUser>(user);
    const [error, setError] = useState<string | null>(null);

    const supportedLanguages = ['en', 'he'];
    const countryToLang: { [key: string]: string } = {
        'israel': 'he',
    };

    useEffect(() => {
        // Set initial language for new and existing users
        if (user.preferredLanguage) {
            setFormData(prev => ({ ...prev, preferredLanguage: user.preferredLanguage }));
        } else if (supportedLanguages.includes(language)) {
            setFormData(prev => ({ ...prev, preferredLanguage: language }));
        } else {
            setFormData(prev => ({ ...prev, preferredLanguage: 'en' }));
        }
    }, [user.preferredLanguage, language]);

    useEffect(() => {
        // This effect runs when a NEW user types in the country field
        if (isOnboarding) {
            const lang = countryToLang[formData.country?.toLowerCase() || ''] || 'en';
            if (supportedLanguages.includes(lang)) {
                setFormData(prev => ({ ...prev, preferredLanguage: lang }));
            }
        }
    }, [formData.country, isOnboarding]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const fullNameRequired = useT('Full name is required');
    const mobileNumberRequired = useT('Mobile number is required');
    const addressRequired = useT('Address is required');
    const cityRequired = useT('City is required');
    const countryRequired = useT('Country is required');
    const languageRequired = useT('Language is required');

    const handleSave = () => {
        if (!formData.fullName.trim()) {
            setError(fullNameRequired);
            return;
        }
        if (!formData.mobile.trim()) {
            setError(mobileNumberRequired);
            return;
        }
        if (!formData.address?.trim()) {
            setError(addressRequired);
            return;
        }
        if (!formData.city?.trim()) {
            setError(cityRequired);
            return;
        }
        if (!formData.country?.trim()) {
            setError(countryRequired);
            return;
        }
        if (!formData.preferredLanguage) {
            setError(languageRequired);
            return;
        }
        setError(null);
        onSave(formData);
    };

    const myProfileTitle = useT('My Profile');
    const yourProfileDetailsTitle = useT('Your Profile Details');
    const saveAndContinue = useT('Save and Continue');
    const saveChanges = useT('Save Changes');

    return (
        <div className={styles.container} dir={isRtl ? 'rtl' : 'ltr'}>
            <h2 className={styles.title}>{isOnboarding ? yourProfileDetailsTitle : myProfileTitle}</h2>
            <p className={styles.subtitle}>{isOnboarding ? <T>Update your information below</T> : ''}</p>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.grid}>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="fullName">
                        <T>Full Name</T>
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} className={styles.input} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="email"><T>Email</T></label>
                    <p className={styles.readOnlyField}>{formData.email}</p>
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="mobile">
                        <T>Mobile</T>
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="mobile" name="mobile" type="text" value={formData.mobile} onChange={handleChange} className={styles.input} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="address">
                        <T>Address</T>
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="address" name="address" type="text" value={formData.address || ''} onChange={handleChange} className={styles.input} placeholder={useT('Enter your address')} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="city">
                        <T>City</T>
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="city" name="city" type="text" value={formData.city || ''} onChange={handleChange} className={styles.input} placeholder={useT('Enter your city')} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="country">
                        <T>Country</T>
                        <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <input id="country" name="country" type="text" value={formData.country || ''} onChange={handleChange} className={styles.input} placeholder={useT('Enter your country')} required />
                </div>
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="preferredLanguage"><T>Preferred Language</T></label>
                    <select id="preferredLanguage" name="preferredLanguage" value={formData.preferredLanguage || ''} onChange={handleChange} className={styles.input}>
                        <option value=""><T>Select Language</T></option>
                        {supportedLanguages.map(lang => <LanguageOption key={lang} lang={lang} />)}
                    </select>
                </div>
                <div className={styles.field}>
                    <label className={styles.label}><T>Role</T></label>
                    <p className={`${styles.readOnlyField} ${styles.capitalize}`}><T>{formData.role}</T></p>
                </div>
            </div>
            <div className={styles.actions}>
                {!isOnboarding && onBack && <button onClick={onBack} className={styles.backButton}><T>Back to Dashboard</T></button>}
                <button onClick={handleSave} className={styles.saveButton}>{isOnboarding ? saveAndContinue : saveChanges}</button>
            </div>
        </div>
    );
};

const LanguageOption: React.FC<{ lang: string }> = ({ lang }) => {
    return <option value={lang}>{useT(lang === 'en' ? 'English' : 'Hebrew')}</option>;
};

export default UserDetails;
