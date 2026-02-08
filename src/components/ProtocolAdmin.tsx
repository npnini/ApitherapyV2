
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { Protocol } from '../types/protocol';
import { StingPoint as AcuPoint } from '../types/apipuncture';
import { Trash2, Edit, Plus, Loader, Save, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ProtocolAdmin.module.css';

// A type for the form state, where points are an array of strings (IDs)
interface ProtocolFormState extends Omit<Protocol, 'points'> {
    points: string[];
}

const ProtocolAdmin: React.FC = () => {
    const { t } = useTranslation();
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [allAcuPoints, setAllAcuPoints] = useState<AcuPoint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isFormLoading, setIsFormLoading] = useState<boolean>(false);
    const [editingProtocol, setEditingProtocol] = useState<Partial<ProtocolFormState> | null>(null);
    const [deletingProtocol, setDeletingProtocol] = useState<Protocol | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const fetchProtocolsAndPoints = useCallback(async () => {
        setIsLoading(true);
        try {
            const protocolsCollection = collection(db, 'protocols');
            const protocolSnapshot = await getDocs(protocolsCollection);
            const protocolsList = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Protocol).sort((a,b) => a.name.localeCompare(b.name));
            setProtocols(protocolsList);

            const pointsCollection = collection(db, 'acupuncture_points');
            const pointsSnapshot = await getDocs(pointsCollection);
            const pointsList = pointsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AcuPoint)).sort((a,b) => a.code.localeCompare(b.code));
            setAllAcuPoints(pointsList);

        } catch (error) {
            console.error("Error fetching data:", error);
            alert('Could not fetch data.');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchProtocolsAndPoints();
    }, [fetchProtocolsAndPoints]);

    const validateProtocolForm = (protocol: Partial<ProtocolFormState>): boolean => {
        if (!protocol.name?.trim()) {
            setFormError(t('protocol_name_required'));
            return false;
        }
        if (!protocol.description?.trim()) {
            setFormError(t('protocol_description_required'));
            return false;
        }
        if (!protocol.rationale?.trim()) {
            setFormError(t('protocol_rationale_required'));
            return false;
        }
        if (!protocol.points || protocol.points.length === 0) {
            setFormError(t('at_least_one_point'));
            return false;
        }

        const isNewProtocol = !protocol.id;
        if (isNewProtocol) {
            const nameExists = protocols.some(p => p.name.toLowerCase() === protocol.name.trim().toLowerCase() && p.id !== protocol.id);
            if (nameExists) {
                setFormError(t('protocol_name_exists'));
                return false;
            }
        }

        setFormError(null);
        return true;
    }

    const handleSave = async () => {
        if (!editingProtocol) return;

        if (!validateProtocolForm(editingProtocol)) {
            return;
        }

        setIsFormLoading(true);

        try {
            const protocolToSave: Omit<ProtocolFormState, 'id'> = {
                name: editingProtocol.name!.trim(),
                description: editingProtocol.description!.trim(),
                rationale: editingProtocol.rationale!.trim(),
                points: editingProtocol.points!,
            };

            if (editingProtocol.id) {
                const protocolRef = doc(db, 'protocols', editingProtocol.id);
                await updateDoc(protocolRef, protocolToSave);
            } else {
                await addDoc(collection(db, 'protocols'), protocolToSave);
            }
            setEditingProtocol(null);
            fetchProtocolsAndPoints(); 
        } catch (error) {
            setFormError(t('failed_to_save_protocol'));
            console.error("Error saving protocol:", error);
        }
        setIsFormLoading(false);
    };

    const confirmDelete = async () => {
        if (!deletingProtocol) return;

        setIsLoading(true);
        try {
            await deleteDoc(doc(db, 'protocols', deletingProtocol.id));
            fetchProtocolsAndPoints();
        } catch (error) {
            console.error("Error deleting protocol:", error);
            alert(t('failed_to_delete_protocol'));
        }
        setIsLoading(false);
        setDeletingProtocol(null);
    };
    
    const handleStartEditing = (proto: Protocol) => {
        const pointIds = (proto.points || []).map(p => typeof p === 'string' ? p : (p as AcuPoint).id);
        setFormError(null);
        setEditingProtocol({ ...proto, points: pointIds });
    };

    const handleStartNew = () => {
        setFormError(null);
        setEditingProtocol({ name: '', description: '', rationale: '', points: [] });
    }

    const renderProtocolForm = () => {
        if (!editingProtocol) return null;
        
        const handlePointSelection = (pointId: string) => {
            const currentPoints = editingProtocol.points || [];
            const newPoints =
                currentPoints.includes(pointId)
                    ? currentPoints.filter(id => id !== pointId)
                    : [...currentPoints, pointId];
            setEditingProtocol({ ...editingProtocol, points: newPoints });
        };

        return (
             <div className={styles.modalOverlay}>
                <div className={styles.modalContent}>
                    <h2 className={styles.modalTitle}>{editingProtocol.id ? t('edit_protocol') : t('add_new_protocol') }</h2>
                    
                    {formError && <p className={styles.formError}>{formError}</p>}

                    {isFormLoading ? <div className={styles.formLoader}><Loader className={styles.loader} size={32} /></div> : (
                    <div className={styles.formGrid}>
                        <div>
                          <label htmlFor='protocolName' className={styles.formLabel}>{t('protocol_name')}</label>
                          <input
                              id='protocolName'
                              type="text"
                              placeholder={t('protocol_name_placeholder')}
                              value={editingProtocol.name || ''}
                              onChange={(e) => setEditingProtocol({ ...editingProtocol, name: e.target.value })}
                              className={styles.formInput}
                          />
                        </div>
                        <div>
                          <label htmlFor='protocolDescription' className={styles.formLabel}>{t('protocol_description')}</label>
                          <textarea
                              id='protocolDescription'
                              placeholder={t('protocol_description_placeholder')}
                              value={editingProtocol.description || ''}
                              onChange={(e) => setEditingProtocol({ ...editingProtocol, description: e.target.value })}
                              className={styles.formTextarea}
                          />
                        </div>
                        <div>
                          <label htmlFor='protocolRationale' className={styles.formLabel}>{t('protocol_rationale')}</label>
                          <textarea
                              id='protocolRationale'
                              placeholder={t('protocol_rationale_placeholder')}
                              value={editingProtocol.rationale || ''}
                              onChange={(e) => setEditingProtocol({ ...editingProtocol, rationale: e.target.value })}
                              className={styles.formTextarea}
                          />
                        </div>
                        <div>
                            <h3 className={styles.formLabel}>{t('select_points')}</h3>
                            <div className={styles.pointsSelectionContainer}>
                                {allAcuPoints.map(point => (
                                    <label key={point.id} className={`${styles.pointLabel} ${(editingProtocol.points || []).includes(point.id) ? styles.pointLabelSelected : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={(editingProtocol.points || []).includes(point.id)}
                                            onChange={() => handlePointSelection(point.id)}
                                            className={styles.pointCheckbox}
                                        />
                                        <span className={styles.pointCode}>{point.code}</span>
                                        <span className={styles.pointLabelText}>{point.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                    )}
                    <div className={styles.modalActions}>
                        <button onClick={() => setEditingProtocol(null)} className={styles.cancelButton}>{t('cancel')}</button>
                        <button onClick={handleSave} disabled={isFormLoading} className={styles.saveButton}>
                           <Save size={16} className={styles.saveButtonIcon}/> {isFormLoading ? t('saving') : t('save_protocol')}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderDeleteConfirmation = () => {
        if (!deletingProtocol) return null;

        return (
            <div className={styles.modalOverlay}>
                <div className={styles.deleteModalContent}>
                    <div className={styles.deleteModalHeader}>
                        <div className={styles.deleteModalIconContainer}>
                           <AlertTriangle className={styles.deleteModalIcon} aria-hidden="true" />
                        </div>
                        <div>
                            <h2 className={styles.deleteModalTitle}>{t('delete_protocol')}</h2>
                            <p className={styles.deleteModalText}>{t('delete_protocol_confirmation', { name: deletingProtocol.name })}</p>
                        </div>
                    </div>
                    <div className={styles.deleteModalActions}>
                        <button onClick={() => setDeletingProtocol(null)} className={styles.deleteCancelButton}>{t('cancel')}</button>
                        <button onClick={confirmDelete} className={styles.confirmDeleteButton}>{t('confirm_delete')}</button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('protocol_configuration')}</h1>
                <button onClick={handleStartNew} className={styles.addButton}>
                    <Plus size={18} className={styles.addButtonIcon}/>{t('add_new_protocol')}
                </button>
            </div>

            {isLoading ? <div className={styles.loaderContainer}><Loader className={styles.loader} size={40}/></div> : (
                <div className={styles.protocolListContainer}>
                    <ul className={styles.protocolList}>
                        {protocols.length === 0 ? (
                            <p className={styles.emptyList}>{t('no_protocols_found')}</p>
                        ) : protocols.map(protocol => (
                            <li key={protocol.id} className={styles.protocolItem}>
                                <div>
                                    <p className={styles.protocolName}>{protocol.name}</p>
                                    <p className={styles.protocolDescription}>{protocol.description}</p>
                                    <p className={styles.protocolPoints}>{t('points_count', { count: (protocol.points || []).length })}</p>
                                </div>
                                <div className={styles.actionButtons}>
                                    <button onClick={() => handleStartEditing(protocol)} className={styles.editButton}><Edit size={18} /></button>
                                    <button onClick={() => protocol.id && setDeletingProtocol(protocol)} className={styles.deleteButton}><Trash2 size={18} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {renderProtocolForm()}
            {renderDeleteConfirmation()}
        </div>
    );
};

export default ProtocolAdmin;
