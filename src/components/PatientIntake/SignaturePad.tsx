import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Maximize2 } from 'lucide-react';
import Modal from '../common/Modal';
import styles from './SignaturePad.module.css';
import { T, useT } from '../T';
interface SignaturePadProps {
  onSave: (signature: string) => void;
  initialSignature?: string;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, initialSignature }) => {
  const sigPad = useRef<SignatureCanvas>(null);
  const expandedSigPad = useRef<SignatureCanvas>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isExpandedSigned, setIsExpandedSigned] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const tExpand = useT('Expand signature pad');
  const tSignHere = useT('Sign Here');

  useEffect(() => {
    if (sigPad.current) {
      sigPad.current.clear();
      if (initialSignature) {
        sigPad.current.fromDataURL(initialSignature);
        setIsSigned(true);
      }
    }
  }, [initialSignature]);

  useEffect(() => {
    if (isExpanded && expandedSigPad.current) {
      expandedSigPad.current.clear();
      if (sigPad.current && !sigPad.current.isEmpty()) {
        expandedSigPad.current.fromDataURL(sigPad.current.toDataURL());
        setIsExpandedSigned(true);
      } else {
        setIsExpandedSigned(false);
      }
    }
  }, [isExpanded]);

  const handleDraw = () => {
    setIsSigned(!sigPad.current?.isEmpty());
    setIsSaved(false);
  };

  const handleExpandedDraw = () => {
    setIsExpandedSigned(!expandedSigPad.current?.isEmpty());
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

  const clearExpanded = () => {
    if (expandedSigPad.current) {
      expandedSigPad.current.clear();
      setIsExpandedSigned(false);
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

  const saveExpanded = () => {
    if (expandedSigPad.current && !expandedSigPad.current.isEmpty()) {
      onSave(expandedSigPad.current.toDataURL());
      setIsSigned(true);
      setIsSaved(true);
      setIsExpanded(false);
    }
  };

  const getSaveButtonClassName = (signed: boolean) => {
    if (isSaved) {
      return `${styles.button} ${styles.saveButtonSaved}`;
    }
    if (signed) {
      return `${styles.button} ${styles.saveButtonActive}`;
    }
    return `${styles.button} ${styles.saveButton}`;
  };

  return (
    <div className={styles.signatureContainer}>
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={styles.expandButton}
        title={tExpand}
        aria-label={tExpand}
      >
        <Maximize2 size={16} />
      </button>
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
        <button type="button" onClick={save} className={getSaveButtonClassName(isSigned)} disabled={!isSigned}><T>Save Signature</T></button>
      </div>

      <Modal isOpen={isExpanded} onClose={() => setIsExpanded(false)} title={tSignHere}>
        <div className={styles.expandedSignatureContainer}>
          <SignatureCanvas
            ref={expandedSigPad}
            penColor='black'
            canvasProps={{ className: styles.expandedSignatureCanvas }}
            minWidth={0.5}
            maxWidth={1.5}
            onEnd={handleExpandedDraw}
          />
        </div>
        <div className={styles.signatureButtons}>
          <button type="button" onClick={clearExpanded} className={`${styles.button} ${styles.clearButton}`}><T>Clear</T></button>
          <button type="button" onClick={saveExpanded} className={getSaveButtonClassName(isExpandedSigned)} disabled={!isExpandedSigned}><T>Save Signature</T></button>
        </div>
      </Modal>
    </div>
  );
};

export default SignaturePad;
