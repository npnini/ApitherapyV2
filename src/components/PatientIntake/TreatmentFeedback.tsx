import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { JoinedPatientData } from '../../types/patient';
import { Measure } from '../../types/measure';
import { TreatmentSession } from '../../types/treatmentSession';
import { StingPoint } from '../../types/apipuncture';
import { addMeasuredValueReading, updateTreatmentFeedback } from '../../firebase/patient';
import { T, useT, useTranslationContext } from '../T';
import { Loader, CheckCircle, AlertTriangle, Calendar, FileText, Activity, Syringe, Info } from 'lucide-react';
import styles from './TreatmentFeedback.module.css';

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

interface HydratedRound {
    protocolName: string;
    points: StingPoint[];
}

const TreatmentFeedback: React.FC<TreatmentFeedbackProps> = ({ patient, treatment, onComplete, onBack }) => {
    const { language, direction } = useTranslationContext();

    const [measures, setMeasures] = useState<Measure[]>([]);
    const [hydratedRounds, setHydratedRounds] = useState<HydratedRound[]>([]);
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
            // 1. Fetch Measures
            const measuresSnapshot = await getDocs(collection(db, 'cfg_measures'));
            const allMeasures: Measure[] = measuresSnapshot.docs.map(doc => ({
                ...(doc.data() as Omit<Measure, 'id'>),
                id: doc.id,
            }));

            const measureIds = patient.medicalRecord?.patient_level_data?.treatment_plan?.measureIds;
            if (measureIds && measureIds.length > 0) {
                setMeasures(allMeasures.filter(m => measureIds.includes(m.id)));
            }

            // 2. Hydrate Rounds (Protocols and Points)
            const protocolsSnapshot = await getDocs(collection(db, 'cfg_protocols'));
            const protocolsMap = new Map();
            protocolsSnapshot.docs.forEach(d => protocolsMap.set(d.id, d.data().name));

            const pointsSnapshot = await getDocs(collection(db, 'cfg_acupuncture_points'));
            const pointsMap = new Map();
            pointsSnapshot.docs.forEach(d => pointsMap.set(d.id, { ...d.data(), id: d.id }));

            const rounds: HydratedRound[] = (treatment.rounds || []).map(r => ({
                protocolName: getMLValue(protocolsMap.get(r.protocolId), language),
                points: (r.stungPointIds || []).map(id => pointsMap.get(id)).filter(p => !!p)
            }));
            setHydratedRounds(rounds);

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
            const readings = measures.map(m => ({
                measureId: m.id,
                type: m.type as 'Category' | 'Scale',
                value: measureValues[m.id]
            }));

            if (!patient.id) {
                console.error('TreatmentFeedback: patient.id is missing');
                setSaveStatus('error');
                return;
            }

            // 1. Save to measured_values
            const readingId = await addMeasuredValueReading(patient.id, {
                readings: readings as any,
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
                {/* Left Pane: Treatment Summary */}
                <div className={styles.leftPane}>
                    <h3 className={styles.sectionTitle}><Info size={18} /> {tTreatmentSummary}</h3>
                    <div className={styles.treatmentInfo}>
                        <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}><Calendar size={14} /> <T>Date & Time</T></span>
                            <span className={styles.infoContent}>{formatDate(treatment.createdTimestamp)}</span>
                        </div>

                        <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}><FileText size={14} /> <T>Patient Report</T></span>
                            <p className={styles.infoContent}>{treatment.patientReport || <T>No report.</T>}</p>
                        </div>

                        <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}><Syringe size={14} /> <T>Protocol Rounds</T></span>
                            <div className={styles.roundsList}>
                                {hydratedRounds.length === 0 ? (
                                    <p className={styles.infoContent}>{tNoRounds}</p>
                                ) : hydratedRounds.map((round, idx) => (
                                    <div key={idx} className={styles.roundItem}>
                                        <div className={styles.roundProtocol}>{round.protocolName}</div>
                                        <div className={styles.pointList}>
                                            {round.points.map(p => (
                                                <span key={p.id} className={styles.pointBadge}>
                                                    <span className={styles.pointCode}>{p.code}</span> {getMLValue(p.label, language)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.infoBlock}>
                            <span className={styles.infoLabel}><FileText size={14} /> {tFinalNotes}</span>
                            <p className={styles.infoContent}>{treatment.finalNotes || tNoNotes}</p>
                        </div>
                    </div>
                </div>

                {/* Right Pane: Feedback Form */}
                <div className={styles.rightPane}>
                    <h3 className={styles.sectionTitle}><Activity size={18} /> {tPatientFeedback}</h3>
                    <div className={styles.feedbackForm}>
                        <div className={styles.section}>
                            <textarea
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
                                                        return <option key={idx} value={catLabel}>{catLabel}</option>;
                                                    })}
                                                </select>
                                            )}
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
