import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { JoinedPatientData } from '../../types/patient';
import { Measure } from '../../types/measure';
import { TreatmentSession } from '../../types/treatmentSession';
import { StingPoint } from '../../types/apipuncture';
import { addMeasuredValueReading, updateTreatmentFeedback } from '../../firebase/patient';
import { T, useT, useTranslationContext } from '../T';
import { Loader, CheckCircle, AlertTriangle, Activity, Info } from 'lucide-react';
import styles from './TreatmentFeedback.module.css';
import TreatmentSummary from './TreatmentSummary';

interface TreatmentFeedbackProps {
    patient: JoinedPatientData;
    treatment: TreatmentSession;
    onComplete: () => void;
    onBack: () => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};


const TreatmentFeedback: React.FC<TreatmentFeedbackProps> = ({ patient, treatment, onComplete, onBack }) => {
    const { language, direction } = useTranslationContext();

    const [measures, setMeasures] = useState<Measure[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

    // Form state
    const [feedbackText, setFeedbackText] = useState('');
    const [measureValues, setMeasureValues] = useState<Record<string, string | number>>({});

    const tTreatmentSummary = useT('Treatment Summary');
    const tPatientFeedback = useT('Patient Feedback');
    const tFeedbackPlaceholder = useT('Enter patient feedback a day after treatment...');
    const tMeasures = useT('Measures');
    const tSaveFeedback = useT('Save Feedback');
    const tSuccess = useT('Feedback saved successfully!');
    const tError = useT('Failed to save feedback.');
    const tNoRounds = useT('No protocol rounds recorded.');
    const tFinalNotes = useT('Final Notes');
    const tNoNotes = useT('No notes.');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Measures — derive from treatment.problemIds → problems → measureIds
            const [measuresSnapshot, problemsSnapshot] = await Promise.all([
                getDocs(collection(db, 'cfg_measures')),
                getDocs(collection(db, 'cfg_problems')),
            ]);
            const allMeasures: Measure[] = measuresSnapshot.docs.map(d => ({
                ...(d.data() as Omit<Measure, 'id'>),
                id: d.id,
            }));

            // Collect measure IDs linked to problems used in this treatment
            const treatmentProblemIds = treatment.problemIds || [];
            const relevantMeasureIds = new Set<string>();
            problemsSnapshot.docs.forEach(d => {
                if (treatmentProblemIds.includes(d.id)) {
                    const probData = d.data();
                    (probData.measureIds || []).forEach((mid: string) => relevantMeasureIds.add(mid));
                }
            });
            setMeasures(allMeasures.filter(m => relevantMeasureIds.has(m.id)));

        } catch (err) {
            console.error('TreatmentFeedback: failed to load data', err);
        } finally {
            setIsLoading(false);
        }
    }, [patient, treatment, language]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleMeasureChange = (measureId: string, value: string | number) => {
        setMeasureValues(prev => ({ ...prev, [measureId]: value }));
        setSaveStatus(null);
    };

    const isFormValid = measures.every(m => measureValues[m.id] !== undefined && measureValues[m.id] !== '');

    const handleSave = async () => {
        if (!isFormValid || isSaving) return;
        setIsSaving(true);
        setSaveStatus(null);

        try {
            const readings = measures.map(m => {
                const value = measureValues[m.id];
                const numericValue = typeof value === 'number' ? value : undefined;

                return {
                    measureId: m.id,
                    value,
                };
            }).filter(r => r.value !== undefined && r.value !== '');

            const usedMeasureIds = readings.map(r => r.measureId);

            if (!patient.id) {
                console.error('TreatmentFeedback: patient.id is missing');
                setSaveStatus('error');
                return;
            }

            // 1. Save to measured_values
            const readingId = await addMeasuredValueReading(patient.id, {
                treatmentId: treatment.id,
                readings: readings as any,
                usedMeasureIds: usedMeasureIds, // Added
                note: feedbackText
            });

            // 2. Update treatment with readingId and feedback text
            await updateTreatmentFeedback(treatment.id!, readingId, feedbackText);

            setSaveStatus('success');
            setTimeout(() => onComplete(), 2000);
        } catch (err) {
            console.error('TreatmentFeedback: failed to save', err);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (ts: any) => {
        if (!ts) return '';
        const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
        return date.toLocaleString(language, {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    if (isLoading) {
        return (
            <div className={styles.loadingOverlay}>
                <Loader size={32} className={styles.spinner} />
                <p><T>Loading treatment details...</T></p>
            </div>
        );
    }

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.grid}>
                <div className={styles.leftPane}>
                    <h3 className={styles.sectionTitle}>
                        <Info size={18} />
                        <T>Treatment</T> {treatment.treatmentNumber || ''} <T>Summary</T>
                    </h3>
                    <TreatmentSummary 
                        treatment={treatment} 
                        language={language} 
                        direction={direction} 
                    />
                </div>

                {/* Right Pane: Feedback Form */}
                <div className={styles.rightPane}>
                    <h3 className={styles.sectionTitle}><Activity size={18} /> {tPatientFeedback}</h3>
                    <div className={styles.feedbackForm}>
                        <div className={styles.section}>
                            <textarea
                                id="patientFeedbackText"
                                name="patientFeedbackText"
                                className={styles.textarea}
                                value={feedbackText}
                                onChange={e => setFeedbackText(e.target.value)}
                                placeholder={tFeedbackPlaceholder}
                                rows={6}
                            />
                        </div>

                        <div className={styles.section}>
                            <h4 className={styles.sectionTitle}>{tMeasures}</h4>
                            <div className={styles.measuresGrid}>
                                {measures.map(measure => {
                                    const value = measureValues[measure.id] ?? '';
                                    return (
                                        <div key={measure.id} className={styles.measureItem}>
                                            <div className={styles.measureHeader}>
                                                <span className={styles.measureName}>{getMLValue(measure.name, language)}</span>
                                                <span className={styles.measureDesc}>{getMLValue(measure.description, language)}</span>
                                            </div>
                                            <input
                                                id={`measure-${measure.id}`}
                                                name={`measure-${measure.id}`}
                                                type="number"
                                                className={styles.measureInput}
                                                value={value}
                                                min={measure.min}
                                                max={measure.max}
                                                placeholder={`${measure.min ?? 0} – ${measure.max ?? 10}`}
                                                onChange={e => handleMeasureChange(measure.id, e.target.value === '' ? '' : Number(e.target.value))}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={styles.actions}>
                            <button
                                className={styles.btnPrimary}
                                disabled={!isFormValid || isSaving}
                                onClick={handleSave}
                            >
                                {isSaving ? <Loader size={18} className={styles.spinner} /> : <CheckCircle size={18} />}
                                {tSaveFeedback}
                            </button>

                            {saveStatus === 'success' && (
                                <span className={`${styles.statusMsg} ${styles.success}`}>
                                    <CheckCircle size={16} /> {tSuccess}
                                </span>
                            )}
                            {saveStatus === 'error' && (
                                <span className={`${styles.statusMsg} ${styles.error}`}>
                                    <AlertTriangle size={16} /> {tError}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TreatmentFeedback;
