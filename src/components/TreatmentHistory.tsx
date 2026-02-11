
import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { VitalSigns } from '../types/treatmentSession';
import { ChevronLeft, Calendar, User, Syringe, FileText, Activity, MapPin, Loader, AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();

    if (!vitals) {
        return null;
    }

    // Handle legacy string format
    if (typeof vitals === 'string') {
        return (
            <div className={styles.vitalsBlock}>
                <h4 className={styles.detailLabel}>{title}</h4>
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
            <h4 className={styles.detailLabel}>{title}</h4>
            <div className={styles.vitalsGrid}>
                {systolic !== undefined && <div><span className={styles.vitalsLabel}>{t('systolic')}:</span> {systolic}</div>}
                {diastolic !== undefined && <div><span className={styles.vitalsLabel}>{t('diastolic')}:</span> {diastolic}</div>}
                {heartRate !== undefined && <div><span className={styles.vitalsLabel}>{t('heart_rate')}:</span> {heartRate}</div>}
            </div>
        </div>
    )
}

interface TreatmentHistoryProps {
    patient: PatientData;
    onBack: () => void;
}

const TreatmentHistory: React.FC<TreatmentHistoryProps> = ({ patient, onBack }) => {
    const { t, i18n } = useTranslation();
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

            const allPointIds = rawTreatments.reduce((acc, treatment) => {
                if (Array.isArray(treatment.stungPoints)) {
                    treatment.stungPoints.forEach(id => acc.add(id));
                }
                return acc;
            }, new Set<string>());

            const pointsMap = new Map<string, StingPoint>();
            if (allPointIds.size > 0) {
                const pointPromises = Array.from(allPointIds).map(id => getDoc(doc(db, 'acupuncture_points', id)));
                const pointDocs = await Promise.all(pointPromises);
                pointDocs.forEach(doc => {
                    if (doc.exists()) {
                        pointsMap.set(doc.id, { id: doc.id, ...doc.data() } as StingPoint);
                    }
                });
            }

            const hydratedTreatments = rawTreatments.map((treatment): HydratedTreatment => {
                const hydratedPoints = (Array.isArray(treatment.stungPoints) ? treatment.stungPoints : [])
                    .map(id => pointsMap.get(id))
                    .filter((p): p is StingPoint => p !== undefined);

                return { ...treatment, stungPoints: hydratedPoints };
            });

            setTreatments(hydratedTreatments);
        } catch (err) {
            console.error("Error fetching treatment history:", err);
            setError(t('failed_to_load_treatment_history'));
        } finally {
            setIsLoading(false);
        }
    }, [patient.id, t]);

    useEffect(() => {
        fetchTreatments();
    }, [fetchTreatments]);

    const formatDate = (isoString: string) => {
        if (!isoString) return t('not_available');
        try {
            return new Date(isoString).toLocaleString(i18n.language, { 
                year: 'numeric', month: 'numeric', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            });
        } catch (e) {
            return t('invalid_date');
        }
    };

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader className={styles.loader} />
                <p className={styles.loaderText}>{t('loading_treatment_history')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
               <AlertTriangle className={styles.errorIcon} />
               <h3 className={styles.errorTitle}>{t('error_title')}</h3>
               <p className={styles.errorMessage}>{error}</p>
               <button onClick={onBack} className={styles.errorButton}>{t('back')}</button>
           </div>
       );
    }

    const direction = i18n.dir();
    const BackIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.header}>
                <button onClick={onBack} className={styles.backButton}>
                    <BackIcon size={24} />
                </button>
                <h1 className={styles.title}>{t('treatment_history_for', {patientName: patient.fullName})}</h1>
            </div>

            {treatments.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>{t('no_treatments_recorded')}</p>
                </div>
            ) : (
                <div className={styles.treatmentsList}>
                    {treatments.map((treatment) => (
                        <div key={treatment.id} className={styles.treatmentCard}>
                            <div className={styles.cardHeader} dir={direction}>
                                <h2 className={styles.protocolName}>{treatment.protocolName}</h2>
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
                                        {t('patient_report')}
                                    </h3>
                                    <p className={styles.detailContent}>{treatment.patientReport || t('not_provided')}</p>
                                </div>
                                <div className={styles.detailItem}>
                                    <h3 className={styles.detailLabel}>
                                        <Activity size={16} />
                                        {t('vitals')}
                                    </h3>
                                    <VitalSignsDisplay title={t('pre_stinging_measures')} vitals={treatment.preStingVitals || treatment.vitals} />
                                    <VitalSignsDisplay title={t('post_stinging_measures')} vitals={treatment.postStingVitals} />
                                    <VitalSignsDisplay title={t('final_measures')} vitals={treatment.finalVitals} />
                                </div>
                            </div>
                            
                            <div className={styles.pointsContainer}>
                                <h3 className={styles.detailLabel}>
                                    <Syringe size={16} />
                                    {t('stung_points')}
                                </h3>
                                <ul className={styles.pointsList}>
                                    {treatment.stungPoints.length > 0 ? (
                                        treatment.stungPoints.map((point) => (
                                            <li key={point.id} className={styles.pointItem} dir={direction}>
                                                <div className={styles.pointDetails}>
                                                    <MapPin size={16} className={styles.pointIcon} />
                                                    <span className="text-sm">
                                                        <span className={styles.pointCode}>{point.code}</span> - <span className={styles.pointLabel}>{point.label}</span>
                                                    </span>
                                                </div>
                                            </li>
                                        ))
                                    ) : (
                                        <li>{t('no_points_for_treatment')}</li>
                                    )}
                                </ul>
                            </div>

                            <div className={styles.notesContainer}>
                                <h3 className={styles.detailLabel}>
                                    <FileText size={16} />
                                    {t('final_notes')}
                                </h3>
                                <p className={styles.notesContent}>{treatment.finalNotes || t('no_notes')}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
