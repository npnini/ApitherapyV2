import React, { useState, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Problem } from '../../types/problem';
import styles from './ProblemList.module.css';
import { Edit, Trash2, FileCheck2 } from 'lucide-react';
import Modal from '../shared/Modal';
import { useTranslation } from 'react-i18next';

interface ProblemListProps {
  onEdit: (id: string) => void;
  onAddNew: () => void;
}

const ProblemList: React.FC<ProblemListProps> = ({ onEdit, onAddNew }) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [problemsCollection, loading, error] = useCollection(collection(db, 'problems'));
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [problemToDelete, setProblemToDelete] = useState<string | null>(null);

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
    return problems.filter(problem =>
      problem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      problem.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [problems, searchTerm]);

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
        <h2 className={styles.title}>{t('problems_title')}</h2>
        <button onClick={onAddNew} className={styles.addNewButton}>{t('create_new_problem')}</button>
      </div>
      <input
        type="text"
        placeholder={t('search_placeholder_main')}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
      />
      {loading && <p className={styles.loadingText}>{t('loading_problems')}</p>}
      {error && <p className={styles.errorText}>Error loading problems.</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('table_header_name')}</th>
            <th>{t('table_header_description')}</th>
            <th>{t('table_header_document')}</th>
            <th>{t('table_header_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {filteredProblems.map(problem => {
            const documentUrl = getDocumentUrl(problem);
            return (
              <tr key={problem.id}>
                <td>{problem.name}</td>
                <td>{problem.description}</td>
                <td className={styles.documentCell}>
                  {documentUrl && (
                    <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                      <FileCheck2 size={18} />
                    </a>
                  )}
                </td>
                <td className={styles.actionCell}>
                  <button onClick={() => onEdit(problem.id)} className={styles.iconButton}>
                    <Edit size={18} />
                  </button>
                  <button onClick={() => handleDeleteClick(problem.id)} className={styles.iconButton}>
                    <Trash2 size={18} />
                  </button>
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
        title="Delete Problem"
        message="Are you sure you want to delete this problem? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />
    </div>
  );
};

export default ProblemList;
