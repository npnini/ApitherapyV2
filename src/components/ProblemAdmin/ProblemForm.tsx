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
import { X, Globe } from 'lucide-react';

interface ProblemFormProps {
  initialData?: Problem;
  onSubmit: (data: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null, lang: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  appConfig: { defaultLanguage: string; supportedLanguages: string[] };
}

const TranslationReference: React.FC<{ label: string; text: string | undefined }> = ({ label, text }) => {
  if (!text) return null;
  return (
    <div className={styles.translationReference}>
      <span className={styles.translationReferenceLabel}>{label}</span>
      {text}
    </div>
  );
};

const ProblemForm: React.FC<ProblemFormProps> = ({ initialData, onSubmit, onCancel, isSubmitting, appConfig }) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [activeLang, setActiveLang] = useState<string>(currentLang);

  const [names, setNames] = useState<{ [key: string]: string }>({});
  const [descriptions, setDescriptions] = useState<{ [key: string]: string }>({});
  const [selectedProtocols, setSelectedProtocols] = useState<ShuttleItem[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<ShuttleItem[]>([]);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState<{ [key: string]: string } | undefined>(undefined);
  const [selectedFileName, setSelectedFileName] = useState<string | undefined>();

  const [protocolsCollection] = useCollection(collection(db, 'protocols'));
  const [measuresCollection] = useCollection(collection(db, 'measures'));

  const SUPPORTED_LANGS = appConfig.supportedLanguages;
  const orderedLangs = [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
    .filter(l => SUPPORTED_LANGS.includes(l));

  const allProtocols = useMemo(() =>
    protocolsCollection?.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol)) || []
    , [protocolsCollection]);

  const allMeasures = useMemo(() =>
    measuresCollection?.docs.map(doc => ({ ...doc.data(), id: doc.id } as Measure)) || []
    , [measuresCollection]);

  const availableProtocolsForShuttle = useMemo(() =>
    allProtocols.map(p => ({
      id: p.id,
      name: typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string)
    })),
    [allProtocols, currentLang]
  );

  const availableMeasuresForShuttle = useMemo(() =>
    allMeasures.map(m => ({
      id: m.id,
      name: m.name[currentLang] || m.name['en'] || Object.values(m.name)[0] || ''
    })),
    [allMeasures, currentLang]
  );

  useEffect(() => {
    if (initialData) {
      setNames(initialData.name || {});
      setDescriptions(initialData.description || {});

      let docUrls: { [key: string]: string } | undefined;
      if (typeof initialData.documentUrl === 'string') {
        docUrls = { en: initialData.documentUrl };
      } else if (typeof initialData.documentUrl === 'object' && initialData.documentUrl !== null) {
        docUrls = initialData.documentUrl as { [key: string]: string };
      }
      setDocumentUrl(docUrls);

      if (allProtocols.length > 0) {
        const initialProtocols = allProtocols.filter(p => initialData.protocolIds?.includes(p.id));
        setSelectedProtocols(initialProtocols.map(p => ({
          id: p.id,
          name: typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string)
        })));
      }

      if (allMeasures.length > 0) {
        const initialMeasures = allMeasures.filter(m => initialData.measureIds?.includes(m.id));
        setSelectedMeasures(initialMeasures.map(m => ({
          id: m.id,
          name: m.name[currentLang] || m.name['en'] || Object.values(m.name)[0] || ''
        })));
      }
    } else {
      setNames({});
      setDescriptions({});
      setDocumentUrl(undefined);
      setSelectedProtocols([]);
      setSelectedMeasures([]);
    }
  }, [initialData, allProtocols, allMeasures, currentLang]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const protocolIds = selectedProtocols.map(p => p.id);
    const measureIds = selectedMeasures.map(m => m.id);
    onSubmit({ name: names, description: descriptions, protocolIds, measureIds, documentUrl }, fileToUpload, activeLang);
  };

  const handleFileChange = (file: File | null) => {
    if (file && file.type !== 'application/pdf') {
      alert('Only PDF files are allowed.');
      return;
    }
    setFileToUpload(file);
    if (file) {
      setSelectedFileName(file.name);
    } else {
      setSelectedFileName(undefined);
    }
  };

  const handleFileDelete = () => {
    setFileToUpload(null);
    setSelectedFileName(undefined);
    if (documentUrl && documentUrl[activeLang]) {
      const newDocUrls = { ...documentUrl };
      delete newDocUrls[activeLang];
      setDocumentUrl(newDocUrls);
    }
  };

  const isEditing = !!initialData;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.formHeader}>
          <h2 className={styles.formTitle}>{isEditing ? t('edit_problem') : t('add_problem')}</h2>
          <button onClick={onCancel} className={styles.closeButton}><X size={24} /></button>
        </div>

        <div className={styles.langTabBar}>
          {orderedLangs.map(lang => (
            <button
              key={lang}
              type="button"
              className={`${styles.langTab} ${activeLang === lang ? styles.langTabActive : ''}`}
              onClick={() => setActiveLang(lang)}
            >
              {t(lang)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollableArea}>

            <div className={styles.inputGroup}>
              <div className={styles.labelWrapper}>
                <label htmlFor="name" className={styles.formLabel}>
                  {t('form_label_name')}
                  <span className={styles.requiredAsterisk}>*</span>
                </label>
                <div className={styles.indicatorContainer}>
                  <Globe size={14} className={styles.indicatorIcon} />
                  <span className={styles.translationCounter}>
                    {Object.values(names).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                  </span>
                </div>
              </div>
              {activeLang !== appConfig.defaultLanguage && !names[activeLang] && (
                <TranslationReference
                  label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                  text={names[appConfig.defaultLanguage]}
                />
              )}
              <input
                id="name"
                type="text"
                value={names[activeLang] || ''}
                onChange={(e) => setNames({ ...names, [activeLang]: e.target.value })}
                className={styles.formInput}
                required={activeLang === appConfig.defaultLanguage}
              />
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.labelWrapper}>
                <label htmlFor="description" className={styles.formLabel}>
                  {t('form_label_description')}
                  <span className={styles.requiredAsterisk}>*</span>
                </label>
                <div className={styles.indicatorContainer}>
                  <Globe size={14} className={styles.indicatorIcon} />
                  <span className={styles.translationCounter}>
                    {Object.values(descriptions).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                  </span>
                </div>
              </div>
              {activeLang !== appConfig.defaultLanguage && !descriptions[activeLang] && (
                <TranslationReference
                  label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                  text={descriptions[appConfig.defaultLanguage]}
                />
              )}
              <textarea
                id="description"
                value={descriptions[activeLang] || ''}
                onChange={(e) => setDescriptions({ ...descriptions, [activeLang]: e.target.value })}
                className={styles.formTextarea}
                required={activeLang === appConfig.defaultLanguage}
              />
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
              activeLang={activeLang}
              selectedFileName={selectedFileName}
              entityName="Problem"
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
