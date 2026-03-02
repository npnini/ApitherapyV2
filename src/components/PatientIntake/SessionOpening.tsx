import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
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
    preSessionVitals: Partial<VitalSigns>;
    measureReadingId?: string; // Captures the ID after saving to Firestore
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
    const [preSessionVitals, setPreSessionVitals] = useState<Partial<VitalSigns>>({});

    const tPatientReport = useT('Patient Report');
    const tPatientReportPlaceholder = useT('Enter patient feedback or symptoms...');
    const tTrackingMeasures = useT('Tracking Measures');
    const tPreSessionVitals = useT('Pre-Session Blood Pressure & Heart Rate');
    const tNextSelectProtocol = useT('Next: Select Protocol');
    const tLoading = useT('Loading...');
    const tBack = useT('Back');

    // Fetch measures: use patient's measureIds if present, else all cfg_measures
    const fetchMeasures = useCallback(async () => {
        setIsLoading(true);
        try {
            const snapshot = await getDocs(collection(db, 'cfg_measures'));
            const allMeasures: Measure[] = snapshot.docs.map(doc => ({
                ...(doc.data() as Omit<Measure, 'id'>),
                id: doc.id,
            }));

            const measureIds = patient.medicalRecord?.patient_level_data?.treatment_plan?.measureIds;
            if (measureIds && measureIds.length > 0) {
                setMeasures(allMeasures.filter(m => measureIds.includes(m.id)));
            } else {
                setMeasures(allMeasures);
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
        preSessionVitals.systolic !== undefined &&
        preSessionVitals.diastolic !== undefined &&
        preSessionVitals.heartRate !== undefined;

    const isFormValid = patientReport.trim() !== '' && isVitalsComplete;

    const handleSubmit = () => {
        if (!isFormValid) return;
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
            preSessionVitals,
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

                {/* 2. Tracking Measures */}
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

                {/* 3. Pre-Session Vitals */}
                <section className={styles.section}>
                    <VitalsInputGroup
                        title={tPreSessionVitals}
                        vitals={preSessionVitals}
                        onVitalsChange={setPreSessionVitals}
                    />
                </section>

                {/* Actions */}
                <div className={styles.actions}>
                    <button type="button" onClick={onBack} className={styles.btnSecondary}>
                        {tBack}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isFormValid}
                        className={styles.btnPrimary}
                    >
                        {tNextSelectProtocol} <NextIcon direction={direction} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionOpening;
