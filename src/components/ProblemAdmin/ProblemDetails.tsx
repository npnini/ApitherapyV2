import React from 'react';
import { Problem } from '../../types/problem';
import styles from './ProblemDetails.module.css';
import { T, useTranslationContext } from '../T';
import { ChevronLeft, Edit as EditIcon, FileCheck2 } from 'lucide-react';

interface ProblemDetailsProps {
  problem: Problem;
  onEdit: () => void;
  onBack: () => void;
}

const ProblemDetails: React.FC<ProblemDetailsProps> = ({ problem, onEdit, onBack }) => {
  const { language: currentLang } = useTranslationContext();

  const getDocumentUrl = () => {
    if (typeof problem.documentUrl === 'string') {
      return problem.documentUrl;
    }
    if (problem.documentUrl && typeof problem.documentUrl === 'object') {
      return problem.documentUrl[currentLang] || problem.documentUrl.en;
    }
    return null;
  };

  const documentUrl = getDocumentUrl();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={onBack} className={styles.backButton}>
          <ChevronLeft size={20} />
          <T>Back to list</T>
        </button>
        <h2 className={styles.title}>{typeof problem.name === 'object' ? (problem.name[currentLang] || problem.name['en'] || Object.values(problem.name)[0] || '') : (problem.name as string)}</h2>
        <button onClick={onEdit} className={styles.editButton}>
          <EditIcon size={20} />
          <T>Edit</T>
        </button>
      </div>

      <div className={styles.content}>
        <p className={styles.description}>{typeof problem.description === 'object' ? (problem.description[currentLang] || problem.description['en'] || Object.values(problem.description)[0] || '') : (problem.description as string)}</p>

        {documentUrl && (
          <div className={styles.documentSection}>
            <h3 className={styles.sectionTitle}><T>Related document</T></h3>
            <a href={documentUrl} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
              <FileCheck2 size={18} /> <T>View document</T>
            </a>
          </div>
        )}

        {problem.protocolIds && problem.protocolIds.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}><T>Protocols</T></h3>
            {/* Future implementation: Display protocol names instead of IDs */}
            <ul className={styles.list}>
              {problem.protocolIds.map(id => <li key={id}>{id}</li>)}
            </ul>
          </div>
        )}

        {problem.measureIds && problem.measureIds.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}><T>Measures</T></h3>
            {/* Future implementation: Display measure names instead of IDs */}
            <ul className={styles.list}>
              {problem.measureIds.map(id => <li key={id}>{id}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProblemDetails;

