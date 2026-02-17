
import React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ConfirmationModal.module.css';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    showCancelButton?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, title, message, onConfirm, onCancel, showCancelButton = true }) => {
    const { t } = useTranslation();

    if (!isOpen) {
        return null;
    }

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <AlertTriangle className={styles.modalIcon} size={48} />
                <h3 className={styles.modalTitle}>{title}</h3>
                <p className={styles.modalDescription}>{message}</p>
                <div className={styles.modalActions}>
                    {showCancelButton && (
                        <button onClick={onCancel} className={styles.modalCancelButton}>{t('cancel')}</button>
                    )}
                    <button onClick={onConfirm} className={styles.modalConfirmButton}>{t('confirm')}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
