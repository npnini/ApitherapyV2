import React, { useState, useEffect, useCallback, useRef } from 'react';
import { JoinedPatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, where, query, orderBy } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { VitalSigns } from '../types/treatmentSession';
import { ChevronLeft, Calendar, User, Syringe, FileText, Activity, MapPin, Loader, AlertTriangle, ChevronRight, List, Table, Play } from 'lucide-react';
import { T, useT, useTranslationContext } from './T';
import styles from './TreatmentHistory.module.css';

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        return value[lang] || value.en || '';
    }
    return '';
};

const renderSafe = (value: any): React.ReactNode => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (typeof value === 'object') {
        return Object.entries(value as object)
            .filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(', ');
    }
    return String(value);
};

interface VitalSignsDisplayProps {
    title: string;
    vitals: Partial<VitalSigns> | undefined;
    icon?: React.ReactNode;
}

const VitalSignsDisplay: React.FC<VitalSignsDisplayProps> = ({ title, vitals, icon }) => {
    if (!vitals) return null;
    const { systolic, diastolic, heartRate } = vitals;
    if (systolic === undefined && diastolic === undefined && heartRate === undefined) return null;

    return (
        <div className={styles.vitalsBlock}>
            <h4 className={styles.innerLabel}>
                {icon && <span className={styles.iconWrapper}>{icon}</span>}
                <T>{title}</T>
            </h4>
            <div className={styles.vitalsGrid}>
                {systolic !== undefined && <div><span className={styles.vitalsLabel}><T>Systolic</T>:</span> {renderSafe(systolic)}</div>}
                {diastolic !== undefined && <div><span className={styles.vitalsLabel}><T>Diastolic</T>:</span> {renderSafe(diastolic)}</div>}
                {heartRate !== undefined && <div><span className={styles.vitalsLabel}><T>Heart Rate</T>:</span> {renderSafe(heartRate)}</div>}
            </div>
        </div>
    );
};

/** Flat Firestore treatment document — matches TreatmentSession schema exactly */
interface StoredTreatmentDoc {
    id: string;
    patientId: string;
    caretakerId: string;
    createdTimestamp?: any;
    updatedTimestamp?: any;
    patientReport: string;
    preTreatmentVitals?: Partial<VitalSigns>;
    preTreatmentMeasureReadingId?: string;
    preTreatmentImage?: string;
    isSensitivityTest?: boolean;
    protocolId?: string;
    protocolIds?: string[];
    problemId?: string;
    problemIds?: string[];
    stungPointIds?: string[];
    status?: 'Incomplete' | 'Completed';
    postStingingVitals?: Partial<VitalSigns>;
    finalVitals?: Partial<VitalSigns>;
    finalNotes?: string;
    patientFeedback?: string;
    patientFeedbackMeasureReadingId?: string;
    treatmentNumber?: number;
}

/** Hydrated form — adds resolved point objects and fetched measure readings */
interface HydratedTreatment extends StoredTreatmentDoc {
    stungPoints: StingPoint[];
    measuredValues?: Array<{ measureId: string; label: string; value: string | number }>;
    feedbackMeasuredValues?: Array<{ label: string; value: string | number }>;
}

interface TreatmentHistoryProps {
    patient: Partial<JoinedPatientData>;
    onBack: () => void;
    isTab?: boolean;
    onResumeTreatment?: (treatment: any) => void;
}

const TreatmentHistory: React.FC<TreatmentHistoryProps> = ({ patient, onBack, isTab, onResumeTreatment }) => {
    const { language } = useTranslationContext();
    const tNotAvailable = useT('Not available');
    const tInvalidDate = useT('Invalid date');
    const tNotProvided = useT('Not provided');
    const tNoNotes = useT('No notes');
    const [treatments, setTreatments] = useState<HydratedTreatment[]>([]);
    const [caretakerNames, setCaretakerNames] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'tabular'>('tabular');
    const [patientMeasureNames, setPatientMeasureNames] = useState<{ id: string, name: string | Record<string, string> }[]>([]);
    const [protocolsNamesMap, setProtocolsNamesMap] = useState<Map<string, string | Record<string, string>>>(new Map());
    const [problemsNamesMap, setProblemsNamesMap] = useState<Map<string, string | Record<string, string>>>(new Map());
    const [freeProtoId, setFreeProtoId] = useState<string | null>(null);
    const pointsMapRef = useRef<Map<string, StingPoint>>(new Map());

    const fetchTreatments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const treatmentsRef = collection(db, 'treatments');
            console.log(`[TRACER] TreatmentHistory: Querying treatments by patientId field: "${patient.id}"`);

            // Query by field to handle both prefix-based and random-based document IDs.
            // Using a simple equality query first to avoid missing index errors.
            const q = query(
                treatmentsRef,
                where('patientId', '==', patient.id)
            );

            const querySnapshot = await getDocs(q);
            let rawTreatments = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as StoredTreatmentDoc));

            // Sort in memory to ensure latest treatments appear first without requiring a composite index
            rawTreatments.sort((a, b) => {
                const tsA = a.createdTimestamp?.seconds || 0;
                const tsB = b.createdTimestamp?.seconds || 0;
                return tsB - tsA;
            });

            console.log(`[TRACER] TreatmentHistory: Found ${rawTreatments.length} treatments.`);

            const configSnap = await getDoc(doc(db, 'cfg_app_config', 'main'));
            const appConfig = configSnap.exists() ? configSnap.data() : {};
            const fId = appConfig.treatmentSettings?.freeProtocolIdentifier;
            setFreeProtoId(fId || null);

            // Fetch all acupuncture points
            const pointsSnapshot = await getDocs(collection(db, 'cfg_acupuncture_points'));
            const pointsMap = new Map<string, StingPoint>();
            pointsSnapshot.docs.forEach(d => {
                const data = d.data() as StingPoint;
                const point = { ...data, id: d.id };
                pointsMap.set(d.id, point);
                pointsMap.set(data.code, point);
            });
            pointsMapRef.current = pointsMap;

            // Fetch measures, protocols, and problems
            const [measuresSnapshot, protocolsSnapshot, problemsSnapshot] = await Promise.all([
                getDocs(collection(db, 'cfg_measures')),
                getDocs(collection(db, 'cfg_protocols')),
                getDocs(collection(db, 'cfg_problems'))
            ]);

            const measuresMap = new Map<string, string | Record<string, string>>();
            measuresSnapshot.docs.forEach(d => {
                const data = d.data();
                measuresMap.set(d.id, data.name);
            });

            const problemsMeasureMap = new Map<string, string[]>(); // problemId -> measureIds
            problemsSnapshot.docs.forEach(d => {
                problemsMeasureMap.set(d.id, d.data().measureIds || []);
            });

            // Build union of all measures referenced by any treatment's problemIds
            const allTreatmentMeasureIds = new Set<string>();
            rawTreatments.forEach(t => {
                const problemIds = t.problemIds || (t.problemId ? [t.problemId] : []);
                problemIds.forEach(pid => {
                    (problemsMeasureMap.get(pid) || []).forEach(mid => allTreatmentMeasureIds.add(mid));
                });
            });

            const patientMeasures: { id: string, name: string | Record<string, string> }[] = [];
            measuresSnapshot.docs.forEach(d => {
                if (allTreatmentMeasureIds.has(d.id)) {
                    patientMeasures.push({ id: d.id, name: d.data().name });
                }
            });
            setPatientMeasureNames(patientMeasures);

            const protocolsMap = new Map<string, string | Record<string, string>>();
            protocolsSnapshot.docs.forEach(d => {
                protocolsMap.set(d.id, d.data().name);
            });
            setProtocolsNamesMap(protocolsMap);

            const problemsMap = new Map<string, string | Record<string, string>>();
            problemsSnapshot.docs.forEach(d => {
                problemsMap.set(d.id, d.data().name);
            });
            setProblemsNamesMap(problemsMap);

            // Hydrate each treatment
            const hydratedTreatments = await Promise.all(rawTreatments.map(async (treatment): Promise<HydratedTreatment> => {
                // Resolve stungPointIds → StingPoint objects
                const stungPoints: StingPoint[] = (treatment.stungPointIds ?? [])
                    .map(id => pointsMap.get(id))
                    .filter((p): p is StingPoint => p !== undefined);

                // Fetch pre-treatment measured values
                let measuredValues: Array<{ measureId: string; label: string; value: string | number }> = [];
                if (treatment.preTreatmentMeasureReadingId) {
                    try {
                        const readingDoc = await getDoc(doc(db, 'measured_values', treatment.preTreatmentMeasureReadingId));
                        if (readingDoc.exists()) {
                            const data = readingDoc.data();
                            measuredValues = (data.readings || []).map((r: any) => ({
                                measureId: r.measureId,
                                label: getMLValue(measuresMap.get(r.measureId), language),
                                value: r.value
                            }));
                        }
                    } catch (err) {
                        console.error('Error fetching measure reading:', err);
                    }
                }

                // Fetch patient feedback measured values
                let feedbackMeasuredValues: Array<{ label: string; value: string | number }> = [];
                if (treatment.patientFeedbackMeasureReadingId) {
                    try {
                        const readingDoc = await getDoc(doc(db, 'measured_values', treatment.patientFeedbackMeasureReadingId));
                        if (readingDoc.exists()) {
                            const data = readingDoc.data();
                            feedbackMeasuredValues = (data.readings || []).map((r: any) => ({
                                label: getMLValue(measuresMap.get(r.measureId), language),
                                value: r.value
                            }));
                        }
                    } catch (err) {
                        console.error('Error fetching patient feedback measure reading:', err);
                    }
                }

                return {
                    ...treatment,
                    stungPoints,
                    measuredValues: measuredValues.length > 0 ? measuredValues : undefined,
                    feedbackMeasuredValues: feedbackMeasuredValues.length > 0 ? feedbackMeasuredValues : undefined
                };
            }));

            setTreatments(hydratedTreatments);

            // Fetch caretaker display names
            const uniqueCaretakerIds = Array.from(new Set(rawTreatments.map(t => t.caretakerId)));
            const newNamesMap = new Map<string, string>(Array.from(caretakerNames.entries()));
            let mapChanged = false;
            await Promise.all(uniqueCaretakerIds.map(async (id) => {
                if (!newNamesMap.has(id)) {
                    try {
                        const userDoc = await getDoc(doc(db, 'users', id));
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            newNamesMap.set(id, userData.fullName || userData.displayName || id);
                            mapChanged = true;
                        }
                    } catch (err) {
                        console.error(`Error fetching user ${id}:`, err);
                    }
                }
            }));
            if (mapChanged) setCaretakerNames(newNamesMap);

        } catch (err) {
            console.error('Error fetching treatment history:', err);
            setError('Failed to load treatment history');
        } finally {
            setIsLoading(false);
        }
    }, [patient.id]);

    useEffect(() => {
        fetchTreatments();
    }, [fetchTreatments]);

    const formatDate = (treatment: StoredTreatmentDoc) => {
        const dateVal = treatment.createdTimestamp;
        if (!dateVal) return tNotAvailable;
        try {
            let date: Date;
            if (dateVal.seconds) {
                date = new Date(dateVal.seconds * 1000);
            } else if (typeof dateVal === 'number') {
                date = new Date(dateVal);
            } else if (typeof dateVal === 'string') {
                date = new Date(dateVal);
            } else {
                return tNotAvailable;
            }
            const pad2 = (n: number) => String(n).padStart(2, '0');
            return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
        } catch (e) {
            return tInvalidDate;
        }
    };

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader className={styles.loader} />
                <p className={styles.loaderText}><T>Loading treatment history...</T></p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <AlertTriangle className={styles.errorIcon} />
                <h3 className={styles.errorTitle}><T>Error</T></h3>
                <p className={styles.errorMessage}><T>{error}</T></p>
                <button onClick={onBack} className={styles.errorButton}><T>Back</T></button>
            </div>
        );
    }

    const direction = language === 'he' ? 'rtl' : 'ltr';
    const BackIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;

    return (
        <div className={styles.container} dir={direction}>
            {!isTab && (
                <div className={styles.header}>
                    <button onClick={onBack} className={styles.backButton}>
                        <BackIcon size={24} />
                    </button>
                    <h1 className={styles.title}>
                        <T>Treatment History for</T> {patient.fullName}
                    </h1>
                </div>
            )}

            {/* View toggle */}
            <div className={styles.viewToggle}>
                <button
                    onClick={() => setViewMode('list')}
                    className={`${styles.toggleButton} ${viewMode === 'list' ? styles.activeToggle : ''}`}
                >
                    <List size={18} />
                    <T>List View</T>
                </button>
                <button
                    onClick={() => setViewMode('tabular')}
                    className={`${styles.toggleButton} ${viewMode === 'tabular' ? styles.activeToggle : ''}`}
                >
                    <Table size={18} />
                    <T>Tabular View</T>
                </button>
            </div>

            {treatments.length === 0 ? (
                <div className={styles.emptyState}>
                    <p><T>No treatments recorded</T></p>
                </div>

            ) : viewMode === 'tabular' ? (
                /* ── TABULAR VIEW ────────────────────────────────────────── */
                <div className={styles.tableWrapper}>
                    <table className={styles.treatmentTable}>
                        <thead>
                            <tr>
                                <th><T>Date and time</T></th>
                                <th><T>Patient Report</T></th>
                                <th><T>Status</T></th>
                                {patientMeasureNames.map(m => (
                                    <th key={m.id}>{getMLValue(m.name, language)}</th>
                                ))}
                                <th><T>Problem(s)</T></th>
                                <th><T>Protocol(s)</T></th>
                                <th><T>Pre treatment Vitals</T></th>
                                <th><T>Stings</T></th>
                                <th><T>Post-Sting Vitals</T></th>
                                <th><T>Post treatment Vitals</T></th>
                                <th><T>Final notes</T></th>
                                <th><T>Actions</T></th>
                            </tr>
                        </thead>
                        <tbody>
                            {treatments.map((t) => {
                                const preV = t.preTreatmentVitals;
                                const preVitalsStr = preV
                                    ? `${preV.systolic ?? '-'}-${preV.diastolic ?? '-'}-${preV.heartRate ?? '-'}`
                                    : '-';

                                const psV = t.postStingingVitals;
                                const postStingVitalsStr = psV
                                    ? `${psV.systolic ?? '-'}-${psV.diastolic ?? '-'}-${psV.heartRate ?? '-'}`
                                    : '-';

                                const postV = t.finalVitals;
                                const postVitalsStr = postV
                                    ? `${postV.systolic ?? '-'}-${postV.diastolic ?? '-'}-${postV.heartRate ?? '-'}`
                                    : '-';

                                const stingCodes = t.stungPoints.length > 0
                                    ? t.stungPoints.map(p => p.code).join(', ')
                                    : '-';

                                return (
                                    <tr key={t.id}>
                                        <td className={styles.dateCell}>{formatDate(t)}</td>
                                        <td className={styles.reportCell} title={t.patientReport || undefined}>{t.patientReport || '-'}</td>
                                        <td className={styles.statusCell}>
                                            <span className={`${styles.statusBadge} ${t.status === 'Incomplete' ? styles.statusIncomplete : styles.statusCompleted}`}>
                                                <T>{t.status || 'Completed'}</T>
                                            </span>
                                        </td>
                                        {patientMeasureNames.map(m => {
                                            const mv = t.measuredValues?.find(mv => mv.measureId === m.id);
                                            return <td key={m.id} className={styles.measureCell}>{mv?.value ?? '-'}</td>;
                                        })}
                                        <td className={styles.multiIdCell} title={(t.problemIds || (t.problemId ? [t.problemId] : [])).map(id => getMLValue(problemsNamesMap.get(id), language)).join(', ') || undefined}>
                                            {(t.problemIds || (t.problemId ? [t.problemId] : [])).map(id => getMLValue(problemsNamesMap.get(id), language)).join(', ') || '-'}
                                        </td>
                                        <td className={styles.multiIdCell} title={(t.protocolIds || (t.protocolId ? [t.protocolId] : [])).map(id => {
                                            const name = getMLValue(protocolsNamesMap.get(id), language);
                                            if (!name && id === freeProtoId) return language === 'he' ? 'פרוטוקול חופשי' : 'Free Protocol';
                                            return name || id;
                                        }).join(', ') || undefined}>
                                            {(t.protocolIds || (t.protocolId ? [t.protocolId] : [])).map(id => {
                                                const name = getMLValue(protocolsNamesMap.get(id), language);
                                                if (!name && id === freeProtoId) return language === 'he' ? 'פרוטוקול חופשי' : 'Free Protocol';
                                                return name || id;
                                            }).join(', ') || '-'}
                                        </td>
                                        <td className={styles.vitalsCell}>{preVitalsStr}</td>
                                        <td className={styles.stingsCell}>{stingCodes}</td>
                                        <td className={styles.vitalsCell}>{postStingVitalsStr}</td>
                                        <td className={styles.vitalsCell}>{postVitalsStr}</td>
                                        <td className={styles.notesCell} title={t.finalNotes || undefined}>{t.finalNotes || '-'}</td>
                                        <td className={styles.actionsCell}>
                                            {t.status === 'Incomplete' && (
                                                <button
                                                    className={styles.resumeIconBtn}
                                                    title="Resume Treatment"
                                                    onClick={() => {
                                                        if (onResumeTreatment) {
                                                            onResumeTreatment(t);
                                                        }
                                                    }}
                                                >
                                                    <Play size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

            ) : (
                /* ── LIST VIEW ───────────────────────────────────────────── */
                <div className={styles.treatmentsList}>
                    {treatments.map((treatment) => (
                        <div key={treatment.id} className={styles.treatmentCard}>
                            <div className={styles.cardHeader} dir={direction}>
                                <div className={styles.metaInfo}>
                                    <h2 className={styles.protocolName}>
                                        <T>Treatment</T> - {treatment.treatmentNumber || '-'}
                                        {treatment.status === 'Incomplete' && <span className={styles.statusIncompleteBadge}> (<T>Incomplete</T>)</span>}
                                        {treatment.isSensitivityTest &&
                                            <span className={styles.sensitivityBadge}> (<T>Sensitivity Test</T>)</span>}
                                    </h2>
                                    <div className={styles.metaRow}>
                                        <Calendar size={16} />
                                        <span>{formatDate(treatment)}</span>
                                    </div>
                                    <div className={styles.metaRowSmall}>
                                        <User size={14} />
                                        <span>{caretakerNames.get(treatment.caretakerId) || treatment.caretakerId}</span>
                                    </div>
                                </div>
                                {treatment.status === 'Incomplete' && (
                                    <button
                                        className={styles.resumeIconBtn}
                                        onClick={() => onResumeTreatment?.(treatment)}
                                    >
                                        <Play size={16} />
                                        <span style={{ marginInlineStart: '0.5rem' }}><T>Resume Treatment</T></span>
                                    </button>
                                )}
                            </div>

                            <div className={styles.sessionPhases}>
                                {/* Phase 1: Session Opening */}
                                <div className={styles.phase}>
                                    <h3 className={styles.phaseTitle}><T>1. Session Opening</T></h3>
                                    <div className={styles.detailsGrid}>
                                        <div className={styles.detailItem}>
                                            <h4 className={styles.detailLabel}>
                                                <FileText size={16} />
                                                <T>Patient Report</T>
                                            </h4>
                                            <p className={styles.detailContent}>{renderSafe(treatment.patientReport) || tNotProvided}</p>
                                        </div>

                                        {treatment.measuredValues && treatment.measuredValues.length > 0 && (
                                            <div className={styles.detailItem}>
                                                <h4 className={styles.detailLabel}>
                                                    <Activity size={16} />
                                                    <T>Initial Measures (KPIs)</T>
                                                </h4>
                                                <div className={styles.measuredValuesGrid}>
                                                    {treatment.measuredValues.map((mv, idx) => (
                                                        <div key={idx} className={styles.kpiItem}>
                                                            <span className={styles.kpiLabel}>{mv.label}:</span>
                                                            <span className={styles.kpiValue}>{renderSafe(mv.value)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className={styles.detailItem}>
                                            <VitalSignsDisplay
                                                title="Pre-session Vitals"
                                                vitals={treatment.preTreatmentVitals}
                                                icon={<Activity size={14} />}
                                            />
                                        </div>

                                        {treatment.preTreatmentImage && (
                                            <div className={styles.imageDetailItem}>
                                                <h4 className={styles.detailLabel}><T>Pre-Treatment Photo</T></h4>
                                                <img
                                                    src={treatment.preTreatmentImage}
                                                    alt="Pre-treatment"
                                                    className={styles.treatmentPhoto}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.sideBySidePhases}>
                                    {/* Phase 2: Stung Points */}
                                    <div className={`${styles.phase} ${styles.sidePhase}`}>
                                        <h3 className={styles.phaseTitle}><T>2. Stung Points</T></h3>
                                        <div className={styles.pointsContainer}>
                                            {treatment.stungPoints.length > 0 ? (
                                                <ul className={styles.pointsList}>
                                                    {treatment.stungPoints.map((point) => (
                                                        <li key={point.id} className={styles.pointItem} dir={direction}>
                                                            <div className={styles.pointDetails}>
                                                                <MapPin size={14} className={styles.pointIcon} />
                                                                <span className={styles.pointTextWrapper}>
                                                                    <span className={styles.pointCode}>{point.code}</span>
                                                                    {' - '}
                                                                    <span className={styles.pointLabel}>{getMLValue(point.label, language)}</span>
                                                                </span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className={styles.emptyText}><T>No points stung</T></p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phase 3: Protocols Used */}
                                    <div className={`${styles.phase} ${styles.sidePhase}`}>
                                        <h3 className={styles.phaseTitle}><T>3. Protocols Used</T></h3>
                                        <div className={styles.protocolsListSmall}>
                                            {(treatment.protocolIds || (treatment.protocolId ? [treatment.protocolId] : [])).length > 0 ? (
                                                (treatment.protocolIds || (treatment.protocolId ? [treatment.protocolId] : [])).map((id, idx) => {
                                                    const nameObj = protocolsNamesMap.get(id);
                                                    let name = getMLValue(nameObj, language);

                                                    // Fallback for free protocol if not in DB
                                                    if (!name && id === freeProtoId) {
                                                        name = language === 'he' ? 'פרוטוקול חופשי' : 'Free Protocol';
                                                    }

                                                    return (
                                                        <div key={idx} className={styles.protocolListItemSmall}>
                                                            {name || id}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <p className={styles.emptyText}><T>No protocols recorded</T></p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Phase 4: Finish Session */}
                                <div className={styles.phase}>
                                    <h3 className={styles.phaseTitle}><T>4. Finish Session</T></h3>
                                    <div className={styles.detailsGrid}>
                                        <div className={styles.detailItem}>
                                            <VitalSignsDisplay
                                                title="Post-Stinging Vitals"
                                                vitals={treatment.postStingingVitals}
                                                icon={<Activity size={14} />}
                                            />
                                        </div>
                                        <div className={styles.detailItem}>
                                            <VitalSignsDisplay
                                                title="Final Vitals"
                                                vitals={treatment.finalVitals}
                                                icon={<Activity size={14} />}
                                            />
                                        </div>
                                        <div className={styles.detailItem}>
                                            <h4 className={styles.detailLabel}>
                                                <FileText size={16} />
                                                <T>Final Notes</T>
                                            </h4>
                                            <p className={styles.notesContent}>{renderSafe(treatment.finalNotes) || tNoNotes}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Phase 5: Treatment Feedback */}
                                {(treatment.patientFeedback || (treatment.feedbackMeasuredValues && treatment.feedbackMeasuredValues.length > 0)) && (
                                    <div className={styles.phase}>
                                        <h3 className={styles.phaseTitle}><T>5. Treatment Feedback</T></h3>
                                        <div className={styles.detailsGrid}>
                                            {treatment.patientFeedback && (
                                                <div className={styles.detailItem}>
                                                    <h4 className={styles.detailLabel}>
                                                        <FileText size={16} />
                                                        <T>Patient Feedback</T>
                                                    </h4>
                                                    <p className={styles.notesContent}>{renderSafe(treatment.patientFeedback)}</p>
                                                </div>
                                            )}
                                            {treatment.feedbackMeasuredValues && treatment.feedbackMeasuredValues.length > 0 && (
                                                <div className={styles.detailItem}>
                                                    <h4 className={styles.detailLabel}>
                                                        <Activity size={16} />
                                                        <T>Feedback Measures</T>
                                                    </h4>
                                                    <div className={styles.measuredValuesGrid}>
                                                        {treatment.feedbackMeasuredValues.map((mv, idx) => (
                                                            <div key={idx} className={styles.kpiItem}>
                                                                <span className={styles.kpiLabel}>{mv.label}:</span>
                                                                <span className={styles.kpiValue}>{renderSafe(mv.value)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
