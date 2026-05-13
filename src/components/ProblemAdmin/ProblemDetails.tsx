import React from 'react';
import { Problem } from '../../types/problem';
import styles from './ProblemDetails.module.css';
import { T, useTranslationContext } from '../T';
import { ChevronLeft, Edit as EditIcon, FileCheck2 } from 'lucide-react';

import { StorageLink } from '../shared/StorageComponents';
import { getFieldContent } from '../../utils/storageUtils';

interface ProblemDetailsProps {
  problem: Problem;
  onEdit: () => void;
  onBack: () => void;
}

const ProblemDetails: React.FC<ProblemDetailsProps> = ({ problem, onEdit, onBack }) => {
  const { language: currentLang } = useTranslationContext();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={onBack} className={styles.backButton}>
          <ChevronLeft size={20} />
          <T>Back to list</T>
        </button>
        <h2 className={styles.title}>{getFieldContent(problem.name, currentLang)}</h2>
        <button onClick={onEdit} className={styles.editButton}>
          <EditIcon size={20} />
          <T>Edit</T>
        </button>
      </div>

      <div className={styles.content}>
        <p className={styles.description}>{getFieldContent(problem.description, currentLang)}</p>

        {problem.documentUrl && (
          <div className={styles.documentSection}>
            <h3 className={styles.sectionTitle}><T>Related document</T></h3>
            <StorageLink 
              path={problem.documentUrl} 
              lang={currentLang} 
              className={styles.documentLink}
              label={<><FileCheck2 size={18} /> <T>View document</T></>}
            />
          </div>
        )}

        {problem.protocolId && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}><T>Protocol</T></h3>
            {/* Future implementation: Display protocol names instead of IDs */}
            <ul className={styles.list}>
              <li>{problem.protocolId}</li>
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

