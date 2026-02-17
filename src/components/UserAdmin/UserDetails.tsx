import React, { useState, useEffect } from 'react';
import { User } from '../../types/user';
import styles from './UserDetails.module.css';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface UserDetailsProps {
  user: User;
  onBack: () => void;
  onSave: (user: User) => void;
}

const UserDetails: React.FC<UserDetailsProps> = ({ user, onBack, onSave }) => {
  const { t } = useTranslation();
  const [editedUser, setEditedUser] = useState<User>(user);

  useEffect(() => {
    setEditedUser(user);
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditedUser({ ...editedUser, [name]: value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedUser);
  };

  return (
    <div className={styles.modalOverlay}>
        <div className={styles.modalContent}>
            <div className={styles.formHeader}>
                <h2 className={styles.formTitle}>{t('edit_user')}</h2>
                <button onClick={onBack} className={styles.closeButton}><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.scrollableArea}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="name">{t('form_label_name')}:</label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={editedUser.name}
                            onChange={handleChange}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label htmlFor="email">{t('form_label_email')}:</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={editedUser.email}
                            onChange={handleChange}
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label htmlFor="role">{t('form_label_role')}:</label>
                        <select
                            id="role"
                            name="role"
                            value={editedUser.role}
                            onChange={handleChange}
                            className={styles.select}
                        >
                            <option value="user">{t('role_user')}</option>
                            <option value="admin">{t('role_admin')}</option>
                        </select>
                    </div>
                </div>
                <div className={styles.formActions}>
                    <button type="button" onClick={onBack} className={styles.secondaryButton}>{t('cancel')}</button>
                    <button type="submit" className={styles.primaryButton}>{t('save')}</button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default UserDetails;
