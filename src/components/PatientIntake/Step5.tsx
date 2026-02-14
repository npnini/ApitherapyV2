import React from 'react';
import { useTranslation } from 'react-i18next';
import SignaturePad from './SignaturePad';
import { PatientData } from '../../types/patient';
import styles from './Questionnaire.module.css';
import stepStyles from './Step.module.css';
import { X } from 'lucide-react';

interface Step5Props {
    data: Partial<PatientData>;
    setData: (data: Partial<PatientData>) => void;
    hasAttemptedSubmit: boolean;
}

const Step5: React.FC<Step5Props> = ({ data, setData, hasAttemptedSubmit }) => {
  const { t } = useTranslation();

  const handleInputChange = (field: string, value: any) => {
    setData({
        ...data,
        medicalRecord: {
            ...data.medicalRecord,
            questionnaire: {
                ...data.medicalRecord?.questionnaire,
                [field]: value,
            },
        },
    });
  };

  const handleSaveSignature = (signature: string) => {
    handleInputChange('signature', signature);
  };

  // Defensively ensure questionnaire exists
  const questionnaire = data.medicalRecord?.questionnaire || {};
  const errors = {
    consent: hasAttemptedSubmit && !questionnaire.consent,
    signature: hasAttemptedSubmit && !questionnaire.signature,
    beeStingDetails: hasAttemptedSubmit && questionnaire.stungByBee && !questionnaire.beeStingDetails,
  };

  return (
    <div className={styles.formStep}>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>{t('medications')}</label>
        <div className={styles.radioGroup} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={questionnaire.aspirin || false}
              onChange={(e) => handleInputChange('aspirin', e.target.checked)}
            />
            {t('do_you_take_aspirin')}
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={questionnaire.betaBlockers || false}
              onChange={(e) => handleInputChange('betaBlockers', e.target.checked)}
            />
            {t('do_you_take_beta_blockers')}
          </label>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.radioGroup} style={{ flexDirection: 'column', alignItems: 'flex-start', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={questionnaire.stungByBee || false}
                onChange={(e) => handleInputChange('stungByBee', e.target.checked)}
              />
              {t('have_you_been_stung_by_a_bee_in_the_past')}
            </label>
            {questionnaire.stungByBee && (
              <div className={stepStyles.conditionalInput}>
                <input
                  type="text"
                  className={`${stepStyles.input} ${errors.beeStingDetails ? styles.errorBorder : ''}`}
                  value={questionnaire.beeStingDetails || ''}
                  onChange={(e) => handleInputChange('beeStingDetails', e.target.value)}
                  placeholder={t('how_many_times_and_at_what_age')}
                />
                {errors.beeStingDetails && <div className={styles.error}>{t('field_is_required')}</div>}
              </div>
            )}
        </div>
      </div>

      <div className={`${styles.formGroup} ${stepStyles.declarationSection}`}>
        <h2 className={stepStyles.declarationLabel}>{t('declaration_consent')}</h2>
        <ul>
          <li>{t('i_confirm_that_all_the_information_i_have_provided_is_true')}</li>
          <li>{t('i_am_aware_that_bee_venom_therapy_is_experimental')}</li>
          <li>{t('i_am_aware_that_i_am_not_allergic_to_bee_venom')}</li>
        </ul>
        <label className={`${styles.checkboxLabel} ${stepStyles.consentLabel}`}>
          <input type="checkbox" checked={questionnaire.consent || false} onChange={(e) => handleInputChange('consent', e.target.checked)} />
          {t('i_agree_to_the_terms_and_conditions')}
        </label>
        {errors.consent && <div className={styles.error}>{t('consent_is_required')}</div>}
      </div>

      <div className={`${styles.formGroup} ${stepStyles.signatureSection}`}>
        <div className={`${stepStyles.signatureBox} ${questionnaire.signature ? stepStyles.signed : ''} ${errors.signature ? styles.errorBorder : ''}`}>
          <h2 className={stepStyles.signatureLabel}>{t('patient_signature')}</h2>
            {questionnaire.signature ? (
                <>
                    <img src={questionnaire.signature} alt="Patient Signature" className={stepStyles.signatureImage} />
                    <button type="button" onClick={() => handleInputChange('signature', undefined)} className={stepStyles.clearSignatureButton}>
                        <X size={16} />
                    </button>
                </>
            ) : (
                <SignaturePad onSave={handleSaveSignature} />
            )}
        </div>
        {errors.signature && <div className={styles.error}>{t('signature_is_required')}</div>}
      </div>
    </div>
  );
};

export default Step5;
