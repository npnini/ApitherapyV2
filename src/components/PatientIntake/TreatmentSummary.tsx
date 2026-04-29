import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { TreatmentSession } from '../../types/treatmentSession';
import { StingPoint } from '../../types/apipuncture';
import { Protocol } from '../../types/protocol';
import { Measure } from '../../types/measure';
import { T, useT } from '../T';
import { Loader, Calendar, FileText, Activity, Syringe, Info } from 'lucide-react';
import styles from './TreatmentSummary.module.css';

interface TreatmentSummaryProps {
    treatment: TreatmentSession;
    language: string;
    direction: 'ltr' | 'rtl';
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const TreatmentSummary: React.FC<TreatmentSummaryProps> = ({ treatment, language, direction }) => {
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const tNoProtocols = useT('No protocols used.');
    const tNoPoints = useT('No points stung.');
    const tProtocols = useT('Protocols');
    const tStungPoints = useT('Stung Points');
    const tMeasures = useT('Measures');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Basic Config & Data
            const [configSnap, measuresSnap, problemsSnap, protocolsSnap, pointsSnap] = await Promise.all([
                getDoc(doc(db, 'cfg_app_config', 'main')),
                getDocs(collection(db, 'cfg_measures')),
                getDocs(collection(db, 'cfg_problems')),
                getDocs(collection(db, 'cfg_protocols')),
                getDocs(collection(db, 'cfg_acupuncture_points')),
            ]);

            const appConfig = configSnap.exists() ? configSnap.data() : null;

            // 2. Collect all relevant protocol IDs
            const protocolIds = new Set<string>(treatment.protocolIds || []);
            if (treatment.isSensitivityTest && appConfig?.treatmentSettings?.sensitivityProtocolIdentifier) {
                protocolIds.add(appConfig.treatmentSettings.sensitivityProtocolIdentifier);
            }

            // 3. Hydrate Protocols
            const allProtocols = protocolsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Protocol));
            setProtocols(allProtocols.filter(p => protocolIds.has(p.id)));

            // 4. Hydrate Points
            const allPoints = pointsSnap.docs.map(d => ({ ...d.data(), id: d.id } as StingPoint));
            setPoints(allPoints.filter(p => (treatment.stungPointIds || []).includes(p.id)));

            // 5. Hydrate Measures based on treatment problems
            const allMeasures = measuresSnap.docs.map(d => ({ ...d.data(), id: d.id } as Measure));
            const treatmentProblemIds = treatment.problemIds || [];
            const relevantMeasureIds = new Set<string>();
            problemsSnap.docs.forEach(d => {
                if (treatmentProblemIds.includes(d.id)) {
                    (d.data().measureIds || []).forEach((mid: string) => relevantMeasureIds.add(mid));
                }
            });
            setMeasures(allMeasures.filter(m => relevantMeasureIds.has(m.id)));

        } catch (err) {
            console.error('TreatmentSummary: failed to load data', err);
        } finally {
            setIsLoading(false);
        }
    }, [treatment]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
            <div className={styles.loading}>
                <Loader size={24} className={styles.spinner} />
                <p><T>Loading summary...</T></p>
            </div>
        );
    }

    return (
        <div className={styles.summaryContainer} dir={direction}>
            <div className={styles.infoBlock}>
                <span className={styles.infoLabel}><Calendar size={14} /> <T>Date & Time</T></span>
                <span className={styles.infoContent}>{formatDate(treatment.createdTimestamp)}</span>
            </div>

            <div className={styles.infoBlock}>
                <span className={styles.infoLabel}><FileText size={14} /> <T>Patient Report</T></span>
                <p className={styles.infoContent}>{treatment.patientReport || <T>No report.</T>}</p>
            </div>

            <div className={styles.infoBlock}>
                <span className={styles.infoLabel}><Syringe size={14} /> {tProtocols}</span>
                <div className={styles.protocolsList}>
                    {protocols.length === 0 ? (
                        <p className={styles.emptyText}>{tNoProtocols}</p>
                    ) : protocols.map(p => (
                        <div key={p.id} className={styles.protocolItem}>
                            <Activity size={14} />
                            <span>{getMLValue(p.name, language)}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.infoBlock}>
                <span className={styles.infoLabel}><Info size={14} /> {tStungPoints}</span>
                <div className={styles.pointsList}>
                    {points.length === 0 ? (
                        <p className={styles.emptyText}>{tNoPoints}</p>
                    ) : points.map(p => (
                        <span key={p.id} className={styles.pointBadge}>
                            <span className={styles.pointCode}>{p.code}</span> {getMLValue(p.label, language)}
                        </span>
                    ))}
                </div>
            </div>

            <div className={styles.infoBlock}>
                <span className={styles.infoLabel}><Activity size={14} /> {tMeasures}</span>
                <div className={styles.measureNamesList}>
                    {measures.length === 0 ? (
                        <p className={styles.emptyText}><T>No measures recorded.</T></p>
                    ) : (
                        measures.map(m => (
                            <span key={m.id} className={styles.measureNameTag}>
                                {getMLValue(m.name, language)}
                            </span>
                        ))
                    )}
                </div>
            </div>

            <div className={styles.infoBlock}>
                <span className={styles.infoLabel}><FileText size={14} /> <T>Final Notes</T></span>
                <p className={styles.infoContent}>{treatment.finalNotes || <T>No notes.</T>}</p>
            </div>
        </div>
    );
};

export default TreatmentSummary;
