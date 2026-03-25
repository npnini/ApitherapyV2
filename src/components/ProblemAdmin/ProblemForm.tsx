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
  onSubmit: (data: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, lang: string) => void;
  onFileUpdate: (data: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File, lang: string) => void;
  onFileDelete: (lang: string) => void;
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

const ProblemForm: React.FC<ProblemFormProps> = ({ initialData, onSubmit, onFileUpdate, onFileDelete, onCancel, isSubmitting, appConfig }) => {
  const { language: currentLang, registerString, getTranslation } = useTranslationContext();
  const [activeLang, setActiveLang] = useState<string>(currentLang);

  const [names, setNames] = useState<{ [key: string]: string }>({});
  const [descriptions, setDescriptions] = useState<{ [key: string]: string }>({});
  const [protocolId, setProtocolId] = useState<string>('');
  const [selectedMeasures, setSelectedMeasures] = useState<ShuttleItem[]>([]);
  const [documentUrl, setDocumentUrl] = useState<{ [key: string]: string } | undefined>(undefined);
  const [problemStatus, setProblemStatus] = useState<'active' | 'inactive'>('active');

  const [protocolsCollection] = useCollection(collection(db, 'cfg_protocols'));
  const [measuresCollection] = useCollection(collection(db, 'cfg_measures'));

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
    registerString('Protocol');
    registerString('Select a protocol');
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

  const activeProtocols = useMemo(() => {
    const initProtoId = initialData?.protocolId || (initialData?.protocolIds && initialData.protocolIds.length > 0 ? initialData.protocolIds[0] : null);
    return allProtocols.filter(p => !p.status || p.status === 'active' || initProtoId === p.id);
  }, [allProtocols, initialData]);

  const availableMeasuresForShuttle = useMemo(() => {
    const activeMeasures = allMeasures.filter(m => !m.status || m.status === 'active' || initialData?.measureIds?.includes(m.id));
    return activeMeasures.map(m => ({
      id: m.id,
      name: m.name[currentLang] || m.name['en'] || Object.values(m.name)[0] || ''
    }));
  }, [allMeasures, currentLang, initialData]);

  useEffect(() => {
    if (initialData) {
      setNames(initialData.name || {});
      setDescriptions(initialData.description || {});
      setProblemStatus(initialData.status || 'active');

      let docUrls: { [key: string]: string } | undefined;
      if (typeof initialData.documentUrl === 'string') {
        docUrls = { en: initialData.documentUrl };
      } else if (typeof initialData.documentUrl === 'object' && initialData.documentUrl !== null) {
        docUrls = initialData.documentUrl as { [key: string]: string };
      }
      setDocumentUrl(docUrls);

      if (initialData.protocolId) {
        setProtocolId(initialData.protocolId);
      } else if (initialData.protocolIds && initialData.protocolIds.length > 0) {
        setProtocolId(initialData.protocolIds[0]);
      } else {
        setProtocolId('');
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
      setProtocolId('');
      setSelectedMeasures([]);
    }
  }, [initialData, allProtocols, allMeasures, currentLang]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const measureIds = selectedMeasures.map(m => m.id);
    onSubmit({
      name: names,
      description: descriptions,
      ...(protocolId ? { protocolId, protocolIds: [protocolId] } : {}),
      measureIds,
      ...(documentUrl ? { documentUrl } : {}),
      status: problemStatus,
      reference_count: initialData?.reference_count || 0
    }, activeLang);
  };

  const handleFileChange = (file: File | null) => {
    if (file && file.type !== 'application/pdf') {
      alert(getTranslation('Only PDF files are allowed.'));
      return;
    }
    if (file) {
      const measureIds = selectedMeasures.map(m => m.id);
      onFileUpdate({
        name: names,
        description: descriptions,
        ...(protocolId ? { protocolId, protocolIds: [protocolId] } : {}),
        measureIds,
        documentUrl,
        status: problemStatus,
        reference_count: initialData?.reference_count || 0
      }, file, activeLang);
    }
  };

  const handleFileDelete = () => {
    onFileDelete(activeLang);
  };

  const isEditing = !!initialData;
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

            <div className={styles.statusToggleContainer}>
              <span className={styles.statusLabel}><T>Status</T>:</span>
              <div className={styles.toggleWrapper} title={initialData && initialData.reference_count ? getTranslation('This problem is referenced by patients and cannot be made inactive.') : ''}>
                <label className={`${styles.switch} ${initialData && initialData.reference_count ? styles.switchDisabled : ''}`}>
                  <input
                    type="checkbox"
                    checked={problemStatus === 'active'}
                    onChange={(e) => setProblemStatus(e.target.checked ? 'active' : 'inactive')}
                    disabled={!!(initialData && initialData.reference_count)}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
              <span className={`${styles.statusText} ${problemStatus === 'active' ? styles.statusActive : styles.statusInactive}`}>
                <T>{problemStatus === 'active' ? 'Active' : 'Inactive'}</T>
              </span>
              {initialData && initialData.reference_count > 0 && (
                <span className={styles.referenceCountHint}>
                  (<T>Used by</T> {initialData.reference_count} <T>patients</T>)
                </span>
              )}
            </div>

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

            <div className={styles.inputGroup}>
              <label htmlFor="protocol" className={styles.formLabel}>
                <T>Protocol</T>
              </label>
              <select
                id="protocol"
                value={protocolId}
                onChange={(e) => setProtocolId(e.target.value)}
                className={styles.formInput}
              >
                <option value="">{getTranslation('Select a protocol')}</option>
                {activeProtocols.map(p => (
                  <option key={p.id} value={p.id}>
                    {typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string)}
                  </option>
                ))}
              </select>
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

