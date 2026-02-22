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
import { T, useT, useTranslationContext } from '../T';
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
  const { language: currentLang, registerString, getTranslation } = useTranslationContext();
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
  const orderedLangs = useMemo(() => [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
    .filter(l => SUPPORTED_LANGS.includes(l)), [currentLang, SUPPORTED_LANGS]);

  // String Registry for languages and dynamic labels
  useEffect(() => {
    SUPPORTED_LANGS.forEach(lang => registerString(lang));
    registerString('English');
    registerString('Hebrew');
    registerString('Arabic');
    registerString('Russian');
    registerString('Name');
    registerString('Description');
    registerString('Only PDF files are allowed.');
    registerString('Default language');
    registerString('Available protocols');
    registerString('Selected protocols');
    registerString('Available measures');
    registerString('Selected measures');
    registerString('Cancel');
    registerString('Saving...');
  }, [registerString, SUPPORTED_LANGS]);

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
      alert(getTranslation('Only PDF files are allowed.'));
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
  const shuttleAvailableProtocols = useT('Available protocols');
  const shuttleSelectedProtocols = useT('Selected protocols');
  const shuttleAvailableMeasures = useT('Available measures');
  const shuttleSelectedMeasures = useT('Selected measures');

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
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.formHeader}>
          <h2 className={styles.formTitle}>{isEditing ? <T>Edit problem</T> : <T>Add problem</T>}</h2>
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
              {getLangDisplayName(lang)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollableArea}>

            <div className={styles.inputGroup}>
              <div className={styles.labelWrapper}>
                <label htmlFor="name" className={styles.formLabel}>
                  <T>Name</T>
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
                  label={`${getTranslation('Default language')}: ${getLangDisplayName(appConfig.defaultLanguage)}`}
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
                  <T>Description</T>
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
                  label={`${getTranslation('Default language')}: ${getLangDisplayName(appConfig.defaultLanguage)}`}
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
                availableTitle={shuttleAvailableProtocols}
                selectedTitle={shuttleSelectedProtocols}
              />
            </div>

            <div className={styles.shuttleContainer}>
              <ShuttleSelector
                availableItems={availableMeasuresForShuttle}
                selectedItems={selectedMeasures}
                onSelectionChange={setSelectedMeasures}
                availableTitle={shuttleAvailableMeasures}
                selectedTitle={shuttleSelectedMeasures}
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
            <button type="button" onClick={onCancel} className={styles.secondaryButton} disabled={isSubmitting}>{getTranslation('Cancel')}</button>
            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? getTranslation('Saving...') : <T>Save problem</T>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProblemForm;

