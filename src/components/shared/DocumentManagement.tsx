import React, { useEffect, useMemo } from 'react';
import { FileUp, Trash2, ExternalLink, Upload } from 'lucide-react';
import styles from './DocumentManagement.module.css';
import { T, useTranslationContext } from '../T';

interface DocumentManagementProps {
  documentUrl?: { [key: string]: string };
  onFileChange: (file: File | null) => void;
  onFileDelete: () => void;
  isSubmitting: boolean;
  selectedFileName?: string;
  activeLang?: string;
  entityName: string;
}

const getFilenameFromUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  try {
    const path = url.split('?')[0];
    const filename = path.split('%2F').pop();
    return filename ? decodeURIComponent(filename) : '';
  } catch (error) {
    console.error("Error parsing filename from URL:", error);
    return '';
  }
};

const DocumentManagement: React.FC<DocumentManagementProps> = ({
  documentUrl,
  onFileChange,
  onFileDelete,
  isSubmitting,
  selectedFileName,
  activeLang,
  entityName
}) => {
  const { language, getTranslation, registerString } = useTranslationContext();
  const effectiveLang = activeLang || language;

  // Register strings needed by this component
  const stringsToRegister = useMemo(() => [
    entityName,
    'Hebrew',
    'English',
    'Arabic',
    'Russian',
    'Current file',
    'No document attached for'
  ], [entityName]);

  useEffect(() => {
    stringsToRegister.forEach(s => registerString(s));
  }, [stringsToRegister, registerString]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    onFileChange(file);
  };

  const currentDocumentUrl = documentUrl ? documentUrl[effectiveLang] : undefined;
  const hasDocumentForCurrentLang = !!currentDocumentUrl;

  const getLangDisplayName = (lang: string) => {
    switch (lang) {
      case 'he': return getTranslation('Hebrew');
      case 'en': return getTranslation('English');
      case 'ar': return getTranslation('Arabic');
      case 'ru': return getTranslation('Russian');
      default: return lang;
    }
  };

  return (
    <div className={styles.documentSection}>
      <div className={styles.documentHeaderContainer}>
        <h3 className={styles.documentHeader}>
          {getTranslation(entityName)} <T>Document</T>
        </h3>
        <div className={styles.documentStatus}>
          {!hasDocumentForCurrentLang && !selectedFileName && (
            <p className={styles.noDocument}>
              <T>No document attached for</T> {getLangDisplayName(effectiveLang)}
            </p>
          )}
          {selectedFileName && (
            <p className={styles.fileName}><T>Current file</T>: {selectedFileName}</p>
          )}
          {hasDocumentForCurrentLang && !selectedFileName && (
            <p className={styles.fileName}><T>Current file</T>: {getFilenameFromUrl(currentDocumentUrl)}</p>
          )}
        </div>
      </div>

      <div className={styles.documentInfo}>
        <div className={styles.documentButtonRow}>
          {hasDocumentForCurrentLang ? (
            <>
              <button
                type="button"
                onClick={() => window.open(currentDocumentUrl, '_blank')}
                className={`${styles.documentActionButton} ${styles.blueButton}`}
                disabled={isSubmitting}
              >
                <ExternalLink size={16} /> <T>View Document</T>
              </button>

              <label className={`${styles.documentActionButton} ${styles.greenButton}`}>
                <FileUp size={16} /> <T>Replace Document</T>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className={styles.fileInput}
                  disabled={isSubmitting}
                  accept="application/pdf"
                />
              </label>

              <button
                type="button"
                onClick={onFileDelete}
                className={`${styles.documentActionButton} ${styles.redButton}`}
                disabled={isSubmitting}
              >
                <Trash2 size={16} /> <T>Delete Document</T>
              </button>
            </>
          ) : (
            <label className={`${styles.documentActionButton} ${styles.blueButton}`}>
              <Upload size={16} /> <T>Upload Document</T>
              <input
                type="file"
                onChange={handleFileSelect}
                className={styles.fileInput}
                disabled={isSubmitting}
                accept="application/pdf"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentManagement;
