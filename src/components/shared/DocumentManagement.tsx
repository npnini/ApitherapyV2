import React from 'react';
import { FileUp, Trash2, ExternalLink, Upload } from 'lucide-react';
import styles from './DocumentManagement.module.css';
import { useTranslation } from 'react-i18next';

interface DocumentManagementProps {
  documentUrl?: string;
  onFileChange: (file: File | null) => void;
  onFileDelete: () => void;
  isSubmitting: boolean;
  selectedFileName?: string;
}

const DocumentManagement: React.FC<DocumentManagementProps> = ({ 
  documentUrl, 
  onFileChange, 
  onFileDelete, 
  isSubmitting, 
  selectedFileName 
}) => {
  const { t } = useTranslation();
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    onFileChange(file);
  };

  const hasDocument = documentUrl || selectedFileName;

  return (
    <div className={styles.documentSection}>
      <div className={styles.documentHeaderContainer}>
        <h3 className={styles.documentHeader}>{t('document_section_title')}</h3>
        <p className={styles.supportedFormats}>{t('pdf_only_supported')}</p>
      </div>
      <div className={styles.documentInfo}>
        <div className={styles.documentStatus}>
          {!hasDocument && (
            <p className={styles.noDocument}>{t('no_document_attached')}</p>
          )}
          {selectedFileName && !documentUrl && (
            <p className={styles.fileName}>{t('selected_file')} {selectedFileName}</p>
          )}
    
          <div className={styles.documentButtonRow}>
            {hasDocument ? (
              <>
                <button
                  type="button"
                  onClick={() => window.open(documentUrl, '_blank')}
                  className={`${styles.documentActionButton} ${styles.blueButton}`}
                  disabled={isSubmitting || !documentUrl}
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
    </div>
  );
};

export default DocumentManagement;
