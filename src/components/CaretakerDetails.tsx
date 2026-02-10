
import React from 'react';
import { AppUser } from '../types/user';
import { useTranslation } from 'react-i18next';
import { User, Mail, Phone, MapPin, Building } from 'lucide-react';
import styles from './UserDetails.module.css'; // Corrected import

interface CaretakerDetailsProps {
    caretaker: AppUser;
}

const CaretakerDetails: React.FC<CaretakerDetailsProps> = ({ caretaker }) => {
    const { t } = useTranslation();

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>{t('caretaker_details')}</h2>
            </div>
            <div className={styles.grid}>
                <div className={styles.detailItem}>
                    <User className={styles.icon} />
                    <div>
                        <p className={styles.label}>{t('full_name')}</p>
                        <p className={styles.value}>{caretaker.fullName}</p>
                    </div>
                </div>
                <div className={styles.detailItem}>
                    <Mail className={styles.icon} />
                    <div>
                        <p className={styles.label}>{t('email')}</p>
                        <p className={styles.value}>{caretaker.email}</p>
                    </div>
                </div>
                <div className={styles.detailItem}>
                    <Phone className={styles.icon} />
                    <div>
                        <p className={styles.label}>{t('mobile')}</p>
                        <p className={styles.value}>{caretaker.mobile || t('not_provided')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CaretakerDetails;
