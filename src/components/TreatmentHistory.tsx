import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { VitalSigns, ProtocolRound } from '../types/treatmentSession';
import { ChevronLeft, Calendar, User, Syringe, FileText, Activity, MapPin, Loader, AlertTriangle, ChevronRight } from 'lucide-react';
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
        // If it's a Translation object, it should have been handled by getMLValue
        // But if it's a VitalSigns or other data object, we stringify it for safety
        return Object.entries(value as object)
            .filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(', ');
    }
    return String(value);
};

interface VitalSignsDisplayProps {
    title: string;
    vitals: Partial<VitalSigns> | string | undefined;
    icon?: React.ReactNode;
}

const VitalSignsDisplay: React.FC<VitalSignsDisplayProps> = ({ title, vitals, icon }) => {
    if (!vitals) {
        return null;
    }

    // Handle legacy string format
    if (typeof vitals === 'string') {
        return (
            <div className={styles.vitalsBlock}>
                <h4 className={styles.innerLabel}>
                    {icon && <span className={styles.iconWrapper}>{icon}</span>}
                    <T>{title}</T>
                </h4>
                <p className={styles.detailContentShort}>{vitals}</p>
            </div>
        );
    }

    const { systolic, diastolic, heartRate } = vitals;

    if (systolic === undefined && diastolic === undefined && heartRate === undefined) {
        return null;
    }

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
    )
}

// Explicit type for documents stored in Firestore
interface StoredTreatmentDoc {
    id: string;
    patientId: string;
    caretakerId: string;
    timestamp?: any;
    date?: string; // legacy
    patientReport: string;
    preSessionVitals?: Partial<VitalSigns>;
    preStingVitals?: Partial<VitalSigns>; // legacy
    rounds: ProtocolRound[];
    finalVitals?: Partial<VitalSigns>;
    finalNotes?: string;
    isSensitivityTest?: boolean;
    measureReadingId?: string; // Link to KPI readings
    vitals?: string; // legacy
    protocolId?: string; // legacy
    protocolName?: string | Record<string, string>; // legacy
    stungPoints?: string[]; // legacy
}

// Explicit type for the hydrated data used for rendering
interface HydratedRound extends Omit<ProtocolRound, 'stungPointCodes'> {
    stungPoints: StingPoint[];
}

interface HydratedTreatment extends Omit<StoredTreatmentDoc, 'rounds' | 'stungPoints'> {
    rounds: HydratedRound[];
    stungPoints?: StingPoint[]; // legacy
    measuredValues?: Array<{ label: string; value: string | number }>;
}

interface TreatmentHistoryProps {
    patient: PatientData;
    onBack: () => void;
    isTab?: boolean;
}

const TreatmentHistory: React.FC<TreatmentHistoryProps> = ({ patient, onBack, isTab }) => {
    const { language } = useTranslationContext();
    const tNotAvailable = useT('Not available');
    const tInvalidDate = useT('Invalid date');
    const tNotProvided = useT('Not provided');
    const tNoNotes = useT('No notes');
    const [treatments, setTreatments] = useState<HydratedTreatment[]>([]);
    const [caretakerNames, setCaretakerNames] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTreatments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const treatmentsRef = collection(db, 'treatments');
            const q = query(
                treatmentsRef,
                where('__name__', '>=', `${patient.id}_`),
                where('__name__', '<=', `${patient.id}_\uf8ff`),
                orderBy('__name__', 'desc')
            );
            const querySnapshot = await getDocs(q);

            let rawDocs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoredTreatmentDoc));

            // If timestamp query returned nothing but collection might not be empty (unlikely with orderBy), 
            // or if we need to merge with legacy 'date' field docs if they don't have timestamps:
            // For now, most new docs have 'timestamp' from saveTreatment. 
            // If a doc has only 'date', 'timestamp' will be undefined.

            const rawTreatments = rawDocs;

            // Fetch all points to handle both legacy IDs and new Codes in stungPoints
            const pointsSnapshot = await getDocs(collection(db, 'cfg_acupuncture_points'));
            const pointsMap = new Map<string, StingPoint>();
            pointsSnapshot.docs.forEach(doc => {
                const data = doc.data() as StingPoint;
                const point = { ...data, id: doc.id };
                pointsMap.set(doc.id, point);
                pointsMap.set(data.code, point);
            });

            // Fetch measures labels
            const measuresSnapshot = await getDocs(collection(db, 'cfg_measures'));
            const measuresMap = new Map<string, string | Record<string, string>>();
            measuresSnapshot.docs.forEach(doc => {
                measuresMap.set(doc.id, doc.data().name);
            });

            setTreatments([]); // Clear old state
            const hydratedTreatments = await Promise.all(rawTreatments.map(async (treatment): Promise<HydratedTreatment> => {
                // Determine if it's new structure (rounds) or legacy (single protocol)
                const rounds = treatment.rounds || [];
                const hasRounds = rounds.length > 0;

                const hydratedRounds: HydratedRound[] = rounds.map(round => ({
                    ...round,
                    stungPoints: (round.stungPointCodes || [])
                        .map((code: string) => pointsMap.get(code))
                        .filter((p: StingPoint | undefined): p is StingPoint => p !== undefined)
                }));

                // Handle legacy hydration if needed
                const legacyPoints = !hasRounds && Array.isArray(treatment.stungPoints)
                    ? treatment.stungPoints.map(id => pointsMap.get(id)).filter((p): p is StingPoint => p !== undefined)
                    : undefined;

                // Fetch measured values (KPIs)
                let measuredValues: Array<{ label: string; value: string | number }> = [];
                if (treatment.measureReadingId) {
                    try {
                        const readingDoc = await getDoc(doc(db, 'measured_values', treatment.measureReadingId));
                        if (readingDoc.exists()) {
                            const data = readingDoc.data();
                            measuredValues = (data.readings || []).map((r: any) => ({
                                label: getMLValue(measuresMap.get(r.measureId), language),
                                value: r.value
                            }));
                        }
                    } catch (err) {
                        console.error("Error fetching measure reading:", err);
                    }
                }

                return {
                    ...treatment,
                    rounds: hydratedRounds,
                    stungPoints: legacyPoints,
                    measuredValues: measuredValues.length > 0 ? measuredValues : undefined
                };
            }));

            setTreatments(hydratedTreatments);

            // Fetch caretaker names
            const uniqueCaretakerIds = Array.from(new Set(rawTreatments.map(t => t.caretakerId)));
            const newNamesMap = new Map(caretakerNames);
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

            if (mapChanged) {
                setCaretakerNames(newNamesMap);
            }
        } catch (err) {
            console.error("Error fetching treatment history:", err);
            setError("Failed to load treatment history");
        } finally {
            setIsLoading(false);
        }
    }, [patient.id]);

    useEffect(() => {
        fetchTreatments();
    }, [fetchTreatments]);

    const formatDate = (treatment: StoredTreatmentDoc | HydratedTreatment) => {
        // Prefer explicit createdTimestamp which is a Firestore Timestamp
        const dateVal = (treatment as any).createdTimestamp || treatment.timestamp || treatment.date;
        if (!dateVal) return tNotAvailable;

        try {
            let date: Date;
            if (dateVal.seconds) {
                // Firestore Timestamp
                date = new Date(dateVal.seconds * 1000);
            } else if (typeof dateVal === 'number') {
                // Epoch ms
                date = new Date(dateVal);
            } else if (typeof dateVal === 'string') {
                // ISO String or other
                date = new Date(dateVal);
            } else {
                return tNotAvailable;
            }

            return date.toLocaleString(language, {
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
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

            {treatments.length === 0 ? (
                <div className={styles.emptyState}>
                    <p><T>No treatments recorded</T></p>
                </div>
            ) : (
                <div className={styles.treatmentsList}>
                    {treatments.map((treatment) => (
                        <div key={treatment.id} className={styles.treatmentCard}>
                            <div className={styles.cardHeader} dir={direction}>
                                <div className={styles.metaInfo}>
                                    <h2 className={styles.protocolName}>
                                        {treatment.rounds?.length > 0
                                            ? (treatment.rounds.length === 1
                                                ? getMLValue(treatment.rounds[0].protocolName, language)
                                                : <T>Multi-protocol session</T>)
                                            : getMLValue(treatment.protocolName, language)}
                                        {treatment.isSensitivityTest && <span className={styles.sensitivityBadge}> (<T>Sensitivity Test</T>)</span>}
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

                                        {(treatment.measuredValues && treatment.measuredValues.length > 0) && (
                                            <div className={styles.detailItem}>
                                                <h4 className={styles.detailLabel}>
                                                    <Activity size={16} />
                                                    <T>Initial Measures (KPIs)</T>
                                                </h4>
                                                <div className={styles.measuredValuesGrid}>
                                                    {treatment.measuredValues.map((mv, idx) => (
                                                        <div key={idx} className={styles.kpiItem}>
                                                            <span className={styles.kpiLabel}>{mv.label}:</span>
                                                            <span className={styles.kpiValue}>
                                                                {renderSafe(mv.value)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className={styles.detailItem}>
                                            <VitalSignsDisplay
                                                title="Pre-session Vitals"
                                                vitals={treatment.preSessionVitals || treatment.preStingVitals || treatment.vitals}
                                                icon={<Activity size={14} />}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Phase 2: Protocol Rounds */}
                                {treatment.rounds && treatment.rounds.length > 0 ? (
                                    <div className={styles.phase}>
                                        <h3 className={styles.phaseTitle}><T>2. Protocol Rounds</T></h3>
                                        {treatment.rounds.map((round, rIndex) => (
                                            <div key={rIndex} className={styles.roundBox}>
                                                <div className={styles.roundHeader}>
                                                    <T>Round</T> {rIndex + 1}: {getMLValue(round.protocolName, language)}
                                                </div>
                                                <div className={styles.roundContent}>
                                                    <div className={styles.pointsContainer}>
                                                        <h4 className={styles.innerLabel}>
                                                            <Syringe size={14} />
                                                            <T>Stung Points</T>
                                                        </h4>
                                                        <ul className={styles.pointsList}>
                                                            {round.stungPoints.length > 0 ? (
                                                                round.stungPoints.map((point) => (
                                                                    <li key={point.id} className={styles.pointItem} dir={direction}>
                                                                        <div className={styles.pointDetails}>
                                                                            <MapPin size={14} className={styles.pointIcon} />
                                                                            <span className="text-sm">
                                                                                <span className={styles.pointCode}>{point.code}</span> - <span className={styles.pointLabel}>{getMLValue(point.label, language)}</span>
                                                                            </span>
                                                                        </div>
                                                                    </li>
                                                                ))
                                                            ) : (
                                                                <li><T>No points for treatment</T></li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                    {round.postRoundVitals && (
                                                        <div className={styles.roundVitals}>
                                                            <VitalSignsDisplay
                                                                title="Post-round Vitals"
                                                                vitals={round.postRoundVitals}
                                                                icon={<Activity size={14} />}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* Legacy Stung Points View */
                                    treatment.stungPoints && treatment.stungPoints.length > 0 && (
                                        <div className={styles.phase}>
                                            <h3 className={styles.phaseTitle}><T>2. Protocol Rounds (Legacy)</T></h3>
                                            <div className={styles.pointsContainer}>
                                                <ul className={styles.pointsList}>
                                                    {treatment.stungPoints.map((point) => (
                                                        <li key={point.id} className={styles.pointItem} dir={direction}>
                                                            <div className={styles.pointDetails}>
                                                                <MapPin size={14} className={styles.pointIcon} />
                                                                <span className="text-sm">
                                                                    <span className={styles.pointCode}>{point.code}</span> - <span className={styles.pointLabel}>{getMLValue(point.label, language)}</span>
                                                                </span>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )
                                )}

                                {/* Phase 3: Finish Session */}
                                <div className={styles.phase}>
                                    <h3 className={styles.phaseTitle}><T>3. Finish Session</T></h3>
                                    <div className={styles.detailsGrid}>
                                        <div className={styles.detailItem}>
                                            <VitalSignsDisplay
                                                title="Post-session Vitals"
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
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
