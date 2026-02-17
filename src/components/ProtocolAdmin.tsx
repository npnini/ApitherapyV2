
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { Protocol } from '../types/protocol';
import { StingPoint as AcuPoint } from '../types/apipuncture';
import { Trash2, Edit, Plus, Loader, Save, AlertTriangle, FileUp, FileDown, FileCheck2, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ProtocolAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';


// A type for the form state, where points are an array of strings (IDs)
interface ProtocolFormState extends Omit<Protocol, 'points'> {
    points: string[];
}

const ProtocolAdmin: React.FC = () => {
    const { t } = useTranslation();
    const [user, setUser] = useState<User | null>(null);
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [allAcuPoints, setAllAcuPoints] = useState<AcuPoint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isFormLoading, setIsFormLoading] = useState<boolean>(false);
    const [editingProtocol, setEditingProtocol] = useState<Partial<ProtocolFormState> | null>(null);
    const [deletingProtocol, setDeletingProtocol] = useState<Protocol | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    const fetchProtocolsAndPoints = useCallback(async () => {
        if (!user) {
            setIsLoading(false);
            setProtocols([]);
            setAllAcuPoints([]);
            return;
        }

        setIsLoading(true);
        try {
            const [protocolSnapshot, pointsSnapshot] = await Promise.all([
                getDocs(collection(db, 'protocols')),
                getDocs(collection(db, 'acupuncture_points'))
            ]);

            const protocolsList = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Protocol).sort((a,b) => a.name.localeCompare(b.name));
            setProtocols(protocolsList);

            const pointsList = pointsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AcuPoint)).sort((a,b) => a.code.localeCompare(b.code));
            setAllAcuPoints(pointsList);

        } catch (error) {
            console.error("Error fetching data:", error);
            setFormError(t('could_not_fetch_data'));
        }
        setIsLoading(false);
    }, [user, t]);

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
        if (!protocol.points || protocol.points.length === 0) {
            setFormError(t('at_least_one_point'));
            return false;
        }

        const isNewProtocol = !protocol.id;
        if (isNewProtocol) {
            const nameExists = protocols.some(p => p.name.toLowerCase() === protocol.name!.trim().toLowerCase() && p.id !== protocol.id);
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
            let documentUrl = editingProtocol.documentUrl;
            if (fileToDelete) {
                await deleteFile(fileToDelete);
                documentUrl = undefined;
            }

            if (fileToUpload) {
                if (documentUrl) {
                    await deleteFile(documentUrl);
                }
                documentUrl = await uploadFile(fileToUpload, 'Protocols');
            }

            const protocolToSave: any = {
                name: editingProtocol.name!.trim(),
                description: editingProtocol.description!.trim(),
                rationale: editingProtocol.rationale!.trim(),
                points: editingProtocol.points!,
                documentUrl: documentUrl || null,
            };

            if (editingProtocol.id) {
                const protocolRef = doc(db, 'protocols', editingProtocol.id);
                await updateDoc(protocolRef, protocolToSave);
            } else {
                await addDoc(collection(db, 'protocols'), protocolToSave);
            }
            setEditingProtocol(null);
            setFileToUpload(null);
            setFileToDelete(null);
            setIsDirty(false);
            fetchProtocolsAndPoints();
        } catch (error) {
            setFormError(t('failed_to_save_protocol'));
            console.error("Error saving protocol:", error);
        } finally {
            setIsFormLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingProtocol) return;

        setIsLoading(true);
        try {
            if (deletingProtocol.documentUrl) {
                await deleteFile(deletingProtocol.documentUrl);
            }
            await deleteDoc(doc(db, 'protocols', deletingProtocol.id));
            fetchProtocolsAndPoints();
        } catch (error) {
            console.error("Error deleting protocol:", error);
            setFormError(t('failed_to_delete_protocol'));
        } finally {
            setIsLoading(false);
            setDeletingProtocol(null);
        }
    };

    const handleFileDelete = (protocol: Partial<ProtocolFormState>) => {
        if (!protocol.documentUrl) return;
        setFileToDelete(protocol.documentUrl);
        onUpdate({ ...protocol, documentUrl: undefined });
    };

    const onUpdate = (protocol: Partial<ProtocolFormState>) => {
        setEditingProtocol(protocol);
        setIsDirty(true);
    }
    
    const handleStartEditing = (proto: Protocol) => {
        const pointIds = (proto.points || []).map((p: AcuPoint | string) => typeof p === 'string' ? p : (p as AcuPoint).id);
        setFormError(null);
        setFileToUpload(null);
        setFileToDelete(null);
        setIsDirty(false);
        setEditingProtocol({ ...proto, points: pointIds });
    };

    const handleStartNew = () => {
        setFormError(null);
        setFileToUpload(null);
        setFileToDelete(null);
        setIsDirty(false);
        setEditingProtocol({ name: '', description: '', rationale: '', points: [] });
    }

    const onCancel = () => {
        setEditingProtocol(null);
        setFileToUpload(null);
        setFileToDelete(null);
        setIsDirty(false);
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('protocol_configuration')}</h1>
                <button onClick={handleStartNew} className={styles.addButton}>
                    <Plus size={18} className={styles.addButtonIcon}/>{t('add_new_protocol')}
                </button>
            </div>
            {formError && <p className={styles.errorBox}>{formError}</p>}

            {isLoading ? <div className={styles.loaderContainer}><Loader className={styles.loader} size={40}/></div> : (
                <div className={styles.protocolListContainer}>
                     <table className={styles.table}>
                        <thead className={styles.tableHeader}>
                            <tr>
                                <th scope="col" className={styles.headerCell}>{t('protocol_name')}</th>
                                <th scope="col" className={styles.headerCell}>{t('description')}</th>
                                <th scope="col" className={`${styles.headerCell} ${styles.documentCell}`}>{t('document')}</th>
                                <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}>
                                    {t('actions')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {protocols.length === 0 ? (
                                <tr><td colSpan={4} className={styles.emptyCell}>{t('no_protocols_found')}</td></tr>
                            ) : protocols.map(protocol => (
                                <tr key={protocol.id} className={styles.tableRow}>
                                    <td className={`${styles.cell} ${styles.protocolName}`}>{protocol.name}</td>
                                    <td className={styles.cell}>{protocol.description}</td>
                                    <td className={`${styles.cell} ${styles.documentCell}`}>
                                        {protocol.documentUrl && (
                                            <a href={protocol.documentUrl} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                <FileCheck2 size={18}/>
                                            </a>
                                        )}
                                    </td>
                                    <td className={`${styles.cell} ${styles.actionsCell}`}>
                                        <button onClick={() => handleStartEditing(protocol)} className={styles.actionButton}><Edit size={18} /></button>
                                        <button onClick={() => protocol.id && setDeletingProtocol(protocol)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingProtocol && <EditProtocolForm
                protocol={editingProtocol}
                allAcuPoints={allAcuPoints}
                onSave={handleSave}
                onCancel={onCancel}
                onUpdate={onUpdate}
                error={formError}
                isSubmitting={isFormLoading}
                onFileChange={(file) => {
                    setFileToUpload(file);
                    setIsDirty(true);
                }}
                onFileDelete={handleFileDelete}
                isDirty={isDirty}
            />}

            {deletingProtocol && <DeleteConfirmationModal
                protocol={deletingProtocol}
                onConfirm={confirmDelete}
                onCancel={() => setDeletingProtocol(null)}
                isSubmitting={isLoading}
            />}
        </div>
    );
};

interface EditProtocolFormProps {
    protocol: Partial<ProtocolFormState>;
    allAcuPoints: AcuPoint[];
    onSave: () => void;
    onCancel: () => void;
    onUpdate: (protocol: Partial<ProtocolFormState>) => void;
    error: string | null;
    isSubmitting: boolean;
    onFileChange: (file: File | null) => void;
    onFileDelete: (protocol: Partial<ProtocolFormState>) => void;
    isDirty: boolean;
}

const EditProtocolForm: React.FC<EditProtocolFormProps> = ({ protocol, allAcuPoints, onSave, onCancel, onUpdate, error, isSubmitting, onFileChange, onFileDelete, isDirty }) => {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

    const handlePointSelection = (pointId: string) => {
        const currentPoints = protocol.points || [];
        const newPoints =
            currentPoints.includes(pointId)
                ? currentPoints.filter(id => id !== pointId)
                : [...currentPoints, pointId];
        onUpdate({ ...protocol, points: newPoints });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (file) {
            setSelectedFileName(file.name);
            onFileChange(file);
        } else {
            setSelectedFileName(null);
            onFileChange(null);
        }
    };

    return (
        <div className={styles.modalOverlay}>
           <div className={styles.modalContent}>
                <div className={styles.formTitleContainer}>
                    <h2 className={styles.formTitle}>{protocol.id ? t('edit_protocol') : t('add_new_protocol') }</h2>
                </div>
                {error && <p className={styles.formError}>{error}</p>}
                <div className={styles.formGrid}>
                    {isSubmitting ? <div className={styles.formLoader}><Loader className={styles.loader} size={32} /></div> : (
                    <>
                        <div>
                            <label htmlFor='protocolName' className={styles.formLabel}>
                            {t('protocol_name')}
                            <span className={styles.requiredAsterisk}>*</span>
                            </label>
                            <input
                                id='protocolName'
                                type="text"
                                placeholder={t('protocol_name_placeholder')}
                                value={protocol.name || ''}
                                onChange={(e) => onUpdate({ ...protocol, name: e.target.value })}
                                className={styles.formInput}
                            />
                        </div>
                        <div>
                            <label htmlFor='protocolDescription' className={styles.formLabel}>
                            {t('protocol_description')}
                            <span className={styles.requiredAsterisk}>*</span>
                            </label>
                            <textarea
                                id='protocolDescription'
                                placeholder={t('protocol_description_placeholder')}
                                value={protocol.description || ''}
                                onChange={(e) => onUpdate({ ...protocol, description: e.target.value })}
                                className={styles.formTextarea}
                            />
                        </div>
                        <div>
                            <label htmlFor='protocolRationale' className={styles.formLabel}>{t('protocol_rationale')}</label>
                            <textarea
                                id='protocolRationale'
                                placeholder={t('protocol_rationale_placeholder')}
                                value={protocol.rationale || ''}
                                onChange={(e) => onUpdate({ ...protocol, rationale: e.target.value })}
                                className={styles.formTextarea}
                            />
                        </div>
                        <div>
                            <h3 className={styles.formLabel}>
                                {t('select_points')}
                                <span className={styles.requiredAsterisk}>*</span>
                            </h3>
                            <div className={styles.pointsSelectionContainer}>
                                {allAcuPoints.map(point => (
                                    <label key={point.id} className={`${styles.pointLabel} ${(protocol.points || []).includes(point.id) ? styles.pointLabelSelected : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={(protocol.points || []).includes(point.id)}
                                            onChange={() => handlePointSelection(point.id)}
                                            className={styles.pointCheckbox}
                                        />
                                        <span className={styles.pointCode}>{point.code}</span>
                                        <span className={styles.pointLabelText}>{point.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Document Management Section */}
                        <div className={styles.documentSection}>
                            <label className={styles.formLabel}>{t('protocol_document')}</label>

                            {!protocol.documentUrl && !selectedFileName && (
                                <p className={styles.noDocument}>{t('no_document_attached')}</p>
                            )}

                            {selectedFileName && (
                                <p className={styles.fileName}>{t('selected_file')}: {selectedFileName}</p>
                            )}

                            <div className={styles.documentButtonRow}>
                                {protocol.documentUrl && (
                                    <button
                                        type="button"
                                        onClick={() => window.open(protocol.documentUrl, '_blank')}
                                        className={`${styles.documentActionButton} ${styles.documentViewButton}`}
                                        disabled={isSubmitting}
                                    >
                                        <FileDown size={16} /> {t('view_document')}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`${styles.documentActionButton} ${styles.documentUploadButton}`}
                                    disabled={isSubmitting}
                                >
                                    <FileUp size={16} /> 
                                    {protocol.documentUrl ? t('replace_document') : t('upload_document')}
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    className={styles.fileInput}
                                    accept=".pdf,.doc,.docx,.jpg,.png"
                                />

                                {protocol.documentUrl && (
                                    <button
                                        type="button"
                                        onClick={() => onFileDelete(protocol)}
                                        disabled={isSubmitting}
                                        className={`${styles.documentActionButton} ${styles.documentDeleteButton}`}
                                    >
                                        <XSquare size={16} /> {t('delete_document')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                    )}
                </div>
               <div className={styles.modalActions}>
                   <button onClick={onCancel} className={styles.cancelButton}>{t('cancel')}</button>
                   <button onClick={onSave} disabled={isSubmitting || !isDirty} className={styles.saveButton}>
                      <Save size={16} /> {isSubmitting ? t('saving') : t('save_protocol')}
                   </button>
               </div>
           </div>
       </div>
    );
}

interface DeleteConfirmationModalProps {
    protocol: Protocol;
    onConfirm: () => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ protocol, onConfirm, onCancel, isSubmitting }) => {
    const { t } = useTranslation();
    return (
        <div className={styles.modalOverlay}>
            <div className={styles.deleteModalContent}>
                <div className={styles.deleteModalHeader}>
                    <div className={styles.deleteModalIconContainer}>
                       <AlertTriangle className={styles.deleteModalIcon} aria-hidden="true" />
                    </div>
                    <div>
                        <h2 className={styles.deleteModalTitle}>{t('delete_protocol')}</h2>
                        <p className={styles.deleteModalText}>{t('delete_protocol_confirmation', { name: protocol.name })}</p>
                    </div>
                </div>
                <div className={styles.deleteModalActions}>
                    <button onClick={onCancel} className={styles.deleteCancelButton} disabled={isSubmitting}>{t('cancel')}</button>
                    <button onClick={onConfirm} className={styles.confirmDeleteButton} disabled={isSubmitting}>
                        {isSubmitting ? t('deleting') : t('confirm_delete')}
                    </button>
                </div>
            </div>
        </div>
    )
}


export default ProtocolAdmin;
