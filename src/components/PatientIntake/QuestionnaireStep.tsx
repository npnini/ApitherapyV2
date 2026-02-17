import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PatientData, QuestionnaireResponse as QuestionnaireResponseType } from '../../types/patient';
import styles from './QuestionnaireStep.module.css';
import { getQuestionnaire } from '../../firebase/questionnaire';
import { Questionnaire, Question } from '../../types/questionnaire';
import SignaturePad from './SignaturePad';

interface QuestionnaireStepProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
}

interface AutosizedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const AutosizedTextarea: React.FC<AutosizedTextareaProps> = (props) => {
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const textArea = textAreaRef.current;
        if (textArea) {
            textArea.style.height = '1px';
            textArea.style.height = textArea.scrollHeight + 'px';
        }
    }, [props.value]);

    return <textarea {...props} ref={textAreaRef} rows={1} />;
};


const QuestionnaireStep: React.FC<QuestionnaireStepProps> = ({ patientData, onDataChange }) => {
  const { t, i18n } = useTranslation();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQuestionnaire = async () => {
      const q = await getQuestionnaire("apitherapy");
      setQuestionnaire(q);
      if (q) {
        const updatedQuestionnaireResponse = { 
            ...patientData.questionnaireResponse, 
            domain: q.domain, 
            version: q.versionNumber
        };
        onDataChange({ ...patientData, questionnaireResponse: updatedQuestionnaireResponse as QuestionnaireResponseType });
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

    const updatedQuestionnaireResponse = { ...patientData.questionnaireResponse, [name]: finalValue };
    onDataChange({ ...patientData, questionnaireResponse: updatedQuestionnaireResponse as QuestionnaireResponseType });
  };

  const handleSignatureSave = (signature: string) => {
    const updatedQuestionnaireResponse = { ...patientData.questionnaireResponse, signature };
    onDataChange({ ...patientData, questionnaireResponse: updatedQuestionnaireResponse as QuestionnaireResponseType });
  }

  const renderQuestion = (question: Question) => {
    const translation = question.translations.find((t) => t.language === i18n.language) || question.translations.find((t) => t.language === 'en');
    const answer = patientData.questionnaireResponse?.[question.name as keyof QuestionnaireResponseType] ?? '';

    if (question.type === 'boolean') {
        return (
            <div key={question.name} className={styles.booleanQuestionRow}>
                <label className={styles.booleanLabel}>
                    <input type="checkbox" name={question.name} onChange={handleChange} checked={!!answer} />
                    {translation?.text || question.name}
                    {question.required && <span className={styles.requiredAsterisk}>*</span>}
                </label>
            </div>
        );
    }

    return (
      <div key={question.name} className={styles.questionRow}>
        <label className={styles.label}>
            {translation?.text || question.name}
            {question.required && <span className={styles.requiredAsterisk}>*</span>}
        </label>
        <div className={styles.inputWrapper}>
            {question.type === 'string' && (
                <AutosizedTextarea name={question.name} onChange={handleChange} value={answer} className={styles.textarea} />
            )}
            {question.type === 'text' && (
                <AutosizedTextarea name={question.name} onChange={handleChange} value={answer} className={styles.textarea} />
            )}
            {question.type === 'number' && (
              <input type="number" name={question.name} onChange={handleChange} value={answer} className={styles.input} />
            )}
            {question.type === 'select' && question.options && (
                <select name={question.name} value={answer} onChange={handleChange} className={styles.select}>
                    {(!answer) && <option value="">{t('please_select')}</option>}
                    {question.options.map(op => {
                        const optionTranslation = op.translations[i18n.language] || op.translations['en'];
                        return <option key={op.value} value={op.value}>{optionTranslation}</option>;
                    })}
                </select>
            )}
        </div>
      </div>
    );
  };

  if (isLoading) {
      return <div>Loading questions...</div>
  }

  return (
    <div className={styles.container}>
      {questionnaire && (
        <div className={styles.questionsScrollableContainer}>
            <div className={styles.questionsGrid}>
                {questionnaire.questions.sort((a, b) => a.order - b.order).map(renderQuestion)}
            </div>
        </div>
      )}

      <div className={styles.consentAndSignatureContainer}>
        <fieldset className={styles.consentSection}>
          <legend className={styles.consentTitle}>{t('legal_confirmation_signature')}</legend>
          <p className={styles.consentText}>
            {t('legal_confirmation_text')}
          </p>
        </fieldset>
        <fieldset className={styles.signaturePadWrapper}>
          <legend className={styles.signaturePadLabel}>{t('patient_signature')}</legend>
          <SignaturePad onSave={handleSignatureSave} initialSignature={patientData.questionnaireResponse?.signature} />
        </fieldset>
      </div>
    </div>
  );
};

export default QuestionnaireStep;
