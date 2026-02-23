
import React from 'react';
import { Questionnaire } from '../../types/questionnaire';
import { Edit, Trash2, Loader, Copy } from 'lucide-react';
import styles from './QuestionnaireList.module.css';
import { T, useT } from '../T';

interface QuestionnaireListProps {
    questionnaires: Questionnaire[];
    isLoading: boolean;
    onEdit: (questionnaire: Questionnaire) => void;
    onDelete: (questionnaire: Questionnaire) => void;
    onClone: (questionnaire: Questionnaire) => void;
}

const QuestionnaireList: React.FC<QuestionnaireListProps> = ({ questionnaires, isLoading, onEdit, onDelete, onClone }) => {
    const editT = useT('Edit');
    const cloneT = useT('Clone');
    const deleteT = useT('Delete');

    if (isLoading) {
        return <div className={styles.loaderContainer}><Loader className={styles.loader} size={32} /></div>;
    }

    if (questionnaires.length === 0) {
        return <div className={styles.emptyState}><T>No questionnaires found</T></div>;
    }

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead className={styles.tableHeader}>
                    <tr>
                        <th scope="col" className={styles.headerCell}><T>Domain</T></th>
                        <th scope="col" className={styles.headerCell}><T>Version</T></th>
                        <th scope="col" className={styles.headerCell}><T>Questions</T></th>
                        <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}><T>Actions</T></th>
                    </tr>
                </thead>
                <tbody className={styles.tableBody}>
                    {questionnaires.map(q => (
                        <tr key={q.id} className={styles.tableRow}>
                            <td className={styles.cell}>{q.domain}</td>
                            <td className={styles.cell}>{q.versionNumber}</td>
                            <td className={styles.cell}>{q.questions.length}</td>
                            <td className={`${styles.cell} ${styles.actionsCell}`}>
                                <div className={styles.actionsWrapper}>
                                    <button onClick={() => onEdit(q)} className={styles.actionButton} title={editT}><Edit size={18} /></button>
                                    <button onClick={() => onClone(q)} className={styles.actionButton} title={cloneT}><Copy size={18} /></button>
                                    <button onClick={() => onDelete(q)} className={`${styles.actionButton} ${styles.deleteButton}`} title={deleteT}><Trash2 size={18} /></button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default QuestionnaireList;
