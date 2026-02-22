import React, { useState, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Problem } from '../../types/problem';
import styles from './ProblemList.module.css';
import { Edit, Trash2, FileCheck2 } from 'lucide-react';
import Modal from '../shared/Modal';
import { T, useT, useTranslationContext } from '../T';
import Tooltip from '../common/Tooltip';

interface ProblemListProps {
  onEdit: (id: string) => void;
  onAddNew: () => void;
  appConfig: { defaultLanguage: string; supportedLanguages: string[] };
}

const ProblemList: React.FC<ProblemListProps> = ({ onEdit, onAddNew }) => {
  const { language: currentLang } = useTranslationContext();
  const [problemsCollection, loading, error] = useCollection(collection(db, 'problems'));
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [problemToDelete, setProblemToDelete] = useState<string | null>(null);

  const searchPlaceholder = useT('Search...');
  const modalTitle = useT('Delete Problem');
  const modalMessage = useT('Are you sure you want to delete this problem? This action cannot be undone.');
  const confirmText = useT('Delete');
  const cancelText = useT('Cancel');

  const problems = useMemo(() => {
    if (!problemsCollection) return [];
    return problemsCollection.docs.map(doc => ({ ...doc.data(), id: doc.id } as Problem));
  }, [problemsCollection]);

  const getDocumentUrl = (problem: Problem) => {
    if (problem.documentUrl && typeof problem.documentUrl === 'object') {
      return problem.documentUrl[currentLang] || problem.documentUrl['en'];
    }
    // Fallback for old string-based URLs, if any
    if (typeof problem.documentUrl === 'string') {
      return problem.documentUrl;
    }
    return undefined;
  };

  const filteredProblems = useMemo(() => {
    return problems.filter(problem => {
      const name = typeof problem.name === 'object' ? (problem.name[currentLang] || problem.name['en'] || Object.values(problem.name)[0] || '') : (problem.name as string);
      const description = typeof problem.description === 'object' ? (problem.description[currentLang] || problem.description['en'] || Object.values(problem.description)[0] || '') : (problem.description as string);
      return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        description.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [problems, searchTerm, currentLang]);

  const handleDeleteClick = (id: string) => {
    setProblemToDelete(id);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (problemToDelete) {
      await deleteDoc(doc(db, 'problems', problemToDelete));
      setIsModalOpen(false);
      setProblemToDelete(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}><T>Problems list</T></h2>
        <button onClick={onAddNew} className={styles.addNewButton}><T>Add new problem</T></button>
      </div>
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
      />
      {loading && <p className={styles.loadingText}><T>Loading problems...</T></p>}
      {error && <p className={styles.errorText}><T>Error loading problems.</T></p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th><T>Name</T></th>
            <th><T>Description</T></th>
            <th><T>Document</T></th>
            <th><T>Actions</T></th>
          </tr>
        </thead>
        <tbody>
          {filteredProblems.map(problem => {
            const documentUrl = getDocumentUrl(problem);
            const name = typeof problem.name === 'object' ? (problem.name[currentLang] || problem.name['en'] || Object.values(problem.name)[0] || '') : (problem.name as string);
            const description = typeof problem.description === 'object' ? (problem.description[currentLang] || problem.description['en'] || Object.values(problem.description)[0] || '') : (problem.description as string);
            return (
              <tr key={problem.id}>
                <td>{name}</td>
                <td>{description}</td>
                <td className={styles.documentCell}>
                  {documentUrl && (
                    <Tooltip text={useT('View Document')}>
                      <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                        <FileCheck2 size={18} />
                      </a>
                    </Tooltip>
                  )}
                </td>
                <td className={styles.actionCell}>
                  <Tooltip text={useT('Edit Problem')}>
                    <button onClick={() => onEdit(problem.id)} className={styles.iconButton}>
                      <Edit size={18} />
                    </button>
                  </Tooltip>
                  <Tooltip text={useT('Delete Problem')}>
                    <button onClick={() => handleDeleteClick(problem.id)} className={styles.iconButton}>
                      <Trash2 size={18} />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title={modalTitle}
        message={modalMessage}
        confirmText={confirmText}
        cancelText={cancelText}
      />
    </div>
  );
};

export default ProblemList;

