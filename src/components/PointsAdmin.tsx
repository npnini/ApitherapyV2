
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, FileUp, FileDown, FileCheck2, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './PointsAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';

const PointsAdmin: React.FC = () => {
    const { t } = useTranslation();
    const [user, setUser] = useState<User | null>(null);
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<StingPoint | null>(null);
    const [deletingPoint, setDeletingPoint] = useState<StingPoint | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const pointsCollectionRef = React.useMemo(() => collection(db, 'acupuncture_points'), []);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchPoints = useCallback(async () => {
        if (!user) {
            setPoints([]);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const data = await getDocs(pointsCollectionRef);
            const fetchedPoints = data.docs.map(doc => ({ ...(doc.data() as Omit<StingPoint, 'id'>), id: doc.id }));
            fetchedPoints.sort((a, b) => a.code.localeCompare(b.code));
            setPoints(fetchedPoints);
        } catch (err) {
            setError(t('failedToFetchPoints'));
            console.error(err);
        }
        setIsLoading(false);
    }, [user, pointsCollectionRef, t]);

    useEffect(() => {
        fetchPoints();
    }, [fetchPoints]);

    const validatePointForm = (point: StingPoint, isNew: boolean): boolean => {
        if (!point.code.trim()) {
            setFormError(t('pointCodeRequired'));
            return false;
        }
        if (!point.label.trim()) {
            setFormError(t('pointLabelRequired'));
            return false;
        }
        if (!point.description.trim()) {
            setFormError(t('pointDescriptionRequired'));
            return false;
        }

        if (isNew) {
            const codeExists = points.some(p => p.code.toLowerCase() === point.code.trim().toLowerCase());
            if (codeExists) {
                setFormError(t('pointCodeExists', { code: point.code.trim().toUpperCase() }));
                return false;
            }
        }
        
        setFormError(null);
        return true;
    }

    const handleSave = async (pointToSave: StingPoint) => {
        const isNewPoint = !pointToSave.id;
        if (!validatePointForm(pointToSave, isNewPoint)) {
            return;
        }

        setIsSubmitting(true);
        let documentUrl = pointToSave.documentUrl;

        try {
            if (fileToDelete) {
                await deleteFile(fileToDelete);
                documentUrl = undefined;
            }

            if (fileToUpload) {
                // If there's an existing document, delete it first.
                if (documentUrl) {
                    await deleteFile(documentUrl);
                }
                documentUrl = await uploadFile(fileToUpload, 'Points');
            }

            const code = pointToSave.code.trim().toUpperCase();

            const dataToSave: any = {
                code,
                label: pointToSave.label.trim(),
                description: pointToSave.description.trim(),
                position: pointToSave.position,
                documentUrl: documentUrl || null,
            };
            
            if (isNewPoint) {
                const newPointRef = doc(db, 'acupuncture_points', code);
                await setDoc(newPointRef, dataToSave);
            } else {
                const pointDoc = doc(db, 'acupuncture_points', pointToSave.id);
                await updateDoc(pointDoc, dataToSave);
            }
            
            setIsEditing(null);
            setFileToUpload(null);
            setFileToDelete(null);
            setIsDirty(false);
            fetchPoints();
        } catch (err) {
            setFormError(t('failedToSavePoint'));
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingPoint) return;

        setIsSubmitting(true);
        try {
            // Delete the document from storage if it exists
            if (deletingPoint.documentUrl) {
                await deleteFile(deletingPoint.documentUrl);
            }

            const pointDoc = doc(db, 'acupuncture_points', deletingPoint.id);
            await deleteDoc(pointDoc);
            fetchPoints();
        } catch (err) {
            setError(t('failedToDeletePoint'));
            console.error(err);
        } 
        setIsSubmitting(false);
        setDeletingPoint(null);
    };

    const handleFileDelete = (point: StingPoint) => {
        if (!point.documentUrl) return;
        setFileToDelete(point.documentUrl);
        const updatedPoint = { ...point, documentUrl: undefined };
        onUpdate(updatedPoint);
    };

    const onUpdate = (point: StingPoint) => {
        setIsEditing(point);
        setIsDirty(true);
    }
    
    const handleCancelEdit = () => {
        setIsEditing(null);
        setFileToUpload(null);
        setFileToDelete(null);
        setFormError(null); 
        setIsDirty(false);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('acupuncturePoints')}</h1>
                <div>
                    <button
                        onClick={() => {
                            setFormError(null);
                            setFileToUpload(null);
                            setFileToDelete(null);
                            setIsDirty(false);
                            setIsEditing({ id: '', code: '', label: '', description: '', position: { x: 0, y: 0, z: 0 }});
                        }}
                        className={styles.addButton}
                    >
                        <PlusCircle size={18} className={styles.addButtonIcon} /> {t('addNewPoint')}
                    </button>
                </div>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {isEditing && (
                <EditPointForm 
                    point={isEditing} 
                    onSave={handleSave} 
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                    points={points}
                    onFileChange={(file) => {
                        setFileToUpload(file);
                        setIsDirty(true);
                    }}
                    onFileDelete={handleFileDelete}
                    onUpdate={onUpdate}
                    isDirty={isDirty}
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
                <div className="overflow-x-auto">
                    <table className={styles.table}>
                        <thead className={styles.tableHeader}>
                            <tr>
                                <th scope="col" className={styles.headerCell}>{t('code')}</th>
                                <th scope="col" className={styles.headerCell}>{t('label')}</th>
                                <th scope="col" className={styles.headerCell}>{t('description')}</th>
                                <th scope="col" className={styles.headerCell}>{t('position')}</th>
                                <th scope="col" className={`${styles.headerCell} ${styles.documentCell}`}>{t('document')}</th>
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
                                points.map(point => (
                                    <tr key={point.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{point.code}</td>
                                        <td className={styles.cell}>{point.label}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={point.description}>{point.description}</td>
                                        <td className={`${styles.cell} ${styles.positionCell}`}>{`(${point.position.x}, ${point.position.y}, ${point.position.z})`}</td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {point.documentUrl && (
                                                <a href={point.documentUrl} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                    <FileCheck2 size={18}/>
                                                </a>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <button onClick={() => {
                                                setFormError(null);
                                                setFileToUpload(null);
                                                setFileToDelete(null);
                                                setIsDirty(false);
                                                setIsEditing(point);
                                            }} className={styles.actionButton}><Edit size={18}/></button>
                                            <button onClick={() => setDeletingPoint(point)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18}/></button>
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


interface EditPointFormProps {
    point: StingPoint;
    points: StingPoint[];
    onSave: (point: StingPoint) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
    onFileChange: (file: File | null) => void;
    onFileDelete: (point: StingPoint) => void;
    onUpdate: (point: StingPoint) => void;
    isDirty: boolean;
}

const EditPointForm: React.FC<EditPointFormProps> = ({ point, points, onSave, onCancel, error, isSubmitting, onFileChange, onFileDelete, onUpdate, isDirty }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState(point);
    const [localError, setLocalError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFormData(point);
        setSelectedFileName(null);
    }, [point]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (file) {
            setSelectedFileName(file.name);
            onFileChange(file);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const updatedPoint = { ...formData, [name]: value };
        setFormData(updatedPoint);
        onUpdate(updatedPoint);
    };

    const handlePosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const updatedPoint = {
            ...formData,
            position: { ...formData.position, [name]: parseFloat(value) || 0 }
        };
        setFormData(updatedPoint);
        onUpdate(updatedPoint);
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.code.trim()) {
            setLocalError(t("pointCodeRequired")); return;
        }
        if (!formData.label.trim()) {
            setLocalError(t("pointLabelRequired")); return;
        }
        if (!formData.description.trim()) {
            setLocalError(t("descriptionRequired")); return;
        }

        const isNew = !point.id;
        if (isNew) {
            const codeExists = points.some(p => p.code.toLowerCase() === formData.code.trim().toLowerCase());
            if (codeExists) {
                setLocalError(t('pointCodeExists', { code: formData.code.trim().toUpperCase() }));
                return;
            }
        }

        setLocalError(null);
        onSave(formData);
    };

    const isEditing = !!formData.id;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{maxWidth: '600px'}}>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <h2 className={styles.formTitle}>{isEditing ? t('editPoint') : t('addNewPoint')}</h2>
                    
                    {(error || localError) && <p className={styles.formError}>{error || localError}</p>}

                    {/* Form fields grid */}
                    <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                        {/* ... other fields ... */}
                         <div>
                            <label htmlFor="code" className={styles.label}>
                                {t('code')}
                                <span className={styles.requiredAsterisk}>*</span>
                            </label>
                            <input 
                                type="text" 
                                id="code"
                                name="code" 
                                value={formData.code} 
                                onChange={handleChange} 
                                placeholder={t('codePlaceholder')}
                                className={styles.input}
                                required 
                                disabled={isEditing}
                            />
                        </div>
                        <div>
                             <label htmlFor="label" className={styles.label}>
                                {t('label')}
                                <span className={styles.requiredAsterisk}>*</span>
                            </label>
                            <input 
                                type="text"
                                id="label" 
                                name="label" 
                                value={formData.label} 
                                onChange={handleChange} 
                                placeholder={t('labelPlaceholder')}
                                className={styles.input} 
                                required 
                            />
                        </div>
                    </div>
                     <div>
                        <label htmlFor="description" className={styles.label}>
                            {t('description')}
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <textarea 
                            id="description"
                            name="description" 
                            value={formData.description} 
                            onChange={handleChange} 
                            placeholder={t('description')} 
                            className={styles.textarea}
                            rows={3}
                            required
                        ></textarea>
                    </div>
                     <div>
                        <label className={styles.label}>
                            {t('position3d')}
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <div className={`${styles.grid} ${styles['grid-cols-3']}`}>
                            <div>
                                <label htmlFor="x" className={styles.coordinateLabel}>{t('x_axis')}</label>
                                <input id="x" type="number" name="x" step="0.01" value={formData.position.x} onChange={handlePosChange} placeholder="X" className={styles.input} />
                            </div>
                            <div>
                                <label htmlFor="y" className={styles.coordinateLabel}>{t('y_axis')}</label>
                                <input id="y" type="number" name="y" step="0.01" value={formData.position.y} onChange={handlePosChange} placeholder="Y" className={styles.input} />
                            </div>
                            <div>
                                <label htmlFor="z" className={styles.coordinateLabel}>{t('z_axis')}</label>
                                <input id="z" type="number" name="z" step="0.01" value={formData.position.z} onChange={handlePosChange} placeholder="Z" className={styles.input} />
                            </div>
                        </div>
                    </div>

                    {/* Document management section */}
                    <div className={styles.documentSection}>
                        <label className={styles.label}>{t('pointDocument')}</label>

                        {!formData.documentUrl && !selectedFileName && (
                            <p className={styles.noDocument}>{t('noDocumentAttached')}</p>
                        )}
                        {selectedFileName && (
                            <p className={styles.fileName}>{t('selectedFile', 'Selected file')}: {selectedFileName}</p>
                        )}

                        <div className={styles.documentButtonRow}>
                            {formData.documentUrl && (
                                <button
                                    type="button"
                                    onClick={() => window.open(formData.documentUrl, '_blank')}
                                    className={`${styles.documentActionButton} ${styles.documentViewButton}`}
                                    disabled={isSubmitting}
                                >
                                    <FileDown size={16} /> {t('viewDocument')}
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={`${styles.documentActionButton} ${styles.documentUploadButton}`}
                                disabled={isSubmitting}
                            >
                                <FileUp size={16} />
                                {formData.documentUrl ? t('replaceDocument') : t('uploadDocument')}
                            </button>
                            <input
                                type="file"
                                id="file-upload"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className={styles.fileInput}
                                accept=".pdf,.doc,.docx,.jpg,.png"
                            />

                            {formData.documentUrl && (
                                <button
                                    type="button"
                                    onClick={() => onFileDelete(formData)}
                                    disabled={isSubmitting}
                                    className={`${styles.documentActionButton} ${styles.documentDeleteButton}`}
                                >
                                    <XSquare size={16} /> {t('deleteDocument')}
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}>{t('cancel')}</button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting || !isDirty}
                            className={isSubmitting || !isDirty ? styles.saveButtonDisabled : styles.saveButton}
                        >
                            <Save size={16} className={styles.saveButtonIcon} /> 
                            {isSubmitting ? t('saving') : t('savePoint')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PointsAdmin;
