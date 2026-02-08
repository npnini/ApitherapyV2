
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './PointsAdmin.module.css';

const PointsAdmin: React.FC = () => {
    const { t } = useTranslation();
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<StingPoint | null>(null);
    const [deletingPoint, setDeletingPoint] = useState<StingPoint | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const pointsCollectionRef = React.useMemo(() => collection(db, 'acupuncture_points'), []);

    const fetchPoints = useCallback(async () => {
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
    }, [pointsCollectionRef, t]);

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

        const code = pointToSave.code.trim().toUpperCase();

        const dataToSave = {
            code,
            label: pointToSave.label.trim(),
            description: pointToSave.description.trim(),
            position: pointToSave.position,
        };
        
        try {
            if (isNewPoint) {
                const newPointRef = doc(db, 'acupuncture_points', code);
                await setDoc(newPointRef, dataToSave);
            } else {
                const pointDoc = doc(db, 'acupuncture_points', pointToSave.id);
                await updateDoc(pointDoc, dataToSave);
            }
            
            setIsEditing(null);
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

    const handleCancelEdit = () => {
        setIsEditing(null);
        setFormError(null); 
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('acupuncturePoints')}</h1>
                <div>
                    <button
                        onClick={() => {
                            setFormError(null);
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
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">{t('actions')}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {isLoading && !deletingPoint ? (
                                <tr><td colSpan={5} className={styles.loaderCell}><Loader className={styles.loader} size={32}/></td></tr>
                            ) : points.length === 0 ? (
                                <tr><td colSpan={5} className={styles.emptyCell}>{t('noPointsFound')}</td></tr>
                            ) : (
                                points.map(point => (
                                    <tr key={point.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.codeCell}`}>{point.code}</td>
                                        <td className={styles.cell}>{point.label}</td>
                                        <td className={`${styles.cell} ${styles.descriptionCell}`} title={point.description}>{point.description}</td>
                                        <td className={`${styles.cell} ${styles.positionCell}`}>{`(${point.position.x}, ${point.position.y}, ${point.position.z})`}</td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <button onClick={() => { setFormError(null); setIsEditing(point);}} className={styles.actionButton}><Edit size={18}/></button>
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
}

const EditPointForm: React.FC<EditPointFormProps> = ({ point, points, onSave, onCancel, error, isSubmitting }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState(point);
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        setFormData(point);
    }, [point]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            position: { ...prev.position, [name]: parseFloat(value) || 0 }
        }));
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
            <div className={styles.modalContent}>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <h2 className={styles.formTitle}>{isEditing ? t('editPoint') : t('addNewPoint')}</h2>
                    
                    {(error || localError) && <p className={styles.formError}>{error || localError}</p>}

                    <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                        <div>
                            <label htmlFor="code" className={styles.label}>{t('code')}</label>
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
                             <label htmlFor="label" className={styles.label}>{t('label')}</label>
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
                        <label htmlFor="description" className={styles.label}>{t('description')}</label>
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
                        <label className={styles.label}>{t('position3d')}</label>
                        <div className={`${styles.grid} ${styles['grid-cols-3']}`}>
                            <div>
                                <label htmlFor="x" className={`${styles.label} pl-1`}>{t('x_axis')}</label>
                                <input id="x" type="number" name="x" step="0.01" value={formData.position.x} onChange={handlePosChange} placeholder="X" className={styles.input} />
                            </div>
                            <div>
                                <label htmlFor="y" className={`${styles.label} pl-1`}>{t('y_axis')}</label>
                                <input id="y" type="number" name="y" step="0.01" value={formData.position.y} onChange={handlePosChange} placeholder="Y" className={styles.input} />
                            </div>
                            <div>
                                <label htmlFor="z" className={`${styles.label} pl-1`}>{t('z_axis')}</label>
                                <input id="z" type="number" name="z" step="0.01" value={formData.position.z} onChange={handlePosChange} placeholder="Z" className={styles.input} />
                            </div>
                        </div>
                    </div>
                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}>{t('cancel')}</button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className={styles.saveButton}
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
