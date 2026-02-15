
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, getDoc } from 'firebase/firestore';
import { Questionnaire } from '../../types/questionnaire';
import { PlusCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import QuestionnaireList from './QuestionnaireList';
import QuestionnaireForm from './QuestionnaireForm';
import styles from './QuestionnaireAdmin.module.css';

const QuestionnaireAdmin: React.FC = () => {
    const { t } = useTranslation();
    const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<Questionnaire | null>(null);
    const [deletingItem, setDeletingItem] = useState<Questionnaire | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);

    const collectionRef = React.useMemo(() => collection(db, 'questionnaires'), []);

    useEffect(() => {
        const fetchAppConfig = async () => {
            try {
                const appConfigDocRef = doc(db, 'app_config', 'main');
                const appConfigSnap = await getDoc(appConfigDocRef);
                if (appConfigSnap.exists()) {
                    const configData = appConfigSnap.data();
                    if (configData.languageSettings && configData.languageSettings.supportedLanguages) {
                        setSupportedLanguages(configData.languageSettings.supportedLanguages);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch app config:", err);
                setError(t('failedToFetchAppConfig'));
            }
        };
        fetchAppConfig();
    }, [t]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getDocs(collectionRef);
            const fetchedItems = data.docs.map(doc => ({ ...(doc.data() as Omit<Questionnaire, 'id'>), id: doc.id }));
            fetchedItems.sort((a, b) => a.domain.localeCompare(b.domain) || a.versionNumber - b.versionNumber);
            setQuestionnaires(fetchedItems);
            setError(null);
        } catch (err) {
            setError(t('failedToFetchData'));
            console.error(err);
        }
        setIsLoading(false);
    }, [collectionRef, t]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSave = async (itemToSave: Questionnaire) => {
        setIsSubmitting(true);
        try {
            const { id, ...data } = itemToSave;
            if (id && questionnaires.some(q => q.id === id)) { // Check if it's an existing doc
                await updateDoc(doc(db, 'questionnaires', id), data);
            } else {
                await addDoc(collectionRef, data);
            }
            setIsEditing(null);
            fetchData();
        } catch (err) {
            setFormError(t('failedToSaveItem'));
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingItem) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, 'questionnaires', deletingItem.id));
            fetchData();
        } catch (err) {
            setError(t('failedToDeleteItem'));
            console.error(err);
        }
        setIsSubmitting(false);
        setDeletingItem(null);
    };
    
    const handleClone = (questionnaireToClone: Questionnaire) => {
        const newVersionNumber = Math.max(...questionnaires.filter(q => q.domain === questionnaireToClone.domain).map(q => q.versionNumber)) + 1;
        const { id, ...clonedData } = questionnaireToClone;
        const newQuestionnaire = {
            ...clonedData,
            versionNumber: newVersionNumber || 1,
        };
        setIsEditing(newQuestionnaire as Questionnaire);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>{t('questionnaire_configuration')}</h1>
                <button onClick={() => setIsEditing({ id: '', domain: 'apitherapy', versionNumber: 1, questions: [] })} className={styles.addButton}>
                    <PlusCircle size={18} /> {t('addNew')}
                </button>
            </div>
            {error && <p className={styles.errorBox}>{error}</p>}

            {isEditing && (
                <QuestionnaireForm 
                    questionnaire={isEditing} 
                    onSave={handleSave} 
                    onCancel={() => setIsEditing(null)}
                    error={formError}
                    isSubmitting={isSubmitting}
                    supportedLanguages={supportedLanguages}
                />
            )}

            {deletingItem && (
                 <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIconContainer}>
                               <AlertTriangle className={styles.modalIcon} aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className={styles.modalTitle}>{t('deleteItem')}</h2>
                                <p className={styles.modalText}>{t('deleteConfirmation', { domain: deletingItem.domain, version: deletingItem.versionNumber })}</p>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setDeletingItem(null)} disabled={isSubmitting} className={styles.cancelButton}>{t('cancel')}</button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className={styles.confirmDeleteButton}>
                                {isSubmitting ? t('deleting') : t('confirmDelete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <QuestionnaireList 
                questionnaires={questionnaires} 
                isLoading={isLoading} 
                onEdit={setIsEditing} 
                onDelete={setDeletingItem} 
                onClone={handleClone}
            />
        </div>
    );
};

export default QuestionnaireAdmin;
