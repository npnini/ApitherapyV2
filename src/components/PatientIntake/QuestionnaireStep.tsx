import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PatientData, MedicalRecord as MedicalRecordType } from '../../types/patient';
import styles from './QuestionnaireStep.module.css';
import { getQuestionnaire } from '../../firebase/questionnaire';
import { Questionnaire } from '../../types/questionnaire';
import SignaturePad from './SignaturePad'; // Import SignaturePad

interface QuestionnaireStepProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
}

const QuestionnaireStep: React.FC<QuestionnaireStepProps> = ({ patientData, onDataChange }) => {
  const { t, i18n } = useTranslation();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQuestionnaire = async () => {
      const q = await getQuestionnaire("apitherapy");
      setQuestionnaire(q);
      if (q) {
        const updatedMedicalRecord = { 
            ...patientData.medicalRecord, 
            domain: q.domain, 
            version: q.versionNumber
        };
        onDataChange({ ...patientData, medicalRecord: updatedMedicalRecord as MedicalRecordType });
      }
      setIsLoading(false);
    };

    fetchQuestionnaire();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    const question = questionnaire?.questions.find(q => q.name === name);
    let finalValue: any;

    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (question && question.type === 'number') {
      finalValue = value === '' ? undefined : parseFloat(value);
    } else {
      finalValue = value;
    }

    const updatedMedicalRecord = { ...patientData.medicalRecord, [name]: finalValue };
    onDataChange({ ...patientData, medicalRecord: updatedMedicalRecord as MedicalRecordType });
  };

  const handleSignatureSave = (signature: string) => {
    const updatedMedicalRecord = { ...patientData.medicalRecord, signature };
    onDataChange({ ...patientData, medicalRecord: updatedMedicalRecord as MedicalRecordType });
  }

  const renderQuestion = (question: any) => {
    const translation = question.translations.find((t: any) => t.language === i18n.language) || question.translations.find((t: any) => t.language === 'en');
    const answer = patientData.medicalRecord?.[question.name as keyof MedicalRecordType];

    return (
      <div key={question.name} className={styles.questionRow}>
        {question.type === 'boolean' && (
          <input type="checkbox" name={question.name} onChange={handleChange} checked={!!answer} />
        )}
        <label className={styles.questionLabel}>{translation.text}</label>
        {(question.type === 'string' || question.type === 'text' || question.type === 'number') && (
          <div className={styles.inputWrapper}>
            {(question.type === 'string' || question.type === 'text') && (
              <input type="text" name={question.name} onChange={handleChange} value={answer ?? ''} className={styles.input} />
            )}
            {question.type === 'number' && (
              <input type="number" name={question.name} onChange={handleChange} value={answer ?? ''} className={styles.input} />
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
      return <div>Loading questions...</div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.formRow}>
        <div className={styles.section}>
          <label className={styles.label} htmlFor="condition">{t('condition')}</label>
          <textarea id="condition" name="condition" className={styles.textarea} value={patientData.medicalRecord?.condition || ''} onChange={handleChange} />
        </div>
        <div className={styles.section}>
          <label className={styles.label} htmlFor="severity">{t('severity')}</label>
          <select id="severity" name="severity" className={styles.select} value={patientData.medicalRecord?.severity || ''} onChange={handleChange}>
            {patientData.medicalRecord?.severity ? null : <option value="">{t('select_severity')}</option>}
            <option value="mild">{t('mild')}</option>
            <option value="moderate">{t('moderate')}</option>
            <option value="severe">{t('severe')}</option>
          </select>
        </div>
      </div>

      {questionnaire && (
        <div className={styles.questionsScrollableContainer}>
            <div className={styles.questionsGrid}>
                {questionnaire.questions.sort((a, b) => a.order - b.order).map(renderQuestion)}
            </div>
        </div>
      )}

      <div className={styles.signatureSection}>
        <div className={styles.consentSection}>
          <h3 className={styles.consentTitle}>{t('legal_confirmation_signature')}</h3>
          <p className={styles.consentText}>
            {t('legal_confirmation_text')}
          </p>
        </div>
        <fieldset className={styles.signaturePadWrapper}>
          <legend className={styles.signaturePadLabel}>{t('patient_signature')}</legend>
          <SignaturePad onSave={handleSignatureSave} initialSignature={patientData.medicalRecord?.signature} />
        </fieldset>
      </div>
    </div>
  );
};

export default QuestionnaireStep;
