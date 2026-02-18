import React, { useState } from 'react';
import { doc, collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useDocument } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { Problem } from '../../types/problem';
import ProblemList from './ProblemList';
import ProblemDetails from './ProblemDetails';
import ProblemForm from './ProblemForm';
import { uploadFile, deleteFile } from '../../services/storageService';
import styles from './ProblemAdmin.module.css';
import { useTranslation } from 'react-i18next';

type View = 'list' | 'details' | 'form';

const ProblemAdmin: React.FC = () => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (formData: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null) => {
    setIsSubmitting(true);
    try {
      let documentUrl : { [key: string]: string } = {};
      if (problem?.documentUrl) {
        if (typeof problem.documentUrl === 'string') {
            documentUrl.en = problem.documentUrl;
        } else {
            documentUrl = { ...problem.documentUrl };
        }
      }

      if (file) {
        if (documentUrl[currentLang]) {
          await deleteFile(documentUrl[currentLang]);
        }
        const newUrl = await uploadFile(file, `Problems/${selectedProblemId || 'new'}`);
        documentUrl[currentLang] = newUrl;
      } else if (
        problem?.documentUrl &&
        typeof problem.documentUrl === 'object' &&
        problem.documentUrl[currentLang] &&
        (!formData.documentUrl || !(formData.documentUrl as any)[currentLang])
      ) {
          await deleteFile(problem.documentUrl[currentLang]);
          delete documentUrl[currentLang];
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
      return <ProblemList onEdit={handleEdit} onAddNew={handleAddNew} />;
    }
    if (currentView === 'details' && problem) {
      return <ProblemDetails problem={problem} onBack={handleBackToList} onEdit={() => handleEdit(problem.id)} />;
    }
    if (currentView === 'form') {
        if (loading && selectedProblemId) {
            return <div>Loading...</div>;
        }
        return <ProblemForm initialData={selectedProblemId ? problem : undefined} onSubmit={handleSubmit} onCancel={handleCancelForm} isSubmitting={isSubmitting} />;
    }
    return null;
  };

  return (
    <div className={styles.container}>
      {error && <p className={styles.error}>Error: {error.message}</p>}
      {renderContent()}
    </div>
  );
};

export default ProblemAdmin;
