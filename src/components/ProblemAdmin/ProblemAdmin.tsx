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
  const { t } = useTranslation();
  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [problemDocument, loading, error] = useDocument(selectedProblemId ? doc(db, 'problems', selectedProblemId) : undefined);
  const problem = problemDocument?.data() as Problem;

  const handleSelectProblem = (id: string) => {
    setSelectedProblemId(id);
    setCurrentView('details');
  };

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

  const handleFormSubmit = async (data: Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>, file: File | null) => {
    setIsSubmitting(true);
    try {
      let documentUrl: string | null = data.documentUrl || null;

      if (file) {
        if (documentUrl) {
          await deleteFile(documentUrl);
        }
        documentUrl = await uploadFile(file, 'Problems');
      } else if (data.documentUrl === undefined && problem?.documentUrl) {
        await deleteFile(problem.documentUrl);
        documentUrl = null;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { documentUrl: _, ...restData } = data;

      if (selectedProblemId) {
        const problemRef = doc(db, 'problems', selectedProblemId);
        await updateDoc(problemRef, {
          ...restData,
          documentUrl: documentUrl || null,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'problems'), {
          ...restData,
          documentUrl: documentUrl || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setCurrentView('list');
      setSelectedProblemId(null);
    } catch (e) {
      console.error("Error saving problem: ", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    return (
      <>
        <ProblemList onEdit={handleEdit} onAddNew={handleAddNew} />
        {currentView === 'details' && (
          <>
            {loading && <p>{t('loading_problems')}</p>}
            {error && <p>Error loading problem details.</p>}
            {problem && <ProblemDetails problem={{...problem, id: selectedProblemId! }} onEdit={() => handleEdit(selectedProblemId!)} onBack={handleBackToList} />}
          </>
        )}
        {currentView === 'form' && (
          <ProblemForm initialData={problem} onSubmit={handleFormSubmit} onCancel={handleCancelForm} isSubmitting={isSubmitting} />
        )}
      </>
    );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('problem_admin_title')}</h1>
      {renderContent()}
    </div>
  );
};

export default ProblemAdmin;