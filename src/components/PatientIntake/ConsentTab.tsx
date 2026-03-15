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

interface ConsentTabProps {
    patientData: Partial<JoinedPatientData>;
    user: AppUser | null;
    onDataChange: (data: Partial<JoinedPatientData>, isInternal?: boolean) => void;
}

export interface ConsentTabHandle {
    onSave: () => Promise<string | null>;
}

const ConsentTab = forwardRef<ConsentTabHandle, ConsentTabProps>(({ patientData, user, onDataChange }, ref) => {
    const { language, direction } = useTranslationContext();
    const [template, setTemplate] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [patientSignature, setPatientSignature] = useState<string>('');
    const [caretakerSignature, setCaretakerSignature] = useState<string>('');
    const [imgError, setImgError] = useState(false);
    const [displayUrl, setDisplayUrl] = useState<string>('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; message: string }>({
        isOpen: false,
        title: '',
        message: ''
    });

    const noTemplateMsg = useT('No consent template found for this language.');
    const errorMsg = useT('Error loading consent template.');
    const provideSigMsg = useT('Please provide patient signature.');
    const tPatientSignatureLabel = useT('Patient Signature:');
    const tCaretakerSignatureLabel = useT('Caretaker Signature:');
    const tSentSuccess = useT('Consent form sent to patient successfully.');
    const tSentError = useT('Failed to send consent form to patient.');
    const tSuccessTitle = useT('Success');
    const tErrorTitle = useT('Error');
    const tWarningTitle = useT('Warning');

    useEffect(() => {
        const fetchTemplate = async () => {
            setIsLoading(true);
            setTemplate(''); // Clear previous template
            try {
                const configDoc = await getDoc(doc(db, 'cfg_app_config', 'main'));
                if (configDoc.exists()) {
                    const data = configDoc.data();
                    const templateUrl = data.consentSettings?.consent_files?.apitherapy?.[language];
                    if (templateUrl) {
                        const response = await fetch(templateUrl);
                        const text = await response.text();
                        setTemplate(text);
                    } else {
                        setTemplate(noTemplateMsg);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch consent template:', err);
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

    const consentSignedUrl = patientData.medicalRecord?.consentSignedUrl;

    useEffect(() => {
        if (consentSignedUrl) {
            setDisplayUrl(consentSignedUrl);
            setImgError(false);
        }
    }, [consentSignedUrl]);

    const handleImageError = async () => {
        if (displayUrl && !imgError) {
            try {
                console.log('ConsentTab: Refreshing stale storage URL...');
                const storageRef = sRef(storage, displayUrl);
                const freshUrl = await getDownloadURL(storageRef);
                setDisplayUrl(freshUrl);
            } catch (err) {
                console.error('ConsentTab: Failed to refresh download URL:', err);
                setImgError(true);
            }
        }
    };

    const injectData = (text: string) => {
        if (!text) return '';

        const patientName = patientData.fullName || '____________________';
        const idNumber = patientData.identityNumber || '____________________';
        const caretaker = user?.fullName || (user as any)?.name || user?.displayName || '____________________';

        // 1. Pre-process text (newlines to breaks)
        let result = text;
        if (!text.includes('<br') && !text.includes('<p>')) {
            result = result.replace(/\n/g, '<br/>');
        }

        // 2. Definitive replacements (Handlebars style and user-suggested styles)
        result = result
            // Standard
            .replace(/{{patientName}}/g, `<b>${patientName}</b>`)
            .replace(/{{identityNumber}}/g, `<b>${idNumber}</b>`)
            .replace(/{{caretakerName}}/g, `<b>${caretaker}</b>`)
            // User suggested alternatives
            .replace(/{fullName}|{{fullName}}/g, `<b>${patientName}</b>`)
            .replace(/{identity_number}|{{identity_number}}/g, `<b>${idNumber}</b>`)
            .replace(/{caretaker}|{{caretaker}}/g, `<b>${caretaker}</b>`);

        // 3. Optional Heuristic for blank underscore lines (like I, __________)
        // We only do this if the tags weren't found or were missing
        const underscoreLines = /(?:[\\\/|][Ll][\s\xa0]*){2,}|_{3,}|\.{5,}/gi;
        let heuristicCount = 0;

        result = result.replace(underscoreLines, (match) => {
            // Only replace if it’s a long underscore or placeholder sequence
            heuristicCount++;
            if (heuristicCount === 1) return `<b>${patientName}</b>`;
            if (heuristicCount === 2) return `<b>${idNumber}</b>`;
            if (heuristicCount === 3) return `<b>${caretaker}</b>`;
            return match;
        });

        console.log('ConsentTab: Data injected. Heuristics used:', heuristicCount);
        return result;
    };

    const caretakerName = user?.fullName || (user as any)?.name || user?.displayName || '';

    const handleSendToPatient = async () => {
        if (!consentSignedUrl || !patientData.id) return;
        setIsSendingEmail(true);
        try {
            await sendDocumentEmail({
                patientId: patientData.id,
                documentUrl: consentSignedUrl,
                language: language
            });
            setModalConfig({
                isOpen: true,
                title: tSuccessTitle,
                message: tSentSuccess
            });
        } catch (error) {
            console.error('Failed to send consent:', error);
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
            // Priority 1: If we have an existing signed URL and no new signature input, return it
            if (consentSignedUrl && !patientSignature) {
                return consentSignedUrl;
            }

            // Priority 2: New signature processing
            if (!patientSignature) {
                setModalConfig({
                    isOpen: true,
                    title: tWarningTitle,
                    message: provideSigMsg
                });
                return null;
            }

            try {
                const signatures = [
                    {
                        label: tPatientSignatureLabel,
                        dataUrl: patientSignature,
                        name: patientData.fullName || ''
                    }
                ];
                if (caretakerSignature) {
                    signatures.push({
                        label: tCaretakerSignatureLabel,
                        dataUrl: caretakerSignature,
                        name: caretakerName
                    });
                }

                const processedTemplate = injectData(template);
                const blob = await generateDocumentImage(
                    processedTemplate,
                    signatures,
                    {}, // Placeholders already injected
                    direction
                );

                const fileName = `consent.png`;
                const folderPath = `Patients/${patientData.id || 'new'}`;
                const url = await uploadFile(new File([blob], fileName, { type: 'image/png' }), folderPath, fileName);
                setPatientSignature(''); // Clear signatures to prevent redundant uploads
                setCaretakerSignature('');
                return url;
            } catch (err) {
                console.error('Consent generation/upload failed:', err);
                return null;
            }
        }
    }));

    return (
        <div className={styles.consentContainer}>
            {isLoading ? (
                <div className={styles.placeholderTab}><T>Loading template...</T></div>
            ) : consentSignedUrl && !imgError ? (
                <div className={styles.signedView}>
                    <img
                        src={displayUrl || consentSignedUrl}
                        alt="Signed Consent"
                        className={styles.signedDocumentImage}
                        onError={handleImageError}
                    />
                    <div className={styles.fileActions} style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                        <button
                            className={styles.btnSecondary}
                            onClick={async () => {
                                if (consentSignedUrl) {
                                    await deleteFile(consentSignedUrl);
                                }
                                onDataChange({
                                    ...patientData,
                                    medicalRecord: {
                                        ...(patientData.medicalRecord || {}),
                                        consentSignedUrl: ''
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
            ) : consentSignedUrl && imgError ? (
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
                                    consentSignedUrl: ''
                                }
                            });
                            setImgError(false);
                        }}
                    >
                        <T>Re-sign Consent</T>
                    </button>
                </div>
            ) : (
                <>
                    <div className={styles.documentView}>
                        <div className={styles.documentPaper}>
                            <div dangerouslySetInnerHTML={{ __html: injectData(template).replace(/\n/g, '<br/>') }} />
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
                        <div className={styles.signatureBlock}>
                            <label className={styles.signatureLabel}><T>Caretaker Signature</T></label>
                            <SignaturePad
                                onSave={setCaretakerSignature}
                                initialSignature={caretakerSignature}
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

export default ConsentTab;
