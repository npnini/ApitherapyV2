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

interface HydratedProtocol {
    protocolId: string;
    protocolName: string;
    stungPoints: StingPoint[];
}

interface ProblemGroup {
    problemId: string;
    problemName: string;
    protocols: HydratedProtocol[];
    measures: Measure[];
}

const TreatmentFeedback: React.FC<TreatmentFeedbackProps> = ({ patient, treatment, onComplete, onBack }) => {
    const { language, direction } = useTranslationContext();

    const [measures, setMeasures] = useState<Measure[]>([]);
    const [problemGroups, setProblemGroups] = useState<ProblemGroup[]>([]);
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

            // Fetch app config for freeProtocolIdentifier
            const configSnap = await getDoc(doc(db, 'cfg_app_config', 'main'));
            const appConfig = configSnap.exists() ? configSnap.data() : null;
            const freeProtoIdFromConfig = appConfig?.treatmentSettings?.freeProtocolIdentifier;

            // 2. Hydrate Problem Groups (Problem -> Protocols -> Stung Points + Measures)
            const protocolsSnapshot = await getDocs(collection(db, 'cfg_protocols'));
            const protocolsMap = new Map();
            protocolsSnapshot.docs.forEach(d => protocolsMap.set(d.id, { id: d.id, ...d.data() }));

            const pointsSnapshot = await getDocs(collection(db, 'cfg_acupuncture_points'));
            const pointsMap = new Map();
            pointsSnapshot.docs.forEach(d => pointsMap.set(d.id, { ...d.data(), id: d.id }));

            const groups: ProblemGroup[] = [];
            const assignedPointIds = new Set<string>();

            problemsSnapshot.docs.forEach(probDoc => {
                if (treatmentProblemIds.includes(probDoc.id)) {
                    const probData = probDoc.data();
                    const probProtocolIds = probData.protocolIds || (probData.protocolId ? [probData.protocolId] : []);
                    const probMeasureIds = probData.measureIds || [];

                    const protocols: HydratedProtocol[] = probProtocolIds.map((pid: string) => {
                        const protoData = protocolsMap.get(pid);
                        if (!protoData) return null;

                        // Identify points from this protocol that were stung
                        const rawPoints = protoData.points || [];
                        const protoPointIds = Array.isArray(rawPoints) && rawPoints.length > 0 && typeof rawPoints[0] === 'object'
                            ? rawPoints.map((p: any) => p.id)
                            : rawPoints;

                        const pointsInThisProtocol = (treatment.stungPointIds || [])
                            .filter(id => protoPointIds.includes(id))
                            .map(id => {
                                assignedPointIds.add(id);
                                return pointsMap.get(id);
                            })
                            .filter(p => !!p);

                        return {
                            protocolId: pid,
                            protocolName: getMLValue(protoData.name, language),
                            stungPoints: pointsInThisProtocol
                        };
                    }).filter((p: any) => !!p);

                    const probMeasures = allMeasures.filter(m => probMeasureIds.includes(m.id));

                    groups.push({
                        problemId: probDoc.id,
                        problemName: getMLValue(probData.name, language),
                        protocols,
                        measures: probMeasures
                    });
                }
            });

            // Handle Free Protocol if used OR if there are orphan points
            if (treatment.freeProtocolUsed || treatment.protocolIds?.includes(freeProtoIdFromConfig)) {
                const orphanPointIds = (treatment.stungPointIds || []).filter(id => !assignedPointIds.has(id));
                const freeProtoId = freeProtoIdFromConfig || (treatment.protocolIds || []).find(id => !protocolsSnapshot.docs.some(d => d.id === id)); // fallback

                if (orphanPointIds.length > 0 && freeProtoId) {
                    const protoData = protocolsMap.get(freeProtoId);
                    if (protoData) {
                        groups.push({
                            problemId: 'free_protocol',
                            problemName: getMLValue(protoData.name, language) || (language === 'he' ? 'פרוטוקול חופשי' : 'Free Protocol'),
                            protocols: [{
                                protocolId: freeProtoId,
                                protocolName: getMLValue(protoData.name, language),
                                stungPoints: orphanPointIds.map(id => pointsMap.get(id)).filter(p => !!p)
                            }],
                            measures: []
                        });
                    }
                }
            }

            setProblemGroups(groups);

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
                {/* Left Pane: Treatment Summary */}
                <div className={styles.leftPane}>
                    <h3 className={styles.sectionTitle}>
                        <Info size={18} />
                        <T>Treatment</T> {treatment.treatmentNumber || ''} <T>Summary</T>
                    </h3>
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
                                {problemGroups.length === 0 ? (
                                    <p className={styles.infoContent}>{tNoRounds}</p>
                                ) : problemGroups.map((group) => (
                                    <div key={group.problemId} className={styles.problemSection}>
                                        <div className={styles.problemHeader}>
                                            <Activity size={14} className={styles.problemIcon} />
                                            <span className={styles.problemName}>{group.problemName}</span>
                                        </div>
                                        <div className={styles.problemContent}>
                                            {group.protocols.map((proto) => (
                                                <div key={proto.protocolId} className={styles.protocolBlock}>
                                                    <div className={styles.protocolTitle}>{proto.protocolName}</div>
                                                    <div className={styles.pointList}>
                                                        {proto.stungPoints.length > 0 ? proto.stungPoints.map(p => (
                                                            <span key={p.id} className={styles.pointBadge}>
                                                                <span className={styles.pointCode}>{p.code}</span> {getMLValue(p.label, language)}
                                                            </span>
                                                        )) : <span className={styles.emptyText}><T>No points stung from this protocol</T></span>}
                                                    </div>
                                                </div>
                                            ))}

                                            {group.measures.length > 0 && (
                                                <div className={styles.problemMeasures}>
                                                    <span className={styles.measuresLabel}><T>Measures</T></span>
                                                    <div className={styles.measureNamesList}>
                                                        {group.measures.map(m => (
                                                            <span key={m.id} className={styles.measureNameTag}>
                                                                {getMLValue(m.name, language)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
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
