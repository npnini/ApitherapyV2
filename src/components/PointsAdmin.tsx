import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, FileCheck2, X, Globe, Search, RefreshCw, Lock, Unlock } from 'lucide-react';
import styles from './PointsAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';
import { T, useT, useTranslationContext } from '../components/T';
import Tooltip from './common/Tooltip';
import PointPlacementScene from './PointPlacementScene';
import DocumentManagement from './shared/DocumentManagement';

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
    const [searchTerm, setSearchTerm] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });

    const pointsCollectionRef = useMemo(() => collection(db, 'cfg_acupuncture_points'), []);

    const stringsToRegister = useMemo(() => [
        'Failed to fetch points',
        'Point code and label (in at least one language) are required',
        'Failed to save the point',
        'Close',
        'Failed to delete the point',
        'Deleting...',
        'Saving...',
        'Confirm Delete',
        'Search points...',
        'Please log in',
        'No points found',
        'Edit Point',
        'Delete Point',
        'View Document',
        'Image URL',
        'View Image',
        'Close Image'
    ], [registerString]);

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

    const filteredPoints = useMemo(() => {
        if (!searchTerm.trim()) return points;

        const term = searchTerm.toLowerCase().trim();
        return points.filter(point => {
            // Search in code
            if (point.code.toLowerCase().includes(term)) return true;

            // Search in labels (Hebrew and English)
            const labelMatches = Object.values(point.label || {}).some(val =>
                typeof val === 'string' && val.toLowerCase().includes(term)
            );
            if (labelMatches) return true;

            // Search in descriptions (Hebrew and English)
            const descMatches = Object.values(point.description || {}).some(val =>
                typeof val === 'string' && val.toLowerCase().includes(term)
            );
            if (descMatches) return true;

            return false;
        });
    }, [points, searchTerm]);

    const handleStartEditing = (point: StingPoint) => {
        setFormError(null);
        // Normalize legacy fields and handle migration to 'positions'
        const pointToEdit = { ...point };

        // Ensure both position formats exist and migration from legacy 'position'
        const positions = point.positions || {};
        pointToEdit.positions = {
            xbot: positions.xbot || (point as any).position || { x: 0, y: 0, z: 0 },
            corpo: positions.corpo || { x: 0, y: 0, z: 0 }
        };

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
        setSelectedPreviewModel('corpo');
    };

    const handleAddNew = () => {
        setFormError(null);
        const newPoint: Partial<StingPoint> = {
            id: '',
            code: '',
            label: {},
            description: {},
            positions: {
                xbot: { x: 0, y: 0, z: 0 },
                corpo: { x: 0, y: 0, z: 0 }
            },
            documentUrl: {},
            longText: {},
            sensitivity: 'Medium',
            imageURL: '',
            status: 'active',
            reference_count: 0
        };
        setEditingPoint(newPoint);
        setOriginalPoint(newPoint);
    };

    const handleUpdate = async (updatedPoint: Partial<StingPoint>, file?: File | null, lang: string = currentLang) => {
        setEditingPoint(updatedPoint);
        setIsDirty(true);

        if (file) {
            setIsSubmitting(true);
            try {
                const folderName = updatedPoint.id || 'new';
                const firebasePath = `Points/${folderName}`;
                const newUrl = await uploadFile(file, firebasePath);

                const currentDocUrls = typeof updatedPoint.documentUrl === 'object' ? { ...updatedPoint.documentUrl } : {};
                const newDocUrls = { ...currentDocUrls, [lang]: newUrl };

                setEditingPoint({ ...updatedPoint, documentUrl: newDocUrls });
                setFormError(null);
            } catch (err) {
                console.error("Error uploading file during update:", err);
                setFormError(getTranslation('Failed to upload file.'));
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const handleSave = async (pointToSave: Partial<StingPoint>) => {
        const isNewPoint = !pointToSave.id;

        const labelValues = Object.values(pointToSave.label || {}).map(v => v.trim()).filter(Boolean);
        if (!pointToSave.code || labelValues.length === 0) {
            setFormError(getTranslation('Point code and label (in at least one language) are required'));
            return;
        }

        setIsSubmitting(true);
        try {
            // Cleanup orphaned files (files that were in original but not in pointToSave)
            const originalDocUrls = originalPoint?.documentUrl;
            if (originalDocUrls) {
                const oldUrls: Record<string, string> = typeof originalDocUrls === 'string' ? { en: originalDocUrls } : originalDocUrls as Record<string, string>;
                const currentUrls: Record<string, string> = (pointToSave.documentUrl as Record<string, string>) || {};

                for (const [l, url] of Object.entries(oldUrls)) {
                    if (url && !currentUrls[l]) {
                        await deleteFile(url).catch(err => console.error("Error deleting orphaned file:", err));
                    }
                }
            }

            const dataToSave = {
                code: pointToSave.code!.trim(),
                label: pointToSave.label,
                description: pointToSave.description,
                longText: pointToSave.longText,
                sensitivity: pointToSave.sensitivity || 'Medium',
                imageURL: pointToSave.imageURL || '',
                positions: {
                    xbot: pointToSave.positions?.xbot || { x: 0, y: 0, z: 0 },
                    corpo: pointToSave.positions?.corpo || { x: 0, y: 0, z: 0 }
                },
                documentUrl: pointToSave.documentUrl && Object.keys(pointToSave.documentUrl).length > 0 ? pointToSave.documentUrl : null,
                status: pointToSave.status || 'active',
                reference_count: pointToSave.reference_count || 0,
                updatedAt: serverTimestamp(),
            };

            if (isNewPoint) {
                const newDocRef = await addDoc(pointsCollectionRef, { ...dataToSave, createdAt: serverTimestamp() });
                console.log(`[DEBUG-SAVE-SUCCESS] New point created with ID: ${newDocRef.id}`);
            } else {
                const pointDoc = doc(db, 'cfg_acupuncture_points', pointToSave.id!);
                await updateDoc(pointDoc, dataToSave);
                console.log(`[DEBUG-SAVE-SUCCESS] Point with ID: ${pointToSave.id} updated.`);
            }

            setEditingPoint(null);
            setIsDirty(false);
            fetchPoints();

        } catch (err) {
            console.error('Save failed:', err);
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

            const pointDoc = doc(db, 'cfg_acupuncture_points', deletingPoint.id);
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
                <h1 className={styles.title}><T>Points Configuration</T></h1>
                <div className={styles.headerActions}>
                    <div className={styles.searchContainer}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder={getTranslation('Search points...')}
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
                        <PlusCircle size={18} className={styles.addButtonIcon} /> <T>Add New Point</T>
                    </button>
                </div>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {editingPoint && (
                <EditPointForm
                    key={editingPoint.id || 'new'}
                    point={editingPoint}
                    onSave={(data) => handleSave(data)}
                    onUpdate={(data, file, lang) => handleUpdate(data, file, lang)}
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                    isDirty={isDirty}
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
                            <th scope="col" className={styles.headerCell}><T>Status</T></th>
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
                            filteredPoints.map(point => {
                                const docUrlForCurrentLang = getDocumentUrlForLang(point.documentUrl, currentLang);
                                return (
                                    <tr key={point.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{point.code}</td>
                                        <td className={styles.cell}>{point.label[currentLang] || point.label['en'] || ''}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={point.description[currentLang] || point.description['en'] || ''}>{point.description[currentLang] || point.description['en'] || ''}</td>
                                        <td className={styles.cell}>
                                            <span className={`${styles.statusBadge} ${point.status === 'active' ? styles.badgeActive : styles.badgeInactive}`}>
                                                <T>{point.status === 'active' ? 'Active' : 'Inactive'}</T>
                                            </span>
                                        </td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {docUrlForCurrentLang && (
                                                <Tooltip text={getTranslation('View Document')}>
                                                    <a href={docUrlForCurrentLang} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                        <FileCheck2 size={18} />
                                                    </a>
                                                </Tooltip>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <div className={styles.actionsWrapper}>
                                                <Tooltip text={getTranslation('Edit Point')}>
                                                    <button onClick={() => handleStartEditing(point)} className={styles.actionButton}><Edit size={18} /></button>
                                                </Tooltip>
                                                {point.reference_count > 0 ? (
                                                    <Tooltip text={getTranslation('Cannot delete: point is referenced in protocols')}>
                                                        <button className={`${styles.actionButton} ${styles.deleteButtonDisabled}`} disabled>
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip text={getTranslation('Delete Point')}>
                                                        <button onClick={() => setDeletingPoint(point)} className={`${styles.actionButton} ${styles.deleteButton}`}>
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </Tooltip>
                                                )}
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

const TranslationReference: React.FC<{ label: string; text: string | undefined }> = ({ label, text }) => {
    if (!text) return null;
    return (
        <div className={styles.translationReference}>
            <span className={styles.translationReferenceLabel}>{label}</span>
            {text}
        </div>
    );
};

interface EditPointFormProps {
    point: Partial<StingPoint>;
    onSave: (point: Partial<StingPoint>) => void;
    onUpdate: (point: Partial<StingPoint>, file?: File, lang?: string) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
    isDirty: boolean;
    appConfig: { defaultLanguage: string; supportedLanguages: string[] };
}

const EditPointForm: React.FC<EditPointFormProps> = ({ point, onSave, onUpdate, onCancel, error, isSubmitting, isDirty: initialIsDirty, appConfig }) => {
    const { language: currentLang, registerString, getTranslation } = useTranslationContext();
    const [formData, setFormData] = useState<Partial<StingPoint>>(point);
    const [activeLang, setActiveLang] = useState<string>(currentLang);
    const SUPPORTED_LANGS = appConfig.supportedLanguages;
    const orderedLangs = useMemo(() => [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
        .filter(l => SUPPORTED_LANGS.includes(l)), [currentLang, SUPPORTED_LANGS]);
    const [isDirty, setIsDirty] = useState(initialIsDirty);

    const [selectedPreviewModel, setSelectedPreviewModel] = useState<'corpo' | 'xbot'>('corpo');
    const [isRolling, setIsRolling] = useState(true);

    const stringsToRegister = useMemo(() => [
        'Saving...',
        'Save Point',
        'Default Language',
        'English',
        'Hebrew',
        'Edit Point',
        'Add New Point',
        'e.g., Hundred Meetings',
        "Describe the point's purpose",
        "Active",
        "Inactive",
        "Status",
        "Long Text",
        "Additional detailed description",
        "Sensitivity",
        "Low",
        "Medium",
        "High",
        "Image URL",
        "URL to image",
        "3D Coordinates",
        "Anatomical",
        "Mannequin",
        "Sync from Corpo",
        "Corpo (Anatomy)",
        "Xbot (Mannequin)",
        "Auto-Rotate"
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [registerString, stringsToRegister]);

    useEffect(() => {
        setFormData(point);
        setIsDirty(initialIsDirty);
    }, [point, initialIsDirty]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'label' || name === 'description' || name === 'longText') {
            setFormData(prev => ({
                ...prev,
                [name]: { ...(prev[name] as Record<string, string> || {}), [activeLang]: value }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        setIsDirty(true);
    };

    const handlePosChange = (modelId: 'xbot' | 'corpo', field: 'x' | 'y' | 'z', value: string) => {
        const val = parseFloat(value) || 0;
        const currentPositions = formData.positions || { xbot: { x: 0, y: 0, z: 0 }, corpo: { x: 0, y: 0, z: 0 } };
        const currentModelPos = currentPositions[modelId] || { x: 0, y: 0, z: 0 };

        handlePositionChange({
            ...currentModelPos,
            [field]: val
        });
    };

    const handlePositionChange = (newPos: { x: number, y: number, z: number }) => {
        setFormData(prev => ({
            ...prev,
            positions: {
                ...(prev.positions || { xbot: { x: 0, y: 0, z: 0 }, corpo: { x: 0, y: 0, z: 0 } }),
                [selectedPreviewModel]: newPos
            }
        }));
        setIsDirty(true);
    };

    const handleSyncXbot = () => {
        if (formData.positions?.corpo) {
            setFormData(prev => ({
                ...prev,
                positions: {
                    ...(prev.positions || { xbot: { x: 0, y: 0, z: 0 }, corpo: { x: 0, y: 0, z: 0 } }),
                    xbot: { ...prev.positions!.corpo!, isManual: false }
                }
            }));
            setSelectedPreviewModel('xbot');
            setIsDirty(true);
        }
    };

    const handleFileChange = (newFile: File | null) => {
        if (newFile) {
            onUpdate(formData, newFile, activeLang);
        }
    };

    const handleFileDelete = () => {
        if (!formData.documentUrl) return;

        let newDocUrls = { ... (typeof formData.documentUrl === 'object' ? formData.documentUrl : { en: formData.documentUrl }) };
        delete (newDocUrls as Record<string, any>)[activeLang];

        onUpdate({ ...formData, documentUrl: newDocUrls });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    const isEditing = !!formData.id;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>{isEditing ? <T>Edit Point</T> : <T>Add New Point</T>}</h2>
                    <button onClick={onCancel} className={styles.closeButton}><X size={24} /></button>
                </div>

                <div className={styles.splitLayout}>
                    {/* Left Panel: Form Metadata */}
                    <div className={styles.leftPanel}>
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

                        <form onSubmit={handleSubmit} id="editPointForm" className={styles.scrollableArea}>
                            {error && <p className={styles.formError}>{error}</p>}

                            <div className={styles.statusToggleContainer}>
                                <span className={styles.statusLabel}><T>Status</T>:</span>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={formData.status === 'active'}
                                        onChange={(e) => {
                                            setFormData(prev => ({ ...prev, status: e.target.checked ? 'active' : 'inactive' }));
                                            setIsDirty(true);
                                        }}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                                <span className={`${styles.statusText} ${formData.status === 'active' ? styles.statusActive : styles.statusInactive}`}>
                                    <T>{formData.status === 'active' ? 'Active' : 'Inactive'}</T>
                                </span>
                            </div>

                            <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                                <div>
                                    <label htmlFor="code" className={styles.label}><T>Code</T><span className={styles.requiredAsterisk}>*</span></label>
                                    <input 
                                        id="code" 
                                        name="code" 
                                        type="text" 
                                        value={formData.code || ''} 
                                        onChange={handleChange} 
                                        className={styles.input} 
                                        required 
                                        disabled={isEditing} 
                                    />
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
                                        placeholder={getTranslation('e.g., Hundred Meetings')}
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
                                    placeholder={getTranslation("Describe the point's purpose")}
                                    className={styles.textarea}
                                    rows={2}
                                ></textarea>
                            </div>

                            <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                                <div>
                                    <label htmlFor="sensitivity" className={styles.label}><T>Sensitivity</T></label>
                                    <select
                                        id="sensitivity"
                                        name="sensitivity"
                                        value={formData.sensitivity || 'Medium'}
                                        onChange={handleChange}
                                        className={styles.input}
                                    >
                                        <option value="Low">{getTranslation('Low')}</option>
                                        <option value="Medium">{getTranslation('Medium')}</option>
                                        <option value="High">{getTranslation('High')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="imageURL" className={styles.label}><T>Image URL</T></label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            id="imageURL"
                                            name="imageURL"
                                            type="text"
                                            value={formData.imageURL || ''}
                                            onChange={handleChange}
                                            placeholder={getTranslation('URL to image')}
                                            className={styles.input}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={styles.coordinateSection}>
                                <div className={styles.coordinateHeader}>
                                    <label className={styles.label}><T>3D Coordinates</T> - <T>{selectedPreviewModel === 'corpo' ? 'Anatomical' : 'Mannequin'}</T></label>
                                    {selectedPreviewModel === 'xbot' && (
                                        <button 
                                            type="button" 
                                            onClick={handleSyncXbot}
                                            className={styles.syncButton}
                                            title="Sync from Anatomical (Corpo)"
                                        >
                                            <RefreshCw size={14} />
                                            <T>Sync from Corpo</T>
                                        </button>
                                    )}
                                </div>
                                <div className={styles.coordinateGrid}>
                                    <div className={styles.coordInput}>
                                        <span>X</span>
                                        <input 
                                            type="number" 
                                            step="0.001"
                                            value={formData.positions?.[selectedPreviewModel]?.x || 0}
                                            onChange={(e) => handlePosChange(selectedPreviewModel, 'x', e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.coordInput}>
                                        <span>Y</span>
                                        <input 
                                            type="number" 
                                            step="0.001"
                                            value={formData.positions?.[selectedPreviewModel]?.y || 0}
                                            onChange={(e) => handlePosChange(selectedPreviewModel, 'y', e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.coordInput}>
                                        <span>Z</span>
                                        <input 
                                            type="number" 
                                            step="0.001"
                                            value={formData.positions?.[selectedPreviewModel]?.z || 0}
                                            onChange={(e) => handlePosChange(selectedPreviewModel, 'z', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <DocumentManagement
                                entityName="Point"
                                documentUrl={formData.documentUrl as { [key: string]: string }}
                                onFileChange={handleFileChange}
                                onFileDelete={handleFileDelete}
                                isSubmitting={isSubmitting}
                                activeLang={activeLang}
                            />
                        </form>
                        <div className={styles.formFooter}>
                            <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}><T>Cancel</T></button>
                            <button type="submit" form="editPointForm" disabled={isSubmitting || !isDirty} className={styles.saveButton}>
                                <Save size={18} /> {isSubmitting ? <T>Saving...</T> : <T>Save Point</T>}
                            </button>
                        </div>
                    </div>

                    {/* Right Panel: 3D Viewport */}
                    <div className={styles.rightPanel}>
                        <div className={styles.viewportControls}>
                            <div className={styles.controlGroup}>
                                <button 
                                    className={`${styles.controlButton} ${selectedPreviewModel === 'corpo' ? styles.controlButtonActive : ''}`}
                                    onClick={() => setSelectedPreviewModel('corpo')}
                                >
                                    <T>Corpo (Anatomy)</T>
                                </button>
                                <button 
                                    className={`${styles.controlButton} ${selectedPreviewModel === 'xbot' ? styles.controlButtonActive : ''}`}
                                    onClick={() => setSelectedPreviewModel('xbot')}
                                >
                                    <T>Xbot (Mannequin)</T>
                                </button>
                            </div>

                            <label className={styles.toggleLabel}>
                                <span><T>Auto-Rotate</T></span>
                                <div className={styles.toggle} onClick={() => setIsRolling(r => !r)}>
                                    <div className={`${styles.toggleTrack} ${isRolling ? styles.toggleOn : ''}`} />
                                    <div className={`${styles.toggleThumb} ${isRolling ? styles.toggleThumbOn : ''}`} />
                                </div>
                            </label>
                        </div>

                        <div className={styles.canvasScrollWrapper}>
                            <div className={styles.canvasSizer}>
                                <PointPlacementScene 
                                    selectedModel={selectedPreviewModel}
                                    position={formData.positions?.[selectedPreviewModel] || null}
                                    onPositionChange={handlePositionChange}
                                    isLocked={!isRolling}
                                />
                            </div>
                        </div>

                        <div className={styles.modelLabel}>
                            {selectedPreviewModel === 'corpo' ? 'ANATOMICAL SOURCE' : 'MANNEQUIN TARGET'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PointsAdmin;
