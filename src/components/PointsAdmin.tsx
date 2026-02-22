
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, FileCheck2, X, Globe } from 'lucide-react';
import styles from './PointsAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';
import DocumentManagement from './shared/DocumentManagement';
import { T, useT, useTranslationContext } from '../components/T';
import Tooltip from './common/Tooltip';

// Helper to get the correct document URL for the current language
const getDocumentUrlForLang = (docUrl: any, lang: string): string | null => {
    if (typeof docUrl === 'object' && docUrl !== null) {
        return docUrl[lang] || null;
    }
    // Handle legacy data where the URL is just a string (assume English)
    if (typeof docUrl === 'string' && lang === 'en') {
        return docUrl;
    }
    return null;
};

const PointsAdmin: React.FC = () => {
    const { language: currentLang, registerString, getTranslation } = useTranslationContext();
    const [user, setUser] = useState<User | null>(null);
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingPoint, setEditingPoint] = useState<Partial<StingPoint> | null>(null);
    const [originalPoint, setOriginalPoint] = useState<Partial<StingPoint> | null>(null);
    const [deletingPoint, setDeletingPoint] = useState<StingPoint | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });

    const pointsCollectionRef = useMemo(() => collection(db, 'acupuncture_points'), []);

    const stringsToRegister = useMemo(() => [
        'Failed to fetch points',
        'Point code and label (in at least one language) are required',
        'Failed to save the point',
        'Failed to delete the point',
        'Deleting...',
        'Confirm Delete',
        'Please log in',
        'No points found',
        'Edit Point',
        'Delete Point',
        'View Document'
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [registerString, stringsToRegister]);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) setIsLoading(false);
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

    const fetchPoints = useCallback(async () => {
        if (!user) {
            setPoints([]);
            return;
        }

        setIsLoading(true);
        try {
            const data = await getDocs(pointsCollectionRef);
            const fetchedPoints = data.docs.map(doc => ({ ...(doc.data() as Omit<StingPoint, 'id'>), id: doc.id }));
            fetchedPoints.sort((a, b) => a.code.localeCompare(b.code));
            setPoints(fetchedPoints);
            setError(null);
        } catch (err) {
            setError(getTranslation('Failed to fetch points'));
            console.error(err);
        }
        setIsLoading(false);
    }, [user, pointsCollectionRef, getTranslation]);

    useEffect(() => {
        if (user) fetchPoints();
    }, [user, fetchPoints]);

    const handleStartEditing = (point: StingPoint) => {
        setFormError(null);
        // Normalize legacy fields to the new object format upon editing
        const pointToEdit = { ...point };

        if (typeof pointToEdit.label === 'string') {
            pointToEdit.label = { en: pointToEdit.label };
        }
        if (typeof pointToEdit.description === 'string') {
            pointToEdit.description = { en: pointToEdit.description };
        }
        if (typeof pointToEdit.documentUrl === 'string') {
            pointToEdit.documentUrl = { en: pointToEdit.documentUrl };
        }

        setEditingPoint(pointToEdit);
        setOriginalPoint(pointToEdit);
    };

    const handleAddNew = () => {
        setFormError(null);
        const newPoint: Partial<StingPoint> = { id: '', code: '', label: {}, description: {}, position: { x: 0, y: 0, z: 0 }, documentUrl: {} };
        setEditingPoint(newPoint);
        setOriginalPoint(newPoint);
    };

    const handleSave = async (pointToSave: Partial<StingPoint>, file: File | null, lang: string) => {
        const isNewPoint = !pointToSave.id;

        const labelValues = Object.values(pointToSave.label || {}).map(v => v.trim()).filter(Boolean);
        if (!pointToSave.code || labelValues.length === 0) {
            setFormError(getTranslation('Point code and label (in at least one language) are required'));
            return;
        }

        setIsSubmitting(true);
        console.log(`%c[DEBUG-SAVE-01] handleSave started. Lang: ${currentLang}`, 'color: blue; font-weight: bold;', {
            pointToSave: JSON.parse(JSON.stringify(pointToSave)),
            file: file?.name
        });

        try {
            let documentUrlObject: { [key: string]: string } = {};

            // Start with the existing URLs from the point being saved
            if (pointToSave.documentUrl) {
                if (typeof pointToSave.documentUrl === 'string') {
                    documentUrlObject = { en: pointToSave.documentUrl };
                } else {
                    documentUrlObject = { ...pointToSave.documentUrl };
                }
            }

            // Identify and delete any files that were removed from the documentUrlObject (the form state)
            const originalDocUrls = originalPoint?.documentUrl;
            if (originalDocUrls) {
                const oldUrls: Record<string, string> = typeof originalDocUrls === 'string' ? { en: originalDocUrls } : originalDocUrls as Record<string, string>;
                for (const [l, url] of Object.entries(oldUrls)) {
                    // If it was in the original but NOT in the current object, and we aren't about to replace it with a new file for that same language
                    if (url && !documentUrlObject[l] && !(file && l === lang)) {
                        console.log(`[DEBUG-SAVE-DEL] Deleting orphaned file for lang ${l}:`, url);
                        await deleteFile(url).catch(err => console.error("Error deleting orphaned file:", err));
                    }
                }
            }

            // Handle file upload/replacement for the active language
            if (file) {
                console.log(`[DEBUG-SAVE-04] File upload triggered for lang '${lang}'.`);
                // If a file for the current language already exists, delete it first.
                if (documentUrlObject[lang]) {
                    console.log(`[DEBUG-SAVE-05] Deleting existing file for replacement ${lang}:`, documentUrlObject[lang]);
                    await deleteFile(documentUrlObject[lang]).catch(err => console.error("Error deleting old file for replacement:", err));
                }
                const newUrl = await uploadFile(file, `Points/${pointToSave.id || 'new'}`);
                console.log(`[DEBUG-SAVE-06] File uploaded. New URL: ${newUrl}`);
                documentUrlObject[lang] = newUrl;
            }

            const dataToSave = {
                code: pointToSave.code!.trim(),
                label: pointToSave.label,
                description: pointToSave.description,
                position: pointToSave.position || { x: 0, y: 0, z: 0 },
                documentUrl: Object.keys(documentUrlObject).length > 0 ? documentUrlObject : null,
                updatedAt: serverTimestamp(),
            };

            console.log('%c[DEBUG-SAVE-FINAL] FINAL OBJECT TO FIRESTORE:', 'color: green; font-weight: bold;', JSON.parse(JSON.stringify(dataToSave)));

            if (isNewPoint) {
                // Use addDoc for safety, letting Firestore generate the ID.
                const newDocRef = await addDoc(pointsCollectionRef, { ...dataToSave, createdAt: serverTimestamp() });
                console.log(`[DEBUG-SAVE-SUCCESS] New point created with ID: ${newDocRef.id}`);
            } else {
                const pointDoc = doc(db, 'acupuncture_points', pointToSave.id!);
                await updateDoc(pointDoc, dataToSave);
                console.log(`[DEBUG-SAVE-SUCCESS] Point with ID: ${pointToSave.id} updated.`);
            }

            setEditingPoint(null);
            fetchPoints();

        } catch (err) {
            console.error('%c[DEBUG-SAVE-ERROR] SAVE FAILED', 'color: red; font-weight: bold;', err);
            setFormError(getTranslation('Failed to save the point'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingPoint) return;
        console.log(`%c[DEBUG-DELETE-01] Deleting point ID: ${deletingPoint.id}`, 'color: orange; font-weight: bold;', deletingPoint);

        setIsSubmitting(true);
        try {
            // Delete all documents from storage if they exist
            if (deletingPoint.documentUrl) {
                const urls = typeof deletingPoint.documentUrl === 'string' ? [deletingPoint.documentUrl] : Object.values(deletingPoint.documentUrl);
                for (const url of urls) {
                    try {
                        console.log(`[DEBUG-DELETE-02] Deleting file from storage: ${url}`);
                        await deleteFile(url);
                    } catch (storageError) {
                        console.error("[DEBUG-DELETE-ERROR] Failed to delete file from storage, but proceeding with Firestore deletion.", storageError);
                    }
                }
            }

            const pointDoc = doc(db, 'acupuncture_points', deletingPoint.id);
            await deleteDoc(pointDoc);
            console.log('[DEBUG-DELETE-SUCCESS] Point deleted from Firestore.');
            fetchPoints();
        } catch (err) {
            console.error('%c[DEBUG-DELETE-ERROR] Firestore deletion failed.', 'color: red; font-weight: bold;', err);
            setError(getTranslation('Failed to delete the point'));
        }
        setIsSubmitting(false);
        setDeletingPoint(null);
    };

    const handleCancelEdit = () => {
        setEditingPoint(null);
        setFormError(null);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}><T>Acupuncture Points</T></h1>
                <button onClick={handleAddNew} className={styles.addButton}>
                    <PlusCircle size={18} className={styles.addButtonIcon} /> <T>Add New Point</T>
                </button>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {editingPoint && (
                <EditPointForm
                    key={editingPoint.id || 'new'} // Ensures form resets when switching points
                    point={editingPoint}
                    onSave={(data, file, lang) => handleSave(data, file, lang)}
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                    appConfig={appConfig}
                />
            )}

            {deletingPoint && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIconContainer}>
                                <AlertTriangle className={styles.modalIcon} aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className={styles.modalTitle}><T>Delete Point</T></h2>
                                <p className={styles.modalText}>
                                    <T>{`Are you sure you want to delete the point '${deletingPoint.code}'?`}</T>
                                </p>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setDeletingPoint(null)} disabled={isSubmitting} className={styles.cancelButton}><T>Cancel</T></button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className={styles.confirmDeleteButton}>
                                {isSubmitting ? <T>Deleting...</T> : <T>Confirm Delete</T>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead className={styles.tableHeader}>
                        <tr>
                            <th scope="col" className={styles.headerCell}><T>Code</T></th>
                            <th scope="col" className={styles.headerCell}><T>Label</T></th>
                            <th scope="col" className={styles.headerCell}><T>Description</T></th>
                            <th scope="col" className={styles.headerCell}><T>Position</T></th>
                            <th scope="col" className={styles.headerCell}><T>Document</T></th>
                            <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}>
                                <T>Actions</T>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={styles.tableBody}>
                        {isLoading ? (
                            <tr><td colSpan={6} className={styles.loaderCell}><Loader className={styles.loader} size={32} /></td></tr>
                        ) : points.length === 0 ? (
                            <tr><td colSpan={6} className={styles.emptyCell}>{!user ? <T>Please log in</T> : <T>No points found</T>}</td></tr>
                        ) : (
                            points.map(point => {
                                const docUrlForCurrentLang = getDocumentUrlForLang(point.documentUrl, currentLang);
                                return (
                                    <tr key={point.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{point.code}</td>
                                        <td className={styles.cell}>{point.label[currentLang] || point.label['en'] || ''}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={point.description[currentLang] || point.description['en'] || ''}>{point.description[currentLang] || point.description['en'] || ''}</td>
                                        <td className={styles.cell}>{`(${point.position.x}, ${point.position.y}, ${point.position.z})`}</td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {docUrlForCurrentLang && (
                                                <Tooltip text={useT('View Document')}>
                                                    <a href={docUrlForCurrentLang} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                        <FileCheck2 size={18} />
                                                    </a>
                                                </Tooltip>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <div className={styles.actionsWrapper}>
                                                <Tooltip text={useT('Edit Point')}>
                                                    <button onClick={() => handleStartEditing(point)} className={styles.actionButton}><Edit size={18} /></button>
                                                </Tooltip>
                                                <Tooltip text={useT('Delete Point')}>
                                                    <button onClick={() => setDeletingPoint(point)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18} /></button>
                                                </Tooltip>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


interface EditPointFormProps {
    point: Partial<StingPoint>;
    onSave: (point: Partial<StingPoint>, file: File | null, lang: string) => void;
    onCancel: () => void;
    error: string | null;
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

const EditPointForm: React.FC<EditPointFormProps> = ({ point, onSave, onCancel, error, isSubmitting, appConfig }) => {
    const { language: currentLang, registerString, getTranslation } = useTranslationContext();
    const [formData, setFormData] = useState(point);
    const [activeLang, setActiveLang] = useState<string>(currentLang);
    const SUPPORTED_LANGS = appConfig.supportedLanguages;
    const orderedLangs = useMemo(() => [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
        .filter(l => SUPPORTED_LANGS.includes(l)), [currentLang, SUPPORTED_LANGS]);
    const [file, setFile] = useState<File | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const stringsToRegister = useMemo(() => [
        'Saving...',
        'Save Point',
        'Default Language',
        'English',
        'Hebrew',
        'Edit Point',
        'Add New Point',
        'e.g., Hundred Meetings',
        "Describe the point's purpose"
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [registerString, stringsToRegister]);

    useEffect(() => {
        setFormData(point);
        setFile(null);
        setIsDirty(false);
    }, [point]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'label' || name === 'description') {
            setFormData(prev => ({
                ...prev,
                [name]: { ...(prev[name] as Record<string, string> || {}), [activeLang]: value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        setIsDirty(true);
    };

    const handlePosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const currentPosition = formData.position || { x: 0, y: 0, z: 0 };
        setFormData(prev => ({
            ...prev,
            position: { ...currentPosition, [name]: parseFloat(value) || 0 }
        }));
        setIsDirty(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData, file, activeLang);
    };

    const handleFileDelete = () => {
        if (!formData.documentUrl) return;

        let newDocUrls = { ... (typeof formData.documentUrl === 'object' ? formData.documentUrl : { en: formData.documentUrl }) };
        delete (newDocUrls as Record<string, any>)[activeLang];

        setFormData(prev => ({ ...prev, documentUrl: newDocUrls }));
        setFile(null); // Mark for deletion on save if it was just uploaded
        setIsDirty(true);
    };

    const isEditing = !!formData.id;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>{isEditing ? <T>Edit Point</T> : <T>Add New Point</T>}</h2>
                    <button onClick={onCancel} className={styles.closeButton}><X size={24} /></button>
                </div>
                <div className={styles.langTabBar}>
                    {orderedLangs.map(lang => (
                        <button
                            key={lang}
                            type="button"
                            onClick={() => setActiveLang(lang)}
                            className={`${styles.langTab} ${activeLang === lang ? styles.langTabActive : ''}`}
                        >
                            <T>{lang === 'en' ? 'English' : lang === 'he' ? 'Hebrew' : lang}</T>
                        </button>
                    ))}
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.scrollableArea}>
                        {error && <p className={styles.formError}>{error}</p>}

                        <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                            <div>
                                <label htmlFor="code" className={styles.label}><T>Code</T><span className={styles.requiredAsterisk}>*</span></label>
                                <input id="code" name="code" type="text" value={formData.code || ''} onChange={handleChange} className={styles.input} required disabled={isEditing} />
                            </div>
                            <div>
                                <div className={styles.labelWrapper}>
                                    <label htmlFor="label" className={styles.label}><T>Label</T><span className={styles.requiredAsterisk}>*</span></label>
                                    <div className={styles.indicatorContainer}>
                                        <Globe size={14} className={styles.indicatorIcon} />
                                        <span className={styles.translationCounter}>
                                            {Object.values(formData.label || {}).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                                        </span>
                                    </div>
                                </div>
                                {activeLang !== appConfig.defaultLanguage && !((formData.label as Record<string, string>)?.[activeLang]) && (
                                    <TranslationReference
                                        label={`${getTranslation('Default Language')}: ${getTranslation(appConfig.defaultLanguage === 'he' ? 'Hebrew' : 'English')}`}
                                        text={(formData.label as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <input
                                    id="label"
                                    name="label"
                                    type="text"
                                    value={(formData.label as Record<string, string>)?.[activeLang] || ''}
                                    onChange={handleChange}
                                    placeholder={useT('e.g., Hundred Meetings')}
                                    className={styles.input}
                                    required={activeLang === appConfig.defaultLanguage}
                                />
                            </div>
                        </div>
                        <div>
                            <div className={styles.labelWrapper}>
                                <label htmlFor="description" className={styles.label}><T>Description</T></label>
                                <div className={styles.indicatorContainer}>
                                    <Globe size={14} className={styles.indicatorIcon} />
                                    <span className={styles.translationCounter}>
                                        {Object.values(formData.description || {}).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                                    </span>
                                </div>
                            </div>
                            {activeLang !== appConfig.defaultLanguage && !((formData.description as Record<string, string>)?.[activeLang]) && (
                                <TranslationReference
                                    label={`${getTranslation('Default Language')}: ${getTranslation(appConfig.defaultLanguage === 'he' ? 'Hebrew' : 'English')}`}
                                    text={(formData.description as Record<string, string>)?.[appConfig.defaultLanguage]}
                                />
                            )}
                            <textarea
                                id="description"
                                name="description"
                                value={(formData.description as Record<string, string>)?.[activeLang] || ''}
                                onChange={handleChange}
                                placeholder={useT("Describe the point's purpose")}
                                className={styles.textarea}
                                rows={3}
                            ></textarea>
                        </div>
                        <div>
                            <label className={styles.label}><T>3D Position</T></label>
                            <div className={`${styles.grid} ${styles['grid-cols-3']}`}>
                                <div>
                                    <label htmlFor="x" className={styles.coordinateLabel}><T>X-axis</T></label>
                                    <input id="x" type="number" name="x" step="0.01" value={formData.position?.x || 0} onChange={handlePosChange} placeholder="X" className={styles.input} />
                                </div>
                                <div>
                                    <label htmlFor="y" className={styles.coordinateLabel}><T>Y-axis</T></label>
                                    <input id="y" type="number" name="y" step="0.01" value={formData.position?.y || 0} onChange={handlePosChange} placeholder="Y" className={styles.input} />
                                </div>
                                <div>
                                    <label htmlFor="z" className={styles.coordinateLabel}><T>Z-axis</T></label>
                                    <input id="z" type="number" name="z" step="0.01" value={formData.position?.z || 0} onChange={handlePosChange} placeholder="Z" className={styles.input} />
                                </div>
                            </div>
                        </div>
                        <DocumentManagement
                            entityName="Point"
                            documentUrl={formData.documentUrl as { [key: string]: string }}
                            onFileChange={(newFile) => {
                                setFile(newFile);
                                setIsDirty(true);
                            }}
                            onFileDelete={handleFileDelete}
                            isSubmitting={isSubmitting}
                            activeLang={activeLang}
                            selectedFileName={file?.name}
                        />

                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}><T>Cancel</T></button>
                        <button type="submit" disabled={isSubmitting || !isDirty} className={styles.saveButton}>
                            <Save size={16} /> {isSubmitting ? <T>Saving...</T> : <T>Save Point</T>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PointsAdmin;
