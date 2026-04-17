import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../firebase';
import { isMeasureUsed } from '../../firebase/patient';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Measure } from '../../types/measure';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, AlertCircle, Loader, FileCheck2, X, Globe, Search, ArrowUp, ArrowDown } from 'lucide-react';
import styles from '../PointsAdmin.module.css'; // General table styles
import formStyles from './MeasureForm.module.css'; // Form-specific styles
import { uploadFile, deleteFile } from '../../services/storageService';
import DocumentManagement from '../shared/DocumentManagement';
import { T, useT, useTranslationContext } from '../T';
import Tooltip from '../common/Tooltip';
import { CSS } from '@dnd-kit/utilities';

const MeasureAdmin: React.FC = () => {
    const { language: currentLang, getTranslation, registerString } = useTranslationContext();
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
    const [searchTerm, setSearchTerm] = useState('');
    const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });
    const [isMeasureInUse, setIsMeasureInUse] = useState(false);

    // Register all strings used in callbacks or non-T components
    const stringsToRegister = useMemo(() => [
        'Failed to fetch measures',
        'Measure name',
        'already exists',
        'Measure name is required',
        'Measure description is required',
        'Minimum and maximum values are required',
        'Improvement direction is required',
        'Maximum value must be greater than the minimum value',
        'Failed to save the measure',
        'Failed to delete the measure',
        'Failed to upload file',
        'UP',
        'DOWN',
        'Up',
        'Down',
        'Direction',
        'Range',
        'Deleting...',
        'Saving...',
        'Confirm Delete',
        'Save Measure',
        'Category',
        'Scale',
        'Hebrew',
        'English',
        'Arabic',
        'Russian',
        'missing',
        'Edit',
        'Remove',
        'Enter measure name',
        'Enter description',
        'Add a new category',
        'Edit Measure',
        'Delete Measure',
        'View Document',
        'Search measures...', // Added
        'Could not fetch measures and categories' // Added
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [stringsToRegister, registerString]);

    const measuresCollectionRef = React.useMemo(() => collection(db, 'cfg_measures'), []);

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
                const configDoc = await getDoc(doc(db, 'cfg_app_config', 'main'));
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
            const measureSnapshot = await getDocs(measuresCollectionRef);
            const fetchedMeasures = measureSnapshot.docs.map(doc => ({ ...(doc.data() as Omit<Measure, 'id'>), id: doc.id }));
            fetchedMeasures.sort((a, b) =>
                (a.name[currentLang] || a.name['en'] || '').localeCompare(b.name[currentLang] || b.name['en'] || '')
            );
            setMeasures(fetchedMeasures);
            setError(null);
        } catch (err) {
            setError(getTranslation('Failed to fetch measures'));
            console.error(err);
        }
        setIsLoading(false);
    }, [user, measuresCollectionRef, currentLang, getTranslation]);

    useEffect(() => {
        fetchMeasures();
    }, [fetchMeasures]);

    const filteredMeasures = useMemo(() => { // Added
        if (!searchTerm.trim()) return measures;

        const term = searchTerm.toLowerCase().trim();
        return measures.filter(measure => {
            // Search in name
            const name = typeof measure.name === 'object'
                ? (measure.name[currentLang] || measure.name[appConfig.defaultLanguage] || Object.values(measure.name)[0] || '')
                : (measure.name as string);
            if (name.toLowerCase().includes(term)) return true;

            // Search in description
            const description = typeof measure.description === 'object'
                ? (measure.description[currentLang] || measure.description[appConfig.defaultLanguage] || Object.values(measure.description)[0] || '')
                : (measure.description as string);
            if (description.toLowerCase().includes(term)) return true;

            return false;
        });
    }, [measures, searchTerm, currentLang, appConfig.defaultLanguage, getTranslation]);

    const handleStartEditing = async (measure: Measure) => {
        setFormError(null);
        let docUrls = measure.documentUrl;
        if (typeof docUrls === 'string') {
            docUrls = { en: docUrls };
        }
        const measureToEdit = { ...measure, documentUrl: docUrls };

        setIsLoading(true); // Re-use loader for use check
        const inUse = await isMeasureUsed(measure.id);
        setIsMeasureInUse(inUse);
        setIsLoading(false);

        setEditingMeasure(measureToEdit);
        setOriginalMeasure(measureToEdit);
        setIsDirty(false);
    };

    const handleAddNew = () => {
        setFormError(null);
        setIsMeasureInUse(false);
        const newMeasure: Measure = {
            id: '',
            name: {},
            description: {},
            min: 0,
            max: 10,
            improvementDirection: 'UP',
            status: 'active',
            reference_count: 0
        };
        setEditingMeasure(newMeasure);
        setOriginalMeasure(newMeasure);
        setIsDirty(false);
    };

    const validateMeasureForm = (measure: Measure, isNew: boolean): boolean => {
        const allInputValues = Object.values(measure.name || {}).map(v => v.trim().toLowerCase()).filter(Boolean);
        if (allInputValues.length === 0) {
            setFormError(getTranslation('Measure name is required'));
            return false;
        }

        const descriptionValues = Object.values(measure.description || {}).map(v => v.trim()).filter(Boolean);
        if (descriptionValues.length === 0) {
            setFormError(getTranslation('Measure description is required'));
            return false;
        }

        if (isNew) {
            const nameExists = measures.some(m =>
                m.id !== measure.id &&
                Object.values(m.name || {}).some(v => allInputValues.includes(v.trim().toLowerCase()))
            );
            if (nameExists) {
                const displayName = measure.name[currentLang] || measure.name['en'] || allInputValues[0];
                setFormError(`${getTranslation('Measure name')} '${displayName}' ${getTranslation('already exists')}`);
                return false;
            }
        }

        if (measure.min === undefined || measure.max === undefined) {
            setFormError(getTranslation('Minimum and maximum values are required'));
            return false;
        }
        if (measure.min >= measure.max) {
            setFormError(getTranslation('Maximum value must be greater than the minimum value'));
            return false;
        }

        if (!measure.improvementDirection) {
            setFormError(getTranslation('Improvement direction is required'));
            return false;
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

            for (const [l, url] of Object.entries(originalUrls)) {
                if (url && !newUrls[l]) {
                    await deleteFile(url).catch(err => console.error("Error deleting orphaned file:", err));
                }
            }

            const dataToSave: any = {
                name: measureToSave.name,
                description: measureToSave.description,
                min: Number(measureToSave.min),
                max: Number(measureToSave.max),
                improvementDirection: measureToSave.improvementDirection,
                documentUrl: Object.keys(newUrls).length > 0 ? newUrls : null,
                status: measureToSave.status || 'active',
                reference_count: measureToSave.reference_count || 0,
                updatedAt: serverTimestamp(),
            };

            if (isNewMeasure) {
                dataToSave.createdAt = serverTimestamp();
                await addDoc(measuresCollectionRef, dataToSave);
            } else {
                const measureDoc = doc(db, 'cfg_measures', measureToSave.id);
                await updateDoc(measureDoc, dataToSave);
            }

            setEditingMeasure(null);
            setIsDirty(false);
            fetchMeasures();
        } catch (err) {
            setFormError(getTranslation('Failed to save the measure'));
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

            await deleteDoc(doc(db, 'cfg_measures', deletingMeasure.id));
            fetchMeasures();
        } catch (err) {
            setError(getTranslation('Failed to delete the measure'));
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

            const currentDocUrls = updatedMeasure.documentUrl;
            let existingUrl: string | undefined;
            if (typeof currentDocUrls === 'object' && currentDocUrls !== null) {
                existingUrl = (currentDocUrls as any)[lang];
            } else if (typeof currentDocUrls === 'string' && lang === 'en') {
                existingUrl = currentDocUrls;
            }

            const uploadAndCleanup = async () => {
                if (existingUrl) {
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
                    setFormError(getTranslation('Failed to upload file'));
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
                <h1 className={styles.title}><T>Measure Configuration</T></h1>
                <div className={styles.headerActions}> {/* Added wrapper div */}
                    <div className={styles.searchContainer}> {/* Added search container */}
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder={getTranslation('Search measures...')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                        {searchTerm && (
                            <button className={styles.clearSearch} onClick={() => setSearchTerm('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <button onClick={handleAddNew} className={styles.addButton}>
                        <PlusCircle size={18} className={styles.addButtonIcon} /> <T>Add New Measure</T>
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
                    isUsed={isMeasureInUse}
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
                                <h2 className={styles.modalTitle}><T>Delete Measure</T></h2>
                                <p className={styles.modalText}>
                                    <T>Are you sure you want to delete the measure</T> '{deletingMeasure.name[currentLang] || deletingMeasure.name['en'] || ''}'?
                                </p>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setDeletingMeasure(null)} disabled={isSubmitting} className={styles.cancelButton}><T>Cancel</T></button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className={styles.confirmDeleteButton}>
                                {isSubmitting ? <T>Deleting...</T> : <T>Confirm Delete</T>}
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
                                <th scope="col" className={styles.headerCell}><T>Name</T></th>
                                <th scope="col" className={styles.headerCell}><T>Direction</T></th>
                                <th scope="col" className={styles.headerCell}><T>Range</T></th>
                                <th scope="col" className={styles.headerCell}><T>Description</T></th>
                                <th scope="col" className={styles.headerCell}><T>Status</T></th>
                                <th scope="col" className={`${styles.headerCell} ${styles.documentCell}`}><T>Document</T></th>
                                <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}>
                                    <T>Actions</T>
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {isLoading ? (
                                <tr><td colSpan={6} className={styles.loaderCell}><Loader className={styles.loader} size={32} /></td></tr>
                            ) : error ? (
                                <tr><td colSpan={6} className={styles.emptyCell}>{error}</td></tr>
                            ) : filteredMeasures.length === 0 ? (
                                <tr><td colSpan={6} className={styles.emptyCell}>{!user ? <T>Please log in</T> : <T>No measures found</T>}</td></tr>
                            ) : (
                                filteredMeasures.map(measure => (
                                    <tr key={measure.id} className={styles.tableRow}>
                                        <td className={styles.cell}>{measure.name[currentLang] || measure.name['en'] || ''}</td>
                                        <td className={styles.cell}>
                                            <div className={styles.directionCell}>
                                                {measure.improvementDirection === 'UP' ? <ArrowUp size={16} className={styles.directionIconUp} /> : <ArrowDown size={16} className={styles.directionIconDown} />}
                                                <T>{measure.improvementDirection === 'UP' ? 'Up' : 'Down'}</T>
                                            </div>
                                        </td>
                                        <td className={styles.cell}>{measure.min} - {measure.max}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={measure.description[currentLang] || measure.description['en'] || ''}>{measure.description[currentLang] || measure.description['en'] || ''}</td>
                                        <td className={styles.cell}>
                                            <span className={`${formStyles.statusBadge} ${measure.status === 'active' ? formStyles.badgeActive : formStyles.badgeInactive}`}>
                                                <T>{measure.status === 'active' ? 'Active' : 'Inactive'}</T>
                                            </span>
                                        </td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {measure.documentUrl && getDocumentUrl(measure.documentUrl) && (
                                                <Tooltip text={useT('View Document')}>
                                                    <a href={getDocumentUrl(measure.documentUrl)} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                        <FileCheck2 size={18} />
                                                    </a>
                                                </Tooltip>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <div className={styles.actionsWrapper}>
                                                <Tooltip text={useT('Edit Measure')}>
                                                    <button onClick={() => handleStartEditing(measure)} className={styles.actionButton}><Edit size={18} /></button>
                                                </Tooltip>
                                                {measure.reference_count > 0 ? (
                                                    <Tooltip text={getTranslation('Cannot delete: measure is referenced in protocols or problems')}>
                                                        <button className={`${styles.actionButton} ${formStyles.deleteButtonDisabled}`} disabled>
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip text={useT('Delete Measure')}>
                                                        <button onClick={() => setDeletingMeasure(measure)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18} /></button>
                                                    </Tooltip>
                                                )}
                                            </div>
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
    isUsed: boolean;
}


const TranslationReference: React.FC<{ label: React.ReactNode; text: string | undefined }> = ({ label, text }) => {
    if (!text) return null;
    return (
        <div className={formStyles.translationReference}>
            <span className={formStyles.translationReferenceLabel}>{label}</span>
            {text}
        </div>
    );
};

const EditMeasureForm: React.FC<EditMeasureFormProps> = ({ measure, measures, onSave, onCancel, error, isSubmitting, onUpdate, isDirty, appConfig, isUsed }) => {
    const { language: currentLang, getTranslation, registerString } = useTranslationContext();
    const [activeLang, setActiveLang] = useState<string>(currentLang);
    const SUPPORTED_LANGS = appConfig.supportedLanguages;
    const orderedLangs = [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
        .filter(l => SUPPORTED_LANGS.includes(l));
    const [formData, setFormData] = useState(measure);
    const [localError, setLocalError] = useState<string | null>(null);
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
        const { name, value, type } = e.target;
        let finalValue: any = value;

        if (type === 'number') {
            finalValue = value === '' ? 0 : Number(value);
        }

        let updatedMeasure: Measure;
        if (name === 'name' || name === 'description') {
            updatedMeasure = { ...formData, [name]: { ...(formData[name] as { [key: string]: string }), [activeLang]: value } };
        } else {
            updatedMeasure = { ...formData, [name]: finalValue } as Measure;
        }
        setFormData(updatedMeasure);
        onUpdate(updatedMeasure);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const allInputValues = Object.values(formData.name || {}).map(v => v.trim().toLowerCase()).filter(Boolean);
        if (allInputValues.length === 0) {
            setLocalError(getTranslation('Measure name is required')); return;
        }
        const descriptionValues = Object.values(formData.description || {}).map(v => v.trim()).filter(Boolean);
        if (descriptionValues.length === 0) {
            setLocalError(getTranslation('Measure description is required')); return;
        }
        if (formData.min === undefined || formData.max === undefined) {
            setLocalError(getTranslation('Minimum and maximum values are required'));
            return;
        }
        if (formData.min >= formData.max) {
            setLocalError(getTranslation('Maximum value must be greater than the minimum value'));
            return;
        }
        if (!formData.improvementDirection) {
            setLocalError(getTranslation('Improvement direction is required'));
            return;
        }

        const isNew = !measure.id;
        const nameExists = measures.some(m =>
            m.id !== measure.id &&
            Object.values(m.name || {}).some(v => allInputValues.includes(v.trim().toLowerCase()))
        );
        if (isNew && nameExists) {
            const displayName = formData.name[activeLang] || formData.name['en'] || allInputValues[0];
            setLocalError(`${getTranslation('Measure name')} '${displayName}' ${getTranslation('already exists')}`);
            return;
        }

        setLocalError(null);
        onSave(formData);
    };

    const isEditing = !!formData.id;

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
            <div className={formStyles.modalContent}>
                <div className={formStyles.formHeader}>
                    <h2 className={formStyles.formTitle}>{isEditing ? <T>Edit Measure</T> : <T>Add New Measure</T>}</h2>
                    <button onClick={onCancel} className={formStyles.closeButton}><X size={24} /></button>
                </div>
                <div className={formStyles.langTabBar}>
                    {orderedLangs.map(lang => (
                        <button
                            key={lang}
                            type="button"
                            onClick={() => { setActiveLang(lang); }}
                            className={`${formStyles.langTab} ${activeLang === lang ? formStyles.langTabActive : ''}`}
                        >
                            {getLangDisplayName(lang)}
                        </button>
                    ))}
                </div>
                <form onSubmit={handleSubmit} className={formStyles.form}>
                    <div className={formStyles.scrollableArea}>
                        {(error || localError) && <p className={formStyles.formError}>{error || localError}</p>}

                        <div className={formStyles.statusToggleContainer}>
                            <span className={formStyles.statusLabel}><T>Status</T>:</span>
                            <label className={formStyles.switch}>
                                <input
                                    type="checkbox"
                                    checked={formData.status === 'active'}
                                    onChange={(e) => {
                                        const updatedStatus: 'active' | 'inactive' = e.target.checked ? 'active' : 'inactive';
                                        const updatedMeasure: Measure = { ...formData, status: updatedStatus };
                                        setFormData(updatedMeasure);
                                        onUpdate(updatedMeasure);
                                    }}
                                />
                                <span className={formStyles.slider}></span>
                            </label>
                            <span className={`${formStyles.statusText} ${formData.status === 'active' ? formStyles.statusActive : formStyles.statusInactive}`}>
                                <T>{formData.status === 'active' ? 'Active' : 'Inactive'}</T>
                            </span>
                        </div>

                        <div>
                            <div className={formStyles.labelWrapper}>
                                <label htmlFor="name" className={formStyles.label}>
                                    <T>Measure Name</T>
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
                                    label={<><T>Default Language</T>: {getLangDisplayName(appConfig.defaultLanguage)}</>}
                                    text={formData.name[appConfig.defaultLanguage]}
                                />
                            )}
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name[activeLang] || ''}
                                onChange={handleChange}
                                placeholder={useT('Enter measure name')}
                                className={formStyles.input}
                            />
                        </div>

                        <div className={formStyles.directionRangeContainer}>
                            <div className={formStyles.directionSection}>
                                <label className={formStyles.label}><T>Improvement Direction</T> <span className={formStyles.requiredAsterisk}>*</span></label>
                                <div className={formStyles.radioGroup}>
                                    <label className={`${formStyles.radioLabel} ${formData.improvementDirection === 'UP' ? formStyles.radioLabelActive : ''}`}>
                                        <input
                                            type="radio"
                                            name="improvementDirection"
                                            value="UP"
                                            checked={formData.improvementDirection === 'UP'}
                                            onChange={handleChange}
                                            className={formStyles.radioInput}
                                        />
                                        <ArrowUp size={16} />
                                        <T>Up</T>
                                    </label>
                                    <label className={`${formStyles.radioLabel} ${formData.improvementDirection === 'DOWN' ? formStyles.radioLabelActive : ''}`}>
                                        <input
                                            type="radio"
                                            name="improvementDirection"
                                            value="DOWN"
                                            checked={formData.improvementDirection === 'DOWN'}
                                            onChange={handleChange}
                                            className={formStyles.radioInput}
                                        />
                                        <ArrowDown size={16} />
                                        <T>Down</T>
                                    </label>
                                </div>
                            </div>

                            <div className={formStyles.rangeSection}>
                                <label className={formStyles.label}><T>Range</T> <span className={formStyles.requiredAsterisk}>*</span></label>
                                <div className={formStyles.rangeInputs}>
                                    <div className={formStyles.rangeInputWrapper}>
                                        <span className={formStyles.rangePrefix}><T>Min</T></span>
                                        <input
                                            type="number"
                                            name="min"
                                            value={formData.min}
                                            onChange={handleChange}
                                            className={formStyles.rangeInput}
                                        />
                                    </div>
                                    <div className={formStyles.rangeInputWrapper}>
                                        <span className={formStyles.rangePrefix}><T>Max</T></span>
                                        <input
                                            type="number"
                                            name="max"
                                            value={formData.max}
                                            onChange={handleChange}
                                            className={formStyles.rangeInput}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className={formStyles.labelWrapper}>
                                <label htmlFor="description" className={formStyles.label}>
                                    <T>Description</T>
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
                                    label={<><T>Default Language</T>: {getLangDisplayName(appConfig.defaultLanguage)}</>}
                                    text={formData.description[appConfig.defaultLanguage]}
                                />
                            )}
                            <textarea
                                id="description"
                                name="description"
                                value={formData.description[activeLang] || ''}
                                onChange={handleChange}
                                placeholder={useT('Enter description')}
                                className={formStyles.textarea}
                                rows={3}
                            ></textarea>
                        </div>

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
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={formStyles.cancelButton}><T>Cancel</T></button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !isDirty}
                            className={formStyles.saveButton}
                        >
                            <Save size={16} />
                            {isSubmitting ? <T>Saving...</T> : <T>Save Measure</T>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MeasureAdmin;
