import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { VitalSigns } from '../types/treatmentSession';
import { ChevronLeft, Calendar, User, Syringe, FileText, Activity, MapPin, Loader, AlertTriangle, ChevronRight } from 'lucide-react';
import { T, useT, useTranslationContext } from './T';
import styles from './TreatmentHistory.module.css';

// Explicit type for documents stored in Firestore
interface StoredTreatmentDoc {
    id: string;
    patientId: string;
    protocolId: string;
    protocolName: string;
    caretakerId: string;
    date: string;
    patientReport: string;
    preStingVitals?: Partial<VitalSigns>;
    postStingVitals?: Partial<VitalSigns>;
    finalVitals?: Partial<VitalSigns>;
    stungPoints: string[];
    finalNotes?: string;
    vitals?: string; // For backward compatibility
}

// Explicit type for the hydrated data used for rendering
interface HydratedTreatment {
    id: string;
    patientId: string;
    protocolId: string;
    protocolName: string;
    caretakerId: string;
    date: string;
    patientReport: string;
    preStingVitals?: Partial<VitalSigns>;
    postStingVitals?: Partial<VitalSigns>;
    finalVitals?: Partial<VitalSigns>;
    stungPoints: StingPoint[];
    finalNotes?: string;
    vitals?: string; // For backward compatibility
}

interface VitalSignsDisplayProps {
    title: string;
    vitals: Partial<VitalSigns> | string | undefined;
}

const VitalSignsDisplay: React.FC<VitalSignsDisplayProps> = ({ title, vitals }) => {
    if (!vitals) {
        return null;
    }

    // Handle legacy string format
    if (typeof vitals === 'string') {
        return (
            <div className={styles.vitalsBlock}>
                <h4 className={styles.detailLabel}><T>{title}</T></h4>
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
            <h4 className={styles.detailLabel}><T>{title}</T></h4>
            <div className={styles.vitalsGrid}>
                {systolic !== undefined && <div><span className={styles.vitalsLabel}><T>Systolic</T>:</span> {systolic}</div>}
                {diastolic !== undefined && <div><span className={styles.vitalsLabel}><T>Diastolic</T>:</span> {diastolic}</div>}
                {heartRate !== undefined && <div><span className={styles.vitalsLabel}><T>Heart Rate</T>:</span> {heartRate}</div>}
            </div>
        </div>
    )
}

interface TreatmentHistoryProps {
    patient: PatientData;
    onBack: () => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        return value[lang] || value.en || '';
    }
    return '';
};

const TreatmentHistory: React.FC<TreatmentHistoryProps> = ({ patient, onBack }) => {
    const { language } = useTranslationContext();
    const [treatments, setTreatments] = useState<HydratedTreatment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTreatments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const treatmentsRef = collection(db, `patients/${patient.id}/medical_records/patient_level_data/treatments`);
            const q = query(treatmentsRef, orderBy("date", "desc"));
            const querySnapshot = await getDocs(q);
            const rawTreatments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoredTreatmentDoc));

            // Fetch all points to handle both legacy IDs and new Codes in stungPoints
            const pointsSnapshot = await getDocs(collection(db, 'acupuncture_points'));
            const pointsMap = new Map<string, StingPoint>();
            pointsSnapshot.docs.forEach(doc => {
                const data = doc.data() as StingPoint;
                const point = { ...data, id: doc.id };
                pointsMap.set(doc.id, point);
                pointsMap.set(data.code, point);
            });

            const hydratedTreatments = rawTreatments.map((treatment): HydratedTreatment => {
                const hydratedPoints = (Array.isArray(treatment.stungPoints) ? treatment.stungPoints : [])
                    .map(id => pointsMap.get(id))
                    .filter((p): p is StingPoint => p !== undefined);

                return { ...treatment, stungPoints: hydratedPoints };
            });

            setTreatments(hydratedTreatments);
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

    const formatDate = (isoString: string) => {
        if (!isoString) return useT('Not available');
        try {
            return new Date(isoString).toLocaleString(language, {
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return useT('Invalid date');
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
            <div className={styles.header}>
                <button onClick={onBack} className={styles.backButton}>
                    <BackIcon size={24} />
                </button>
                <h1 className={styles.title}>
                    <T>{`Treatment History for ${patient.fullName}`}</T>
                </h1>
            </div>

            {treatments.length === 0 ? (
                <div className={styles.emptyState}>
                    <p><T>No treatments recorded</T></p>
                </div>
            ) : (
                <div className={styles.treatmentsList}>
                    {treatments.map((treatment) => (
                        <div key={treatment.id} className={styles.treatmentCard}>
                            <div className={styles.cardHeader} dir={direction}>
                                <h2 className={styles.protocolName}>{getMLValue(treatment.protocolName, language)}</h2>
                                <div className={styles.metaInfo}>
                                    <div className={styles.metaRow}>
                                        <Calendar size={16} />
                                        <span>{formatDate(treatment.date)}</span>
                                    </div>
                                    <div className={styles.metaRowSmall}>
                                        <User size={14} />
                                        <span>{treatment.caretakerId}</span>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.detailsGrid}>
                                <div className={styles.detailItem}>
                                    <h3 className={styles.detailLabel}>
                                        <FileText size={16} />
                                        <T>Patient Report</T>
                                    </h3>
                                    <p className={styles.detailContent}>{treatment.patientReport || useT('Not provided')}</p>
                                </div>
                                <div className={styles.detailItem}>
                                    <h3 className={styles.detailLabel}>
                                        <Activity size={16} />
                                        <T>Vitals</T>
                                    </h3>
                                    <VitalSignsDisplay title="Pre-stinging measures" vitals={treatment.preStingVitals || treatment.vitals} />
                                    <VitalSignsDisplay title="Post-stinging measures" vitals={treatment.postStingVitals} />
                                    <VitalSignsDisplay title="Final measures" vitals={treatment.finalVitals} />
                                </div>
                            </div>

                            <div className={styles.pointsContainer}>
                                <h3 className={styles.detailLabel}>
                                    <Syringe size={16} />
                                    <T>Stung Points</T>
                                </h3>
                                <ul className={styles.pointsList}>
                                    {treatment.stungPoints.length > 0 ? (
                                        treatment.stungPoints.map((point) => (
                                            <li key={point.id} className={styles.pointItem} dir={direction}>
                                                <div className={styles.pointDetails}>
                                                    <MapPin size={16} className={styles.pointIcon} />
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

                            <div className={styles.notesContainer}>
                                <h3 className={styles.detailLabel}>
                                    <FileText size={16} />
                                    <T>Final Notes</T>
                                </h3>
                                <p className={styles.notesContent}>{treatment.finalNotes || useT('No notes')}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
