import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import styles from './SignaturePad.module.css';
import { T, useT } from '../T';
interface SignaturePadProps {
  onSave: (signature: string) => void;
  initialSignature?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, initialSignature }) => {
  const sigPad = useRef<SignatureCanvas>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (sigPad.current) {
      sigPad.current.clear();
      if (initialSignature) {
        sigPad.current.fromDataURL(initialSignature);
        setIsSigned(true);
      }
    }
  }, [initialSignature]);

  const handleDraw = () => {
    setIsSigned(!sigPad.current?.isEmpty());
    setIsSaved(false);
  };

  const clear = () => {
    if (sigPad.current) {
      sigPad.current.clear();
      setIsSigned(false);
      setIsSaved(false);
      onSave('');
    }
  };

  const save = () => {
    if (sigPad.current) {
      onSave(sigPad.current.toDataURL());
      setIsSaved(true);
    }
  };

  const getSaveButtonClassName = () => {
    if (isSaved) {
      return `${styles.button} ${styles.saveButtonSaved}`;
    }
    if (isSigned) {
      return `${styles.button} ${styles.saveButtonActive}`;
    }
    return `${styles.button} ${styles.saveButton}`;
  };

  return (
    <div className={styles.signatureContainer}>
      <SignatureCanvas
        ref={sigPad}
        penColor='black'
        canvasProps={{ className: styles.signatureCanvas }}
        minWidth={0.5}
        maxWidth={1.5}
        onEnd={handleDraw}
      />
      <div className={styles.signatureButtons}>
        <button type="button" onClick={clear} className={`${styles.button} ${styles.clearButton}`}><T>Clear</T></button>
        <button type="button" onClick={save} className={getSaveButtonClassName()} disabled={!isSigned}><T>Save Signature</T></button>
      </div>
    </div>
  );
};

export default SignaturePad;
