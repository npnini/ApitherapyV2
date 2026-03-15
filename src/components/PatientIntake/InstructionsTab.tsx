import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { T, useT, useTranslationContext } from '../T';
import { doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../../firebase';
import { ref as sRef, getDownloadURL } from 'firebase/storage';
import SignaturePad from './SignaturePad';
import ConfirmationModal from '../ConfirmationModal';
import styles from './PatientIntake.module.css';
import { JoinedPatientData, PatientData } from '../../types/patient';
import { AppUser } from '../../types/user';
import { generateDocumentImage } from '../../utils/documentUtils';
import { uploadFile, deleteFile } from '../../services/storageService';
import { sendDocumentEmail } from '../../services/emailService';

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
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; message: string }>({
        isOpen: false,
        title: '',
        message: ''
    });
    // Note: Caretaker signature pad removed as per user comment #2 (Patient only)
    // If both are needed later, simply add caretakerSignature state and pad here.

    const noTemplateMsg = useT('No guidelines template found for this language.');
    const errorMsg = useT('Error loading guidelines template.');
    const provideSigMsg = useT('Please provide patient signature.');
    const tPatientSignatureLabel = useT('Patient Signature:');
    const tSentSuccess = useT('Guidelines sent to patient successfully.');
    const tSentError = useT('Failed to send guidelines to patient.');
    const tSuccessTitle = useT('Success');
    const tErrorTitle = useT('Error');
    const tWarningTitle = useT('Warning');

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
                // Check if it's potentially a CORS or networking error
                const isFetchError = err instanceof TypeError && err.message === 'Failed to fetch';
                if (isFetchError) {
                    setTemplate(errorMsg + ' (Possible CORS or Connectivity error)');
                } else {
                    setTemplate(errorMsg);
                }
            } finally {
                setIsLoading(false);
            }
        };

        if (language) {
            fetchTemplate();
        }
    }, [language, noTemplateMsg, errorMsg]);

    const instructionsSignedUrl = patientData.medicalRecord?.treatmentInstructionsSignedUrl;

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

        // The following replacements are added as per user instruction.
        // Note: patientName, idNumber, caretaker are not defined in this scope.
        // Assuming these are meant to be derived from patientData or placeholders.
        // For faithful reproduction, using placeholder values or empty strings if not found.
        const patientName = patientData.fullName || '____________________';
        const idNumber = patientData.identityNumber || '____________________';
        const caretaker = user?.fullName || (user as any)?.name || user?.displayName || '____________________';

        return result
            .replace(/{{patientName}}/g, patientName)
            .replace(/{{fullName}}/g, patientName)
            .replace(/{{idNumber}}/g, idNumber)
            .replace(/{{caretakerName}}/g, caretaker);
    };

    const handleSendToPatient = async () => {
        if (!instructionsSignedUrl || !patientData.id) return;
        setIsSendingEmail(true);
        try {
            await sendDocumentEmail({
                patientId: patientData.id,
                documentUrl: instructionsSignedUrl,
                language: language
            });
            setModalConfig({
                isOpen: true,
                title: tSuccessTitle,
                message: tSentSuccess
            });
        } catch (error) {
            console.error('Failed to send guidelines:', error);
            setModalConfig({
                isOpen: true,
                title: tErrorTitle,
                message: tSentError
            });
        } finally {
            setIsSendingEmail(false);
        }
    };

    useImperativeHandle(ref, () => ({
        onSave: async () => {
            if (instructionsSignedUrl && !patientSignature) {
                return instructionsSignedUrl;
            }

            if (!patientSignature) {
                setModalConfig({
                    isOpen: true,
                    title: tWarningTitle,
                    message: provideSigMsg
                });
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
                setPatientSignature(''); // Clear signature to prevent redundant uploads
                return url;
            } catch (err) {
                console.error('Instructions generation/upload failed:', err);
                return null;
            }
        }
    }));

    return (
        <div className={styles.consentContainer}>
            {isLoading ? (
                <div className={styles.placeholderTab}><T>Loading template...</T></div>
            ) : instructionsSignedUrl && !imgError ? (
                <div className={styles.signedView}>
                    <img
                        src={displayUrl || instructionsSignedUrl}
                        alt="Signed Instructions"
                        className={styles.signedDocumentImage}
                        onError={handleImageError}
                    />
                    <div className={styles.fileActions} style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button
                            className={styles.btnSecondary}
                            onClick={async () => {
                                if (instructionsSignedUrl) {
                                    await deleteFile(instructionsSignedUrl);
                                }
                                onDataChange({
                                    ...patientData,
                                    medicalRecord: {
                                        ...(patientData.medicalRecord || {}),
                                        treatmentInstructionsSignedUrl: ''
                                    }
                                });
                            }}
                        >
                            <T>Clear & Re-sign</T>
                        </button>
                        <button
                            className={styles.btnPrimary}
                            disabled={isSendingEmail}
                            onClick={handleSendToPatient}
                        >
                            {isSendingEmail ? <T>Sending...</T> : <T>Send to Patient</T>}
                        </button>
                    </div>
                </div>
            ) : instructionsSignedUrl && imgError ? (
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
                                    treatmentInstructionsSignedUrl: ''
                                }
                            });
                            setImgError(false);
                        }}
                    >
                        <T>Re-sign Guidelines</T>
                    </button>
                </div>
            ) : (
                <>
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
                </>
            )}

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                onConfirm={() => setModalConfig({ ...modalConfig, isOpen: false })}
                showCancelButton={false}
            />
        </div>
    );
});

export default InstructionsTab;
