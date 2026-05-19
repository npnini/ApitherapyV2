import React from 'react';
import styles from './ConfirmationModal.module.css';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { T } from './T';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string | React.ReactNode;
    message: string | React.ReactNode;
    onConfirm: () => void;
    onCancel?: () => void;
    showCancelButton?: boolean;
    confirmLabel?: string | React.ReactNode;
    cancelLabel?: string | React.ReactNode;
    type?: 'warning' | 'success' | 'error';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    showCancelButton = true,
    confirmLabel,
    cancelLabel,
    type = 'warning'
}) => {
    if (!isOpen) {
        return null;
    }

    const renderIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle2 className={`${styles.modalIcon} ${styles.modalIconSuccess}`} size={48} />;
            case 'error':
                return <XCircle className={`${styles.modalIcon} ${styles.modalIconError}`} size={48} />;
            case 'warning':
            default:
                return <AlertTriangle className={`${styles.modalIcon} ${styles.modalIconWarning}`} size={48} />;
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                {renderIcon()}
                <h3 className={styles.modalTitle}>{title}</h3>
                <div className={styles.modalDescription}>{message}</div>
                <div className={styles.modalActions}>
                    {showCancelButton && (
                        <button onClick={onCancel} className={styles.modalCancelButton}>
                            {cancelLabel || <T>Cancel</T>}
                        </button>
                    )}
                    <button onClick={onConfirm} className={styles.modalConfirmButton}>
                        {confirmLabel || <T>Confirm</T>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
