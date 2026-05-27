import React, { useState, useEffect, useCallback } from 'react';
import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    serverTimestamp,
    query,
    orderBy,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { PatientDocument } from '../../types/patient';
import { uploadFile, deleteFile } from '../../services/storageService';
import Modal from '../common/Modal';
import ConfirmationModal from '../ConfirmationModal';
import { T, useT } from '../T';
import { FileText, Image as ImageIcon, Trash2, ExternalLink, Plus, Loader, Search } from 'lucide-react';
import styles from './PatientIntake.module.css';
import docStyles from './DocumentsTab.module.css';

interface DocumentsTabProps {
    patientId: string | undefined;
}

const DocumentsTab: React.FC<DocumentsTabProps> = ({ patientId }) => {
    const [documents, setDocuments] = useState<PatientDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // New document form state
    const [newDescription, setNewDescription] = useState('');
    const [newType, setNewType] = useState<'Document' | 'Image'>('Document');
    const [newFile, setNewFile] = useState<File | null>(null);

    // Delete state
    const [documentToDelete, setDocumentToDelete] = useState<PatientDocument | null>(null);

    // File input ref for custom button
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const tSearch = useT('Search...');
    const tNewDocument = useT('New Document');
    const tDescription = useT('Description');
    const tType = useT('Type');
    const tFile = useT('File');
    const tSave = useT('Save');
    const tCancel = useT('Cancel');
    const tNewPatientWarning = useT('Save the patient first before uploading documents.');
    const tChooseFile = useT('Choose file');
    const tNoFileChosen = useT('No file chosen');
    const tDocument = useT('Document');
    const tImage = useT('Image');

    const loadDocuments = useCallback(async () => {
        if (!patientId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const q = query(
                collection(db, 'patient_medical_data', patientId, 'documents'),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PatientDocument));
            setDocuments(docs);
        } catch (err) {
            console.error('DocumentsTab: Failed to load documents:', err);
        } finally {
            setIsLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    const filteredDocuments = documents.filter(d =>
        d.description.toLowerCase().includes(searchText.toLowerCase())
    );

    const handleOpenDocument = async (document: PatientDocument) => {
        try {
            const url = await getDownloadURL(ref(storage, document.url));
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('DocumentsTab: Failed to open document:', err);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!documentToDelete || !patientId) return;
        try {
            await deleteFile(documentToDelete.url);
            await deleteDoc(
                doc(db, 'patient_medical_data', patientId, 'documents', documentToDelete.id)
            );
            setDocuments(prev => prev.filter(d => d.id !== documentToDelete.id));
        } catch (err) {
            console.error('DocumentsTab: Failed to delete document:', err);
        }
        setDocumentToDelete(null);
    };

    const handleSaveNew = async () => {
        if (!newFile || !newDescription.trim() || !patientId) return;
        setIsUploading(true);
        try {
            const fullPath = await uploadFile(newFile, `Patients/${patientId}`);
            const docRef = await addDoc(
                collection(db, 'patient_medical_data', patientId, 'documents'),
                {
                    url: fullPath,
                    description: newDescription.trim(),
                    type: newType,
                    createdAt: serverTimestamp(),
                }
            );
            const newDoc: PatientDocument = {
                id: docRef.id,
                url: fullPath,
                description: newDescription.trim(),
                type: newType,
                createdAt: new Date() as any,
            };
            setDocuments(prev => [newDoc, ...prev]);
            closeNewModal();
        } catch (err) {
            console.error('DocumentsTab: Failed to upload document:', err);
        } finally {
            setIsUploading(false);
        }
    };

    const closeNewModal = () => {
        setShowNewModal(false);
        setNewDescription('');
        setNewType('Document');
        setNewFile(null);
    };

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return '';
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString();
    };

    const getTypeLabel = (type: string): string => {
        return type === 'Image' ? tImage : tDocument;
    };

    // Guard: patient must be saved before uploading documents
    if (!patientId) {
        return (
            <div className={styles.placeholderTab}>
                <h2><T>Documents</T></h2>
                <p>{tNewPatientWarning}</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className={styles.placeholderTab}>
                <Loader className={docStyles.spinner} size={48} />
            </div>
        );
    }

    return (
        <div className={docStyles.container}>
            {/* Toolbar */}
            <div className={docStyles.toolbar}>
                <div className={docStyles.searchWrapper}>
                    <Search size={16} className={docStyles.searchIcon} />
                    <input
                        type="text"
                        className={docStyles.searchInput}
                        placeholder={tSearch}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                </div>
                <button className={docStyles.btnNew} onClick={() => setShowNewModal(true)}>
                    <Plus size={16} />
                    <T>New</T>
                </button>
            </div>

            {/* Document list */}
            {filteredDocuments.length === 0 ? (
                <div className={docStyles.emptyState}>
                    {searchText
                        ? <T>No documents match your search.</T>
                        : <T>No documents yet. Click New to add one.</T>
                    }
                </div>
            ) : (
                <div className={docStyles.list}>
                    {filteredDocuments.map(document => (
                        <div
                            key={document.id}
                            className={docStyles.listRow}
                            onClick={() => handleOpenDocument(document)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && handleOpenDocument(document)}
                        >
                            <div className={docStyles.rowIcon}>
                                {document.type === 'Image'
                                    ? <ImageIcon size={20} />
                                    : <FileText size={20} />
                                }
                            </div>
                            <div className={docStyles.rowDescription}>{document.description}</div>
                            <div className={docStyles.rowType}>{getTypeLabel(document.type)}</div>
                            <div className={docStyles.rowDate}>{formatDate(document.createdAt)}</div>
                            <div className={docStyles.rowActions}>
                                <button
                                    className={docStyles.btnRowAction}
                                    onClick={e => { e.stopPropagation(); handleOpenDocument(document); }}
                                    title="Open"
                                    aria-label="Open document"
                                >
                                    <ExternalLink size={16} />
                                </button>
                                <button
                                    className={`${docStyles.btnRowAction} ${docStyles.btnDelete}`}
                                    onClick={e => { e.stopPropagation(); setDocumentToDelete(document); }}
                                    title="Delete"
                                    aria-label="Delete document"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* New Document Modal */}
            <Modal isOpen={showNewModal} onClose={closeNewModal} title={tNewDocument}>
                <div className={docStyles.formGroup}>
                    <label className={docStyles.label}>{tDescription} *</label>
                    <input
                        type="text"
                        className={docStyles.input}
                        value={newDescription}
                        onChange={e => setNewDescription(e.target.value)}
                        placeholder={tDescription}
                        autoFocus
                    />
                </div>

                <div className={docStyles.formGroup}>
                    <label className={docStyles.label}>{tType}</label>
                    <div className={docStyles.radioGroup}>
                        <label className={docStyles.radioLabel}>
                            <input
                                type="radio"
                                value="Document"
                                checked={newType === 'Document'}
                                onChange={() => setNewType('Document')}
                            />
                            {tDocument}
                        </label>
                        <label className={docStyles.radioLabel}>
                            <input
                                type="radio"
                                value="Image"
                                checked={newType === 'Image'}
                                onChange={() => setNewType('Image')}
                            />
                            {tImage}
                        </label>
                    </div>
                </div>

                <div className={docStyles.formGroup}>
                    <label className={docStyles.label}>{tFile} *</label>
                    <div className={docStyles.fileInputWrapper}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            className={docStyles.fileInputHidden}
                            accept={newType === 'Image' ? 'image/*' : undefined}
                            onChange={e => setNewFile(e.target.files?.[0] ?? null)}
                        />
                        <button
                            type="button"
                            className={docStyles.fileButton}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {tChooseFile}
                        </button>
                        <span className={docStyles.fileLabel}>
                            {newFile?.name || tNoFileChosen}
                        </span>
                    </div>
                </div>

                {isUploading && (
                    <div className={docStyles.uploadProgress}>
                        <Loader size={18} className={docStyles.spinner} />
                        <T>Uploading...</T>
                    </div>
                )}

                <div className={docStyles.modalActions}>
                    <button
                        className={docStyles.btnSecondary}
                        onClick={closeNewModal}
                        disabled={isUploading}
                    >
                        {tCancel}
                    </button>
                    <button
                        className={docStyles.btnPrimary}
                        onClick={handleSaveNew}
                        disabled={!newFile || !newDescription.trim() || isUploading}
                    >
                        {tSave}
                    </button>
                </div>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmationModal
                isOpen={!!documentToDelete}
                title={<T>Delete Document?</T>}
                message={<T>Are you sure you want to delete this document? This action cannot be undone.</T>}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDocumentToDelete(null)}
                showCancelButton
                type="error"
            />
        </div>
    );
};

export default DocumentsTab;
