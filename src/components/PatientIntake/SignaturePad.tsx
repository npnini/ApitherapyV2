import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import styles from './SignaturePad.module.css';
import { useTranslation } from 'react-i18next';

interface SignaturePadProps {
  onSave: (signature: string) => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave }) => {
  const { t } = useTranslation();
  const sigCanvas = useRef<SignatureCanvas>(null);

  const clearSignature = () => {
    sigCanvas.current?.clear();
  };

  const saveSignature = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      onSave(sigCanvas.current.toDataURL());
    }
  };

  return (
    <div className={styles.signatureContainer}>
      <div className={styles.signaturePad}>
        <SignatureCanvas
          ref={sigCanvas}
          penColor="black"
          canvasProps={{ className: styles.signatureCanvas }}
        />
      </div>
      <div className={styles.signatureButtons}>
        <button type="button" onClick={clearSignature} className={styles.button}>
          {t('clear')}
        </button>
        <button type="button" onClick={saveSignature} className={styles.button}>
          {t('save_signature')}
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
