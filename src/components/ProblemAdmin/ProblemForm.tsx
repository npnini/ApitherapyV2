import React, { useState, useEffect, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { Problem } from '../../types/problem';
import { Protocol } from '../../types/protocol';
import { Measure } from '../../types/measure';
import ShuttleSelector, { ShuttleItem } from '../shared/ShuttleSelector';
import DocumentManagement from '../shared/DocumentManagement';
import styles from './ProblemForm.module.css';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface ProblemFormProps {
  initialData?: Problem;
  onSubmit: (data: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const ProblemForm: React.FC<ProblemFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting }) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProtocols, setSelectedProtocols] = useState<ShuttleItem[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<ShuttleItem[]>([]);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState<{ [key: string]: string } | undefined>(undefined);

  const [protocolsCollection] = useCollection(collection(db, 'protocols'));
  const [measuresCollection] = useCollection(collection(db, 'measures'));

  const allProtocols = useMemo(() => 
    protocolsCollection?.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol)) || []
  , [protocolsCollection]);

  const allMeasures = useMemo(() =>
    measuresCollection?.docs.map(doc => ({ ...doc.data(), id: doc.id } as Measure)) || []
  , [measuresCollection]);

  const availableProtocolsForShuttle = useMemo(() =>
    allProtocols.map(p => ({ id: p.id, name: p.name })), 
    [allProtocols]
  );

  const availableMeasuresForShuttle = useMemo(() =>
    allMeasures.map(m => ({ id: m.id, name: m.name })), 
    [allMeasures]
  );

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      
      let docUrls: { [key: string]: string } | undefined;
      if (typeof initialData.documentUrl === 'string') {
        docUrls = { en: initialData.documentUrl };
      } else if (typeof initialData.documentUrl === 'object' && initialData.documentUrl !== null) {
        docUrls = initialData.documentUrl as { [key: string]: string };
      } else {
        docUrls = undefined;
      }
      setDocumentUrl(docUrls);

    } else {
      setName('');
      setDescription('');
      setDocumentUrl(undefined);
    }
  }, [initialData]);

  useEffect(() => {
    if (initialData) {
      if (allProtocols.length > 0) {
        const initialProtocols = allProtocols.filter(p => initialData.protocolIds?.includes(p.id));
        setSelectedProtocols(initialProtocols.map(p => ({ id: p.id, name: p.name })));
      }

      if (allMeasures.length > 0) {
        const initialMeasures = allMeasures.filter(m => initialData.measureIds?.includes(m.id));
        setSelectedMeasures(initialMeasures.map(m => ({ id: m.id, name: m.name })));
      }
    } else {
      setSelectedProtocols([]);
      setSelectedMeasures([]);
    }
  }, [initialData, allProtocols, allMeasures]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const protocolIds = selectedProtocols.map(p => p.id);
    const measureIds = selectedMeasures.map(m => m.id);
    onSubmit({ name, description, protocolIds, measureIds, documentUrl }, fileToUpload);
  };

  const handleFileChange = (file: File | null) => {
    if (file && file.type !== 'application/pdf') {
        alert('Only PDF files are allowed.');
        return;
    }
    setFileToUpload(file);
    if (!file) {
      setSelectedFileName(undefined);
    }
  };

  const handleFileDelete = () => {
    setFileToUpload(null);
    if (documentUrl && documentUrl[currentLang]) {
      const newDocUrls = { ...documentUrl };
      delete newDocUrls[currentLang];
      setDocumentUrl(newDocUrls);
    }
  };

  const [selectedFileName, setSelectedFileName] = useState<string | undefined>();

  useEffect(() => {
    if (fileToUpload) {
      setSelectedFileName(fileToUpload.name);
    }
  }, [fileToUpload]);

  const isEditing = !!initialData;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>{isEditing ? t('edit_problem') : t('add_problem')}</h2>
            <button onClick={onCancel} className={styles.closeButton}><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollableArea}>
            <div className={styles.inputGroup}>
              <label htmlFor="name">{t('form_label_name')}:</label>
              <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="description">{t('form_label_description')}:</label>
              <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className={styles.shuttleContainer}>
              <ShuttleSelector
                availableItems={availableProtocolsForShuttle}
                selectedItems={selectedProtocols}
                onSelectionChange={setSelectedProtocols}
                availableTitle={t('shuttle_available_protocols')}
                selectedTitle={t('shuttle_selected_protocols')}
              />
            </div>

            <div className={styles.shuttleContainer}>
              <ShuttleSelector
                availableItems={availableMeasuresForShuttle}
                selectedItems={selectedMeasures}
                onSelectionChange={setSelectedMeasures}
                availableTitle={t('shuttle_available_measures')}
                selectedTitle={t('shuttle_selected_measures')}
              />
            </div>

            <DocumentManagement 
              documentUrl={documentUrl}
              onFileChange={handleFileChange}
              onFileDelete={handleFileDelete}
              isSubmitting={isSubmitting}
              selectedFileName={selectedFileName}
            />
          </div>

          <div className={styles.formActions}>
            <button type="button" onClick={onCancel} className={styles.secondaryButton} disabled={isSubmitting}>{t('cancel')}</button>
            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? t('saving') : t('save_problem')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProblemForm;
