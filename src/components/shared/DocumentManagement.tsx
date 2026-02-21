import React from 'react';
import { FileUp, Trash2, ExternalLink, Upload } from 'lucide-react';
import styles from './DocumentManagement.module.css';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
  const effectiveLang = activeLang || i18n.language;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    onFileChange(file);
  };

  const currentDocumentUrl = documentUrl ? documentUrl[effectiveLang] : undefined;
  const hasDocumentForCurrentLang = !!currentDocumentUrl;

  return (
    <div className={styles.documentSection}>
      <div className={styles.documentHeaderContainer}>
        <h3 className={styles.documentHeader}>{t('entity_document', { entity: t(entityName) })}</h3>
        <div className={styles.documentStatus}>
          {!hasDocumentForCurrentLang && !selectedFileName && (
            <p className={styles.noDocument}>
              {t('no_document_attached_for_lang', { lang: t(effectiveLang) })}
            </p>
          )}
          {selectedFileName && (
            <p className={styles.fileName}>currentFile: {selectedFileName}</p>
          )}
          {hasDocumentForCurrentLang && !selectedFileName && (
            <p className={styles.fileName}>currentFile: {getFilenameFromUrl(currentDocumentUrl)}</p>
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
                <ExternalLink size={16} /> {t('view_document')}
              </button>

              <label className={`${styles.documentActionButton} ${styles.greenButton}`}>
                <FileUp size={16} /> {t('replace_document')}
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
                <Trash2 size={16} /> {t('delete_document')}
              </button>
            </>
          ) : (
            <label className={`${styles.documentActionButton} ${styles.blueButton}`}>
              <Upload size={16} /> {t('upload_document')}
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
