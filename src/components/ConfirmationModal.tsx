import React from 'react';
import styles from './ConfirmationModal.module.css';
import { AlertTriangle } from 'lucide-react';
import { T } from './T';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string | React.ReactNode;
    message: string | React.ReactNode;
    onConfirm: () => void;
    onCancel?: () => void;
    showCancelButton?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, title, message, onConfirm, onCancel, showCancelButton = true }) => {
    if (!isOpen) {
        return null;
    }

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <AlertTriangle className={styles.modalIcon} size={48} />
                <h3 className={styles.modalTitle}>{title}</h3>
                <div className={styles.modalDescription}>{message}</div>
                <div className={styles.modalActions}>
                    {showCancelButton && (
                        <button onClick={onCancel} className={styles.modalCancelButton}>
                            <T>Cancel</T>
                        </button>
                    )}
                    <button onClick={onConfirm} className={styles.modalConfirmButton}>
                        <T>Confirm</T>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
