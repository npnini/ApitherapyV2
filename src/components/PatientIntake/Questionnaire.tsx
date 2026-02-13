
import React from 'react';
import { PatientData } from '../../types/patient';
import { useTranslation } from 'react-i18next';
import styles from './Questionnaire.module.css';
import { ArrowLeft, Save } from 'lucide-react';

interface QuestionnaireProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
}

const ToggleSwitch: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => {
    const { t } = useTranslation();
    return (
        <div className={styles.toggleSwitch}>
            <span className={styles.toggleLabel}>{t(checked ? 'yes' : 'no')}</span>
            <label className={styles.switch}>
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <span className={styles.slider}></span>
            </label>
        </div>
    );
};

const Questionnaire: React.FC<QuestionnaireProps> = ({ patientData, onDataChange, onSave, onBack, isSaving }) => {
  const { t } = useTranslation();

  const handleQuestionChange = (question: string, value: boolean) => {
    const questionnaire = { ...patientData.medicalRecord?.questionnaire, [question]: value };
    onDataChange({ medicalRecord: { ...patientData.medicalRecord, questionnaire } });
  };
  
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    const questionnaire = { ...patientData.medicalRecord?.questionnaire, comments: value };
    onDataChange({ medicalRecord: { ...patientData.medicalRecord, questionnaire } });
  };

  return (
    <div className={styles.container}>
        <div className={styles.questionGroup}>
            <div className={styles.question}>
                <label className={styles.questionLabel}>{t('question_1')}</label>
                <ToggleSwitch label='q1' checked={patientData.medicalRecord?.questionnaire?.q1 || false} onChange={(value) => handleQuestionChange('q1', value)} />
            </div>
            <div className={styles.question}>
                <label className={styles.questionLabel}>{t('question_2')}</label>
                <ToggleSwitch label='q2' checked={patientData.medicalRecord?.questionnaire?.q2 || false} onChange={(value) => handleQuestionChange('q2', value)} />
            </div>
            <div className={styles.question}>
                <label className={styles.questionLabel}>{t('question_3')}</label>
                <ToggleSwitch label='q3' checked={patientData.medicalRecord?.questionnaire?.q3 || false} onChange={(value) => handleQuestionChange('q3', value)} />
            </div>
        </div>
        
        <div>
            <label className={styles.label} htmlFor='comments'>{t('comments')}</label>
            <textarea id='comments' name='comments' className={styles.textarea} value={patientData.medicalRecord?.questionnaire?.comments || ''} onChange={handleCommentChange} rows={4}></textarea>
        </div>

      <div className={styles.footer}>
        <button type="button" onClick={onBack} className={`${styles.button} ${styles.previousButton}`}><ArrowLeft size={16} />{t('previous')}</button>
        <button type="button" onClick={onSave} className={`${styles.button} ${styles.saveButton}`} disabled={isSaving}>
          <Save size={16} />{isSaving ? t('saving') : t('save_patient')}
        </button>
      </div>
    </div>
  );
};

export default Questionnaire;
