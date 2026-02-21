import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { Protocol } from '../types/protocol';
import { StingPoint as AcuPoint } from '../types/apipuncture';
import { Trash2, Edit, Plus, Loader, Save, AlertTriangle, FileUp, FileDown, FileCheck2, XSquare, X, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ProtocolAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';
import DocumentManagement from './shared/DocumentManagement';


// A type for the form state, where points are an array of strings (IDs)
interface ProtocolFormState extends Omit<Protocol, 'points'> {
    points: string[];
}

const ProtocolAdmin: React.FC = () => {
    const { t, i18n } = useTranslation();
    const currentLang = i18n.language;
    const [user, setUser] = useState<User | null>(null);
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [allAcuPoints, setAllAcuPoints] = useState<AcuPoint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isFormLoading, setIsFormLoading] = useState<boolean>(false);
    const [editingProtocol, setEditingProtocol] = useState<Partial<ProtocolFormState> | null>(null);
    const [deletingProtocol, setDeletingProtocol] = useState<Protocol | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });

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

            const protocolsList = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Protocol).sort((a, b) => {
                const nameA = (typeof a.name === 'object' ? a.name[appConfig.defaultLanguage] || Object.values(a.name)[0] || '' : a.name).toLowerCase();
                const nameB = (typeof b.name === 'object' ? b.name[appConfig.defaultLanguage] || Object.values(b.name)[0] || '' : b.name).toLowerCase();
                return nameA.localeCompare(nameB);
            });
            setProtocols(protocolsList);

            const pointsList = pointsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AcuPoint)).sort((a, b) => a.code.localeCompare(b.code));
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
        const nameValues = Object.values(protocol.name || {}).map(v => v.trim()).filter(Boolean);
        if (nameValues.length === 0) {
            setFormError(t('protocol_name_required'));
            return false;
        }

        const descriptionValues = Object.values(protocol.description || {}).map(v => v.trim()).filter(Boolean);
        if (descriptionValues.length === 0) {
            setFormError(t('protocol_description_required'));
            return false;
        }

        if (!protocol.points || protocol.points.length === 0) {
            setFormError(t('at_least_one_point'));
            return false;
        }

        const isNewProtocol = !protocol.id;
        if (isNewProtocol) {
            const currentName = typeof protocol.name === 'object' ? (protocol.name[appConfig.defaultLanguage] || Object.values(protocol.name)[0] || '').trim().toLowerCase() : '';
            if (currentName) {
                const nameExists = protocols.some(p => {
                    const pName = typeof p.name === 'object' ? (p.name[appConfig.defaultLanguage] || Object.values(p.name)[0] || '').trim().toLowerCase() : (p.name as string).toLowerCase();
                    return pName === currentName && p.id !== protocol.id;
                });
                if (nameExists) {
                    setFormError(t('protocol_name_exists'));
                    return false;
                }
            }
        }

        setFormError(null);
        return true;
    }

    const handleSave = async (lang: string) => {
        if (!editingProtocol) return;

        if (!validateProtocolForm(editingProtocol)) {
            return;
        }

        setIsFormLoading(true);

        try {
            let documentUrl: { [key: string]: string } = {};

            if (editingProtocol.documentUrl) {
                if (typeof editingProtocol.documentUrl === 'string') {
                    documentUrl = { en: editingProtocol.documentUrl };
                } else {
                    documentUrl = { ...editingProtocol.documentUrl };
                }
            }

            const originalProtocol = editingProtocol.id ? protocols.find(p => p.id === editingProtocol.id) : null;
            const originalUrlForLang = originalProtocol?.documentUrl
                ? (typeof originalProtocol.documentUrl === 'object' ? (originalProtocol.documentUrl as any)[lang] : (lang === 'en' ? originalProtocol.documentUrl : undefined))
                : undefined;

            const wasRemoved = originalUrlForLang && !documentUrl[lang];

            if (fileToUpload) {
                if (originalUrlForLang) {
                    await deleteFile(originalUrlForLang);
                }
                const newUrl = await uploadFile(fileToUpload, `Protocols/${editingProtocol.id || 'new'}`);
                documentUrl[lang] = newUrl;
            } else if (wasRemoved) {
                await deleteFile(originalUrlForLang!);
            }

            const protocolToSave: any = {
                name: typeof editingProtocol.name === 'object' ? editingProtocol.name : { [appConfig.defaultLanguage]: editingProtocol.name },
                description: typeof editingProtocol.description === 'object' ? editingProtocol.description : { [appConfig.defaultLanguage]: editingProtocol.description },
                rationale: typeof editingProtocol.rationale === 'object' ? editingProtocol.rationale : { [appConfig.defaultLanguage]: editingProtocol.rationale },
                points: editingProtocol.points!,
                documentUrl: documentUrl,
            };

            if (editingProtocol.id) {
                const protocolRef = doc(db, 'protocols', editingProtocol.id);
                await updateDoc(protocolRef, protocolToSave);
            } else {
                await addDoc(collection(db, 'protocols'), protocolToSave);
            }
            setEditingProtocol(null);
            setFileToUpload(null);
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
                if (typeof deletingProtocol.documentUrl === 'object') {
                    for (const url of Object.values(deletingProtocol.documentUrl)) {
                        await deleteFile(url);
                    }
                } else if (typeof deletingProtocol.documentUrl === 'string') { // Legacy
                    await deleteFile(deletingProtocol.documentUrl);
                }
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

    const handleFileDelete = (protocol: Partial<ProtocolFormState>, lang: string) => {
        if (!protocol.documentUrl) return;

        const newDocUrls = { ...(typeof protocol.documentUrl === 'object' ? protocol.documentUrl : { en: protocol.documentUrl }) };
        delete (newDocUrls as Record<string, any>)[lang];

        onUpdate({ ...protocol, documentUrl: newDocUrls });
        setFileToUpload(null);
    };

    const onUpdate = (protocol: Partial<ProtocolFormState>) => {
        setEditingProtocol(protocol);
        setIsDirty(true);
    }

    const handleStartEditing = (proto: Protocol) => {
        const pointIds = (proto.points || []).map((p: AcuPoint | string) => typeof p === 'string' ? p : (p as AcuPoint).id);
        setFormError(null);
        setFileToUpload(null);
        setIsDirty(false);
        setEditingProtocol({
            ...proto,
            points: pointIds,
            name: typeof proto.name === 'string' ? { [appConfig.defaultLanguage]: proto.name } : proto.name,
            description: typeof proto.description === 'string' ? { [appConfig.defaultLanguage]: proto.description } : proto.description,
            rationale: typeof proto.rationale === 'string' ? { [appConfig.defaultLanguage]: proto.rationale } : proto.rationale,
        });
    };

    const handleStartNew = () => {
        setFormError(null);
        setFileToUpload(null);
        setIsDirty(false);
        setEditingProtocol({
            name: { [appConfig.defaultLanguage]: '' },
            description: { [appConfig.defaultLanguage]: '' },
            rationale: { [appConfig.defaultLanguage]: '' },
            points: []
        });
    }

    const onCancel = () => {
        setEditingProtocol(null);
        setFileToUpload(null);
        setIsDirty(false);
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('protocol_configuration')}</h1>
                <button onClick={handleStartNew} className={styles.addButton}>
                    <Plus size={18} className={styles.addButtonIcon} />{t('add_new_protocol')}
                </button>
            </div>
            {formError && <p className={styles.errorBox}>{formError}</p>}

            {isLoading ? <div className={styles.loaderContainer}><Loader className={styles.loader} size={40} /></div> : (
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
                            ) : protocols.map(protocol => {
                                const docUrlObject = protocol.documentUrl;
                                let docUrlForLang: string | undefined;
                                let docUrlEn: string | undefined;

                                if (docUrlObject) {
                                    if (typeof docUrlObject === 'object') {
                                        docUrlForLang = docUrlObject[currentLang];
                                        docUrlEn = docUrlObject['en'];
                                    } else if (typeof docUrlObject === 'string') { // Legacy support
                                        docUrlEn = docUrlObject;
                                        if (currentLang === 'en') {
                                            docUrlForLang = docUrlObject;
                                        }
                                    }
                                }

                                const finalDocUrl = docUrlForLang || (currentLang !== 'en' ? docUrlEn : undefined);

                                return (
                                    <tr key={protocol.id} className={styles.tableRow}>
                                        <td className={`${styles.cell} ${styles.protocolName}`}>
                                            {(typeof protocol.name === 'object' ? (protocol.name[currentLang] || protocol.name[appConfig.defaultLanguage] || Object.values(protocol.name)[0]) : protocol.name) as string}
                                        </td>
                                        <td className={styles.cell}>
                                            {(typeof protocol.description === 'object' ? (protocol.description[currentLang] || protocol.description[appConfig.defaultLanguage] || Object.values(protocol.description)[0]) : protocol.description) as string}
                                        </td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {finalDocUrl && (
                                                <a href={finalDocUrl} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                    <FileCheck2 size={18} />
                                                </a>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <button onClick={() => handleStartEditing(protocol)} className={styles.actionButton}><Edit size={18} /></button>
                                            <button onClick={() => protocol.id && setDeletingProtocol(protocol)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {editingProtocol && <EditProtocolForm
                protocol={editingProtocol}
                allAcuPoints={allAcuPoints}
                onSave={(lang) => handleSave(lang)}
                onCancel={onCancel}
                onUpdate={onUpdate}
                error={formError}
                isSubmitting={isFormLoading}
                onFileChange={(file) => {
                    setFileToUpload(file);
                    setIsDirty(true);
                }}
                onFileDelete={(protocol, lang) => handleFileDelete(protocol, lang)}
                isDirty={isDirty}
                currentLang={currentLang}
                appConfig={appConfig}
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
    onSave: (lang: string) => void;
    onCancel: () => void;
    onUpdate: (protocol: Partial<ProtocolFormState>) => void;
    error: string | null;
    isSubmitting: boolean;
    onFileChange: (file: File | null) => void;
    onFileDelete: (protocol: Partial<ProtocolFormState>, lang: string) => void;
    isDirty: boolean;
    currentLang: string;
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

const EditProtocolForm: React.FC<EditProtocolFormProps> = ({ protocol, allAcuPoints, onSave, onCancel, onUpdate, error, isSubmitting, onFileChange, onFileDelete, isDirty, currentLang, appConfig }) => {
    const { t } = useTranslation();
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [activeLang, setActiveLang] = useState<string>(currentLang);
    const SUPPORTED_LANGS = appConfig.supportedLanguages;
    const orderedLangs = [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
        .filter(l => SUPPORTED_LANGS.includes(l));


    const handlePointSelection = (pointId: string) => {
        const currentPoints = protocol.points || [];
        const newPoints =
            currentPoints.includes(pointId)
                ? currentPoints.filter(id => id !== pointId)
                : [...currentPoints, pointId];
        onUpdate({ ...protocol, points: newPoints });
    };


    useEffect(() => {
        setSelectedFileName(null);
    }, [protocol]);

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>{protocol.id ? t('edit_protocol') : t('add_new_protocol')}</h2>
                    <button onClick={onCancel} className={styles.closeButton}>
                        <X size={24} />
                    </button>
                </div>
                <div className={styles.langTabBar}>
                    {orderedLangs.map(lang => (
                        <button
                            key={lang}
                            type="button"
                            className={`${styles.langTab} ${activeLang === lang ? styles.langTabActive : ''}`}
                            onClick={() => setActiveLang(lang)}
                        >
                            {t(lang)}
                        </button>
                    ))}
                </div>
                {error && <p className={styles.formError}>{error}</p>}
                <div className={styles.formGrid}>
                    {isSubmitting ? <div className={styles.formLoader}><Loader className={styles.loader} size={32} /></div> : (
                        <>
                            <div>
                                <div className={styles.labelWrapper}>
                                    <label htmlFor='protocolName' className={styles.formLabel}>
                                        {t('protocol_name')}
                                        <span className={styles.requiredAsterisk}>*</span>
                                    </label>
                                    <div className={styles.indicatorContainer}>
                                        <Globe size={14} className={styles.indicatorIcon} />
                                        <span className={styles.translationCounter}>
                                            {Object.values(protocol.name || {}).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                                        </span>
                                    </div>
                                </div>
                                {activeLang !== appConfig.defaultLanguage && !((protocol.name as Record<string, string>)?.[activeLang]) && (
                                    <TranslationReference
                                        label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                                        text={(protocol.name as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <input
                                    id='protocolName'
                                    type="text"
                                    placeholder={t('protocol_name_placeholder')}
                                    value={((protocol.name as Record<string, string>)?.[activeLang] || '') as string}
                                    onChange={(e) => onUpdate({
                                        ...protocol,
                                        name: { ...(protocol.name as Record<string, string> || {}), [activeLang]: e.target.value }
                                    })}
                                    className={styles.formInput}
                                />
                            </div>
                            <div>
                                <div className={styles.labelWrapper}>
                                    <label htmlFor='protocolDescription' className={styles.formLabel}>
                                        {t('protocol_description')}
                                        <span className={styles.requiredAsterisk}>*</span>
                                    </label>
                                    <div className={styles.indicatorContainer}>
                                        <Globe size={14} className={styles.indicatorIcon} />
                                        <span className={styles.translationCounter}>
                                            {Object.values(protocol.description || {}).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                                        </span>
                                    </div>
                                </div>
                                {activeLang !== appConfig.defaultLanguage && !((protocol.description as Record<string, string>)?.[activeLang]) && (
                                    <TranslationReference
                                        label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                                        text={(protocol.description as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <textarea
                                    id='protocolDescription'
                                    placeholder={t('protocol_description_placeholder')}
                                    value={((protocol.description as Record<string, string>)?.[activeLang] || '') as string}
                                    onChange={(e) => onUpdate({
                                        ...protocol,
                                        description: { ...(protocol.description as Record<string, string> || {}), [activeLang]: e.target.value }
                                    })}
                                    className={styles.formTextarea}
                                />
                            </div>
                            <div>
                                <div className={styles.labelWrapper}>
                                    <label htmlFor='protocolRationale' className={styles.formLabel}>{t('protocol_rationale')}</label>
                                    <div className={styles.indicatorContainer}>
                                        <Globe size={14} className={styles.indicatorIcon} />
                                        <span className={styles.translationCounter}>
                                            {Object.values(protocol.rationale || {}).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                                        </span>
                                    </div>
                                </div>
                                {activeLang !== appConfig.defaultLanguage && !((protocol.rationale as Record<string, string>)?.[activeLang]) && (
                                    <TranslationReference
                                        label={`${t('defaultLanguage')}: ${t(appConfig.defaultLanguage)}`}
                                        text={(protocol.rationale as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <textarea
                                    id='protocolRationale'
                                    placeholder={t('protocol_rationale_placeholder')}
                                    value={((protocol.rationale as Record<string, string>)?.[activeLang] || '') as string}
                                    onChange={(e) => onUpdate({
                                        ...protocol,
                                        rationale: { ...(protocol.rationale as Record<string, string> || {}), [activeLang]: e.target.value }
                                    })}
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
                                            <span className={styles.pointLabelText}>
                                                {typeof point.label === 'object' ? (point.label[currentLang] || point.label[appConfig.defaultLanguage] || Object.values(point.label)[0]) : point.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Document Management Section */}
                            <DocumentManagement
                                entityName="Protocol"
                                documentUrl={protocol.documentUrl as { [key: string]: string }}
                                onFileChange={(file) => {
                                    onFileChange(file);
                                    if (file) setSelectedFileName(file.name);
                                    else setSelectedFileName(null);
                                }}
                                onFileDelete={() => {
                                    if (selectedFileName) {
                                        onFileChange(null);
                                        setSelectedFileName(null);
                                    } else {
                                        onFileDelete(protocol, activeLang);
                                    }
                                }}
                                isSubmitting={isSubmitting}
                                activeLang={activeLang}
                                selectedFileName={selectedFileName || undefined}
                            />
                        </>
                    )}
                </div>
                <div className={styles.modalActions}>
                    <button onClick={onCancel} className={styles.cancelButton}>{t('cancel')}</button>
                    <button onClick={() => onSave(activeLang)} disabled={isSubmitting || !isDirty} className={styles.saveButton}>
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
    const { t, i18n } = useTranslation();
    return (
        <div className={styles.modalOverlay}>
            <div className={styles.deleteModalContent}>
                <div className={styles.deleteModalHeader}>
                    <div className={styles.deleteModalIconContainer}>
                        <AlertTriangle className={styles.deleteModalIcon} aria-hidden="true" />
                    </div>
                    <div>
                        <h2 className={styles.deleteModalTitle}>{t('delete_protocol')}</h2>
                        <p className={styles.deleteModalText}>
                            {t('delete_protocol_confirmation', {
                                name: (typeof protocol.name === 'object' ? (protocol.name[i18n.language] || Object.values(protocol.name)[0]) : protocol.name) as string
                            })}
                        </p>
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
