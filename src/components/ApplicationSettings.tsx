
import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { AppUser } from '../types/user';
import { uploadFile, deleteFile } from '../services/storageService';
import { appConfigSchema, ConfigGroup, ConfigSetting } from '../config/appConfigSchema';
import styles from './ApplicationSettings.module.css';
import ShuttleSelector, { ShuttleItem } from './shared/ShuttleSelector';
import { Question, Questionnaire } from '../types/questionnaire';
import { T, useT, useTranslationContext } from './T';

interface ApplicationSettingsProps {
    user: AppUser;
    onClose: () => void;
}

interface Protocol {
    id: string;
    name: string | Record<string, string>;
}

interface QuestionnaireQuestion {
    id: string;
    name: string;
}

const allLanguages: ShuttleItem[] = [
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Spanish' },
    { id: 'fr', name: 'French' },
    { id: 'de', name: 'German' },
    { id: 'he', name: 'Hebrew' },
    { id: 'ar', name: 'Arabic' },
    { id: 'zh', name: 'Chinese' },
    { id: 'ru', name: 'Russian' },
];

const getDefaultsFromSchema = (schema: { [key: string]: ConfigGroup }): Record<string, any> => {
    const defaults: Record<string, any> = {};
    Object.entries(schema).forEach(([groupKey, group]) => {
        const processGroup = (currentGroup: ConfigGroup, currentDefaults: Record<string, any>) => {
            Object.entries(currentGroup.children).forEach(([key, item]) => {
                if ('children' in item) {
                    currentDefaults[key] = {};
                    processGroup(item, currentDefaults[key]);
                } else {
                    currentDefaults[key] = item.defaultValue;
                }
            });
        };
        defaults[groupKey] = {};
        processGroup(group, defaults[groupKey]);
    });
    return defaults;
};

const ApplicationSettings: React.FC<ApplicationSettingsProps> = ({ user, onClose }) => {
    const { language: currentLang, registerString, getTranslation } = useTranslationContext();
    const [initialSettings, setInitialSettings] = useState<Record<string, any>>({});
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [questionnaireQuestions, setQuestionnaireQuestions] = useState<QuestionnaireQuestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const configDocRef = doc(db, 'app_config', 'main');

    const areSettingsChanged = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings);
    }, [settings, initialSettings]);

    const stringsToRegister = useMemo(() => {
        const schemaStrings: string[] = [];
        Object.values(appConfigSchema).forEach(group => {
            schemaStrings.push(group.label);
            schemaStrings.push(group.description);
            Object.values(group.children).forEach(child => {
                schemaStrings.push(child.label);
                schemaStrings.push(child.description);
                // Handle nested groups if any (though schema currently only has 1 level of children in some groups)
                if ('children' in child) {
                    Object.values(child.children).forEach(grandchild => {
                        schemaStrings.push(grandchild.label);
                        schemaStrings.push(grandchild.description);
                    });
                }
            });
        });

        return [
            'Failed to fetch application settings.',
            'Failed to save settings. You must be an administrator to perform this action.',
            'Settings saved!',
            'Saving...',
            '-- Select Default Language --',
            '-- Select a Protocol --',
            '-- Select a Question --',
            'Available Languages',
            'Supported Languages',
            'English', 'Spanish', 'French', 'German', 'Hebrew', 'Arabic', 'Chinese', 'Russian',
            'Loading settings...',
            'Cancel',
            'Save Changes',
            ...schemaStrings
        ];
    }, []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [registerString, stringsToRegister]);

    useEffect(() => {
        const fetchSettingsAndProtocols = async () => {
            setIsLoading(true);
            try {
                const protocolsCollectionRef = collection(db, 'protocols');
                const protocolDocs = await getDocs(protocolsCollectionRef);
                const fetchedProtocols = protocolDocs.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
                setProtocols(fetchedProtocols);

                const docSnap = await getDoc(configDocRef);
                const defaults = getDefaultsFromSchema(appConfigSchema);
                let mergedSettings = { ...defaults };

                if (docSnap.exists()) {
                    const fetchedData = docSnap.data();
                    Object.keys(mergedSettings).forEach(key => {
                        if (fetchedData[key]) {
                            mergedSettings[key] = { ...mergedSettings[key], ...fetchedData[key] };
                        }
                    });
                }

                setSettings(mergedSettings);
                setInitialSettings(mergedSettings);

            } catch (err) {
                setError(getTranslation('Failed to fetch application settings.'));
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettingsAndProtocols();
    }, [getTranslation]);

    useEffect(() => {
        const fetchQuestionnaire = async () => {
            const domain = settings.patientDashboard?.domain;
            if (!domain) {
                setQuestionnaireQuestions([]);
                return;
            }

            try {
                // This query does NOT use orderBy, and will not require an index.
                const q = query(
                    collection(db, 'questionnaires'),
                    where('domain', '==', domain)
                );
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    setQuestionnaireQuestions([]);
                    return;
                }

                // The sorting is done here, on the client-side.
                const questionnaires = querySnapshot.docs.map(doc => doc.data() as Questionnaire);
                questionnaires.sort((a, b) => b.versionNumber - a.versionNumber);
                const latestQuestionnaire = questionnaires[0];

                if (latestQuestionnaire && latestQuestionnaire.questions && Array.isArray(latestQuestionnaire.questions)) {
                    const questions = latestQuestionnaire.questions.map((q: Question) => ({
                        id: q.name,
                        name: q.name,
                    }));
                    setQuestionnaireQuestions(questions);
                } else {
                    setQuestionnaireQuestions([]);
                }
            } catch (err) {
                console.error("Failed to fetch questionnaire:", err);
                setQuestionnaireQuestions([]);
            }
        };

        if (settings.patientDashboard) {
            fetchQuestionnaire();
        }
    }, [settings.patientDashboard?.domain]);

    const handleSettingChange = (path: string[], value: any) => {
        setSaveSuccess(false);
        setError(null);
        setSettings(prev => {
            const newSettings = JSON.parse(JSON.stringify(prev));

            let parentObject = newSettings;
            for (let i = 0; i < path.length - 1; i++) {
                if (!parentObject[path[i]]) {
                    parentObject[path[i]] = {};
                }
                parentObject = parentObject[path[i]];
            }

            parentObject[path[path.length - 1]] = value;

            if (path.join('.') === 'patientDashboard.domain') {
                newSettings.patientDashboard.conditionQuestion = '';
                newSettings.patientDashboard.severityQuestion = '';
            }

            return newSettings;
        });
    };

    const handleSave = async () => {
        if (!areSettingsChanged) return;
        setIsSaving(true);
        setError(null);
        setSaveSuccess(false);

        try {
            await setDoc(configDocRef, settings, { merge: true });
            setInitialSettings(settings);
            setSaveSuccess(true);
            setTimeout(() => {
                setSaveSuccess(false);
                onClose();
            }, 1500);
        } catch (err) {
            setError(getTranslation('Failed to save settings. You must be an administrator to perform this action.'));
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const renderGroup = (group: ConfigGroup, path: string[]) => {
        return Object.entries(group.children).map(([key, item]) => {
            const currentPath = [...path, key];
            if ('children' in item) {
                return (
                    <fieldset key={key} className={styles.nestedGroup}>
                        <legend className={styles.groupLabel}><T>{item.label}</T></legend>
                        <p className={styles.groupDescription}><T>{item.description}</T></p>
                        {renderGroup(item, currentPath)}
                    </fieldset>
                );
            } else {
                return renderSetting(item, currentPath);
            }
        });
    };

    const handleFileUpload = async (path: string[], lang: string, file: File) => {
        setIsSaving(true);
        try {
            const downloadUrl = await uploadFile(file, 'App_config');

            setSettings(prev => {
                const newSettings = JSON.parse(JSON.stringify(prev));
                let parentObject = newSettings;
                for (let i = 0; i < path.length - 1; i++) {
                    if (!parentObject[path[i]]) parentObject[path[i]] = {};
                    parentObject = parentObject[path[i]];
                }

                const lastKey = path[path.length - 1];
                if (!parentObject[lastKey]) parentObject[lastKey] = {};
                if (!parentObject[lastKey].apitherapy) parentObject[lastKey].apitherapy = {};

                parentObject[lastKey].apitherapy[lang] = downloadUrl;
                return newSettings;
            });
            setError(null);
        } catch (err) {
            console.error('File upload failed:', err);
            setError(getTranslation('Failed to upload file.'));
        } finally {
            setIsSaving(false);
        }
    };


    const openInNewTab = async (url: string) => {
        try {
            const response = await fetch(url);
            let blob = await response.blob();

            // Check file extension to infer type
            const path = url.toLowerCase().split('?')[0];
            let type = 'text/plain';
            if (path.endsWith('.html')) type = 'text/html';
            else if (path.endsWith('.pdf')) type = 'application/pdf';
            else if (path.endsWith('.png')) type = 'image/png';
            else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) type = 'image/jpeg';

            // Create a new blob with the inferred content type to force browser rendering
            const viewerBlob = new Blob([blob], { type });
            const viewerUrl = URL.createObjectURL(viewerBlob);
            window.open(viewerUrl, '_blank');
        } catch (err) {
            console.warn('Failed to fetch blob for viewer, falling back to direct link:', err);
            window.open(url, '_blank');
        }
    };

    const downloadFile = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileDelete = async (path: string[], lang: string, url: string) => {
        setIsSaving(true);
        try {
            await deleteFile(url);
            setSettings(prev => {
                const newSettings = JSON.parse(JSON.stringify(prev));
                let parentObject = newSettings;
                for (let i = 0; i < path.length - 1; i++) {
                    parentObject = parentObject[path[i]];
                }
                const lastKey = path[path.length - 1];
                delete parentObject[lastKey].apitherapy[lang];
                return newSettings;
            });
        } catch (err) {
            console.error('File deletion failed:', err);
            setError(getTranslation('Failed to delete file.'));
        } finally {
            setIsSaving(false);
        }
    };

    const renderSetting = (setting: ConfigSetting, path: string[]) => {
        const key = path.join('.');
        let currentVal = settings;
        for (const p of path) {
            currentVal = currentVal?.[p];
        }

        const value = currentVal ?? setting.defaultValue;

        let control;
        switch (setting.type) {
            case 'languages':
                const selectedLanguageCodes = Array.isArray(value) ? value : [];
                const selectedLanguageItems = allLanguages.filter(lang => selectedLanguageCodes.includes(lang.id));

                control = (
                    <div className={styles.control}>
                        <ShuttleSelector
                            availableItems={allLanguages}
                            selectedItems={selectedLanguageItems}
                            onSelectionChange={(newSelection: ShuttleItem[]) => {
                                const newLangCodes = newSelection.map(item => item.id);
                                handleSettingChange(path, newLangCodes);
                            }}
                            availableTitle="Available Languages"
                            selectedTitle="Supported Languages"
                        />
                    </div>
                );
                break;
            case 'defaultLanguage':
                const supportedLangCodes = settings.languageSettings?.supportedLanguages || [];
                const supportedLangItems = allLanguages.filter(lang => supportedLangCodes.includes(lang.id));

                control = (
                    <select
                        id={key}
                        className={styles.input}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => handleSettingChange(path, e.target.value)}
                    >
                        <option value=""><T>-- Select Default Language --</T></option>
                        {supportedLangItems.map(lang => (
                            <option key={lang.id} value={lang.id}><T>{lang.name}</T></option>
                        ))}
                    </select>
                );
                break;
            case 'boolean':
                control = (
                    <label className={styles.toggleSwitch}>
                        <input
                            id={key}
                            type="checkbox"
                            checked={!!value}
                            onChange={e => handleSettingChange(path, e.target.checked)}
                        />
                        <span className={styles.slider}></span>
                    </label>
                );
                break;
            case 'number':
                control = (
                    <input
                        id={key}
                        type="number"
                        className={styles.input}
                        value={typeof value === 'number' ? value : 0}
                        onChange={e => handleSettingChange(path, parseFloat(e.target.value) || 0)}
                    />
                );
                break;
            case 'protocol':
                control = (
                    <select
                        id={key}
                        className={styles.input}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => handleSettingChange(path, e.target.value)}
                    >
                        <option value=""><T>-- Select a Protocol --</T></option>
                        {protocols.map(p => (
                            <option key={p.id} value={p.id}>
                                {typeof p.name === 'object'
                                    ? (p.name[settings.languageSettings?.defaultLanguage || 'en'] ||
                                        p.name['en'] ||
                                        Object.values(p.name)[0] || p.id)
                                    : p.name}
                            </option>
                        ))}
                    </select>
                );
                break;
            case 'question':
                control = (
                    <select
                        id={key}
                        className={styles.input}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => handleSettingChange(path, e.target.value)}
                        disabled={!settings.patientDashboard?.domain || questionnaireQuestions.length === 0}
                    >
                        <option value=""><T>-- Select a Question --</T></option>
                        {questionnaireQuestions.map(q => (
                            <option key={q.id} value={q.id}>{q.name}</option>
                        ))}
                    </select>
                );
                break;
            case 'file':
                const supportedLangs = settings.languageSettings?.supportedLanguages || ['en'];
                const fileValues = value?.apitherapy || {};

                control = (
                    <div className={styles.fileSettingsList}>
                        {supportedLangs.map((lang: string) => {
                            const langName = allLanguages.find(l => l.id === lang)?.name || lang;
                            const fileUrl = fileValues[lang];

                            return (
                                <div key={lang} className={styles.fileSettingRow}>
                                    <span className={styles.langLabel}><T>{langName}</T></span>
                                    {fileUrl ? (
                                        <div className={styles.fileActions}>
                                            <button
                                                type="button"
                                                className={styles.viewBtn}
                                                onClick={() => openInNewTab(fileUrl)}
                                            >
                                                <T>View</T>
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.viewBtn} // same style for now
                                                onClick={() => downloadFile(fileUrl, `consent_${lang}.txt`)}
                                            >
                                                <T>Download</T>
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.deleteBtn}
                                                onClick={() => handleFileDelete(path, lang, fileUrl)}
                                            >
                                                <T>Delete</T>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={styles.uploadWrapper}>
                                            <input
                                                type="file"
                                                id={`file-${key}-${lang}`}
                                                className={styles.fileInput}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleFileUpload(path, lang, file);
                                                }}
                                            />
                                            <label htmlFor={`file-${key}-${lang}`} className={styles.uploadBtn}>
                                                <T>Upload Document</T>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
                break;
            case 'string':
            default:
                control = (
                    <input
                        id={key}
                        type="text"
                        className={styles.input}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => handleSettingChange(path, e.target.value)}
                    />
                );
                break;
        }

        return (
            <div key={key} className={styles.setting} data-type={setting.type}>
                <label htmlFor={key} className={styles.settingLabel}>
                    <T>{setting.label}</T>
                </label>
                <p className={styles.settingDescription}><T>{setting.description}</T></p>
                {control}
            </div>
        );
    };

    if (isLoading) {
        return <div className={styles.container}><T>Loading settings...</T></div>;
    }

    return (
        <div className={styles.container}>
            <main className={styles.mainContent}>
                <div className={styles.form}>
                    {Object.entries(appConfigSchema).map(([key, group]) => (
                        <fieldset key={key} className={styles.group}>
                            <legend className={styles.groupLabel}><T>{group.label}</T></legend>
                            <p className={styles.groupDescription}><T>{group.description}</T></p>
                            {renderGroup(group, [key])}
                        </fieldset>
                    ))}
                </div>
            </main>
            <div className={styles.actions}>
                {error && <p className={styles.errorMessage}>{error}</p>}
                {saveSuccess && <span className={styles.successMessage}><T>Settings saved!</T></span>}
                <button onClick={onClose} className={`${styles.button} ${styles.cancelButton}`}>
                    <T>Cancel</T>
                </button>
                <button onClick={handleSave} disabled={!areSettingsChanged || isSaving} className={`${styles.button} ${styles.saveButton}`}>
                    {isSaving ? <T>Saving...</T> : <T>Save Changes</T>}
                </button>
            </div>
        </div>
    );
};

export default ApplicationSettings;
