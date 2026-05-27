import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { logAction } from '../../services/auditLogService';
import { JoinedPatientData } from '../../types/patient';
import { Measure } from '../../types/measure';
import { Protocol } from '../../types/protocol';
import { TreatmentSession } from '../../types/treatmentSession';
import { addMeasuredValueReading, updateTreatmentFeedback } from '../../firebase/patient';
import { T, useT, useTranslationContext } from '../T';
import { Loader, CheckCircle, AlertTriangle, Activity, Info, ChevronDown, ChevronUp } from 'lucide-react';
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

    const [allMeasures, setAllMeasures] = useState<Measure[]>([]);
    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(null);

    // Form state
    const [feedbackText, setFeedbackText] = useState('');
    const [measureValues, setMeasureValues] = useState<Record<string, string | number>>({});
    const [expandedProtocols, setExpandedProtocols] = useState<Record<string, boolean>>({});

    const tTreatmentSummary = useT('Treatment Summary');
    const tPatientFeedback = useT('Patient Feedback');
    const tFeedbackPlaceholder = useT('Enter patient feedback a day after treatment...');
    const tMeasures = useT('Measures');
    const tSaveFeedback = useT('Save Feedback');
    const tSuccess = useT('Feedback saved successfully!');
    const tError = useT('Failed to save feedback.');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [measuresSnapshot, protocolsSnapshot] = await Promise.all([
                getDocs(collection(db, 'cfg_measures')),
                getDocs(collection(db, 'cfg_protocols')),
            ]);
            
            setAllMeasures(measuresSnapshot.docs.map(d => ({ ...(d.data() as any), id: d.id })));
            setAllProtocols(protocolsSnapshot.docs.map(d => ({ ...(d.data() as any), id: d.id })));
        } catch (err) {
            console.error('TreatmentFeedback: failed to load data', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const activeProtocols = useMemo(() => {
        const ids = new Set<string>(treatment.protocolIds || []);
        if (treatment.isSensitivityTest) {
            const sens = allProtocols.find(p => p.type === 'sensitivity');
            if (sens) ids.add(sens.id);
        }
        return allProtocols.filter(p => ids.has(p.id));
    }, [allProtocols, treatment]);

    const protocolMeasuresMap = useMemo(() => {
        const map: Record<string, Measure[]> = {};
        activeProtocols.forEach(p => {
            if (p.measureIds) {
                map[p.id] = allMeasures.filter(m => p.measureIds.includes(m.id));
            }
        });
        return map;
    }, [activeProtocols, allMeasures]);

    const uniqueMeasures = useMemo(() => {
        const ids = new Set<string>();
        activeProtocols.forEach(p => {
            if (p.measureIds) p.measureIds.forEach(id => ids.add(id));
        });
        return allMeasures.filter(m => ids.has(m.id));
    }, [activeProtocols, allMeasures]);

    useEffect(() => {
        // Expand by default ONLY if single protocol
        const initial: Record<string, boolean> = {};
        const shouldExpand = activeProtocols.length === 1;
        activeProtocols.forEach(p => { initial[p.id] = shouldExpand; });
        setExpandedProtocols(initial);
    }, [activeProtocols]);

    const handleMeasureChange = (measureId: string, value: string | number) => {
        setMeasureValues(prev => ({ ...prev, [measureId]: value }));
        setSaveStatus(null);
    };

    const isProtocolCompleted = useCallback((protocolId: string) => {
        const measures = protocolMeasuresMap[protocolId] || [];
        if (measures.length === 0) return true;
        return measures.every(m => measureValues[m.id] !== undefined && measureValues[m.id] !== '');
    }, [protocolMeasuresMap, measureValues]);

    const firstMissingProtocolName = useMemo(() => {
        const missing = activeProtocols.find(p => !isProtocolCompleted(p.id));
        return missing ? getMLValue(missing.name, language) : null;
    }, [activeProtocols, isProtocolCompleted, language]);

    const isFormValid = useMemo(() => {
        const hasFeedback = feedbackText.trim() !== '';
        const allMeasuresCompleted = activeProtocols.every(p => isProtocolCompleted(p.id));
        return hasFeedback && allMeasuresCompleted;
    }, [feedbackText, activeProtocols, isProtocolCompleted]);

    const saveButtonTooltip = useMemo(() => {
        if (isFormValid) return '';
        if (feedbackText.trim() === '') return language === 'he' ? 'אנא הזן משוב' : 'Please enter feedback text';
        if (firstMissingProtocolName) {
            return language === 'he' 
                ? `אנא הזן מדדים עבור: ${firstMissingProtocolName}` 
                : `Please enter measures for ${firstMissingProtocolName}`;
        }
        return '';
    }, [isFormValid, feedbackText, firstMissingProtocolName, language]);

    const handleSave = async () => {
        if (!isFormValid || isSaving) return;
        setIsSaving(true);
        setSaveStatus(null);

        try {
            const readings = uniqueMeasures.map(m => ({
                measureId: m.id,
                value: measureValues[m.id],
            }));

            const readingId = await addMeasuredValueReading(patient.id, {
                treatmentId: treatment.id,
                readings: readings,
                usedMeasureIds: uniqueMeasures.map(m => m.id),
                note: feedbackText,
                event: 'post'
            });

            await updateTreatmentFeedback(treatment.id!, readingId, feedbackText);

            const authUser = auth.currentUser;
            if (authUser) {
                logAction(authUser, {
                    category: 'patient',
                    action: 'update',
                    entityType: 'treatment',
                    entityId: treatment.id!,
                    entityName: patient.fullName || '',
                    detail: `feedback - treatment ${treatment.treatmentNumber || ''}`,
                });
            }

            setSaveStatus('success');
            setTimeout(() => onComplete(), 2000);
        } catch (err) {
            console.error('TreatmentFeedback: failed to save', err);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
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

                <div className={styles.rightPane}>
                    <h3 className={styles.sectionTitle}><Activity size={18} /> {tPatientFeedback}</h3>
                    <div className={styles.feedbackForm}>
                        <div className={styles.textareaSection}>
                            <textarea
                                className={styles.textarea}
                                value={feedbackText}
                                onChange={e => setFeedbackText(e.target.value)}
                                placeholder={tFeedbackPlaceholder}
                                rows={6}
                            />
                        </div>

                        <div className={styles.measuresSection}>
                            <div className={styles.protocolGroups}>
                                {activeProtocols.map(protocol => {
                                    const protoMeasures = protocolMeasuresMap[protocol.id] || [];
                                    const isExpanded = expandedProtocols[protocol.id];
                                    const isCompleted = isProtocolCompleted(protocol.id);

                                    return (
                                        <div key={protocol.id} className={styles.protocolGroup}>
                                            <button 
                                                className={`${styles.protocolHeader} ${isCompleted ? styles.completedHeader : ''}`} 
                                                onClick={() => setExpandedProtocols(prev => ({ ...prev, [protocol.id]: !prev[protocol.id] }))}
                                                type="button"
                                            >
                                                <span className={styles.protocolGroupName}>{getMLValue(protocol.name, language)}</span>
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                            
                                            {isExpanded && (
                                                <div className={styles.measuresGrid}>
                                                    {protoMeasures.map(measure => {
                                                        const value = measureValues[measure.id] ?? '';
                                                        return (
                                                            <div key={measure.id} className={styles.measureItem}>
                                                                <div className={styles.measureInfo}>
                                                                    <span className={styles.measureName}>{getMLValue(measure.name, language)}</span>
                                                                    <span className={styles.measureDesc}>{getMLValue(measure.description, language)}</span>
                                                                </div>
                                                                <input
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
                                            )}
                                        </div>
                                    );
                                })}
                                {uniqueMeasures.length === 0 && (
                                    <p className={styles.noMeasures}><T>No measures found for this treatment.</T></p>
                                )}
                            </div>
                        </div>

                        <div className={styles.actions}>
                            <button
                                className={styles.btnPrimary}
                                disabled={!isFormValid || isSaving}
                                onClick={handleSave}
                                title={saveButtonTooltip}
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
