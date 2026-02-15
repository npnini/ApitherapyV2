
import React from 'react';
import { Questionnaire } from '../../types/questionnaire';
import { useTranslation } from 'react-i18next';
import { Edit, Trash2, Loader, Copy } from 'lucide-react';
import styles from './QuestionnaireList.module.css';

interface QuestionnaireListProps {
    questionnaires: Questionnaire[];
    isLoading: boolean;
    onEdit: (questionnaire: Questionnaire) => void;
    onDelete: (questionnaire: Questionnaire) => void;
    onClone: (questionnaire: Questionnaire) => void;
}

const QuestionnaireList: React.FC<QuestionnaireListProps> = ({ questionnaires, isLoading, onEdit, onDelete, onClone }) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <div className={styles.loaderContainer}><Loader className={styles.loader} size={32} /></div>;
    }

    if (questionnaires.length === 0) {
        return <div className={styles.emptyState}>{t('noQuestionnairesFound')}</div>;
    }

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead className={styles.tableHeader}>
                    <tr>
                        <th scope="col" className={styles.headerCell}>{t('domain')}</th>
                        <th scope="col" className={styles.headerCell}>{t('version')}</th>
                        <th scope="col" className={styles.headerCell}>{t('questions')}</th>
                        <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}>{t('actions')}</th>
                    </tr>
                </thead>
                <tbody className={styles.tableBody}>
                    {questionnaires.map(q => (
                        <tr key={q.id} className={styles.tableRow}>
                            <td className={styles.cell}>{q.domain}</td>
                            <td className={styles.cell}>{q.versionNumber}</td>
                            <td className={styles.cell}>{q.questions.length}</td>
                            <td className={`${styles.cell} ${styles.actionsCell}`}>
                                <button onClick={() => onClone(q)} className={styles.actionButton} title={t('clone')}><Copy size={18} /></button>
                                <button onClick={() => onEdit(q)} className={styles.actionButton} title={t('edit')}><Edit size={18} /></button>
                                <button onClick={() => onDelete(q)} className={`${styles.actionButton} ${styles.deleteButton}`} title={t('delete')}><Trash2 size={18} /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default QuestionnaireList;
