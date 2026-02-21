
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Measure, MeasureType } from '../../types/measure';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, FileUp, FileDown, FileCheck2, XSquare, X, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from '../PointsAdmin.module.css'; // General table styles
import formStyles from './MeasureForm.module.css'; // Form-specific styles
import { uploadFile, deleteFile } from '../../services/storageService';
import DocumentManagement from '../shared/DocumentManagement';

const getFilenameFromUrl = (url: string | null | undefined): string => {
    if (!url) {
        return '';
    }
    try {
        const path = url.split('?')[0];
        const filename = path.split('%2F').pop();
        return filename ? decodeURIComponent(filename) : '';
    } catch (error) {
        console.error("Error parsing filename from URL:", error);
        return '';
    }
};

const MeasureAdmin: React.FC = () => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;
    const [user, setUser] = useState<User | null>(null);
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingMeasure, setEditingMeasure] = useState<Measure | null>(null);
    const [originalMeasure, setOriginalMeasure] = useState<Measure | null>(null);
    const [deletingMeasure, setDeletingMeasure] = useState<Measure | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });

    const measuresCollectionRef = React.useMemo(() => collection(db, 'measures'), []);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) {
                setIsLoading(false);
            }
        });

        const fetchConfig = async () => {
            try {
                const configDoc = await getDoc(doc(db, 'app_config', 'main'));
                if (configDoc.exists()) {
                    const data = configDoc.data();
                    setAppConfig({
                        defaultLanguage: data.languageSettings?.defaultLanguage || 'en',
                        supportedLanguages: data.languageSettings?.supportedLanguages || ['en']
                    });
                }
            } catch (err) {
                console.error("Error fetching app config:", err);
            }
        };
        fetchConfig();

        return () => unsubscribe();
    }, []);

    const fetchMeasures = useCallback(async () => {
        if (!user) {
            setMeasures([]);
            return;
        }

        setIsLoading(true);
        try {
            const data = await getDocs(measuresCollectionRef);
            const fetchedMeasures = data.docs.map(doc => ({ ...(doc.data() as Omit<Measure, 'id'>), id: doc.id }));
            fetchedMeasures.sort((a, b) =>
                (a.name[currentLang] || a.name['en'] || '').localeCompare(b.name[currentLang] || b.name['en'] || '')
            );
            setMeasures(fetchedMeasures);
            setError(null); // Clear previous errors on successful fetch
        } catch (err) {
            setError(t('failedToFetchMeasures'));
            console.error(err);
        }
        setIsLoading(false);
    }, [user, measuresCollectionRef, t]);

    useEffect(() => {
        fetchMeasures();
    }, [fetchMeasures]);

    const handleStartEditing = (measure: Measure) => {
        setFormError(null);
        let docUrls = measure.documentUrl;
        if (typeof docUrls === 'string') {
            docUrls = { en: docUrls };
        }
        const measureToEdit = { ...measure, documentUrl: docUrls };
        setEditingMeasure(measureToEdit);
        setOriginalMeasure(measureToEdit);
        setIsDirty(false);
    };

    const handleAddNew = () => {
        setFormError(null);
        const newMeasure: Measure = { id: '', name: {}, description: {}, type: 'Category' };
        setEditingMeasure(newMeasure);
        setOriginalMeasure(newMeasure);
        setIsDirty(false);
    };

    const validateMeasureForm = (measure: Measure, isNew: boolean): boolean => {
        const allInputValues = Object.values(measure.name || {}).map(v => v.trim().toLowerCase()).filter(Boolean);
        if (allInputValues.length === 0) {
            setFormError(t('measureNameRequired'));
            return false;
        }

        const descriptionValues = Object.values(measure.description || {}).map(v => v.trim()).filter(Boolean);
        if (descriptionValues.length === 0) {
            setFormError(t('measureDescriptionRequired'));
            return false;
        }

        if (isNew) {
            const nameExists = measures.some(m =>
                m.id !== measure.id &&
                Object.values(m.name || {}).some(v => allInputValues.includes(v.trim().toLowerCase()))
            );
            if (nameExists) {
                const displayName = measure.name[currentLang] || measure.name['en'] || allInputValues[0];
                setFormError(t('measureNameExists', { name: displayName }));
                return false;
            }
        }

        if (measure.type === 'Category' && (!measure.categories || measure.categories.length === 0)) {
            setFormError(t('atLeastOneCategory'));
            return false;
        }

        if (measure.type === 'Scale') {
            if (measure.scale?.min === undefined || measure.scale?.max === undefined) {
                setFormError(t('minMaxRequired'));
                return false;
            }
            if (measure.scale.min >= measure.scale.max) {
                setFormError(t('maxMustBeGreaterThanMin'));
                return false;
            }
        }

        setFormError(null);
        return true;
    }

    const handleSave = async (measureToSave: Measure) => {
        const isNewMeasure = !measureToSave.id;
        if (!validateMeasureForm(measureToSave, isNewMeasure)) {
            return;
        }

        setIsSubmitting(true);

        try {
            const originalUrls: Record<string, string> = (originalMeasure?.documentUrl && typeof originalMeasure.documentUrl === 'object') ? (originalMeasure.documentUrl as Record<string, string>) : {};
            const newUrls: Record<string, string> = (measureToSave.documentUrl && typeof measureToSave.documentUrl === 'object') ? (measureToSave.documentUrl as Record<string, string>) : {};

            // Identify and delete any files that were removed from the documentUrl object (the form state)
            for (const [l, url] of Object.entries(originalUrls)) {
                if (url && !newUrls[l]) {
                    console.log(`[DEBUG-SAVE-DEL] Deleting orphaned file for lang ${l}:`, url);
                    await deleteFile(url).catch(err => console.error("Error deleting orphaned file:", err));
                }
            }

            const dataToSave: any = {
                name: measureToSave.name,
                description: measureToSave.description,
                type: measureToSave.type,
                documentUrl: Object.keys(newUrls).length > 0 ? newUrls : null,
                updatedAt: serverTimestamp(),
            };

            if (measureToSave.type === 'Category') {
                dataToSave.categories = measureToSave.categories;
                dataToSave.scale = null;
            } else if (measureToSave.type === 'Scale') {
                dataToSave.scale = measureToSave.scale;
                dataToSave.categories = null;
            }

            if (isNewMeasure) {
                dataToSave.createdAt = serverTimestamp();
                await addDoc(measuresCollectionRef, dataToSave);
            } else {
                const measureDoc = doc(db, 'measures', measureToSave.id);
                await updateDoc(measureDoc, dataToSave);
            }

            setEditingMeasure(null);
            setIsDirty(false);
            fetchMeasures();
        } catch (err) {
            setFormError(t('failedToSaveMeasure'));
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingMeasure) return;

        setIsSubmitting(true);
        try {
            if (deletingMeasure.documentUrl) {
                const urlsToDelete = typeof deletingMeasure.documentUrl === 'object' ? Object.values(deletingMeasure.documentUrl) : [deletingMeasure.documentUrl];
                for (const url of urlsToDelete) {
                    await deleteFile(url);
                }
            }

            const measureDoc = doc(db, 'measures', deletingMeasure.id);
            await deleteDoc(measureDoc);
            fetchMeasures();
        } catch (err) {
            setError(t('failedToDeleteMeasure'));
            console.error(err);
        }
        setIsSubmitting(false);
        setDeletingMeasure(null);
    };

    const handleUpdate = (updatedMeasure: Measure, file?: File | null, lang: string = currentLang) => {
        setEditingMeasure(updatedMeasure);
        setIsDirty(true);

        if (file) {
            setIsSubmitting(true);

            // Replacement logic: delete old file for this language if it exists in storage
            const currentDocUrls = updatedMeasure.documentUrl;
            let existingUrl: string | undefined;
            if (typeof currentDocUrls === 'object' && currentDocUrls !== null) {
                existingUrl = (currentDocUrls as any)[lang];
            } else if (typeof currentDocUrls === 'string' && lang === 'en') {
                existingUrl = currentDocUrls;
            }

            const uploadAndCleanup = async () => {
                if (existingUrl) {
                    console.log(`[DEBUG-REPLACE] Deleting existing file for ${lang} before upload:`, existingUrl);
                    await deleteFile(existingUrl).catch(err => console.error("Error deleting old file for replacement:", err));
                }
                const url = await uploadFile(file, `Measures/${updatedMeasure.id || 'new'}`);

                let docUrlsToUpdate = updatedMeasure.documentUrl;
                if (typeof docUrlsToUpdate === 'string') {
                    docUrlsToUpdate = { en: docUrlsToUpdate };
                }
                const newDocUrls = { ...(docUrlsToUpdate || {}), [lang]: url };
                setEditingMeasure({ ...updatedMeasure, documentUrl: newDocUrls });
            };

            uploadAndCleanup()
                .catch(err => {
                    setFormError(t('failedToUploadFile'));
                    console.error(err);
                })
                .finally(() => {
                    setIsSubmitting(false);
                });
        }
    };

    const handleCancelEdit = () => {
        setEditingMeasure(null);
        setFormError(null);
        setIsDirty(false);
    };

    const getDocumentUrl = (docUrl: any) => {
        if (typeof docUrl === 'string') return docUrl;
        if (typeof docUrl === 'object' && docUrl !== null) {
            return docUrl[currentLang] || docUrl.en;
        }
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('measure_configuration')}</h1>
                <div>
                    <button onClick={handleAddNew} className={styles.addButton}>
                        <PlusCircle size={18} className={styles.addButtonIcon} /> {t('addNewMeasure')}
                    </button>
                </div>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {editingMeasure && (
                <EditMeasureForm
                    measure={editingMeasure}
                    originalMeasure={originalMeasure!}
                    onSave={handleSave}
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                    measures={measures}
                    onUpdate={handleUpdate}
                    isDirty={isDirty}
                    appConfig={appConfig}
                />
            )}

            {deletingMeasure && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIconContainer}>
                                <AlertTriangle className={styles.modalIcon} aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className={styles.modalTitle}>{t('deleteMeasure')}</h2>
                                <p className={styles.modalText}>{t('deleteMeasureConfirmation', { name: deletingMeasure.name[currentLang] || deletingMeasure.name['en'] || '' })}</p>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setDeletingMeasure(null)} disabled={isSubmitting} className={styles.cancelButton}>{t('cancel')}</button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className={styles.confirmDeleteButton}>
                                {isSubmitting ? t('deleting') : t('confirmDelete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.tableContainer}>
                <div className="overflow-x-auto">
                    <table className={styles.table}>
                        <thead className={styles.tableHeader}>
                            <tr>
                                <th scope="col" className={styles.headerCell}>{t('name')}</th>
                                <th scope="col" className={styles.headerCell}>{t('type')}</th>
                                <th scope="col" className={styles.headerCell}>{t('description')}</th>
                                <th scope="col" className={`${styles.headerCell} ${styles.documentCell}`}>{t('document')}</th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">{t('actions')}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {isLoading ? (
                                <tr><td colSpan={5} className={styles.loaderCell}><Loader className={styles.loader} size={32} /></td></tr>
                            ) : error ? null : measures.length === 0 ? (
                                <tr><td colSpan={5} className={styles.emptyCell}>{!user ? t('please_log_in') : t('noMeasuresFound')}</td></tr>
                            ) : (
                                measures.map(measure => (
                                    <tr key={measure.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{measure.name[currentLang] || measure.name['en'] || ''}</td>
                                        <td className={styles.cell}>{t(measure.type.toLowerCase())}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={measure.description[currentLang] || measure.description['en'] || ''}>{measure.description[currentLang] || measure.description['en'] || ''}</td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {measure.documentUrl && getDocumentUrl(measure.documentUrl) && (
                                                <a href={getDocumentUrl(measure.documentUrl)} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                    <FileCheck2 size={18} />
                                                </a>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <button onClick={() => handleStartEditing(measure)} className={styles.actionButton}><Edit size={18} /></button>
                                            <button onClick={() => setDeletingMeasure(measure)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


interface EditMeasureFormProps {
    measure: Measure;
    originalMeasure: Measure;
    measures: Measure[];
    onSave: (measure: Measure) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
    onUpdate: (measure: Measure, file?: File | null, lang?: string) => void;
    isDirty: boolean;
    appConfig: { defaultLanguage: string; supportedLanguages: string[] };
}

const TranslationReference: React.FC<{ label: string; text: string | undefined }> = ({ label, text }) => {
    if (!text) return null;
    return (
        <div className={formStyles.translationReference}>
            <span className={formStyles.translationReferenceLabel}>{label}</span>
            {text}
        </div>
    );
};

const EditMeasureForm: React.FC<EditMeasureFormProps> = ({ measure, measures, onSave, onCancel, error, isSubmitting, onUpdate, isDirty, appConfig }) => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;
    const [activeLang, setActiveLang] = useState<string>(currentLang);
    const SUPPORTED_LANGS = appConfig.supportedLanguages;
    const orderedLangs = [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
        .filter(l => SUPPORTED_LANGS.includes(l));
    const [formData, setFormData] = useState(measure);
    const [localError, setLocalError] = useState<string | null>(null);
    const [categoryInput, setCategoryInput] = useState('');
    const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    useEffect(() => {
        setFormData(measure);
        setSelectedFile(null);
    }, [measure]);

    const handleFileChange = (file: File | null) => {
        if (file) {
            setSelectedFile(file);
            onUpdate(formData, file, activeLang);
        }
    };

    const handleFileDelete = () => {
        const newDocUrls: { [key: string]: string } = { ...(formData.documentUrl as object || {}) };
        delete newDocUrls[activeLang];
        onUpdate({ ...formData, documentUrl: newDocUrls }, null, activeLang);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        let updatedMeasure: Measure;
        if (name === 'name' || name === 'description') {
            updatedMeasure = { ...formData, [name]: { ...(formData[name] as { [key: string]: string }), [activeLang]: value } };
        } else {
            updatedMeasure = { ...formData, [name]: value } as Measure;
        }
        if (name === 'type') {
            updatedMeasure.categories = [];
            updatedMeasure.scale = { min: 0, max: 0 };
        }
        setFormData(updatedMeasure);
        onUpdate(updatedMeasure);
    };

    const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const num = parseInt(value, 10);
        const newScaleValue = isNaN(num) ? undefined : num;

        const updatedMeasure = {
            ...formData,
            scale: {
                ...(formData.scale || {}),
                [name]: newScaleValue,
            }
        };
        setFormData(updatedMeasure as Measure);
        onUpdate(updatedMeasure as Measure);
    };

    const handleAddCategory = () => {
        if (!categoryInput.trim()) return;

        let updatedCategories: Array<{ [key: string]: string }>;

        if (editingCategoryIndex !== null) {
            // Merge the new value for activeLang into the existing category object
            updatedCategories = [...(formData.categories || [])];
            updatedCategories[editingCategoryIndex] = {
                ...updatedCategories[editingCategoryIndex],
                [activeLang]: categoryInput.trim(),
            };
        } else {
            // Check for duplicate: no existing category has the same value for this lang
            const isDuplicate = formData.categories?.some(cat => (cat[activeLang] || '').toLowerCase() === categoryInput.trim().toLowerCase());
            if (isDuplicate) return;
            updatedCategories = [...(formData.categories || []), { [activeLang]: categoryInput.trim() }];
        }

        const updatedMeasure = { ...formData, categories: updatedCategories };
        setFormData(updatedMeasure);
        onUpdate(updatedMeasure);
        setCategoryInput('');
        setEditingCategoryIndex(null);
    };

    const handleEditCategory = (index: number) => {
        const cat = formData.categories?.[index];
        setCategoryInput(cat?.[activeLang] || '');
        setEditingCategoryIndex(index);
    };

    const handleRemoveCategory = (index: number) => {
        const updatedCategories = (formData.categories || []).filter((_, i) => i !== index);
        const updatedMeasure = { ...formData, categories: updatedCategories };
        setFormData(updatedMeasure);
        onUpdate(updatedMeasure);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const allInputValues = Object.values(formData.name || {}).map(v => v.trim().toLowerCase()).filter(Boolean);
        if (allInputValues.length === 0) {
            setLocalError(t('measureNameRequired')); return;
        }
        const descriptionValues = Object.values(formData.description || {}).map(v => v.trim()).filter(Boolean);
        if (descriptionValues.length === 0) {
            setLocalError(t('measureDescriptionRequired')); return;
        }
        if (formData.type === 'Category' && (!formData.categories || formData.categories.length === 0)) {
            setLocalError(t('atLeastOneCategory'));
            return;
        }

        if (formData.type === 'Scale') {
            if (formData.scale?.min === undefined || formData.scale?.max === undefined) {
                setLocalError(t('minMaxRequired'));
                return;
            }
            if (formData.scale.min >= formData.scale.max) {
                setLocalError(t('maxMustBeGreaterThanMin'));
                return;
            }
        }

        const isNew = !measure.id;
        const nameExists = measures.some(m =>
            m.id !== measure.id &&
            Object.values(m.name || {}).some(v => allInputValues.includes(v.trim().toLowerCase()))
        );
        if (isNew && nameExists) {
            const displayName = formData.name[activeLang] || formData.name['en'] || allInputValues[0];
            setLocalError(t('measureNameExists', { name: displayName }));
            return;
        }

        setLocalError(null);
        onSave(formData);
    };

    const isEditing = !!formData.id;

    return (
        <div className={styles.modalOverlay}>
            <div className={formStyles.modalContent}>
                <div className={formStyles.formHeader}>
                    <h2 className={formStyles.formTitle}>{isEditing ? t('editMeasure') : t('addNewMeasure')}</h2>
                    <button onClick={onCancel} className={formStyles.closeButton}><X size={24} /></button>
                </div>
                <div className={formStyles.langTabBar}>
                    {orderedLangs.map(lang => (
                        <button
                            key={lang}
                            type="button"
                            onClick={() => { setCategoryInput(''); setEditingCategoryIndex(null); setActiveLang(lang); }}
                            className={`${formStyles.langTab} ${activeLang === lang ? formStyles.langTabActive : ''}`}
                        >
                            {t(lang)}
                        </button>
                    ))}
                </div>
                <form onSubmit={handleSubmit} className={formStyles.form}>
                    <div className={formStyles.scrollableArea}>
                        {(error || localError) && <p className={formStyles.formError}>{error || localError}</p>}

                        <div>
                            <div className={formStyles.labelWrapper}>
                                <label htmlFor="name" className={formStyles.label}>
                                    {t('name')}
                                    <span className={formStyles.requiredAsterisk}>*</span>
                                </label>
                                <div className={formStyles.indicatorContainer}>
                                    <Globe size={14} className={formStyles.indicatorIcon} />
                                    <span className={formStyles.translationCounter}>
                                        {Object.values(formData.name || {}).filter(Boolean).length}/{appConfig.supportedLanguages.length}
                                    </span>
                                </div>
                            </div>
                            {activeLang !== appConfig.defaultLanguage && !formData.name[activeLang] && (
                                <TranslationReference
                                    label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                                    text={formData.name[appConfig.defaultLanguage]}
                                />
                            )}
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name[activeLang] || ''}
                                onChange={handleChange}
                                placeholder={t('namePlaceholder')}
                                className={formStyles.input}
                            />
                        </div>

                        <div>
                            <label htmlFor="type" className={formStyles.label}>
                                {t('type')}
                            </label>
                            <select id="type" name="type" value={formData.type} onChange={handleChange} className={formStyles.select}>
                                <option value="Category">{t('category')}</option>
                                <option value="Scale">{t('scale')}</option>
                            </select>
                        </div>

                        {formData.type === 'Category' && (
                            <div>
                                <label className={formStyles.label}>{t('categories')}</label>
                                <div className={formStyles.categoryInputContainer}>
                                    <input
                                        type="text"
                                        value={categoryInput}
                                        onChange={(e) => setCategoryInput(e.target.value)}
                                        placeholder={t('addCategoryPlaceholder')}
                                        className={formStyles.input}
                                    />
                                    <button type="button" onClick={handleAddCategory} className={`${styles.addButton} ${formStyles.addButton}`}>{editingCategoryIndex !== null ? t('update') : t('add')}</button>
                                </div>
                                <div className={formStyles.categoryList}>
                                    {formData.categories?.map((cat, index) => {
                                        const displayValue = cat[activeLang] || cat['en'] || Object.values(cat)[0] || '';
                                        const isMissingActiveLang = !cat[activeLang];
                                        return (
                                            <div key={index} className={formStyles.categoryTag}>
                                                <span>
                                                    {displayValue}
                                                    {isMissingActiveLang && <span className={formStyles.missingLangBadge}> ({t(activeLang)} {t('missing') || 'missing'})</span>}
                                                </span>
                                                <div>
                                                    <button type="button" title={`Edit`} onClick={() => handleEditCategory(index)} className={formStyles.actionButton}>
                                                        <Edit size={16} />
                                                    </button>
                                                    <button type="button" title={`Remove`} onClick={() => handleRemoveCategory(index)} className={formStyles.actionButton}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {formData.type === 'Scale' && (
                            <div className={formStyles.scaleContainer}>
                                <div>
                                    <label htmlFor="min" className={formStyles.label}>{t('minimum')}</label>
                                    <input
                                        type="number"
                                        id="min"
                                        name="min"
                                        value={formData.scale?.min ?? ''}
                                        onChange={handleScaleChange}
                                        className={formStyles.input}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="max" className={formStyles.label}>{t('maximum')}</label>
                                    <input
                                        type="number"
                                        id="max"
                                        name="max"
                                        value={formData.scale?.max ?? ''}
                                        onChange={handleScaleChange}
                                        className={formStyles.input}
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <div className={formStyles.labelWrapper}>
                                <label htmlFor="description" className={formStyles.label}>
                                    {t('description')}
                                    <span className={formStyles.requiredAsterisk}>*</span>
                                </label>
                                <div className={formStyles.indicatorContainer}>
                                    <Globe size={14} className={formStyles.indicatorIcon} />
                                    <span className={formStyles.translationCounter}>
                                        {Object.values(formData.description || {}).filter(Boolean).length}/{appConfig.supportedLanguages.length}
                                    </span>
                                </div>
                            </div>
                            {activeLang !== appConfig.defaultLanguage && !formData.description[activeLang] && (
                                <TranslationReference
                                    label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                                    text={formData.description[appConfig.defaultLanguage]}
                                />
                            )}
                            <textarea
                                id="description"
                                name="description"
                                value={formData.description[activeLang] || ''}
                                onChange={handleChange}
                                placeholder={t('descriptionPlaceholder')}
                                className={formStyles.textarea}
                                rows={3}
                            ></textarea>
                        </div>

                        {/* Document management section */}
                        <DocumentManagement
                            entityName="Measure"
                            documentUrl={formData.documentUrl as { [key: string]: string }}
                            onFileChange={(newFile) => {
                                handleFileChange(newFile);
                            }}
                            onFileDelete={handleFileDelete}
                            isSubmitting={isSubmitting}
                            activeLang={activeLang}
                            selectedFileName={selectedFile?.name}
                        />
                    </div>

                    <div className={formStyles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={formStyles.cancelButton}>{t('cancel')}</button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !isDirty}
                            className={formStyles.saveButton}
                        >
                            <Save size={16} />
                            {isSubmitting ? t('saving') : t('saveMeasure')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MeasureAdmin;
