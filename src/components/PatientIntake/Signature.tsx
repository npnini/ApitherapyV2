import React from 'react';
import { useTranslation } from 'react-i18next';
import SignaturePad from './SignaturePad';
import styles from './Signature.module.css';

interface SignatureProps {
  onSave: (signature: string) => void;
  signature?: string;
}

const Signature: React.FC<SignatureProps> = ({ onSave, signature }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.container}>
      <div className={styles.consentSection}>
        <h3 className={styles.consentTitle}>{t('legal_confirmation_signature')}</h3>
        <p className={styles.consentText}>
          {t('legal_confirmation_text')}
        </p>
      </div>
      <div className={styles.signatureSection}>
        <fieldset className={styles.signaturePadWrapper}>
          <legend className={styles.signaturePadLabel}>{t('patient_signature')}</legend>
          <SignaturePad onSave={onSave} initialSignature={signature} />
        </fieldset>
      </div>
    </div>
  );
};

export default Signature;
