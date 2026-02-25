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

interface ConsentTabProps {
    patientData: Partial<PatientData>;
    user: AppUser | null;
    onDataChange: (data: Partial<PatientData>, isInternal?: boolean) => void;
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

    const noTemplateMsg = useT('No consent template found for this language.');
    const errorMsg = useT('Error loading consent template.');
    const provideSigMsg = useT('Please provide patient signature.');

    useEffect(() => {
        const fetchTemplate = async () => {
            setIsLoading(true);
            setTemplate(''); // Clear previous template
            try {
                const configDoc = await getDoc(doc(db, 'app_config', 'main'));
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

    useImperativeHandle(ref, () => ({
        onSave: async () => {
            // Priority 1: If we have an existing signed URL and no new signature input, return it
            if (consentSignedUrl && !patientSignature) {
                return consentSignedUrl;
            }

            // Priority 2: New signature processing
            if (!patientSignature) {
                alert(provideSigMsg);
                return null;
            }

            try {
                const signatures = [
                    {
                        label: direction === 'rtl' ? 'חתימת המטופל:' : 'Patient Signature:',
                        dataUrl: patientSignature,
                        name: patientData.fullName || ''
                    }
                ];

                if (caretakerSignature) {
                    signatures.push({
                        label: direction === 'rtl' ? 'חתימת המטפל:' : 'Caretaker Signature:',
                        dataUrl: caretakerSignature,
                        name: caretakerName
                    });
                }

                const blob = await generateDocumentImage(
                    template,
                    signatures,
                    {
                        patientName: patientData.fullName || '',
                        identityNumber: patientData.identityNumber || '',
                        caretakerName: caretakerName
                    },
                    direction
                );

                const fileName = `consent.png`;
                const folderPath = `Patients/${patientData.id || 'new'}`;
                const url = await uploadFile(new File([blob], fileName, { type: 'image/png' }), folderPath, fileName);
                return url;
            } catch (err) {
                console.error('Consent generation/upload failed:', err);
                return null;
            }
        }
    }));

    const consentSignedUrl = patientData.medicalRecord?.patient_level_data?.consentSignedUrl;

    if (isLoading) return <div className={styles.placeholderTab}><T>Loading template...</T></div>;

    if (consentSignedUrl) {
        return (
            <div className={styles.consentContainer}>
                <div className={styles.signedView}>
                    <img src={consentSignedUrl} alt="Signed Consent" className={styles.signedDocumentImage} />
                    <button
                        className={styles.btnSecondary}
                        style={{ marginTop: '1rem' }}
                        onClick={() => {
                            // Clear the URL in parent data to allow re-signing
                            onDataChange({
                                ...patientData,
                                medicalRecord: {
                                    ...(patientData.medicalRecord || {}),
                                    patient_level_data: {
                                        ...(patientData.medicalRecord?.patient_level_data || {}),
                                        consentSignedUrl: ''
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
        </div>
    );
});

export default ConsentTab;
