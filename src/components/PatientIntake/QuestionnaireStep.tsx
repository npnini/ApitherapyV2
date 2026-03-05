import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { JoinedPatientData, PatientData, QuestionnaireResponse as QuestionnaireResponseType } from '../../types/patient';
import styles from './QuestionnaireStep.module.css';
import { Questionnaire, Question, Translation } from '../../types/questionnaire';
import SignaturePad from './SignaturePad';
import { T, useT, useTranslationContext } from '../T';
import { evaluateGroupVisibility } from '../../utils/questionnaireUtils';

interface QuestionnaireStepProps {
  patientData: Partial<JoinedPatientData>;
  onDataChange: (data: Partial<JoinedPatientData>, isInternal?: boolean) => void;
  showErrors?: boolean;
  questionnaire: Questionnaire | null;
}

interface AutosizedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

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


const QuestionnaireStep: React.FC<QuestionnaireStepProps> = ({ patientData, onDataChange, showErrors = false, questionnaire }) => {
  const { language } = useTranslationContext();

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

  const renderQuestion = (question: Question, isGrouped: boolean) => {
    const translation = question.translations.find((t) => t.language === language) || question.translations.find((t) => t.language === 'en');
    const answer = patientData.questionnaireResponse?.[question.name as keyof QuestionnaireResponseType] ?? '';

    const content = (
      <>
        {question.type === 'boolean' ? (
          <div key={question.name} className={styles.booleanQuestionBlock}>
            <label className={`${styles.label} ${showErrors && (answer === undefined || answer === '') ? styles.errorLabel : ''}`}>
              {translation?.text || question.name}
              <span className={styles.requiredAsterisk}>*</span>
            </label>
            <div className={styles.booleanOptions}>
              <label className={styles.booleanOptionLabel}>
                <input
                  type="checkbox"
                  checked={answer === true}
                  onChange={() => {
                    const updatedQuestionnaireResponse = { ...patientData.questionnaireResponse, [question.name]: true };
                    onDataChange({ ...patientData, questionnaireResponse: updatedQuestionnaireResponse as QuestionnaireResponseType });
                  }}
                />
                <T>Yes</T>
              </label>
              <label className={styles.booleanOptionLabel}>
                <input
                  type="checkbox"
                  checked={answer === false}
                  onChange={() => {
                    const updatedQuestionnaireResponse = { ...patientData.questionnaireResponse, [question.name]: false };
                    onDataChange({ ...patientData, questionnaireResponse: updatedQuestionnaireResponse as QuestionnaireResponseType });
                  }}
                />
                <T>No</T>
              </label>
            </div>
            {showErrors && (answer === undefined || answer === '') && (
              <p className={styles.errorMessage}>
                <T>Please select an answer</T>
              </p>
            )}
          </div>
        ) : (
          <div key={question.name} className={styles.questionRow}>
            <label className={styles.label}>
              {translation?.text || question.name}
              {question.required && <span className={styles.requiredAsterisk}>*</span>}
            </label>
            <div className={styles.inputWrapper}>
              {(question.type === 'string' || question.type === 'text') && (
                <AutosizedTextarea name={question.name} onChange={handleChange} value={answer} className={styles.textarea} />
              )}
              {question.type === 'number' && (
                <input type="number" name={question.name} onChange={handleChange} value={answer} className={styles.input} />
              )}
              {question.type === 'select' && question.options && (
                <select name={question.name} value={answer} onChange={handleChange} className={styles.select}>
                  {(!answer) && <option value=""><T>Please select</T></option>}
                  {question.options.map(op => {
                    const optionTranslation = op.translations[language] || op.translations['en'];
                    return <option key={op.value} value={op.value}>{optionTranslation}</option>;
                  })}
                </select>
              )}
            </div>
          </div>
        )}
      </>
    );

    return (
      <div key={question.name} className={isGrouped ? styles.groupedQuestion : ''}>
        {content}
      </div>
    );
  };

  if (!questionnaire) {
    return <div><T>Loading questions...</T></div>
  }

  // Pre-calculate visible groups and questions
  const visibleGroups = (questionnaire.groups || []).filter(group => evaluateGroupVisibility(group, patientData as PatientData));
  const visibleGroupIds = new Set(visibleGroups.map(g => g.id));

  const visibleQuestions = questionnaire.questions
    .filter(q => !q.groupId || visibleGroupIds.has(q.groupId))
    .sort((a, b) => a.order - b.order);

  let lastGroupId: string | undefined = undefined;

  return (
    <div className={styles.container}>
      <div className={styles.questionsScrollableContainer}>
        <div className={styles.questionsGrid}>
          {visibleQuestions.map((q) => {
            const showGroupHeader = q.groupId && q.groupId !== lastGroupId;
            lastGroupId = q.groupId;

            const group = q.groupId ? visibleGroups.find(g => g.id === q.groupId) : undefined;
            const groupTranslation = group?.translations.find(t => t.language === language) || group?.translations.find(t => t.language === 'en');

            return (
              <React.Fragment key={q.name}>
                {showGroupHeader && (
                  <h3 className={styles.groupHeader}>{groupTranslation?.text || q.groupId}</h3>
                )}
                {renderQuestion(q, !!q.groupId)}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className={styles.consentAndSignatureContainer}>
        <fieldset className={styles.consentSection}>
          <legend className={styles.consentTitle}><T>Patient Consent</T></legend>
          <p className={styles.consentText}>
            <T>I hereby confirm that all the information I have provided in the attached questionnaire is the truth.</T>
          </p>
        </fieldset>
        <fieldset className={styles.signaturePadWrapper}>
          <legend className={styles.signaturePadLabel}><T>Patient Signature</T></legend>
          <SignaturePad onSave={handleSignatureSave} initialSignature={patientData.questionnaireResponse?.signature} />
        </fieldset>
      </div>
    </div>
  );
};

export default QuestionnaireStep;
