import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { getTreatmentCount } from '../../firebase/patient';
import { db } from '../../firebase';
import { JoinedPatientData, PatientProblem } from '../../types/patient';
import { Problem } from '../../types/problem';
import { Protocol } from '../../types/protocol';
import { VitalSigns } from '../../types/treatmentSession';
import VitalsInputGroup from '../VitalsInputGroup';
import { T, useT, useTranslationContext } from '../T';
import { Loader, Plus, X, UploadCloud, FileText } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { uploadFile } from '../../services/storageService';
import styles from './SessionOpening.module.css';

export interface SessionOpeningData {
    patientReport: string;
    preTreatmentVitals: Partial<VitalSigns>;
    preTreatmentImage?: string; // kept for backward compatibility with existing saved treatments
    generatedTreatmentId?: string; // Pre-generated ID to link measured_values
    problems: PatientProblem[]; // Updated problems list
    treatmentNumber?: number;
    preTreatmentMeasureReadingId?: string;
    usedMeasureIds?: string[];
    measureReadings?: Array<{ measureId: string; value: string | number }>;
}

interface SessionOpeningProps {
    patient: Partial<JoinedPatientData>;
    initialData?: Partial<SessionOpeningData>;
    onComplete: (data: SessionOpeningData) => void;
    onBack: () => void;
    onExit?: (data?: any) => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const SessionOpening: React.FC<SessionOpeningProps> = ({ patient, initialData, onComplete, onBack, onExit }) => {
    const { language, direction } = useTranslationContext();

    const tPatientReport = useT('Patient Report');
    const tPatientReportPlaceholder = useT('How is the patient feeling? Any side effects?');
    const tPreSessionVitals = useT('Pre-Session Vitals');
    const tAddDocument = useT('Add Document');
    const tDocDescription = useT('Document description');
    const tBack = useT('Back');
    const tExit = useT('Exit');
    const tProblems = useT('Problems');
    const tAddProblem = useT('Add Problem');
    const tProblemMissing = useT('Problem missing?');
    const tActive = useT('Active');
    const tInactive = useT('Inactive');

    const [patientReport, setPatientReport] = useState(initialData?.patientReport || '');
    const [preTreatmentVitals, setPreTreatmentVitals] = useState<Partial<VitalSigns>>(initialData?.preTreatmentVitals || {});

    // Document upload handling
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentDescription, setDocumentDescription] = useState('');
    const [documentType, setDocumentType] = useState<'Document' | 'Image'>('Document');
    const [isUploading, setIsUploading] = useState(false);

    // Problems Handling
    const [problems, setProblems] = useState<PatientProblem[]>(
        initialData?.problems || patient.medicalRecord?.problems || []
    );
    const [allProblems, setAllProblems] = useState<Problem[]>([]);
    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [showAddProblem, setShowAddProblem] = useState(false);
    const [problemSearchTerm, setProblemSearchTerm] = useState('');
    const [showMissingProblemModal, setShowMissingProblemModal] = useState(false);
    const [missingProblemNote, setMissingProblemNote] = useState('');
    const [isSendingMissing, setIsSendingMissing] = useState(false);
    const [missingProblemStatus, setMissingProblemStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const [treatmentCount, setTreatmentCount] = useState(0);

    // Fetch initial data (Problems and Protocols only)
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                if (patient.id && !initialData?.treatmentNumber) {
                    const count = await getTreatmentCount(patient.id);
                    setTreatmentCount(count);
                } else if (initialData?.treatmentNumber) {
                    setTreatmentCount(initialData.treatmentNumber - 1);
                }

                const probsSnap = await getDocs(collection(db, 'cfg_problems'));
                const allProbs = probsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Problem));
                setAllProblems(allProbs);

                const protosSnap = await getDocs(collection(db, 'cfg_protocols'));
                const allProtos = protosSnap.docs.map(d => ({ id: d.id, ...d.data() } as Protocol));
                setAllProtocols(allProtos);
            } catch (err) {
                console.error("Failed to fetch session opening data:", err);
            }
        };
        fetchInitialData();
    }, [patient.id, initialData?.treatmentNumber]);

    const toggleProblemStatus = (problemId: string) => {
        setProblems(prev => prev.map(p => {
            if (p.problemId === problemId) {
                return { ...p, problemStatus: p.problemStatus === 'Active' ? 'Inactive' : 'Active' };
            }
            return p;
        }));
    };

    const addProblem = (problemId: string) => {
        if (!problems.find(p => p.problemId === problemId)) {
            setProblems(prev => [...prev, { problemId, problemStatus: 'Active' }]);
        }
        setShowAddProblem(false);
    };

    const sendMissingProblem = async () => {
        if (!missingProblemNote.trim()) return;
        setIsSendingMissing(true);
        setMissingProblemStatus('idle');
        try {
            const sendMissingProblemEmail = httpsCallable(functions, 'sendMissingProblemEmail');
            await sendMissingProblemEmail({
                problemName: missingProblemNote.trim(),
                patientId: patient.id || 'unknown'
            });
            setMissingProblemStatus('success');
            setMissingProblemNote('');
            setTimeout(() => {
                setShowMissingProblemModal(false);
                setMissingProblemStatus('idle');
            }, 2000);
        } catch (err) {
            console.error(err);
            setMissingProblemStatus('error');
        } finally {
            setIsSendingMissing(false);
        }
    };

    /**
     * If the user filled in a document file + description, upload it to the
     * patient_medical_data/{patientId}/documents subcollection (same as DocumentsTab).
     */
    const uploadDocumentIfPresent = async (): Promise<void> => {
        if (!documentFile || !documentDescription.trim() || !patient.id) return;
        setIsUploading(true);
        try {
            const fullPath = await uploadFile(documentFile, `Patients/${patient.id}`);
            await addDoc(
                collection(db, 'patient_medical_data', patient.id, 'documents'),
                {
                    url: fullPath,
                    description: documentDescription.trim(),
                    type: documentType,
                    createdAt: serverTimestamp(),
                }
            );
        } catch (err) {
            console.error('SessionOpening: Failed to upload document:', err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!patientReport.trim()) return;

        await uploadDocumentIfPresent();

        onComplete({
            patientReport: patientReport.trim(),
            preTreatmentVitals,
            problems,
            generatedTreatmentId: initialData?.generatedTreatmentId,
            treatmentNumber: initialData?.treatmentNumber || (treatmentCount + 1)
        });
    };

    const handleExitClick = async () => {
        await uploadDocumentIfPresent();

        if (onExit) {
            onExit({
                patientReport: patientReport.trim(),
                preTreatmentVitals,
                problems,
                generatedTreatmentId: initialData?.generatedTreatmentId,
                treatmentNumber: initialData?.treatmentNumber || (treatmentCount + 1)
            } as SessionOpeningData);
        }
    };

    const isFormValid = patientReport.trim().length > 0;
    const availableToAdd = allProblems.filter(ap => !problems.find(p => p.problemId === ap.id));
    const filteredProblemsToAdd = availableToAdd.filter(ap => {
        const term = problemSearchTerm.toLowerCase();
        if (!term) return true;
        const nameMatch = getMLValue(ap.name, language).toLowerCase().includes(term);
        const descMatch = ap.description ? getMLValue(ap.description, language).toLowerCase().includes(term) : false;
        return nameMatch || descMatch;
    });

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.formCard}>

                {/* 1. Patient Report */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{tPatientReport} <span className={styles.required}>*</span></h3>
                    <div className={styles.reportWrapper}>
                        <textarea
                            className={styles.textarea}
                            rows={4}
                            value={patientReport}
                            onChange={e => setPatientReport(e.target.value)}
                            placeholder={tPatientReportPlaceholder}
                        />
                        {/* Next Step button is now at the bottom of the form */}
                    </div>
                </section>

                {/* 1.5 Problems Management */}
                <section className={styles.section}>
                    <div className={styles.sectionTitleRow}>
                        <h3 className={styles.sectionTitleNoBorder}>{tProblems}</h3>
                        <div className={styles.problemTitleActions}>
                            <button className={styles.linkButton} onClick={() => setShowMissingProblemModal(true)}>
                                {tProblemMissing}
                            </button>
                        </div>
                    </div>

                    <div className={styles.problemsList}>
                        {problems.map(p => {
                            const probObj = allProblems.find(ap => ap.id === p.problemId);
                            const name = probObj ? getMLValue(probObj.name, language) : p.problemId;
                            const isActive = p.problemStatus === 'Active';
                            return (
                                <button
                                    key={p.problemId}
                                    className={`${styles.problemChip} ${isActive ? styles.chipActive : styles.chipInactive}`}
                                    onClick={() => toggleProblemStatus(p.problemId)}
                                    title={`Click to mark as ${isActive ? 'Inactive' : 'Active'}`}
                                >
                                    {name}
                                    <span className={styles.chipStatusIcon}>
                                        {isActive ? tActive : tInactive}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className={styles.addProblemContainer}>
                        {!showAddProblem ? (
                            <button className={styles.btnAddProblem} onClick={() => { setShowAddProblem(true); setProblemSearchTerm(''); }}>
                                <Plus size={16} /> {tAddProblem}
                            </button>
                        ) : (
                            <div className={styles.addProblemDropdownWrapper}>
                                <input
                                    type="text"
                                    className={styles.problemSearchInput}
                                    placeholder={useT('Select a problem to add...')}
                                    value={problemSearchTerm}
                                    onChange={(e) => setProblemSearchTerm(e.target.value)}
                                    autoFocus
                                />
                                <button className={styles.btnCancelAdd} onClick={() => { setShowAddProblem(false); setProblemSearchTerm(''); }}>
                                    <X size={20} />
                                </button>
                                {filteredProblemsToAdd.length > 0 && (
                                    <ul className={styles.problemDropdownList}>
                                        {filteredProblemsToAdd.map(ap => (
                                            <li
                                                key={ap.id}
                                                className={styles.problemDropdownItem}
                                                onClick={() => {
                                                    addProblem(ap.id);
                                                    setProblemSearchTerm('');
                                                }}
                                            >
                                                <div className={styles.problemDropdownItemName}>{getMLValue(ap.name, language)}</div>
                                                {ap.description && getMLValue(ap.description, language) && (
                                                    <div className={styles.problemDropdownItemDesc}>{getMLValue(ap.description, language)}</div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* 2. Pre-Treatment Vitals */}
                <section className={styles.section}>
                    <VitalsInputGroup
                        title={tPreSessionVitals}
                        vitals={preTreatmentVitals}
                        onVitalsChange={setPreTreatmentVitals}
                    />
                </section>

                {/* 3. Add Document (optional) */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{tAddDocument}</h3>
                    <div className={styles.documentUploadGroup}>
                        <input
                            type="text"
                            className={styles.captionInput}
                            placeholder={tDocDescription}
                            value={documentDescription}
                            onChange={e => setDocumentDescription(e.target.value)}
                        />
                        <div className={styles.docTypeRow}>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    value="Document"
                                    checked={documentType === 'Document'}
                                    onChange={() => setDocumentType('Document')}
                                />
                                <FileText size={14} />
                                <T>Document</T>
                            </label>
                            <label className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    value="Image"
                                    checked={documentType === 'Image'}
                                    onChange={() => setDocumentType('Image')}
                                />
                                <UploadCloud size={14} />
                                <T>Image</T>
                            </label>
                        </div>
                        <div className={styles.uploadButtonWrapper}>
                            <input
                                type="file"
                                accept={documentType === 'Image' ? 'image/*' : undefined}
                                onChange={e => setDocumentFile(e.target.files?.[0] ?? null)}
                                id="session-doc-upload"
                                className={styles.fileInput}
                            />
                            <label htmlFor="session-doc-upload" className={styles.btnUpload}>
                                <UploadCloud size={16} />
                                {documentFile ? documentFile.name : <T>Choose File</T>}
                            </label>
                        </div>
                        {documentFile && (
                            <button
                                type="button"
                                className={styles.btnRemove}
                                onClick={() => { setDocumentFile(null); setDocumentDescription(''); }}
                            >
                                <X size={14} /> <T>Clear</T>
                            </button>
                        )}
                    </div>
                </section>

                {/* Actions */}
                <div className={styles.actions}>
                    <div className={styles.actionsLeft}>
                        {onExit && (
                            <button type="button" onClick={handleExitClick} disabled={isUploading} className={styles.btnExit}>
                                {tExit}
                            </button>
                        )}
                        <button type="button" onClick={onBack} className={styles.btnSecondary}>
                            {tBack}
                        </button>
                    </div>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleSubmit}
                        disabled={!isFormValid || isUploading}
                    >
                        {isUploading ? <Loader size={20} className={styles.spinner} /> : <T>Next step</T>}
                    </button>
                </div>
            </div>

            {/* Missing Problem Modal */}
            {showMissingProblemModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>{tProblemMissing}</h2>
                            <button onClick={() => setShowMissingProblemModal(false)} className={styles.closeModalBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.modalSubtitle}><T>Please describe the missing problem below. We will align with the medical team and configure it.</T></p>
                            <textarea
                                className={styles.textarea}
                                rows={4}
                                value={missingProblemNote}
                                onChange={e => { setMissingProblemNote(e.target.value); setMissingProblemStatus('idle'); }}
                                placeholder="Describe the problem..."
                                disabled={missingProblemStatus === 'success'}
                            />
                            {missingProblemStatus === 'success' && (
                                <p className={styles.modalStatusSuccess}><T>Request sent successfully!</T></p>
                            )}
                            {missingProblemStatus === 'error' && (
                                <p className={styles.modalStatusError}><T>Failed to send. Please check your connection and try again.</T></p>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button
                                className={styles.btnSecondary}
                                onClick={() => { setShowMissingProblemModal(false); setMissingProblemStatus('idle'); setMissingProblemNote(''); }}
                            >
                                <T>Cancel</T>
                            </button>
                            <button
                                className={styles.btnPrimary}
                                onClick={sendMissingProblem}
                                disabled={isSendingMissing || !missingProblemNote.trim() || missingProblemStatus === 'success'}
                            >
                                {isSendingMissing ? <Loader size={16} className={styles.spinner} /> : <T>Send Request</T>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SessionOpening;

