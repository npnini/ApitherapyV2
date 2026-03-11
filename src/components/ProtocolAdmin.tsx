import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Protocol } from '../types/protocol';
import { StingPoint as AcuPoint } from '../types/apipuncture';
import { Trash2, Edit, Plus, Loader, Save, AlertTriangle, FileCheck2, X, Globe, Search } from 'lucide-react';
import styles from './ProtocolAdmin.module.css';
import { uploadFile, deleteFile } from '../services/storageService';
import DocumentManagement from './shared/DocumentManagement';
import { T, useT, useTranslationContext } from './T';
import Tooltip from './common/Tooltip';

// A type for the form state, where points are an array of strings (IDs)
interface ProtocolFormState extends Omit<Protocol, 'points'> {
    points: string[];
    status: 'active' | 'inactive';
    reference_count: number;
}

const ProtocolAdmin: React.FC = () => {
    const { language: currentLang, getTranslation, registerString } = useTranslationContext();
    const [user, setUser] = useState<User | null>(null);
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [allAcuPoints, setAllAcuPoints] = useState<AcuPoint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isFormLoading, setIsFormLoading] = useState<boolean>(false);
    const [editingProtocol, setEditingProtocol] = useState<Partial<ProtocolFormState> | null>(null);
    const [deletingProtocol, setDeletingProtocol] = useState<Protocol | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });

    // String Registry for callbacks and dynamic content
    const stringsToRegister = useMemo(() => [
        'could_not_fetch_data',
        'protocol_name_required',
        'protocol_description_required',
        'at_least_one_point',
        'protocol_name_exists',
        'failed_to_save_protocol',
        'failed_to_delete_protocol',
        'English',
        'Hebrew',
        'Arabic',
        'Russian',
        'Cancel',
        'Saving...',
        'Deleting...',
        'Confirm Delete',
        'Protocol Name',
        'Protocol Description',
        'Protocol Rationale',
        'Protocol',
        'Protocol name is required',
        'Protocol description is required',
        'At least one point is required',
        'Protocol name already exists',
        'Failed to save protocol',
        'Failed to delete protocol',
        'Default language',
        'Enter protocol name',
        'Describe protocol purpose',
        'Explain rationale',
        'Are you sure you want to delete the protocol',
        'Delete Protocol',
        'Edit Protocol',
        'Search protocols...',
        'Could not fetch protocols and points'
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
        appConfig.supportedLanguages.forEach(lang => registerString(lang));
    }, [registerString, stringsToRegister, appConfig.supportedLanguages]);

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
                getDocs(collection(db, 'cfg_protocols')),
                getDocs(collection(db, 'cfg_acupuncture_points'))
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
            setFormError(getTranslation('Could not fetch protocols and points'));
        }
        setIsLoading(false);
    }, [user, getTranslation, appConfig.defaultLanguage]);

    const filteredProtocols = useMemo(() => {
        if (!searchTerm.trim()) return protocols;

        const term = searchTerm.toLowerCase().trim();
        return protocols.filter(protocol => {
            // Search in name
            const name = typeof protocol.name === 'object'
                ? (protocol.name[currentLang] || protocol.name[appConfig.defaultLanguage] || Object.values(protocol.name)[0] || '')
                : (protocol.name as string);
            if (name.toLowerCase().includes(term)) return true;

            // Search in description
            const description = typeof protocol.description === 'object'
                ? (protocol.description[currentLang] || protocol.description[appConfig.defaultLanguage] || Object.values(protocol.description)[0] || '')
                : (protocol.description as string);
            if (description.toLowerCase().includes(term)) return true;

            // Search in rationale
            const rationale = typeof protocol.rationale === 'object'
                ? (protocol.rationale[currentLang] || protocol.rationale[appConfig.defaultLanguage] || Object.values(protocol.rationale)[0] || '')
                : (protocol.rationale as string);
            if (rationale && rationale.toLowerCase().includes(term)) return true;

            return false;
        });
    }, [protocols, searchTerm, currentLang, appConfig.defaultLanguage]);

    useEffect(() => {
        fetchProtocolsAndPoints();
    }, [fetchProtocolsAndPoints]);

    const validateProtocolForm = (protocol: Partial<ProtocolFormState>): boolean => {
        const nameValues = Object.values(protocol.name || {}).map(v => v.trim()).filter(Boolean);
        if (nameValues.length === 0) {
            setFormError(getTranslation('Protocol name is required'));
            return false;
        }

        const descriptionValues = Object.values(protocol.description || {}).map(v => v.trim()).filter(Boolean);
        if (descriptionValues.length === 0) {
            setFormError(getTranslation('Protocol description is required'));
            return false;
        }

        if (!protocol.points || protocol.points.length === 0) {
            setFormError(getTranslation('At least one point is required'));
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
                    setFormError(getTranslation('Protocol name already exists'));
                    return false;
                }
            }
        }

        setFormError(null);
        return true;
    }

    const handleFileUpdate = async (protocol: Partial<ProtocolFormState>, file?: File | null, lang: string = currentLang) => {
        setEditingProtocol(protocol);
        setIsDirty(true);

        if (file) {
            setIsFormLoading(true);
            try {
                const folderName = protocol.id || 'new';
                const firebasePath = `Protocols/${folderName}`;
                const newUrl = await uploadFile(file, firebasePath);

                const currentDocUrls = typeof protocol.documentUrl === 'object' ? { ...protocol.documentUrl } : {};
                const newDocUrls = { ...currentDocUrls, [lang]: newUrl };

                setEditingProtocol({ ...protocol, documentUrl: newDocUrls });
                setFormError(null);
            } catch (err) {
                console.error("Error uploading protocol file:", err);
                setFormError(getTranslation('Failed to upload file.'));
            } finally {
                setIsFormLoading(false);
            }
        }
    };

    const handleSave = async () => {
        if (!editingProtocol) return;

        if (!validateProtocolForm(editingProtocol)) {
            return;
        }

        setIsFormLoading(true);

        try {
            const documentUrl = typeof editingProtocol.documentUrl === 'object' ? editingProtocol.documentUrl : {};

            const protocolToSave: any = {
                name: typeof editingProtocol.name === 'object' ? editingProtocol.name : { [appConfig.defaultLanguage]: editingProtocol.name },
                description: typeof editingProtocol.description === 'object' ? editingProtocol.description : { [appConfig.defaultLanguage]: editingProtocol.description },
                rationale: typeof editingProtocol.rationale === 'object' ? editingProtocol.rationale : { [appConfig.defaultLanguage]: editingProtocol.rationale },
                points: editingProtocol.points!,
                documentUrl: documentUrl && Object.keys(documentUrl).length > 0 ? documentUrl : null,
                status: editingProtocol.status || 'active',
                reference_count: editingProtocol.reference_count || 0,
                updatedAt: serverTimestamp(),
            };

            const originalPoints = protocols.find((p: Protocol) => p.id === editingProtocol.id)?.points || [];
            const newPoints = editingProtocol.points || [];

            const addedPoints = newPoints.filter((p: string) => !originalPoints.includes(p));
            const removedPoints = originalPoints.filter((p: string) => !newPoints.includes(p));

            if (editingProtocol.id) {
                const protocolRef = doc(db, 'cfg_protocols', editingProtocol.id);
                await updateDoc(protocolRef, protocolToSave);
            } else {
                await addDoc(collection(db, 'cfg_protocols'), { ...protocolToSave, createdAt: serverTimestamp() });
            }

            // Update reference counts for points
            for (const pointId of addedPoints) {
                const pointRef = doc(db, 'cfg_acupuncture_points', pointId);
                const pointDoc = await getDoc(pointRef);
                if (pointDoc.exists()) {
                    await updateDoc(pointRef, { reference_count: (pointDoc.data().reference_count || 0) + 1 });
                }
            }

            for (const pointId of removedPoints) {
                const pointRef = doc(db, 'cfg_acupuncture_points', pointId);
                const pointDoc = await getDoc(pointRef);
                if (pointDoc.exists()) {
                    await updateDoc(pointRef, { reference_count: Math.max(0, (pointDoc.data().reference_count || 0) - 1) });
                }
            }

            setEditingProtocol(null);
            setIsDirty(false);
            fetchProtocolsAndPoints();
        } catch (error) {
            setFormError(getTranslation('Failed to save protocol'));
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
            await deleteDoc(doc(db, 'cfg_protocols', deletingProtocol.id));

            // Decement reference counts for all points
            for (const pointId of (deletingProtocol.points || [])) {
                const pId = typeof pointId === 'string' ? pointId : pointId.id;
                const pointRef = doc(db, 'cfg_acupuncture_points', pId);
                const pointDoc = await getDoc(pointRef);
                if (pointDoc.exists()) {
                    await updateDoc(pointRef, { reference_count: Math.max(0, (pointDoc.data().reference_count || 0) - 1) });
                }
            }

            fetchProtocolsAndPoints();
        } catch (error) {
            console.error("Error deleting protocol:", error);
            setFormError(getTranslation('Failed to delete protocol'));
        } finally {
            setIsLoading(false);
            setDeletingProtocol(null);
        }
    };

    const handleFileDelete = (protocol: Partial<ProtocolFormState>, lang: string) => {
        if (!protocol.documentUrl) return;

        const newDocUrls = { ...(typeof protocol.documentUrl === 'object' ? protocol.documentUrl : { en: protocol.documentUrl }) };
        delete (newDocUrls as Record<string, any>)[lang];

        handleFileUpdate({ ...protocol, documentUrl: newDocUrls });
    };

    const onUpdate = (protocol: Partial<ProtocolFormState>) => {
        setEditingProtocol(protocol);
        setIsDirty(true);
    }

    const handleStartEditing = (proto: Protocol) => {
        const pointIds = (proto.points || []).map((p: AcuPoint | string) => typeof p === 'string' ? p : (p as AcuPoint).id);
        setFormError(null);
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
        setIsDirty(false);
        setEditingProtocol({
            name: { [appConfig.defaultLanguage]: '' },
            description: { [appConfig.defaultLanguage]: '' },
            rationale: { [appConfig.defaultLanguage]: '' },
            points: [],
            status: 'active',
            reference_count: 0
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
                <h1 className={styles.title}><T>Protocol Configuration</T></h1>
                <div className={styles.headerActions}>
                    <div className={styles.searchContainer}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder={getTranslation('Search protocols...')}
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
                    <button onClick={handleStartNew} className={styles.addButton}>
                        <Plus size={18} className={styles.addButtonIcon} /><T>Add New Protocol</T>
                    </button>
                </div>
            </div>
            {formError && <p className={styles.errorBox}>{formError}</p>}

            {isLoading ? <div className={styles.loaderContainer}><Loader className={styles.loader} size={40} /></div> : (
                <div className={styles.protocolListContainer}>
                    <table className={styles.table}>
                        <thead className={styles.tableHeader}>
                            <tr>
                                <th scope="col" className={styles.headerCell}><T>Protocol Name</T></th>
                                <th scope="col" className={styles.headerCell}><T>Description</T></th>
                                <th scope="col" className={styles.headerCell}><T>Status</T></th>
                                <th scope="col" className={`${styles.headerCell} ${styles.documentCell}`}><T>Document</T></th>
                                <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}>
                                    <T>Actions</T>
                                </th>
                            </tr>
                        </thead>
                        <tbody className={styles.tableBody}>
                            {filteredProtocols.length === 0 ? (
                                <tr><td colSpan={5} className={styles.emptyCell}><T>No protocols found</T></td></tr>
                            ) : filteredProtocols.map(protocol => {
                                const docUrlObject = protocol.documentUrl;
                                let docUrlForLang: string | undefined;
                                let docUrlEn: string | undefined;

                                if (docUrlObject) {
                                    if (typeof docUrlObject === 'object') {
                                        docUrlForLang = (docUrlObject as any)[currentLang];
                                        docUrlEn = (docUrlObject as any)['en'];
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
                                        <td className={styles.cell}>
                                            <span className={`${styles.statusBadge} ${protocol.status === 'active' ? styles.badgeActive : styles.badgeInactive}`}>
                                                <T>{protocol.status === 'active' ? 'Active' : 'Inactive'}</T>
                                            </span>
                                        </td>
                                        <td className={`${styles.cell} ${styles.documentCell}`}>
                                            {finalDocUrl && (
                                                <a href={finalDocUrl} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
                                                    <FileCheck2 size={18} />
                                                </a>
                                            )}
                                        </td>
                                        <td className={`${styles.cell} ${styles.actionsCell}`}>
                                            <div className={styles.actionsWrapper}>
                                                <Tooltip text={getTranslation('Edit Protocol')}>
                                                    <button onClick={() => handleStartEditing(protocol)} className={styles.actionButton}><Edit size={18} /></button>
                                                </Tooltip>
                                                {protocol.reference_count > 0 ? (
                                                    <Tooltip text={getTranslation('Cannot delete: protocol is referenced in problems')}>
                                                        <button className={`${styles.actionButton} ${styles.deleteButtonDisabled}`} disabled>
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip text={getTranslation('Delete Protocol')}>
                                                        <button onClick={() => protocol.id && setDeletingProtocol(protocol)} className={`${styles.actionButton} ${styles.deleteButton}`}>
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </Tooltip>
                                                )}
                                            </div>
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
                onSave={handleSave}
                onCancel={() => setEditingProtocol(null)}
                onUpdate={onUpdate}
                onFileUpdate={handleFileUpdate}
                error={formError}
                isSubmitting={isFormLoading}
                onFileDelete={handleFileDelete}
                isDirty={isDirty}
                currentLang={currentLang}
                appConfig={appConfig}
                getTranslation={getTranslation}
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
    onFileUpdate: (protocol: Partial<ProtocolFormState>, file: File, lang: string) => void;
    error: string | null;
    isSubmitting: boolean;
    onFileDelete: (protocol: Partial<ProtocolFormState>, lang: string) => void;
    isDirty: boolean;
    currentLang: string;
    appConfig: { defaultLanguage: string; supportedLanguages: string[] };
    getTranslation: (s: string) => string;
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

const EditProtocolForm: React.FC<EditProtocolFormProps> = ({ protocol, allAcuPoints, onSave, onCancel, onUpdate, onFileUpdate, error, isSubmitting, onFileDelete, isDirty, currentLang, appConfig, getTranslation }) => {
    const [activeLang, setActiveLang] = useState<string>(currentLang);
    const SUPPORTED_LANGS = appConfig.supportedLanguages;
    const orderedLangs = useMemo(() => [currentLang, ...SUPPORTED_LANGS.filter(l => l !== currentLang).sort()]
        .filter(l => SUPPORTED_LANGS.includes(l)), [currentLang, SUPPORTED_LANGS]);

    const handlePointSelection = (pointId: string) => {
        const currentPoints = protocol.points || [];
        const newPoints =
            currentPoints.includes(pointId)
                ? currentPoints.filter(id => id !== pointId)
                : [...currentPoints, pointId];
        onUpdate({ ...protocol, points: newPoints });
    };

    // No internal selectedFileName state needed anymore as we upload immediately

    const getLangDisplayName = (lang: string) => {
        switch (lang) {
            case 'he': return getTranslation('Hebrew');
            case 'en': return getTranslation('English');
            case 'ar': return getTranslation('Arabic');
            case 'ru': return getTranslation('Russian');
            default: return lang;
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>{protocol.id ? <T>Edit Protocol</T> : <T>Add New Protocol</T>}</h2>
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
                            {getLangDisplayName(lang)}
                        </button>
                    ))}
                </div>
                {error && <p className={styles.formError}>{error}</p>}
                <div className={styles.formGrid}>
                    {isSubmitting ? <div className={styles.formLoader}><Loader className={styles.loader} size={32} /></div> : (
                        <>
                            <div className={styles.statusToggleContainer}>
                                <span className={styles.statusLabel}><T>Status</T>:</span>
                                <label className={styles.switch}>
                                    <input
                                        type="checkbox"
                                        checked={protocol.status === 'active'}
                                        onChange={(e) => {
                                            onUpdate({ ...protocol, status: e.target.checked ? 'active' : 'inactive' });
                                        }}
                                    />
                                    <span className={styles.slider}></span>
                                </label>
                                <span className={`${styles.statusText} ${protocol.status === 'active' ? styles.statusActive : styles.statusInactive}`}>
                                    <T>{protocol.status === 'active' ? 'Active' : 'Inactive'}</T>
                                </span>
                            </div>
                            <div>
                                <div className={styles.labelWrapper}>
                                    <label htmlFor='protocolName' className={styles.formLabel}>
                                        <T>Protocol Name</T>
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
                                        label={`${getTranslation('Default language')}: ${getLangDisplayName(appConfig.defaultLanguage)}`}
                                        text={(protocol.name as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <input
                                    id='protocolName'
                                    type="text"
                                    placeholder={getTranslation('Enter protocol name')}
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
                                        <T>Protocol Description</T>
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
                                        label={`${getTranslation('Default language')}: ${getLangDisplayName(appConfig.defaultLanguage)}`}
                                        text={(protocol.description as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <textarea
                                    id='protocolDescription'
                                    placeholder={getTranslation('Describe protocol purpose')}
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
                                    <label htmlFor='protocolRationale' className={styles.formLabel}><T>Protocol Rationale</T></label>
                                    <div className={styles.indicatorContainer}>
                                        <Globe size={14} className={styles.indicatorIcon} />
                                        <span className={styles.translationCounter}>
                                            {Object.values(protocol.rationale || {}).filter(Boolean).length}/{SUPPORTED_LANGS.length}
                                        </span>
                                    </div>
                                </div>
                                {activeLang !== appConfig.defaultLanguage && !((protocol.rationale as Record<string, string>)?.[activeLang]) && (
                                    <TranslationReference
                                        label={`${getTranslation('Default language')}: ${getLangDisplayName(appConfig.defaultLanguage)}`}
                                        text={(protocol.rationale as Record<string, string>)?.[appConfig.defaultLanguage]}
                                    />
                                )}
                                <textarea
                                    id='protocolRationale'
                                    placeholder={getTranslation('Explain rationale')}
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
                                    <T>Select Points</T>
                                    <span className={styles.requiredAsterisk}>*</span>
                                </h3>
                                <div className={styles.pointsSelectionContainer}>
                                    {allAcuPoints.map(point => {
                                        const isSelected = (protocol.points || []).includes(point.id);
                                        const isDisabled = point.status === 'inactive' && !isSelected;
                                        return (
                                            <label
                                                key={point.id}
                                                className={`
                                                    ${styles.pointLabel} 
                                                    ${isSelected ? styles.pointLabelSelected : ''} 
                                                    ${isDisabled ? styles.pointLabelInactive : ''}
                                                `}
                                                title={isDisabled ? getTranslation('Point is inactive and cannot be selected') : ''}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => !isDisabled && handlePointSelection(point.id)}
                                                    className={styles.pointCheckbox}
                                                    disabled={isDisabled}
                                                />
                                                <span className={styles.pointCode}>{point.code}</span>
                                                <span className={styles.pointLabelText}>
                                                    {typeof point.label === 'object' ? (point.label[currentLang] || point.label[appConfig.defaultLanguage] || Object.values(point.label)[0]) : point.label}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <DocumentManagement
                                entityName="Protocol"
                                documentUrl={protocol.documentUrl as { [key: string]: string }}
                                onFileChange={(file) => {
                                    if (file) onFileUpdate(protocol, file, activeLang);
                                }}
                                onFileDelete={() => onFileDelete(protocol, activeLang)}
                                isSubmitting={isSubmitting}
                                activeLang={activeLang}
                            />
                        </>
                    )}
                </div>
                <div className={styles.modalActions}>
                    <button onClick={onCancel} className={styles.cancelButton}><T>Cancel</T></button>
                    <button onClick={() => onSave()} disabled={isSubmitting || !isDirty} className={styles.saveButton}>
                        <Save size={16} /> {isSubmitting ? getTranslation('Saving...') : <T>Save Protocol</T>}
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
    const { language: currentLang, getTranslation } = useTranslationContext();
    const modalMessage = useT('Are you sure you want to delete the protocol');

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.deleteModalContent}>
                <div className={styles.deleteModalHeader}>
                    <div className={styles.deleteModalIconContainer}>
                        <AlertTriangle className={styles.deleteModalIcon} aria-hidden="true" />
                    </div>
                    <div>
                        <h2 className={styles.deleteModalTitle}><T>Delete Protocol</T></h2>
                        <p className={styles.deleteModalText}>
                            {modalMessage} '{(typeof protocol.name === 'object' ? (protocol.name[currentLang] || Object.values(protocol.name)[0]) : protocol.name) as string}'?
                        </p>
                    </div>
                </div>
                <div className={styles.deleteModalActions}>
                    <button onClick={onCancel} className={styles.deleteCancelButton} disabled={isSubmitting}><T>Cancel</T></button>
                    <button onClick={onConfirm} className={styles.confirmDeleteButton} disabled={isSubmitting}>
                        {isSubmitting ? <T>Deleting...</T> : <T>Confirm Delete</T>}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ProtocolAdmin;
