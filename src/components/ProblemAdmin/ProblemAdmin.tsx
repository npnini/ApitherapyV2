import React, { useState, useEffect, useMemo } from 'react';
import { doc, collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useDocument } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { Problem } from '../../types/problem';
import ProblemList from './ProblemList';
import ProblemDetails from './ProblemDetails';
import ProblemForm from './ProblemForm';
import { uploadFile, deleteFile } from '../../services/storageService';
import styles from './ProblemAdmin.module.css';
import { useTranslationContext } from '../T';
import { getDoc } from 'firebase/firestore';

type View = 'list' | 'details' | 'form';

const ProblemAdmin: React.FC = () => {
  const { language: currentLang, registerString, getTranslation } = useTranslationContext();
  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appConfig, setAppConfig] = useState<{ defaultLanguage: string; supportedLanguages: string[] }>({ defaultLanguage: 'en', supportedLanguages: ['en'] });

  // String Registry for alerts
  const stringsToRegister = useMemo(() => [
    'Problem name is required',
    'Problem description is required',
    'Loading...',
    'Error:',
    'Edit Problem',
    'Delete Problem',
    'View Document'
  ], []);

  useEffect(() => {
    stringsToRegister.forEach(s => registerString(s));
  }, [registerString, stringsToRegister]);

  useEffect(() => {
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
  }, []);

  const [problemDocument, loading, error] = useDocument(selectedProblemId ? doc(db, 'problems', selectedProblemId) : undefined);
  const problem: Problem | undefined = problemDocument ? { id: problemDocument.id, ...problemDocument.data() } as Problem : undefined;

  const handleAddNew = () => {
    setSelectedProblemId(null);
    setCurrentView('form');
  };

  const handleEdit = (id: string) => {
    setSelectedProblemId(id);
    setCurrentView('form');
  };

  const handleBackToList = () => {
    setSelectedProblemId(null);
    setCurrentView('list');
  };

  const handleCancelForm = () => {
    setCurrentView('list');
    setSelectedProblemId(null);
  };

  const handleSubmit = async (formData: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null, lang: string) => {
    const nameValues = Object.values(formData.name || {}).map(v => v.trim()).filter(Boolean);
    if (nameValues.length === 0) {
      alert(getTranslation('Problem name is required'));
      return;
    }

    const descriptionValues = Object.values(formData.description || {}).map(v => v.trim()).filter(Boolean);
    if (descriptionValues.length === 0) {
      alert(getTranslation('Problem description is required'));
      return;
    }

    setIsSubmitting(true);
    try {
      let documentUrl: { [key: string]: string } = {};
      if (problem?.documentUrl) {
        if (typeof problem.documentUrl === 'string') {
          documentUrl.en = problem.documentUrl;
        } else {
          documentUrl = { ...problem.documentUrl };
        }
      }

      if (file) {
        if (documentUrl[lang]) {
          await deleteFile(documentUrl[lang]);
        }
        const newUrl = await uploadFile(file, `Problems/${selectedProblemId || 'new'}`);
        documentUrl[lang] = newUrl;
      } else if (
        problem?.documentUrl &&
        typeof problem.documentUrl === 'object' &&
        problem.documentUrl[lang] &&
        (!formData.documentUrl || !(formData.documentUrl as any)[lang])
      ) {
        await deleteFile(problem.documentUrl[lang]);
        delete documentUrl[lang];
      }

      const dataToSave = {
        ...formData,
        documentUrl: documentUrl,
        updatedAt: serverTimestamp(),
      };

      if (selectedProblemId) {
        await updateDoc(doc(db, 'problems', selectedProblemId), dataToSave);
      } else {
        await addDoc(collection(db, 'problems'), { ...dataToSave, createdAt: serverTimestamp() });
      }

      handleBackToList();
    } catch (error) {
      console.error('Error saving problem', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    if (currentView === 'list') {
      return <ProblemList onEdit={handleEdit} onAddNew={handleAddNew} appConfig={appConfig} />;
    }
    if (currentView === 'details' && problem) {
      return <ProblemDetails problem={problem} onBack={handleBackToList} onEdit={() => handleEdit(problem.id)} />;
    }
    if (currentView === 'form') {
      if (loading && selectedProblemId) {
        return <div>{getTranslation('Loading...')}</div>;
      }
      return <ProblemForm initialData={selectedProblemId ? problem : undefined} onSubmit={(data, file, lang) => handleSubmit(data, file, lang)} onCancel={handleCancelForm} isSubmitting={isSubmitting} appConfig={appConfig} />;
    }
    return null;
  };

  return (
    <div className={styles.container}>
      {error && <p className={styles.error}>{getTranslation('Error:')} {error.message}</p>}
      {renderContent()}
    </div>
  );
};

export default ProblemAdmin;

