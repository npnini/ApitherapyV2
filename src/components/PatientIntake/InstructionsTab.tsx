import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { T, useT, useTranslationContext } from '../T';
import { doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../../firebase';
import { ref as sRef, getDownloadURL } from 'firebase/storage';
import SignaturePad from './SignaturePad';
import styles from './PatientIntake.module.css';
import { JoinedPatientData, PatientData } from '../../types/patient';
import { AppUser } from '../../types/user';
import { generateDocumentImage } from '../../utils/documentUtils';
import { uploadFile, deleteFile } from '../../services/storageService';

interface InstructionsTabProps {
    patientData: Partial<JoinedPatientData>;
    user: AppUser | null;
    onDataChange: (data: Partial<JoinedPatientData>, isInternal?: boolean) => void;
}

export interface InstructionsTabHandle {
    onSave: () => Promise<string | null>;
}

const InstructionsTab = forwardRef<InstructionsTabHandle, InstructionsTabProps>(({ patientData, user, onDataChange }, ref) => {
    const { language, direction } = useTranslationContext();
    const [template, setTemplate] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [patientSignature, setPatientSignature] = useState<string>('');
    const [imgError, setImgError] = useState(false);
    const [displayUrl, setDisplayUrl] = useState<string>('');
    // Note: Caretaker signature pad removed as per user comment #2 (Patient only)
    // If both are needed later, simply add caretakerSignature state and pad here.

    const noTemplateMsg = useT('No guidelines template found for this language.');
    const errorMsg = useT('Error loading guidelines template.');
    const provideSigMsg = useT('Please provide patient signature.');
    const tPatientSignatureLabel = useT('Patient Signature:');

    useEffect(() => {
        const fetchTemplate = async () => {
            setIsLoading(true);
            try {
                const configDoc = await getDoc(doc(db, 'cfg_app_config', 'main'));
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

    const instructionsSignedUrl = patientData.medicalRecord?.patient_level_data?.treatmentInstructionsSignedUrl;

    useEffect(() => {
        if (instructionsSignedUrl) {
            setDisplayUrl(instructionsSignedUrl);
            setImgError(false);
        }
    }, [instructionsSignedUrl]);

    const handleImageError = async () => {
        if (displayUrl && !imgError) {
            try {
                console.log('InstructionsTab: Refreshing stale storage URL...');
                const storageRef = sRef(storage, displayUrl);
                const freshUrl = await getDownloadURL(storageRef);
                setDisplayUrl(freshUrl);
            } catch (err) {
                console.error('InstructionsTab: Failed to refresh download URL:', err);
                setImgError(true);
            }
        }
    };

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

        // 1. Convert newlines to breaks if not already HTML
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
                const processedTemplate = injectData(template);
                const blob = await generateDocumentImage(
                    processedTemplate,
                    [
                        {
                            label: tPatientSignatureLabel,
                            dataUrl: patientSignature,
                            name: patientData.fullName || ''
                        }
                    ],
                    {}, // Already injected
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

    if (isLoading) return <div className={styles.placeholderTab}><T>Loading template...</T></div>;

    if (instructionsSignedUrl && !imgError) {
        return (
            <div className={styles.consentContainer}>
                <div className={styles.signedView}>
                    <img
                        src={displayUrl || instructionsSignedUrl}
                        alt="Signed Instructions"
                        className={styles.signedDocumentImage}
                        onError={handleImageError}
                    />
                    <button
                        className={styles.btnSecondary}
                        style={{ marginTop: '1rem' }}
                        onClick={async () => {
                            if (instructionsSignedUrl) {
                                await deleteFile(instructionsSignedUrl);
                            }
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

    // Signed URL exists but image failed to load (stale/revoked token)
    if (instructionsSignedUrl && imgError) {
        return (
            <div className={styles.consentContainer}>
                <div className={styles.signedView}>
                    <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>
                        <T>The signed document could not be loaded. Please re-sign.</T>
                    </p>
                    <button
                        className={styles.btnSecondary}
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
                            setImgError(false);
                        }}
                    >
                        <T>Re-sign Guidelines</T>
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
