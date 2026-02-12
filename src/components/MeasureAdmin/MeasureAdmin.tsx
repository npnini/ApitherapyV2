
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { Measure, MeasureType } from '../../types/measure';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, FileUp, FileDown, FileCheck2, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from '../PointsAdmin.module.css';
import { uploadFile, deleteFile } from '../../services/storageService';

const MeasureAdmin: React.FC = () => {
    const { t } = useTranslation();
    const [user, setUser] = useState<User | null>(null);
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<Measure | null>(null);
    const [deletingMeasure, setDeletingMeasure] = useState<Measure | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const measuresCollectionRef = React.useMemo(() => collection(db, 'measures'), []);

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

    const fetchMeasures = useCallback(async () => {
        if (!user) {
            setMeasures([]);
            return;
        }

        setIsLoading(true);
        try {
            const data = await getDocs(measuresCollectionRef);
            const fetchedMeasures = data.docs.map(doc => ({ ...(doc.data() as Omit<Measure, 'id'>), id: doc.id }));
            fetchedMeasures.sort((a, b) => a.name.localeCompare(b.name));
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

    const validateMeasureForm = (measure: Measure, isNew: boolean): boolean => {
        if (!measure.name.trim()) {
            setFormError(t('measureNameRequired'));
            return false;
        }

        if (isNew) {
            const nameExists = measures.some(m => m.name.toLowerCase() === measure.name.trim().toLowerCase());
            if (nameExists) {
                setFormError(t('measureNameExists', { name: measure.name.trim() }));
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
        let documentUrl = measureToSave.documentUrl;

        try {
            if (fileToDelete) {
                await deleteFile(fileToDelete);
                documentUrl = undefined;
            }

            if (fileToUpload) {
                if (documentUrl) {
                    await deleteFile(documentUrl);
                }
                documentUrl = await uploadFile(fileToUpload, 'Measures');
            }

            const dataToSave: any = {
                name: measureToSave.name.trim(),
                description: measureToSave.description.trim(),
                type: measureToSave.type,
                documentUrl: documentUrl || null,
            };

            if (measureToSave.type === 'Category') {
                dataToSave.categories = measureToSave.categories;
                dataToSave.scale = null;
            } else if (measureToSave.type === 'Scale') {
                dataToSave.scale = measureToSave.scale;
                dataToSave.categories = null;
            }
            
            if (isNewMeasure) {
                await addDoc(measuresCollectionRef, dataToSave);
            } else {
                const measureDoc = doc(db, 'measures', measureToSave.id);
                await updateDoc(measureDoc, dataToSave);
            }
            
            setIsEditing(null);
            setFileToUpload(null);
            setFileToDelete(null);
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
                await deleteFile(deletingMeasure.documentUrl);
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

    const handleFileDelete = (measure: Measure) => {
        if (!measure.documentUrl) return;
        setFileToDelete(measure.documentUrl);
        const updatedMeasure = { ...measure, documentUrl: undefined };
        onUpdate(updatedMeasure);
    };

    const onUpdate = (measure: Measure) => {
        setIsEditing(measure);
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
                <h1 className={styles.title}>{t('measure_configuration')}</h1>
                <div>
                    <button
                        onClick={() => {
                            setFormError(null);
                            setFileToUpload(null);
                            setFileToDelete(null);
                            setIsDirty(false);
                            setIsEditing({ id: '', name: '', type: 'Category', description: '' });
                        }}
                        className={styles.addButton}
                    >
                        <PlusCircle size={18} className={styles.addButtonIcon} /> {t('addNewMeasure')}
                    </button>
                </div>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {isEditing && (
                <EditMeasureForm 
                    measure={isEditing} 
                    onSave={handleSave} 
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                    measures={measures}
                    onFileChange={(file) => {
                        setFileToUpload(file);
                        setIsDirty(true);
                    }}
                    onFileDelete={handleFileDelete}
                    onUpdate={onUpdate}
                    isDirty={isDirty}
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
                                <p className={styles.modalText}>{t('deleteMeasureConfirmation', { name: deletingMeasure.name })}</p>
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
                                <tr><td colSpan={5} className={styles.loaderCell}><Loader className={styles.loader} size={32}/></td></tr>
                            ) : error ? null : measures.length === 0 ? (
                                <tr><td colSpan={5} className={styles.emptyCell}>{!user ? t('please_log_in') : t('noMeasuresFound')}</td></tr>
                            ) : (
                                measures.map(measure => (
                                    <tr key={measure.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{measure.name}</td>
                                        <td className={styles.cell}>{t(measure.type.toLowerCase())}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={measure.description}>{measure.description}</td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {measure.documentUrl && (
                                                <a href={measure.documentUrl} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
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
                                                setIsEditing(measure);
                                            }} className={styles.actionButton}><Edit size={18}/></button>
                                            <button onClick={() => setDeletingMeasure(measure)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18}/></button>
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
    measures: Measure[];
    onSave: (measure: Measure) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
    onFileChange: (file: File | null) => void;
    onFileDelete: (measure: Measure) => void;
    onUpdate: (measure: Measure) => void;
    isDirty: boolean;
}

const EditMeasureForm: React.FC<EditMeasureFormProps> = ({ measure, measures, onSave, onCancel, error, isSubmitting, onFileChange, onFileDelete, onUpdate, isDirty }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState(measure);
    const [localError, setLocalError] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [categoryInput, setCategoryInput] = useState('');
    const [editingCategory, setEditingCategory] = useState<string | null>(null);

    useEffect(() => {
        setFormData(measure);
        setSelectedFileName(null);
    }, [measure]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (file) {
            setSelectedFileName(file.name);
            onFileChange(file);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const updatedMeasure = { ...formData, [name]: value };
        if (name === 'type') {
            updatedMeasure.categories = [];
            updatedMeasure.scale = {min: 0, max: 0};
        }
        setFormData(updatedMeasure as Measure);
        onUpdate(updatedMeasure as Measure);
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
    
        const isDuplicate = !editingCategory && formData.categories?.includes(categoryInput.trim());
        if (isDuplicate) {
            // Optional: Show an error to the user
            return;
        }
    
        let updatedCategories;
        if (editingCategory) {
            const index = formData.categories?.indexOf(editingCategory);
            if (index !== undefined && index !== -1) {
                updatedCategories = [...(formData.categories || [])];
                updatedCategories[index] = categoryInput.trim();
            } else {
                updatedCategories = [...(formData.categories || []), categoryInput.trim()];
            }
        } else {
            updatedCategories = [...(formData.categories || []), categoryInput.trim()];
        }
    
        const updatedMeasure = { ...formData, categories: updatedCategories };
        setFormData(updatedMeasure);
        onUpdate(updatedMeasure);
        setCategoryInput('');
        setEditingCategory(null);
    };

    const handleEditCategory = (categoryToEdit: string) => {
        setCategoryInput(categoryToEdit);
        setEditingCategory(categoryToEdit);
    };

    const handleRemoveCategory = (category: string) => {
        const updatedMeasure = { ...formData, categories: formData.categories?.filter(c => c !== category) };
        setFormData(updatedMeasure);
        onUpdate(updatedMeasure);
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name.trim()) {
            setLocalError(t("measureNameRequired")); return;
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
        if (isNew) {
            const nameExists = measures.some(m => m.name.toLowerCase() === formData.name.trim().toLowerCase());
            if (nameExists) {
                setLocalError(t('measureNameExists', { name: formData.name.trim() }));
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
                    <h2 className={styles.formTitle}>{isEditing ? t('editMeasure') : t('addNewMeasure')}</h2>
                    
                    {(error || localError) && <p className={styles.formError}>{error || localError}</p>}

                    <div>
                        <label htmlFor="name" className={styles.label}>
                            {t('name')}
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input 
                            type="text" 
                            id="name"
                            name="name" 
                            value={formData.name} 
                            onChange={handleChange} 
                            placeholder={t('namePlaceholder')}
                            className={styles.input}
                            required 
                        />
                    </div>

                    <div>
                        <label htmlFor="type" className={styles.label}>
                            {t('type')}
                        </label>
                        <select id="type" name="type" value={formData.type} onChange={handleChange} className={styles.input}>
                            <option value="Category">{t('category')}</option>
                            <option value="Scale">{t('scale')}</option>
                        </select>
                    </div>

                    {formData.type === 'Category' && (
                        <div>
                            <label className={styles.label}>{t('categories')}</label>
                            <div className={styles.categoryInputContainer}>
                                <input 
                                    type="text" 
                                    value={categoryInput} 
                                    onChange={(e) => setCategoryInput(e.target.value)} 
                                    placeholder={t('addCategoryPlaceholder')}
                                    className={styles.input}
                                />
                                <button type="button" onClick={handleAddCategory} className={styles.addButton} style={{marginLeft: '8px'}}>{editingCategory ? t('update') : t('add')}</button>
                            </div>
                            <div className={styles.categoryList}>
                                {formData.categories?.map(cat => (
                                     <div key={cat} className={styles.categoryTag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>{cat}</span>
                                        <div>
                                            <button type="button" title={`Edit ${cat}`} onClick={() => handleEditCategory(cat)} className={styles.actionButton} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                                <Edit size={16} />
                                            </button>
                                            <button type="button" title={`Remove ${cat}`} onClick={() => handleRemoveCategory(cat)} className={styles.actionButton} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '8px' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {formData.type === 'Scale' && (
                        <div className={styles.scaleContainer}>
                             <div>
                                <label htmlFor="min" className={styles.label}>{t('minimum')}</label>
                                <input 
                                    type="number" 
                                    id="min"
                                    name="min" 
                                    value={formData.scale?.min ?? ''} 
                                    onChange={handleScaleChange} 
                                    className={styles.input} 
                                />
                            </div>
                            <div>
                                <label htmlFor="max" className={styles.label}>{t('maximum')}</label>
                                <input 
                                    type="number" 
                                    id="max"
                                    name="max" 
                                    value={formData.scale?.max ?? ''} 
                                    onChange={handleScaleChange} 
                                    className={styles.input} 
                                />
                            </div>
                        </div>
                    )}

                     <div>
                        <label htmlFor="description" className={styles.label}>
                            {t('description')}
                        </label>
                        <textarea 
                            id="description"
                            name="description" 
                            value={formData.description} 
                            onChange={handleChange} 
                            placeholder={t('descriptionPlaceholder')}
                            className={styles.textarea}
                            rows={3}
                        ></textarea>
                    </div>

                    {/* Document management section */}
                    <div className={styles.documentSection}>
                        <label className={styles.label}>{t('measureDocument')}</label>

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
                            {isSubmitting ? t('saving') : t('saveMeasure')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default MeasureAdmin;
