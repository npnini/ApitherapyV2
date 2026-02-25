import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { T, useT, useTranslationContext } from '../T';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import SignaturePad from './SignaturePad';
import styles from './PatientIntake.module.css';
import { PatientData } from '../../types/patient';
import { AppUser } from '../../types/user';
import { generateDocumentImage } from '../../utils/documentUtils';
import { uploadFile } from '../../services/storageService';

interface InstructionsTabProps {
    patientData: Partial<PatientData>;
    user: AppUser | null;
    onDataChange: (data: Partial<PatientData>, isInternal?: boolean) => void;
}

export interface InstructionsTabHandle {
    onSave: () => Promise<string | null>;
}

const InstructionsTab = forwardRef<InstructionsTabHandle, InstructionsTabProps>(({ patientData, user, onDataChange }, ref) => {
    const { language, direction } = useTranslationContext();
    const [template, setTemplate] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [patientSignature, setPatientSignature] = useState<string>('');
    // Note: Caretaker signature pad removed as per user comment #2 (Patient only)
    // If both are needed later, simply add caretakerSignature state and pad here.

    const noTemplateMsg = useT('No instructions template found for this language.');
    const errorMsg = useT('Error loading instructions template.');
    const provideSigMsg = useT('Please provide patient signature.');

    useEffect(() => {
        const fetchTemplate = async () => {
            setIsLoading(true);
            try {
                const configDoc = await getDoc(doc(db, 'app_config', 'main'));
                if (configDoc.exists()) {
                    const data = configDoc.data();
                    const templateUrl = data.treatmentInstructions?.instructionsFiles?.apitherapy?.[language];
                    if (templateUrl) {
                        const response = await fetch(templateUrl);
                        const text = await response.text();
                        setTemplate(text);
                    } else {
                        setTemplate(noTemplateMsg);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch instructions template:', err);
                setTemplate(errorMsg);
            } finally {
                setIsLoading(false);
            }
        };

        if (language) {
            fetchTemplate();
        }
    }, [language, noTemplateMsg, errorMsg]);

    const injectData = (text: string) => {
        if (!text) return '';

        const placeholders = {
            patientName: patientData.fullName || '____________________',
            identityNumber: patientData.identityNumber || '____________________'
        };

        let result = text;
        Object.entries(placeholders).forEach(([key, value]) => {
            const regex = new RegExp(`{${key}}|{{${key}}}`, 'g');
            result = result.replace(regex, `<b>${value}</b>`);
        });

        // Convert newlines to breaks if not already HTML
        if (!result.includes('<br') && !result.includes('<p>')) {
            result = result.replace(/\n/g, '<br/>');
        }

        return result;
    };

    useImperativeHandle(ref, () => ({
        onSave: async () => {
            if (instructionsSignedUrl && !patientSignature) {
                return instructionsSignedUrl;
            }

            if (!patientSignature) {
                alert(provideSigMsg);
                return null;
            }

            try {
                const blob = await generateDocumentImage(
                    template,
                    [
                        {
                            label: direction === 'rtl' ? 'חתימת המטופל:' : 'Patient Signature:',
                            dataUrl: patientSignature,
                            name: patientData.fullName || ''
                        }
                    ],
                    {
                        patientName: patientData.fullName || '',
                        identityNumber: patientData.identityNumber || ''
                    },
                    direction
                );

                const fileName = `treatment_instructions.png`;
                const folderPath = `Patients/${patientData.id || 'new'}`;
                const url = await uploadFile(new File([blob], fileName, { type: 'image/png' }), folderPath, fileName);
                return url;
            } catch (err) {
                console.error('Instructions generation/upload failed:', err);
                return null;
            }
        }
    }));

    const instructionsSignedUrl = patientData.medicalRecord?.patient_level_data?.treatmentInstructionsSignedUrl;

    if (isLoading) return <div className={styles.placeholderTab}><T>Loading template...</T></div>;

    if (instructionsSignedUrl) {
        return (
            <div className={styles.consentContainer}>
                <div className={styles.signedView}>
                    <img src={instructionsSignedUrl} alt="Signed Instructions" className={styles.signedDocumentImage} />
                    <button
                        className={styles.btnSecondary}
                        style={{ marginTop: '1rem' }}
                        onClick={() => {
                            onDataChange({
                                ...patientData,
                                medicalRecord: {
                                    ...(patientData.medicalRecord || {}),
                                    patient_level_data: {
                                        ...(patientData.medicalRecord?.patient_level_data || {}),
                                        treatmentInstructionsSignedUrl: ''
                                    }
                                }
                            });
                        }}
                    >
                        <T>Clear & Re-sign</T>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.consentContainer}>
            <div className={styles.documentView} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <div className={styles.documentPaper}>
                    <div dangerouslySetInnerHTML={{ __html: injectData(template) }} />
                </div>
            </div>

            <div className={styles.signatureSection}>
                <div className={styles.signatureBlock}>
                    <label className={styles.signatureLabel}><T>Patient Signature</T></label>
                    <SignaturePad
                        onSave={setPatientSignature}
                        initialSignature={patientSignature}
                    />
                </div>
            </div>
        </div>
    );
});

export default InstructionsTab;
