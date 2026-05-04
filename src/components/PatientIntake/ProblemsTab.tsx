import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../../firebase';
import { T, useT, useTranslationContext } from '../T';
import { Problem } from '../../types/problem';
import { Protocol } from '../../types/protocol';
import { JoinedPatientData, PatientProblem, StatusHistoryItem } from '../../types/patient';
import { Measure } from '../../types/measure';
import { AppUser } from '../../types/user';
import styles from './ProblemsTab.module.css';

export interface ProblemsTabHandle {
    getReadings: () => Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number }>;
    isDirty: boolean;
    clearDirty: () => void;
}

interface ProblemsTabProps {
    patientData: JoinedPatientData;
    onDataChange: (data: Partial<JoinedPatientData>, isInternal?: boolean) => void;
    user: AppUser;
}

const ProblemsTab = forwardRef<ProblemsTabHandle, ProblemsTabProps>(({ patientData, onDataChange, user }, ref) => {
    const { language: currentLang } = useTranslationContext();

    // Data fetching
    const [problemsSnap, problemsLoading] = useCollection(query(collection(db, 'cfg_problems')));
    const [protocolsSnap, protocolsLoading] = useCollection(query(collection(db, 'cfg_protocols')));

    const problems = useMemo(() => problemsSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Problem)) || [], [problemsSnap]);
    const protocols = useMemo(() => protocolsSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Protocol)) || [], [protocolsSnap]);

    const [measuresSnap, measuresLoading] = useCollection(query(collection(db, 'cfg_measures')));
    const measures = useMemo(() => measuresSnap?.docs.map(doc => ({ id: doc.id, ...doc.data() } as Measure)) || [], [measuresSnap]);

    // UI Item Mappings
    const problemItems = useMemo(() => {
        return problems.map(p => {
            const nameStr = typeof p.name === 'object' ? (p.name[currentLang] || p.name['en'] || Object.values(p.name)[0] || '') : (p.name as string);
            
            const linkedProtocolIds = Array.from(new Set([
                ...(p.protocolId ? [p.protocolId] : []),
                ...(Array.isArray(p.protocolIds) ? p.protocolIds : [])
            ]));
            
            const linkedProtocols = linkedProtocolIds
                .map(pid => protocols.find(proto => proto.id === pid))
                .filter((proto): proto is Protocol => !!proto);

            const protocolNamesArr = linkedProtocols
                .map(protocol => (typeof protocol.name === 'object' ? (protocol.name[currentLang] || protocol.name['en'] || Object.values(protocol.name)[0] || '') : protocol.name))
                .filter(Boolean);
            const protocolNames = Array.from(new Set(protocolNamesArr)).join(', ');

            const measureIds = Array.from(new Set(linkedProtocols.flatMap(proto => proto.measureIds || [])));
            const measureNames = measureIds
                .map(mid => {
                    const measure = measures.find(m => m.id === mid);
                    return measure ? (typeof measure.name === 'object' ? (measure.name[currentLang] || measure.name['en'] || Object.values(measure.name)[0] || '') : measure.name) : '';
                })
                .filter(Boolean)
                .join(', ');

            return { id: p.id, name: nameStr, protocolName: protocolNames, measureNames };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [problems, protocols, measures, currentLang]);

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
        if (!isInitialized && !problemsLoading && !protocolsLoading && !measuresLoading && problemItems.length > 0) {
            const pld = patientData.medicalRecord;
            if (pld?.problems) {
                setSelectedProblems(pld.problems);
            }
            setIsInitialized(true);
        }
    }, [problemsLoading, protocolsLoading, problemItems, patientData, isInitialized]);

    useImperativeHandle(ref, () => ({
        getReadings: () => [],
        isDirty: isDirty,
        clearDirty: () => setIsDirtyLocal(false)
    }));

    // Sync selections to parent
    useEffect(() => {
        if (!isInitialized) return;

        const pld = patientData.medicalRecord;
        const problemsChanged = JSON.stringify(pld?.problems || []) !== JSON.stringify(selectedProblems);

        if (problemsChanged) {
            onDataChange({
                ...patientData,
                medicalRecord: {
                    ...patientData.medicalRecord,
                    problems: selectedProblems
                }
            }, false);
            setIsDirtyLocal(true);
        }
    }, [selectedProblems, isInitialized]);

    const handleToggleProblem = (problemId: string, isSelected: boolean) => {
        if (isSelected) {
            const newHistory: StatusHistoryItem = {
                status: 'Active',
                timestamp: new Date().toISOString(),
                userId: user.uid
            };
            setSelectedProblems(prev => [...prev, { problemId, problemStatus: 'Active', problemStatusHistory: [newHistory] }]);
        } else {
            setSelectedProblems(prev => prev.filter(p => p.problemId !== problemId));
        }
    };

    const handleToggleStatus = (problemId: string) => {
        setSelectedProblems(prev => prev.map(p => {
            if (p.problemId === problemId) {
                const newStatus = p.problemStatus === 'Active' ? 'Inactive' : 'Active';
                const newHistoryItem: StatusHistoryItem = {
                    status: newStatus,
                    timestamp: new Date().toISOString(),
                    userId: user.uid
                };
                return {
                    ...p,
                    problemStatus: newStatus,
                    problemStatusHistory: [...(p.problemStatusHistory || []), newHistoryItem]
                };
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
                    {selectedProblemItems.length > 0 && (
                        <div className={styles.headerRow}>
                            <div><T>Actions</T></div>
                            <div><T>Problem Name</T></div>
                            <div><T>Protocol</T></div>
                            <div><T>Measures</T></div>
                        </div>
                    )}
                    {selectedProblemItems.length === 0 && <p className={styles.emptyText}><T>No problems selected</T></p>}
                    {selectedProblemItems.map(p => {
                        const selectedProb = selectedProblems.find(sp => sp.problemId === p.id)!;
                        const isActive = selectedProb.problemStatus === 'Active';
                        const isUsed = usedProblemIds.has(p.id);

                        let dateText = null;
                        if (!isActive && selectedProb.problemStatusHistory?.length) {
                            const lastInactive = selectedProb.problemStatusHistory
                                .filter(h => h.status === 'Inactive')
                                .pop();
                            if (lastInactive && lastInactive.timestamp) {
                                dateText = new Date(lastInactive.timestamp).toLocaleDateString(currentLang);
                            }
                        }

                        return (
                            <div key={p.id} className={styles.problemRow}>
                                <div className={styles.columnActions}>
                                    <button
                                        className={`${styles.statusToggleBtn} ${isActive ? styles.statusActive : styles.statusInactive}`}
                                        onClick={() => handleToggleStatus(p.id)}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1.2' }}
                                    >
                                        <span>{isActive ? <T>Active</T> : <T>Inactive</T>}</span>
                                        {dateText && <span style={{ fontSize: '0.65em', fontWeight: 'normal', marginTop: '2px' }}>({dateText})</span>}
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
                                <div className={styles.columnName}>
                                    <span className={styles.problemName}>{p.name}</span>
                                </div>
                                <div className={styles.columnProtocol}>
                                    {p.protocolName && <span className={styles.protocolBadge}>{p.protocolName}</span>}
                                </div>
                                <div className={styles.columnMeasures}>
                                    {p.measureNames && <span className={styles.measuresLabel}>{p.measureNames}</span>}
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
                            <div key={p.id} className={styles.problemRow}>
                                <div className={styles.columnActions}>
                                    <button
                                        className={styles.addBtn}
                                        onClick={() => handleToggleProblem(p.id, true)}
                                    >
                                        <T>Add</T>
                                    </button>
                                </div>
                                <div className={styles.columnName}>
                                    <span className={styles.problemName}>{p.name}</span>
                                </div>
                                <div className={styles.columnProtocol}>
                                    {p.protocolName && <span className={styles.protocolBadge}>{p.protocolName}</span>}
                                </div>
                                <div className={styles.columnMeasures}>
                                    {p.measureNames && <span className={styles.measuresLabel}>{p.measureNames}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </fieldset>
            )}
        </div>
    );
});

export default ProblemsTab;

