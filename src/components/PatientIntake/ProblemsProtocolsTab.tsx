import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { T, useT, useTranslationContext } from '../T';
import { Problem } from '../../types/problem';
import { Protocol } from '../../types/protocol';
import { Measure } from '../../types/measure';
import { JoinedPatientData, MeasuredValueReading } from '../../types/patient';
import ShuttleSelector, { ShuttleItem } from '../shared/ShuttleSelector';
import styles from './ProblemsProtocolsTab.module.css';

export interface ProblemsProtocolsTabHandle {
    getReadings: () => Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number }>;
    isDirty: boolean;
    clearDirty: () => void;
}

interface ProblemsProtocolsTabProps {
    patientData: JoinedPatientData;
    onDataChange: (data: Partial<JoinedPatientData>, isInternal?: boolean) => void;
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
    const [problemsSnap, problemsLoading] = useCollection(query(collection(db, 'cfg_problems')));
    const [protocolsSnap, protocolsLoading] = useCollection(query(collection(db, 'cfg_protocols')));
    const [measuresSnap, measuresLoading] = useCollection(query(collection(db, 'cfg_measures')));

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
    const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Filtered lists (Funneling) based on single selected problem
    const availableProtocolItems = useMemo(() => {
        if (!selectedProblemId) return [];
        const problem = problems.find(p => p.id === selectedProblemId);
        if (!problem || !problem.protocolId) return [];
        return protocolItems.filter(p => p.id === problem.protocolId);
    }, [selectedProblemId, problems, protocolItems]);

    const availableMeasureItems = useMemo(() => {
        if (!selectedProblemId) return [];
        const problem = problems.find(p => p.id === selectedProblemId);
        if (!problem || !problem.measureIds) return [];
        const allowedIds = new Set(problem.measureIds);
        return measureItems.filter(m => allowedIds.has(m.id));
    }, [selectedProblemId, problems, measureItems]);

    useEffect(() => {
        if (!isInitialized && !problemsLoading && !protocolsLoading && !measuresLoading && problemItems.length > 0) {
            const pld = patientData.medicalRecord;
            if (pld?.problemId) {
                setSelectedProblemId(pld.problemId);
            }
            setIsInitialized(true);
        }
    }, [problemsLoading, protocolsLoading, measuresLoading, problemItems, protocolItems, measureItems, patientData, isInitialized]);

    useImperativeHandle(ref, () => ({
        getReadings: () => [],
        isDirty: false,
        clearDirty: () => { }
    }));

    // Sync selections to parent
    useEffect(() => {
        if (!isInitialized) return;

        const pld = patientData.medicalRecord;
        const newProblemId = selectedProblemId || undefined;
        const newProtocolId = availableProtocolItems.length > 0 ? availableProtocolItems[0].id : undefined;
        const newMeasureIds = availableMeasureItems.map(m => m.id);

        const hasChanged =
            pld?.problemId !== newProblemId ||
            pld?.protocolId !== newProtocolId ||
            JSON.stringify(pld?.measureIds || []) !== JSON.stringify(newMeasureIds);

        if (hasChanged) {
            onDataChange({
                ...patientData,
                medicalRecord: {
                    ...patientData.medicalRecord,
                    problemId: newProblemId,
                    protocolId: newProtocolId,
                    measureIds: newMeasureIds
                }
            }, false);
        }
    }, [selectedProblemId, availableProtocolItems, availableMeasureItems, isInitialized]);




    return (
        <div className={styles.tabContainer}>
            <fieldset className={styles.section}>
                <legend><T>Problem Selection</T></legend>
                <div className={styles.formGroup}>
                    <label className={styles.label}><T>Select a Problem</T></label>
                    <select
                        className={styles.inputControl}
                        value={selectedProblemId || ''}
                        onChange={(e) => setSelectedProblemId(e.target.value)}
                    >
                        <option value="">{tAvailableProblems}</option>  {/* Reusing existing translation optionally, or adding a new "Select a problem..." */}
                        {problemItems.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </fieldset>

            {selectedProblemId && availableProtocolItems.length > 0 && (
                <fieldset className={styles.section}>
                    <legend><T>Protocol</T></legend>
                    <div className={styles.infoBox}>
                        <strong>{availableProtocolItems[0].name}</strong>
                    </div>
                </fieldset>
            )}

            {selectedProblemId && availableMeasureItems.length > 0 && (
                <fieldset className={styles.section}>
                    <legend><T>Measures</T></legend>
                    <ul className={styles.measureList}>
                        {availableMeasureItems.map(m => (
                            <li key={m.id}>{m.name}</li>
                        ))}
                    </ul>
                </fieldset>
            )}


        </div>
    );
});

export default ProblemsProtocolsTab;
