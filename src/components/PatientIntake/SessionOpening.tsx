import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getTreatmentCount } from '../../firebase/patient';
import { db, storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { JoinedPatientData, PatientProblem } from '../../types/patient';
import { Problem } from '../../types/problem';
import { Protocol } from '../../types/protocol';
import { VitalSigns } from '../../types/treatmentSession';
import VitalsInputGroup from '../VitalsInputGroup';
import { T, useT, useTranslationContext } from '../T';
import { Loader, Camera, Plus, X, ArrowRight } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import styles from './SessionOpening.module.css';

export interface SessionOpeningData {
    patientReport: string;
    preTreatmentVitals: Partial<VitalSigns>;
    preTreatmentImage?: string; // URL of the uploaded image
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
    const tAddPhoto = useT('Add Photo');
    const tCaption = useT('Caption (optional)');
    const tRemove = useT('Remove Photo');
    const tUploading = useT('Uploading...');
    const tProceed = useT('Proceed to Selection');
    const tBack = useT('Back');
    const tExit = useT('Exit');
    const tProblems = useT('Problems');
    const tAddProblem = useT('Add Problem');
    const tProblemMissing = useT('Problem missing?');
    const tActive = useT('Active');
    const tInactive = useT('Inactive');

    const [patientReport, setPatientReport] = useState(initialData?.patientReport || '');
    const [preTreatmentVitals, setPreTreatmentVitals] = useState<Partial<VitalSigns>>(initialData?.preTreatmentVitals || {});

    // Photo handling
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploadPreview, setUploadPreview] = useState<string | null>(initialData?.preTreatmentImage || null);
    const [imageCaption, setImageCaption] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    // Problems Handling
    const [problems, setProblems] = useState<PatientProblem[]>(
        initialData?.problems || patient.medicalRecord?.problems || []
    );
    const [allProblems, setAllProblems] = useState<Problem[]>([]);
    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [showAddProblem, setShowAddProblem] = useState(false);
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

    const processImageWithCaption = async (file: File, caption: string): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject('Failed to get 2d context');

                ctx.drawImage(img, 0, 0);

                if (caption.trim()) {
                    const fontSize = Math.max(16, Math.floor(canvas.height * 0.04));
                    ctx.font = `${fontSize}px Arial`;

                    const barHeight = fontSize * 2;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'center';
                    ctx.fillText(caption, canvas.width / 2, canvas.height - (barHeight / 2) + (fontSize / 3));
                }

                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas toBlob failed'));
                }, 'image/jpeg', 0.85);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setUploadPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async () => {
        if (!patientReport.trim()) return;

        let preTreatmentImage = '';
        if (imageFile) {
            setIsUploading(true);
            try {
                const processedBlob = await processImageWithCaption(imageFile, imageCaption);
                const storageRef = ref(storage, `Patients/${patient.id}/pre_treatment_${Date.now()}.jpg`);
                await uploadBytes(storageRef, processedBlob);
                preTreatmentImage = await getDownloadURL(storageRef);
                setIsUploading(false);
            } catch (err) {
                console.error('Error processing/uploading image:', err);
                setIsUploading(false);
                return;
            }
        }

        onComplete({
            patientReport: patientReport.trim(),
            preTreatmentVitals,
            preTreatmentImage,
            problems,
            generatedTreatmentId: initialData?.generatedTreatmentId,
            treatmentNumber: initialData?.treatmentNumber || (treatmentCount + 1)
        });
    };

    const handleExitClick = async () => {
        let preTreatmentImage = '';
        if (imageFile) {
            setIsUploading(true);
            try {
                const processedBlob = await processImageWithCaption(imageFile, imageCaption);
                const storageRef = ref(storage, `Patients/${patient.id}/pre_treatment_${Date.now()}.jpg`);
                await uploadBytes(storageRef, processedBlob);
                preTreatmentImage = await getDownloadURL(storageRef);
                setIsUploading(false);
            } catch (err) {
                console.error('Error processing/uploading image during exit:', err);
                setIsUploading(false);
            }
        }

        if (onExit) {
            onExit({
                patientReport: patientReport.trim(),
                preTreatmentVitals,
                preTreatmentImage,
                problems,
                generatedTreatmentId: initialData?.generatedTreatmentId,
                treatmentNumber: initialData?.treatmentNumber || (treatmentCount + 1)
            } as SessionOpeningData);
        }
    };

    const isFormValid = patientReport.trim().length > 0;
    const availableToAdd = allProblems.filter(ap => !problems.find(p => p.problemId === ap.id));

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
                            <button className={styles.btnAddProblem} onClick={() => setShowAddProblem(true)}>
                                <Plus size={16} /> {tAddProblem}
                            </button>
                        ) : (
                            <div className={styles.addProblemDropdownWrapper}>
                                <select
                                    className={styles.problemSelect}
                                    onChange={(e) => {
                                        if (e.target.value) addProblem(e.target.value);
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled><T>Select a problem to add...</T></option>
                                    {availableToAdd.map(ap => (
                                        <option key={ap.id} value={ap.id}>{getMLValue(ap.name, language)}</option>
                                    ))}
                                </select>
                                <button className={styles.btnCancelAdd} onClick={() => setShowAddProblem(false)}>
                                    <X size={20} />
                                </button>
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

                {/* 3. Pre-Treatment Photo */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{tAddPhoto}</h3>
                    <div className={styles.photoContainer}>
                        {!uploadPreview ? (
                            <div className={styles.uploadButtonWrapper}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    id="pre-treatment-upload"
                                    className={styles.fileInput}
                                    capture="environment"
                                />
                                <label htmlFor="pre-treatment-upload" className={styles.btnUpload}>
                                    <Camera size={16} />
                                    <T>Upload Photo</T>
                                </label>
                            </div>
                        ) : (
                            <div className={styles.previewContainer}>
                                <img src={uploadPreview} alt="Preview" className={styles.previewImage} />
                                <div className={styles.captionInputGroup}>
                                    <input
                                        type="text"
                                        className={styles.captionInput}
                                        placeholder={tCaption}
                                        value={imageCaption}
                                        onChange={e => setImageCaption(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className={styles.btnRemove}
                                        onClick={() => {
                                            setImageFile(null);
                                            setUploadPreview(null);
                                            setImageCaption('');
                                        }}
                                    >
                                        {tRemove}
                                    </button>
                                </div>
                            </div>
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

