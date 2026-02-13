import React from 'react';
import { useTranslation } from 'react-i18next';
import SignaturePad from './SignaturePad';
import styles from './Questionnaire.module.css';
import stepStyles from './Step.module.css';
import { X } from 'lucide-react';

interface Step5Props {
  patientData: any;
  handleInputChange: (field: string, value: any) => void;
  handleSaveSignature: (signature: string) => void;
}

const Step5: React.FC<Step5Props> = ({ patientData, handleInputChange, handleSaveSignature }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.formStep}>
      <div className={styles.checkboxGrid}>
        <label className={styles.checkboxOption}>
          <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.aspirin || false} onChange={(e) => handleInputChange('aspirin', e.target.checked)} />
          {t('do_you_take_aspirin')}
        </label>
        <label className={styles.checkboxOption}>
          <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.betaBlockers || false} onChange={(e) => handleInputChange('betaBlockers', e.target.checked)} />
          {t('do_you_take_beta_blockers')}
        </label>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.checkboxOption}>
          <input
            type="checkbox"
            checked={patientData.medicalRecord?.questionnaire?.stungByBee || false}
            onChange={(e) => handleInputChange('stungByBee', e.target.checked)}
          />
          {t('have_you_been_stung_by_a_bee_in_the_past')}
        </label>
        {patientData.medicalRecord?.questionnaire?.stungByBee && (
          <div className={stepStyles.conditionalInput}>
            <input
              type="text"
              className={stepStyles.input}
              value={patientData.medicalRecord?.questionnaire?.beeStingDetails || ''}
              onChange={(e) => handleInputChange('beeStingDetails', e.target.value)}
              placeholder={t('how_many_times_and_at_what_age')}
            />
          </div>
        )}
      </div>

      <div className={`${styles.formGroup} ${stepStyles.declarationSection}`}>
        <h2>{t('declaration_consent')}</h2>
        <ul>
          <li>{t('i_confirm_that_all_the_information_i_have_provided_is_true')}</li>
          <li>{t('i_am_aware_that_bee_venom_therapy_is_experimental')}</li>
          <li>{t('i_am_aware_that_i_am_not_allergic_to_bee_venom')}</li>
        </ul>
        <label className={`${styles.checkboxOption} ${stepStyles.consentLabel}`}>
          <input type="checkbox" checked={patientData.medicalRecord?.questionnaire?.consent || false} onChange={(e) => handleInputChange('consent', e.target.checked)} />
          {t('i_agree_to_the_terms_and_conditions')}
        </label>
      </div>

      <div className={styles.formGroup}>
        <h2>{t('patient_signature')}</h2>
        <div className={`${stepStyles.signatureBox} ${patientData.medicalRecord?.questionnaire?.signature ? stepStyles.signed : ''}`}>
            {patientData.medicalRecord?.questionnaire?.signature ? (
                <>
                    <img src={patientData.medicalRecord.questionnaire.signature} alt="Patient Signature" className={stepStyles.signatureImage} />
                    <button type="button" onClick={() => handleInputChange('signature', undefined)} className={stepStyles.clearSignatureButton}>
                        <X size={16} />
                    </button>
                </>
            ) : (
                <SignaturePad onSave={handleSaveSignature} />
            )}
        </div>
      </div>
    </div>
  );
};

export default Step5;
