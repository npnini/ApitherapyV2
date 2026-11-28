import React from 'react';
import styles from './Modal.module.css';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  isFlex?: boolean;
  /** Optional icon in a navy-tinted tile next to the title (UI redesign Tier 2). */
  icon?: LucideIcon;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, title, subtitle, bodyClassName, bodyStyle, isFlex, icon: Icon }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className={styles.closeButton}>
          <X size={24} />
        </button>
        <div className={`${styles.modalHeader} ${Icon ? styles.modalHeaderWithIcon : ''}`}>
          {Icon && <span className={styles.modalIcon} aria-hidden="true"><Icon size={22} /></span>}
          <div>
            {title && <h2 className={styles.modalTitle}>{title}</h2>}
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
        </div>
        <div className={`${styles.modalBody} ${isFlex ? styles.flexBody : ''} ${bodyClassName || ''}`} style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
