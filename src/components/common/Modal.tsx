import React from 'react';
import styles from './Modal.module.css';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title, subtitle }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={styles.closeButton}>
          <X size={24} />
        </button>
        {(title || subtitle) && (
          <div className={styles.modalHeader}>
            {title && <h2 className={styles.modalTitle}>{title}</h2>}
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default Modal;
