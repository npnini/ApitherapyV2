import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { T, useT, useTranslationContext } from '../T';
import { Problem } from '../../types/problem';
import { Measure } from '../../types/measure';
import { JoinedPatientData, PatientProblem } from '../../types/patient';
import styles from './ProblemsTab.module.css';

export interface ProblemsTabHandle {
    getReadings: () => Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number }>;
    isDirty: boolean;
    clearDirty: () => void;
}

interface ProblemsTabProps {
    patientData: JoinedPatientData;
    onDataChange: (data: Partial<JoinedPatientData>, isInternal?: boolean) => void;
}

const ProblemsTab = forwardRef<ProblemsTabHandle, ProblemsTabProps>(({ patientData, onDataChange }, ref) => {
    const { language: currentLang } = useTranslationContext();
    const tAvailableProblems = useT("Available Problems");

    // Data fetching
    const [problemsSnap, problemsLoading] = useCollection(query(collection(db, 'cfg_problems')));
    const [measuresSnap, measuresLoading] = useCollection(query(collection(db, 'cfg_measures')));

    const problems = useMemo(() => problemsSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Problem)) || [], [problemsSnap]);
    const measures = useMemo(() => measuresSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Measure)) || [], [measuresSnap]);

    // UI Item Mappings
    const problemItems = useMemo(() => {
        return problems.map(p => {
            const nameStr = typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string);
            return { id: p.id, name: nameStr };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [problems, currentLang]);

    const measureItems = useMemo(() => {
        return measures.map(m => {
            const nameStr = typeof m.name === 'object' ? (m.name[currentLang] || m.name['en'] || Object.values(m.name)[0] || '') : (m.name as string);
            return { id: m.id, name: nameStr };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [measures, currentLang]);

    // State
    const [selectedProblems, setSelectedProblems] = useState<PatientProblem[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isDirty, setIsDirtyLocal] = useState(false);
    const [usedProblemIds, setUsedProblemIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (patientData.id) {
            getDocs(collection(db, `patients/${patientData.id}/treatments`))
                .then(snap => {
                    const used = new Set<string>();
                    snap.docs.forEach(d => {
                        const t = d.data();
                        if (t.problemIds) t.problemIds.forEach((id: string) => used.add(id));
                        if (t.problemId) used.add(t.problemId);
                    });
                    setUsedProblemIds(used);
                })
                .catch(e => console.error("Failed to fetch treatments for problems check", e));
        }
    }, [patientData.id]);

    useEffect(() => {
        if (!isInitialized && !problemsLoading && !measuresLoading && problemItems.length > 0) {
            const pld = patientData.medicalRecord;
            if (pld?.problems) {
                setSelectedProblems(pld.problems);
            }
            setIsInitialized(true);
        }
    }, [problemsLoading, measuresLoading, problemItems, measureItems, patientData, isInitialized]);

    useImperativeHandle(ref, () => ({
        getReadings: () => [],
        isDirty: isDirty,
        clearDirty: () => setIsDirtyLocal(false)
    }));

    // Filter measures
    const availableMeasureItems = useMemo(() => {
        const allowedIds = new Set<string>();
        // Only collect measures for 'Active' problems
        selectedProblems.filter(sp => sp.problemStatus === 'Active').forEach(sp => {
            const problem = problems.find(p => p.id === sp.problemId);
            if (problem?.measureIds) {
                problem.measureIds.forEach(id => allowedIds.add(id));
            }
        });
        return measureItems.filter(m => allowedIds.has(m.id));
    }, [selectedProblems, problems, measureItems]);

    // Sync selections to parent
    useEffect(() => {
        if (!isInitialized) return;

        const pld = patientData.medicalRecord;
        const newMeasureIds = availableMeasureItems.map(m => m.id);

        const problemsChanged = JSON.stringify(pld?.problems || []) !== JSON.stringify(selectedProblems);
        const measuresChanged = JSON.stringify(pld?.measureIds || []) !== JSON.stringify(newMeasureIds);

        if (problemsChanged || measuresChanged) {
            onDataChange({
                ...patientData,
                medicalRecord: {
                    ...patientData.medicalRecord,
                    problems: selectedProblems,
                    measureIds: newMeasureIds
                }
            }, false);
            setIsDirtyLocal(true);
        }
    }, [selectedProblems, availableMeasureItems, isInitialized]);

    const handleToggleProblem = (problemId: string, isSelected: boolean) => {
        if (isSelected) {
            setSelectedProblems(prev => [...prev, { problemId, problemStatus: 'Active' }]);
        } else {
            setSelectedProblems(prev => prev.filter(p => p.problemId !== problemId));
        }
    };

    const handleToggleStatus = (problemId: string) => {
        setSelectedProblems(prev => prev.map(p => {
            if (p.problemId === problemId) {
                return { ...p, problemStatus: p.problemStatus === 'Active' ? 'Inactive' : 'Active' };
            }
            return p;
        }));
    };

    const unselectedProblems = problemItems.filter(p => !selectedProblems.find(sp => sp.problemId === p.id));
    const selectedProblemItems = problemItems.filter(p => selectedProblems.find(sp => sp.problemId === p.id));
    const tCannotRemove = useT("Cannot remove problem used in treatments");
    const tRemove = useT("Remove");

    return (
        <div className={styles.tabContainer}>
            <fieldset className={styles.section}>
                <legend><T>Selected Problems</T></legend>
                <div className={styles.problemsList}>
                    {selectedProblemItems.length === 0 && <p className={styles.emptyText}><T>No problems selected</T></p>}
                    {selectedProblemItems.map(p => {
                        const selectedProb = selectedProblems.find(sp => sp.problemId === p.id)!;
                        const isUsed = usedProblemIds.has(p.id);

                        return (
                            <div key={p.id} className={styles.problemRow}>
                                <div className={styles.problemInfo}>
                                    <span>{p.name}</span>
                                </div>
                                <div className={styles.problemActions}>
                                    <button
                                        className={`${styles.statusToggleBtn} ${selectedProb.problemStatus === 'Active' ? styles.statusActive : styles.statusInactive}`}
                                        onClick={() => handleToggleStatus(p.id)}
                                    >
                                        <T>{selectedProb.problemStatus}</T>
                                    </button>
                                    <button
                                        className={styles.removeBtn}
                                        onClick={() => handleToggleProblem(p.id, false)}
                                        disabled={isUsed}
                                        title={isUsed ? tCannotRemove : tRemove}
                                    >
                                        <T>Remove</T>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </fieldset>

            {unselectedProblems.length > 0 && (
                <fieldset className={styles.section}>
                    <legend><T>Available Problems</T></legend>
                    <div className={styles.availableList}>
                        {unselectedProblems.map(p => (
                            <div key={p.id} className={styles.availableRow}>
                                <span>{p.name}</span>
                                <button
                                    className={styles.addBtn}
                                    onClick={() => handleToggleProblem(p.id, true)}
                                >
                                    <T>Add</T>
                                </button>
                            </div>
                        ))}
                    </div>
                </fieldset>
            )}

            {availableMeasureItems.length > 0 && (
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

export default ProblemsTab;
