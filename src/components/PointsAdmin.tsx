
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, FileUp, FileDown, FileCheck2, XSquare, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './PointsAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';

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


const PointsAdmin: React.FC = () => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;
    const [user, setUser] = useState<User | null>(null);
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingPoint, setEditingPoint] = useState<Partial<StingPoint> | null>(null);
    const [originalPoint, setOriginalPoint] = useState<Partial<StingPoint> | null>(null);
    const [deletingPoint, setDeletingPoint] = useState<StingPoint | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const pointsCollectionRef = React.useMemo(() => collection(db, 'acupuncture_points'), []);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) setIsLoading(false);
        });
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
            setError(t('failedToFetchPoints'));
            console.error(err);
        }
        setIsLoading(false);
    }, [user, pointsCollectionRef, t]);

    useEffect(() => {
        if(user) fetchPoints();
    }, [user, fetchPoints]);

    const handleStartEditing = (point: StingPoint) => {
        setFormError(null);
        // Normalize legacy string URLs to the new object format upon editing
        const pointToEdit = { ...point };
        if (typeof pointToEdit.documentUrl === 'string') {
            pointToEdit.documentUrl = { en: pointToEdit.documentUrl };
        }
        setEditingPoint(pointToEdit);
        setOriginalPoint(pointToEdit);
        setIsDirty(false);
    };

    const handleAddNew = () => {
        setFormError(null);
        const newPoint: Partial<StingPoint> = { id: '', code: '', label: '', description: '', position: { x: 0, y: 0, z: 0 }, documentUrl: {} };
        setEditingPoint(newPoint);
        setOriginalPoint(newPoint);
        setIsDirty(false);
    };

    const handleSave = async (pointToSave: Partial<StingPoint>, file: File | null) => {
        const isNewPoint = !pointToSave.id;
        if (!pointToSave.code || !pointToSave.label) {
            setFormError(t('pointCodeAndLabelRequired'));
            return;
        }

        setIsSubmitting(true);
        console.log(`%c[DEBUG-SAVE-01] handleSave started. Lang: ${currentLang}`, 'color: blue; font-weight: bold;', {
            pointToSave: JSON.parse(JSON.stringify(pointToSave)),
            file: file?.name
        });

        try {
            let documentUrlObject: { [key: string]: string } = {};

            // Start with the existing URLs
            if (pointToSave.documentUrl) {
                 if (typeof pointToSave.documentUrl === 'string') {
                    console.log('[DEBUG-SAVE-02] Normalizing legacy string URL.');
                    documentUrlObject = { en: pointToSave.documentUrl };
                } else {
                    console.log('[DEBUG-SAVE-03] Starting with existing URL object.');
                    documentUrlObject = { ...pointToSave.documentUrl };
                }
            }
            
            // Handle file upload
            if (file) {
                console.log(`[DEBUG-SAVE-04] File upload triggered for lang '${currentLang}'.`);
                // If a file for the current language already exists, delete it first.
                if (documentUrlObject[currentLang]) {
                    console.log(`[DEBUG-SAVE-05] Deleting existing file for ${currentLang}:`, documentUrlObject[currentLang]);
                    try {
                        await deleteFile(documentUrlObject[currentLang]);
                    } catch (storageError) {
                        console.error("[DEBUG-SAVE-ERROR] Failed to delete old file from storage, but proceeding.", storageError);
                    }
                }
                const newUrl = await uploadFile(file, `Points/${pointToSave.id || 'new'}/${file.name}`);
                console.log(`[DEBUG-SAVE-06] File uploaded. New URL: ${newUrl}`);
                documentUrlObject[currentLang] = newUrl;
            }

            const dataToSave = {
                code: pointToSave.code.trim(),
                label: pointToSave.label.trim(),
                description: pointToSave.description?.trim() || '',
                position: pointToSave.position || {x:0, y:0, z:0},
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
            setFormError(t('failedToSavePoint'));
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
            setError(t('failedToDeletePoint'));
        } 
        setIsSubmitting(false);
        setDeletingPoint(null);
    };
    
    const handleCancelEdit = () => {
        setEditingPoint(null);
        setFormError(null); 
        setIsDirty(false);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('acupuncturePoints')}</h1>
                 <button onClick={handleAddNew} className={styles.addButton}>
                    <PlusCircle size={18} className={styles.addButtonIcon} /> {t('addNewPoint')}
                </button>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {editingPoint && (
                <EditPointForm 
                    key={editingPoint.id || 'new'} // Ensures form resets when switching points
                    point={editingPoint} 
                    onSave={handleSave} 
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
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
                                <h2 className={styles.modalTitle}>{t('deletePoint')}</h2>
                                <p className={styles.modalText}>{t('deletePointConfirmation', { code: deletingPoint.code })}</p>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setDeletingPoint(null)} disabled={isSubmitting} className={styles.cancelButton}>{t('cancel')}</button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className={styles.confirmDeleteButton}>
                                {isSubmitting ? t('deleting') : t('confirmDelete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead className={styles.tableHeader}>
                            <tr>
                                <th scope="col" className={styles.headerCell}>{t('code')}</th>
                                <th scope="col" className={styles.headerCell}>{t('label')}</th>
                                <th scope="col" className={styles.headerCell}>{t('description')}</th>
                                <th scope="col" className={styles.headerCell}>{t('position')}</th>
                                <th scope="col" className={styles.headerCell}>{t('document')}</th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">{t('actions')}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {isLoading ? (
                                <tr><td colSpan={6} className={styles.loaderCell}><Loader className={styles.loader} size={32}/></td></tr>
                            ) : points.length === 0 ? (
                                <tr><td colSpan={6} className={styles.emptyCell}>{!user ? t('please_log_in') : t('noPointsFound')}</td></tr>
                            ) : (
                                points.map(point => {
                                    const docUrlForCurrentLang = getDocumentUrlForLang(point.documentUrl, currentLang);
                                    return (
                                    <tr key={point.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{point.code}</td>
                                        <td className={styles.cell}>{point.label}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={point.description}>{point.description}</td>
                                        <td className={styles.cell}>{`(${point.position.x}, ${point.position.y}, ${point.position.z})`}</td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {docUrlForCurrentLang && (
                                                <a href={docUrlForCurrentLang} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                    <FileCheck2 size={18}/>
                                                </a>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <button onClick={() => handleStartEditing(point)} className={styles.actionButton}><Edit size={18}/></button>
                                            <button onClick={() => setDeletingPoint(point)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18}/></button>
                                        </td>
                                    </tr>
                                )})
                            )}
                        </tbody>
                    </table>
            </div>
        </div>
    );
};


interface EditPointFormProps {
    point: Partial<StingPoint>;
    onSave: (point: Partial<StingPoint>, file: File | null) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
}

const EditPointForm: React.FC<EditPointFormProps> = ({ point, onSave, onCancel, error, isSubmitting }) => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;
    const [formData, setFormData] = useState(point);
    const [file, setFile] = useState<File | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const docUrlForCurrentLang = getDocumentUrlForLang(formData.documentUrl, currentLang);

    useEffect(() => {
        setFormData(point);
        setFile(null);
        setIsDirty(false);
    }, [point]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files ? e.target.files[0] : null;
        if (selectedFile) {
            setFile(selectedFile);
            setIsDirty(true);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
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
        onSave(formData, file);
    };

    const handleFileDelete = () => {
        console.log(`%c[DEBUG-FILE-DELETE] Deleting file for lang: ${currentLang}`, 'color: orange;');
        if (!formData.documentUrl) return;
        
        let newDocUrls = { ... (typeof formData.documentUrl === 'object' ? formData.documentUrl : { en: formData.documentUrl }) };
        delete (newDocUrls as Record<string, any>)[currentLang];
        
        setFormData(prev => ({...prev, documentUrl: newDocUrls}));
        setFile(null); // Mark for deletion on save if it was just uploaded
        setIsDirty(true);
    };

    const isEditing = !!formData.id;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>{isEditing ? t('editPoint') : t('addNewPoint')}</h2>
                    <button onClick={onCancel} className={styles.closeButton}><X size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.scrollableArea}>
                        {error && <p className={styles.formError}>{error}</p>}

                        <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                           <div>
                                <label htmlFor="code" className={styles.label}>{t('code')}<span className={styles.requiredAsterisk}>*</span></label>
                                <input id="code" name="code" type="text" value={formData.code || ''} onChange={handleChange} className={styles.input} required disabled={isEditing} />
                            </div>
                            <div>
                                <label htmlFor="label" className={styles.label}>{t('label')}<span className={styles.requiredAsterisk}>*</span></label>
                                <input id="label" name="label" type="text" value={formData.label || ''} onChange={handleChange} className={styles.input} required />
                            </div>
                        </div>
                        <div>
                             <label htmlFor="description" className={styles.label}>{t('description')}</label>
                            <textarea id="description" name="description" value={formData.description || ''} onChange={handleChange} className={styles.textarea} rows={3}></textarea>
                        </div>
                        <div>
                            <label className={styles.label}>{t('position3d', '3D Position')}</label>
                            <div className={`${styles.grid} ${styles['grid-cols-3']}`}>
                                <div>
                                    <label htmlFor="x" className={styles.coordinateLabel}>{t('x_axis', 'X-axis')}</label>
                                    <input id="x" type="number" name="x" step="0.01" value={formData.position?.x || 0} onChange={handlePosChange} placeholder="X" className={styles.input} />
                                </div>
                                <div>
                                    <label htmlFor="y" className={styles.coordinateLabel}>{t('y_axis', 'Y-axis')}</label>
                                    <input id="y" type="number" name="y" step="0.01" value={formData.position?.y || 0} onChange={handlePosChange} placeholder="Y" className={styles.input} />
                                </div>
                                <div>
                                    <label htmlFor="z" className={styles.coordinateLabel}>{t('z_axis', 'Z-axis')}</label>
                                    <input id="z" type="number" name="z" step="0.01" value={formData.position?.z || 0} onChange={handlePosChange} placeholder="Z" className={styles.input} />
                                </div>
                            </div>
                        </div>
                         <div className={styles.documentSection}>
                            <label className={styles.label}>{t('pointDocument')}</label>
                            {(docUrlForCurrentLang || file) && (
                                <div className={styles.fileName}>{t('currentFile')}: {file?.name || getFilenameFromUrl(docUrlForCurrentLang)}</div>
                            )}
                            <div className={styles.documentButtonRow}>
                                {docUrlForCurrentLang && !file && (
                                    <a href={docUrlForCurrentLang} target="_blank" rel="noopener noreferrer" className={`${styles.documentActionButton} ${styles.documentViewButton}`}>
                                        <FileDown size={16} /> {t('viewDocument')}
                                    </a>
                                )}
                                <button type="button" onClick={() => fileInputRef.current?.click()} className={`${styles.documentActionButton} ${styles.documentUploadButton}`} disabled={isSubmitting}>
                                    <FileUp size={16} /> {docUrlForCurrentLang ? t('replaceDocument') : t('uploadDocument')}
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} className={styles.fileInput} accept=".pdf,.doc,.docx,.jpg,.png" />
                                {(docUrlForCurrentLang || file) && (
                                    <button type="button" onClick={handleFileDelete} disabled={isSubmitting} className={`${styles.documentActionButton} ${styles.documentDeleteButton}`}>
                                        <XSquare size={16} /> {t('deleteDocument')}
                                    </button>
                                )}
                            </div>
                        </div>

                    </div>
                    
                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}>{t('cancel')}</button>
                        <button type="submit" disabled={isSubmitting || !isDirty} className={styles.saveButton}>
                            <Save size={16} /> {isSubmitting ? t('saving') : t('savePoint')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PointsAdmin;
