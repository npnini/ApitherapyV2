import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { T, useT, useTranslationContext } from '../T';
import { Problem } from '../../types/problem';
import { Protocol } from '../../types/protocol';
import { Measure } from '../../types/measure';
import { PatientData, MeasuredValueReading } from '../../types/patient';
import ShuttleSelector, { ShuttleItem } from '../shared/ShuttleSelector';
import styles from './ProblemsProtocolsTab.module.css';

export interface ProblemsProtocolsTabHandle {
    getReadings: () => Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number }>;
}

interface ProblemsProtocolsTabProps {
    patientData: PatientData;
    onDataChange: (data: Partial<PatientData>, isInternal?: boolean) => void;
}

const ProblemsProtocolsTab = forwardRef<ProblemsProtocolsTabHandle, ProblemsProtocolsTabProps>(({ patientData, onDataChange }, ref) => {
    const { language: currentLang } = useTranslationContext();
    const tAvailableProblems = useT("Available Problems");
    const tSelectedProblems = useT("Selected Problems");
    const tAvailableProtocols = useT("Available Protocols");
    const tSelectedProtocols = useT("Selected Protocols");
    const tAvailableMeasures = useT("Available Measures");
    const tSelectedMeasures = useT("Selected Measures");

    // Data fetching
    const [problemsSnap, problemsLoading] = useCollection(query(collection(db, 'problems')));
    const [protocolsSnap, protocolsLoading] = useCollection(query(collection(db, 'protocols')));
    const [measuresSnap, measuresLoading] = useCollection(query(collection(db, 'measures')));

    // Fetch latest readings for this patient
    const [readingsSnap, readingsLoading] = useCollection(
        patientData.id
            ? query(
                collection(db, 'patients', patientData.id, 'medical_records', 'patient_level_data', 'measured_values'),
                orderBy('timestamp', 'desc'),
                limit(1)
            )
            : null
    );

    const problems = useMemo(() => problemsSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Problem)) || [], [problemsSnap]);
    const protocols = useMemo(() => protocolsSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Protocol)) || [], [protocolsSnap]);
    const measures = useMemo(() => measuresSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Measure)) || [], [measuresSnap]);

    // UI Item Mappings
    const problemItems = useMemo(() => {
        return problems.map(p => {
            const nameStr = typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string);
            return { id: p.id, name: nameStr };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [problems, currentLang]);

    const protocolItems = useMemo(() => {
        return protocols.map(p => {
            const nameStr = typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string);
            return { id: p.id, name: nameStr };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [protocols, currentLang]);

    const measureItems = useMemo(() => {
        return measures.map(m => {
            const nameStr = typeof m.name === 'object' ? (m.name[currentLang] || m.name['en'] || Object.values(m.name)[0] || '') : (m.name as string);
            return { id: m.id, name: nameStr };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [measures, currentLang]);

    // Selection state
    const [selectedProblems, setSelectedProblems] = useState<ShuttleItem[]>([]);
    const [selectedProtocols, setSelectedProtocols] = useState<ShuttleItem[]>([]);
    const [selectedMeasures, setSelectedMeasures] = useState<ShuttleItem[]>([]);
    const [readings, setReadings] = useState<Record<string, string | number>>({});
    const [isInitialized, setIsInitialized] = useState(false);

    // Filtered lists (Funneling)
    const availableProtocolItems = useMemo(() => {
        if (selectedProblems.length === 0) return [];
        const allowedIds = new Set<string>();
        const selectedIds = new Set(selectedProblems.map(p => p.id));
        problems.filter(p => selectedIds.has(p.id)).forEach(p => {
            p.protocolIds?.forEach(id => allowedIds.add(id));
        });
        return protocolItems.filter(p => allowedIds.has(p.id));
    }, [selectedProblems, problems, protocolItems]);

    const availableMeasureItems = useMemo(() => {
        if (selectedProblems.length === 0) return [];
        const allowedIds = new Set<string>();
        const selectedIds = new Set(selectedProblems.map(p => p.id));
        problems.filter(p => selectedIds.has(p.id)).forEach(p => {
            p.measureIds?.forEach(id => allowedIds.add(id));
        });
        return measureItems.filter(m => allowedIds.has(m.id));
    }, [selectedProblems, problems, measureItems]);

    // Initialize from database
    useEffect(() => {
        if (!isInitialized && !problemsLoading && !protocolsLoading && !measuresLoading && !readingsLoading && problemItems.length > 0) {
            const plan = patientData.medicalRecord?.patient_level_data?.treatment_plan;
            if (plan) {
                if (plan.problemIds) {
                    setSelectedProblems(problemItems.filter(item => plan.problemIds?.includes(item.id)));
                }
                if (plan.protocolIds) {
                    setSelectedProtocols(protocolItems.filter(item => plan.protocolIds?.includes(item.id)));
                }
                if (plan.measureIds) {
                    setSelectedMeasures(measureItems.filter(item => plan.measureIds?.includes(item.id)));
                }
            }
            if (readingsSnap && !readingsSnap.empty) {
                const latestReadingsDoc = readingsSnap.docs[0].data() as MeasuredValueReading;
                const initialReadings: Record<string, string | number> = {};
                latestReadingsDoc.readings?.forEach(r => {
                    initialReadings[r.measureId] = r.value;
                });
                setReadings(initialReadings);
            }
            setIsInitialized(true);
        }
    }, [problemsLoading, protocolsLoading, measuresLoading, readingsLoading, problemItems, protocolItems, measureItems, readingsSnap, patientData, isInitialized]);

    useImperativeHandle(ref, () => ({
        getReadings: () => {
            return Object.entries(readings).map(([measureId, value]) => {
                const measure = measures.find(m => m.id === measureId);
                return {
                    measureId,
                    type: measure?.type || 'Scale',
                    value
                };
            }).filter(r => r.value !== undefined && r.value !== null && r.value !== '');
        }
    }));

    // Sync selections to parent
    useEffect(() => {
        if (!isInitialized) return;

        const currentPlan = patientData.medicalRecord?.patient_level_data?.treatment_plan;
        const newProblemIds = selectedProblems.map(p => p.id);
        const newProtocolIds = selectedProtocols.map(p => p.id);
        const newMeasureIds = selectedMeasures.map(p => p.id);

        const hasChanged =
            JSON.stringify(currentPlan?.problemIds || []) !== JSON.stringify(newProblemIds) ||
            JSON.stringify(currentPlan?.protocolIds || []) !== JSON.stringify(newProtocolIds) ||
            JSON.stringify(currentPlan?.measureIds || []) !== JSON.stringify(newMeasureIds);

        if (hasChanged) {
            onDataChange({
                ...patientData,
                medicalRecord: {
                    ...patientData.medicalRecord,
                    patient_level_data: {
                        ...patientData.medicalRecord?.patient_level_data,
                        treatment_plan: {
                            problemIds: newProblemIds,
                            protocolIds: newProtocolIds,
                            measureIds: newMeasureIds
                        }
                    }
                }
            }, false);
        }
    }, [selectedProblems, selectedProtocols, selectedMeasures, isInitialized]);

    const handleReadingChange = (measureId: string, value: string | number) => {
        setReadings(prev => ({ ...prev, [measureId]: value }));
        // Deeply ensure we're sending a fresh object and marking as dirty
        onDataChange({ ...patientData }, false);
    };


    return (
        <div className={styles.tabContainer}>
            <fieldset className={styles.section}>
                <legend><T>Problems Selection</T></legend>
                <ShuttleSelector
                    availableItems={problemItems}
                    selectedItems={selectedProblems}
                    onSelectionChange={setSelectedProblems}
                    availableTitle={tAvailableProblems}
                    selectedTitle={tSelectedProblems}
                />
            </fieldset>

            <fieldset className={styles.section}>
                <legend><T>Protocols Selection</T></legend>
                <ShuttleSelector
                    availableItems={availableProtocolItems}
                    selectedItems={selectedProtocols}
                    onSelectionChange={setSelectedProtocols}
                    availableTitle={tAvailableProtocols}
                    selectedTitle={tSelectedProtocols}
                />
            </fieldset>

            <fieldset className={styles.section}>
                <legend><T>Measures Selection</T></legend>
                <ShuttleSelector
                    availableItems={availableMeasureItems}
                    selectedItems={selectedMeasures}
                    onSelectionChange={setSelectedMeasures}
                    availableTitle={tAvailableMeasures}
                    selectedTitle={tSelectedMeasures}
                />
            </fieldset>

            {selectedMeasures.length > 0 && (
                <fieldset className={styles.section}>
                    <legend><T>Measures values</T></legend>
                    <div className={styles.measuresTableContainer}>
                        <table className={styles.measuresTable}>
                            <thead>
                                <tr>
                                    <th><T>Measure Name</T></th>
                                    <th><T>Description</T></th>
                                    <th>
                                        {readingsSnap && !readingsSnap.empty && (
                                            <div className={styles.lastEnteredLabel}>
                                                <T>Last entered:</T> {(() => {
                                                    const ts = readingsSnap.docs[0].data().timestamp;
                                                    if (!ts) return '';
                                                    const date = ts.toDate ? ts.toDate() : new Date(ts);
                                                    const d = String(date.getDate()).padStart(2, '0');
                                                    const m = String(date.getMonth() + 1).padStart(2, '0');
                                                    const y = date.getFullYear();
                                                    const hr = String(date.getHours()).padStart(2, '0');
                                                    const min = String(date.getMinutes()).padStart(2, '0');
                                                    return `${d}/${m}/${y}  ${hr}:${min}`;
                                                })()}
                                            </div>
                                        )}
                                        <T>Value</T>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {measures.filter(m => selectedMeasures.some(sm => sm.id === m.id)).map(measure => (
                                    <tr key={measure.id}>
                                        <td>
                                            <div className={styles.measureName}>{measure.name[currentLang] || measure.name['en']}</div>
                                        </td>
                                        <td>
                                            <div className={styles.measureDesc}>{measure.description[currentLang] || measure.description['en']}</div>
                                        </td>
                                        <td>
                                            {measure.type === 'Category' ? (
                                                <select
                                                    className={styles.inputControl}
                                                    value={readings[measure.id] || ''}
                                                    onChange={e => handleReadingChange(measure.id, e.target.value)}
                                                >
                                                    <option value=""><T>Select...</T></option>
                                                    {measure.categories?.map((cat, idx) => (
                                                        <option key={idx} value={cat['en']}>
                                                            {cat[currentLang] || cat['en']}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div>
                                                    <input
                                                        type="number"
                                                        className={styles.inputControl}
                                                        min={measure.scale?.min}
                                                        max={measure.scale?.max}
                                                        value={readings[measure.id] || ''}
                                                        onChange={e => handleReadingChange(measure.id, parseFloat(e.target.value))}
                                                    />
                                                    <div className={styles.scaleHint}>
                                                        Range: {measure.scale?.min} - {measure.scale?.max}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </fieldset>
            )}
        </div>
    );
});

export default ProblemsProtocolsTab;
