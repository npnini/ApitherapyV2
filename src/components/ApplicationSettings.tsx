
// src/components/ApplicationSettings.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { AppUser } from '../types/user';
import { appConfigSchema, ConfigGroup, ConfigSetting } from '../config/appConfigSchema';
import styles from './ApplicationSettings.module.css';

interface ApplicationSettingsProps {
    user: AppUser;
}

interface Protocol {
    id: string;
    name: string;
}

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

const ApplicationSettings: React.FC<ApplicationSettingsProps> = ({ user }) => {
    const [initialSettings, setInitialSettings] = useState<Record<string, any>>({});
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const configDocRef = doc(db, 'app_config', 'main');

    const areSettingsChanged = useMemo(() => {
        return JSON.stringify(settings) !== JSON.stringify(initialSettings);
    }, [settings, initialSettings]);

    useEffect(() => {
        const fetchSettingsAndProtocols = async () => {
            setIsLoading(true);
            try {
                // Fetch protocols
                const protocolsCollectionRef = collection(db, 'protocols');
                const protocolDocs = await getDocs(protocolsCollectionRef);
                const fetchedProtocols = protocolDocs.docs.map(doc => ({ id: doc.id, name: doc.data().name as string }));
                setProtocols(fetchedProtocols);

                // Fetch settings
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
                setError('Failed to fetch application settings.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettingsAndProtocols();
    }, []);

    const handleSettingChange = (path: string[], value: any) => {
        setSaveSuccess(false);
        setError(null);
        setSettings(prev => {
            const newSettings = JSON.parse(JSON.stringify(prev));
            let current = newSettings;
            for (let i = 0; i < path.length - 1; i++) {
                if (!current[path[i]] || typeof current[path[i]] !== 'object') {
                    current[path[i]] = {};
                }
                current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
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
            setInitialSettings(settings); // Update the baseline to the new saved state
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000); // Hide success message after 3 seconds
        } catch (err) {
            setError('Failed to save settings. You must be an administrator to perform this action.');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    // Recursive renderer
    const renderGroup = (group: ConfigGroup, path: string[]) => {
        return Object.entries(group.children).map(([key, item]) => {
            const currentPath = [...path, key];
            if ('children' in item) {
                return (
                    <fieldset key={key} className={styles.nestedGroup}>
                         <legend className={styles.groupLabel}>{item.label}</legend>
                         <p className={styles.groupDescription}>{item.description}</p>
                        {renderGroup(item, currentPath)}
                    </fieldset>
                );
            } else {
                return renderSetting(item, currentPath);
            }
        });
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
            case 'boolean':
                control = (
                    <label className={styles.toggleSwitch}>
                        <input
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
                        className={styles.input}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => handleSettingChange(path, e.target.value)}
                    >
                        {protocols.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                );
                break;
            case 'string':
            default:
                control = (
                    <input
                        type="text"
                        className={styles.input}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => handleSettingChange(path, e.target.value)}
                    />
                );
                break;
        }

        return (
            <div key={key} className={styles.setting}>
                <label htmlFor={key} className={styles.settingLabel}>
                    {setting.label}
                </label>
                <p className={styles.settingDescription}>{setting.description}</p>
                {control}
            </div>
        );
    };

    if (isLoading) {
        return <div className={styles.container}>Loading settings...</div>;
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Application Settings</h1>
            {/* <p>Current user role: {user.role}</p> */}
            <div className={styles.form}>
                {Object.entries(appConfigSchema).map(([key, group]) => (
                    <fieldset key={key} className={styles.group}>
                        <legend className={styles.groupLabel}>{group.label}</legend>
                        <p className={styles.groupDescription}>{group.description}</p>
                        {renderGroup(group, [key])}
                    </fieldset>
                ))}
                 <div className={styles.actions}>
                    {saveSuccess && <span className={styles.successMessage}>Changes saved successfully!</span>}
                    {error && <p className={styles.errorMessage}>{error}</p>}
                    <button onClick={handleSave} disabled={!areSettingsChanged || isSaving} className={styles.saveButton}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApplicationSettings;
