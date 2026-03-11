import React, { useState, useMemo } from 'react';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Problem } from '../../types/problem';
import styles from './ProblemList.module.css';
import { Plus, Trash2, Edit, Search, X, FileCheck2 } from 'lucide-react';
import Modal from '../shared/Modal';
import { T, useT, useTranslationContext } from '../T';
import Tooltip from '../common/Tooltip';

interface ProblemListProps {
  onEdit: (id: string) => void;
  onAddNew: () => void;
  appConfig: { defaultLanguage: string; supportedLanguages: string[] };
}

const ProblemList: React.FC<ProblemListProps> = ({ onEdit, onAddNew, appConfig }) => {
  const { language: currentLang, getTranslation } = useTranslationContext();
  const [problemsCollection, loading, error] = useCollection(collection(db, 'cfg_problems'));
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
    if (!searchTerm.trim()) return problems;

    const term = searchTerm.toLowerCase().trim();
    return problems.filter(problem => {
      const name = typeof problem.name === 'object'
        ? (problem.name[currentLang] || problem.name[appConfig.defaultLanguage] || Object.values(problem.name)[0] || '')
        : (problem.name as string);
      if (name.toLowerCase().includes(term)) return true;

      const description = typeof problem.description === 'object'
        ? (problem.description[currentLang] || problem.description[appConfig.defaultLanguage] || Object.values(problem.description)[0] || '')
        : (problem.description as string);
      if (description.toLowerCase().includes(term)) return true;

      return false;
    });
  }, [problems, searchTerm, currentLang, appConfig.defaultLanguage]);

  const handleDeleteClick = (id: string) => {
    setProblemToDelete(id);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (problemToDelete) {
      await deleteDoc(doc(db, 'cfg_problems', problemToDelete));
      setIsModalOpen(false);
      setProblemToDelete(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}><T>Problems Configuration</T></h1>
        <div className={styles.headerActions}>
          <div className={styles.searchContainer}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder={getTranslation('Search problems...')}
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
          <button onClick={onAddNew} className={styles.addNewButton}>
            <Plus size={18} /> <T>Add Problem</T>
          </button>
        </div>
      </div>
      {loading && <p className={styles.loadingText}><T>Loading problems...</T></p>}
      {error && <p className={styles.errorText}><T>Error loading problems.</T></p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th><T>Name</T></th>
            <th><T>Description</T></th>
            <th><T>Status</T></th>
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
                <td>
                  <span className={`${styles.statusBadge || ''} ${problem.status === 'active' ? styles.badgeActive : styles.badgeInactive} `}>
                    <T>{problem.status === 'active' ? 'Active' : 'Inactive'}</T>
                  </span>
                </td>
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
                  {problem.reference_count > 0 ? (
                    <Tooltip text={getTranslation('Cannot delete: problem is referenced in other objects')}>
                      <button className={`${styles.iconButton} ${styles.deleteButtonDisabled} `} disabled>
                        <Trash2 size={18} />
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip text={useT('Delete Problem')}>
                      <button onClick={() => handleDeleteClick(problem.id)} className={`${styles.iconButton} ${styles.deleteButton} `}>
                        <Trash2 size={18} />
                      </button>
                    </Tooltip>
                  )}
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
        title={getTranslation('Delete Problem')}
        message={getTranslation('Are you sure you want to delete this problem? This action cannot be undone.')}
        confirmText={getTranslation('Delete')}
        cancelText={getTranslation('Cancel')}
      />
    </div>
  );
};

export default ProblemList;

