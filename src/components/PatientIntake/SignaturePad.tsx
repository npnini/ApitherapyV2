import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import styles from './SignaturePad.module.css';
import { useTranslation } from 'react-i18next';

interface SignaturePadProps {
  onSave: (signature: string) => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave }) => {
  const sigPad = useRef<SignatureCanvas>(null);
  const { t } = useTranslation();

  const clear = () => {
    sigPad.current?.clear();
  };

  const save = () => {
    if (sigPad.current) {
      onSave(sigPad.current.toDataURL());
    }
  };

  return (
    <div className={styles.signatureContainer}>
        <SignatureCanvas
            ref={sigPad}
            penColor='black'
            canvasProps={{ className: styles.signatureCanvas }}
            minWidth={0.5}
            maxWidth={1.5}
        />
        <div className={styles.signatureButtons}>
            <button type="button" onClick={clear} className={styles.button}>{t('clear')}</button>
            <button type="button" onClick={save} className={styles.button}>{t('save_signature')}</button>
        </div>
    </div>
  );
};

export default SignaturePad;
