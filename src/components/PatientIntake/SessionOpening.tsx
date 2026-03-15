import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { JoinedPatientData } from '../../types/patient';
import { Measure } from '../../types/measure';
import { VitalSigns } from '../../types/treatmentSession';
import VitalsInputGroup from '../VitalsInputGroup';
import { T, useT, useTranslationContext } from '../T';
import { Loader, ChevronRight, ChevronLeft } from 'lucide-react';
import styles from './SessionOpening.module.css';

export interface SessionOpeningData {
    patientReport: string;
    measureReadings: Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number }>;
    preTreatmentVitals: Partial<VitalSigns>;
    preTreatmentMeasureReadingId?: string; // Captures the ID after saving to Firestore
    preTreatmentImage?: string; // URL of the uploaded image
}


const NextIcon: React.FC<{ direction: 'ltr' | 'rtl'; size?: number }> = ({ direction, size = 16 }) => {
    return direction === 'rtl' ? <ChevronLeft size={size} /> : <ChevronRight size={size} />;
};

interface SessionOpeningProps {
    patient: Partial<JoinedPatientData>;
    onComplete: (data: SessionOpeningData) => void;
    onBack: () => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const SessionOpening: React.FC<SessionOpeningProps> = ({ patient, onComplete, onBack }) => {
    const { language, direction } = useTranslationContext();

    const [measures, setMeasures] = useState<Measure[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form state
    const [patientReport, setPatientReport] = useState('');
    const [measureValues, setMeasureValues] = useState<Record<string, string | number>>({});
    const [preTreatmentVitals, setPreTreatmentVitals] = useState<Partial<VitalSigns>>({});
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageCaption, setImageCaption] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadPreview, setUploadPreview] = useState<string | null>(null);


    const tPatientReport = useT('Patient Report');
    const tPatientReportPlaceholder = useT('Enter patient feedback or symptoms...');
    const tTrackingMeasures = useT('Tracking Measures');
    const tPreSessionVitals = useT('Pre-Treatment Blood Pressure & Heart Rate');

    const tNextStep = useT('Next Step');
    const tLoading = useT('Loading...');
    const tBack = useT('Back');
    const tAddPhoto = useT('Add Pre-Treatment Photo');
    const tCaption = useT('Caption (embedded on photo)');
    const tRemove = useT('Remove');
    const tUploading = useT('Uploading...');

    // Fetch measures: use patient's measureIds if present, else all cfg_measures
    const fetchMeasures = useCallback(async () => {
        setIsLoading(true);
        try {
            const snapshot = await getDocs(collection(db, 'cfg_measures'));
            const allMeasures: Measure[] = snapshot.docs.map(doc => ({
                ...(doc.data() as Omit<Measure, 'id'>),
                id: doc.id,
            }));

            let targetMeasureIds: string[] = [];
            const problemId = patient.medicalRecord?.problemId;

            if (problemId) {
                const probSnap = await getDoc(doc(db, 'cfg_problems', problemId));
                if (probSnap.exists()) {
                    targetMeasureIds = probSnap.data().measureIds || [];
                }
            }

            // Fallback to patient's measureIds if no problem-specific ones
            if (targetMeasureIds.length === 0) {
                targetMeasureIds = patient.medicalRecord?.measureIds || [];
            }

            if (targetMeasureIds.length > 0) {
                setMeasures(allMeasures.filter(m => targetMeasureIds.includes(m.id)));
            } else {
                setMeasures([]);
            }
        } catch (err) {
            console.error('SessionOpening: failed to load measures', err);
        } finally {
            setIsLoading(false);
        }
    }, [patient]);

    useEffect(() => {
        fetchMeasures();
    }, [fetchMeasures]);

    const handleMeasureChange = (measureId: string, value: string | number) => {
        setMeasureValues(prev => ({ ...prev, [measureId]: value }));
    };

    const isVitalsComplete =
        preTreatmentVitals.systolic !== undefined &&
        preTreatmentVitals.diastolic !== undefined &&
        preTreatmentVitals.heartRate !== undefined;

    const isFormValid = patientReport.trim() !== '' && isVitalsComplete && !isUploading;


    const processImageWithCaption = async (file: File, caption: string): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Max width 1200px while maintaining aspect ratio
                const scale = Math.min(1, 1200 / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                if (caption.trim()) {
                    const padding = 20;
                    const fontSize = Math.max(16, Math.floor(canvas.height * 0.04));
                    ctx.font = `${fontSize}px Arial`;

                    const metrics = ctx.measureText(caption);
                    const barHeight = fontSize * 2;

                    // Semi-transparent bar
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

                    // White text
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
        if (!isFormValid) return;

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
                alert('Failed to upload image. Please try again.');
                setIsUploading(false);
                return;
            }
        }

        const measureReadings = measures
            .filter(m => measureValues[m.id] !== undefined && measureValues[m.id] !== '')
            .map(m => ({
                measureId: m.id,
                type: m.type,
                value: measureValues[m.id],
            }));

        onComplete({
            patientReport: patientReport.trim(),
            measureReadings,
            preTreatmentVitals,
            preTreatmentImage
        });

    };

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.formCard}>
                {/* 1. Patient Report */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{tPatientReport} <span className={styles.required}>*</span></h3>
                    <textarea
                        className={styles.textarea}
                        rows={4}
                        value={patientReport}
                        onChange={e => setPatientReport(e.target.value)}
                        placeholder={tPatientReportPlaceholder}
                    />
                </section>

                {/* 2. Pre-Treatment Vitals */}
                <section className={styles.section}>
                    <VitalsInputGroup
                        title={tPreSessionVitals}
                        vitals={preTreatmentVitals}
                        onVitalsChange={setPreTreatmentVitals}
                    />
                </section>


                {/* 4. Pre-Treatment Photo */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{tAddPhoto}</h3>
                    <div className={styles.photoContainer}>
                        {!uploadPreview ? (
                            <div className={styles.uploadBox}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageChange}
                                    id="pre-treatment-upload"
                                    className={styles.fileInput}
                                    capture="environment"
                                />
                                <label htmlFor="pre-treatment-upload" className={styles.uploadLabel}>
                                    <T>Click to capture or upload</T>
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

                {/* 3. Tracking Measures (Moved to bottom) */}
                <section className={styles.section}>

                    <h3 className={styles.sectionTitle}>{tTrackingMeasures}</h3>
                    {isLoading ? (
                        <div className={styles.loading}>
                            <Loader size={20} className={styles.spinner} />
                            <span>{tLoading}</span>
                        </div>
                    ) : (
                        <div className={styles.measuresGrid}>
                            {measures.map(measure => {
                                const name = getMLValue(measure.name, language);
                                const value = measureValues[measure.id] ?? '';
                                return (
                                    <div key={measure.id} className={styles.measureItem}>
                                        <label className={styles.measureLabel}>{name}</label>
                                        {measure.type === 'Scale' ? (
                                            <input
                                                type="number"
                                                className={styles.measureInput}
                                                value={value}
                                                min={measure.scale?.min}
                                                max={measure.scale?.max}
                                                placeholder={`${measure.scale?.min ?? 0} – ${measure.scale?.max ?? 10}`}
                                                onChange={e => handleMeasureChange(measure.id, e.target.value === '' ? '' : Number(e.target.value))}
                                            />
                                        ) : (
                                            <select
                                                className={styles.measureInput}
                                                value={String(value)}
                                                onChange={e => handleMeasureChange(measure.id, e.target.value)}
                                            >
                                                <option value="">—</option>
                                                {measure.categories?.map((cat, idx) => {
                                                    const catLabel = getMLValue(cat, language);
                                                    return (
                                                        <option key={idx} value={catLabel}>{catLabel}</option>
                                                    );
                                                })}
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>


                {/* Actions */}
                <div className={styles.actions}>
                    <button type="button" onClick={onBack} className={styles.btnSecondary}>
                        {tBack}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isFormValid || isUploading}
                        className={styles.btnPrimary}
                    >
                        {isUploading ? tUploading : tNextStep} <NextIcon direction={direction} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionOpening;
