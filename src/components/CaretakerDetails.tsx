import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser } from '../types/user';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import styles from './CaretakerDetails.module.css';

interface CaretakerDetailsProps {
  user: AppUser;
  onSave: (details: { userId: string; fullName: string; mobile: string; }) => void;
}

const CaretakerDetails: React.FC<CaretakerDetailsProps> = ({ user, onSave }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.userId || '');
  const [fullName, setFullName] = useState(user.fullName || '');
  const [mobile, setMobile] = useState(user.mobile || '');
  const [errors, setErrors] = useState({ username: '', fullName: '', mobile: '', form: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setUsername(user.userId || '');
    setFullName(user.fullName || '');
    setMobile(user.mobile || '');
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    let validationErrors = { username: '', fullName: '', mobile: '', form: '' };
    setErrors(validationErrors);

    if (!username) validationErrors.username = t('username_required');
    if (!fullName) validationErrors.fullName = t('full_name_required');
    if (!mobile) validationErrors.mobile = t('mobile_number_required');

    if (validationErrors.username || validationErrors.fullName || validationErrors.mobile) {
      setErrors(validationErrors);
      setIsSaving(false);
      return;
    }

    try {
        const usersRef = collection(db, 'users');

        const usernameQuery = query(usersRef, where('userId', '==', username));
        const usernameSnapshot = await getDocs(usernameQuery);
        if (usernameSnapshot.docs.some(doc => doc.id !== user.uid)) {
            validationErrors.username = t('username_taken');
        }

        const mobileQuery = query(usersRef, where('mobile', '==', mobile));
        const mobileSnapshot = await getDocs(mobileQuery);
        if (mobileSnapshot.docs.some(doc => doc.id !== user.uid)) {
            validationErrors.mobile = t('mobile_taken');
        }

        const emailQuery = query(usersRef, where('email', '==', user.email));
        const emailSnapshot = await getDocs(emailQuery);
        if (emailSnapshot.docs.some(doc => doc.id !== user.uid)) {
            validationErrors.form = t('email_taken');
        }

        if (validationErrors.username || validationErrors.mobile || validationErrors.form) {
            setErrors(validationErrors);
            setIsSaving(false);
            return;
        }

        onSave({ userId: username, fullName, mobile });

    } catch (error) {
        console.error("Error saving caretaker details:", error);
        setErrors({ ...validationErrors, form: 'An unexpected error occurred.' });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.form}>
        <h1 className={styles.title}>{t('caretaker_details_title')}</h1>
        <p className={styles.subtitle}>{user.userId ? t('caretaker_details_update_subtitle') : t('caretaker_details_new_subtitle')}</p>

        <div className={styles.inputGroup}>
          <label className={styles.label}>{t('email_address')}</label>
          <p className={styles.emailDisplay}>{user.email}</p>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor="username">{t('username')}</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${styles.input} ${errors.username ? styles.inputError : ''}`}
            placeholder={t('username_placeholder')}
          />
          {errors.username && <p className={styles.errorText}>{errors.username}</p>}
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor="fullName">{t('full_name')}</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={`${styles.input} ${errors.fullName ? styles.inputError : ''}`}
            placeholder={t('full_name_placeholder')}
          />
          {errors.fullName && <p className={styles.errorText}>{errors.fullName}</p>}
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.label} htmlFor="mobile">{t('mobile')}</label>
          <input
            id="mobile"
            type="text"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className={`${styles.input} ${errors.mobile ? styles.inputError : ''}`}
            placeholder={t('mobile_placeholder')}
          />
          {errors.mobile && <p className={styles.errorText}>{errors.mobile}</p>}
        </div>

        {errors.form && <p className={styles.errorText}>{errors.form}</p>}

        <button
          onClick={handleSave}
          disabled={isSaving || !username || !fullName || !mobile}
          className={styles.button}
        >
          {isSaving ? t('saving') : t('save_and_continue')}
        </button>
      </div>
    </div>
  );
};

export default CaretakerDetails;
