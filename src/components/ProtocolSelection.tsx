import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientProblem } from '../types/patient';
import { Problem } from '../types/problem';
import { Protocol } from '../types/protocol';
import { Measure } from '../types/measure';
import { Check, Loader, Plus, X, ArrowRight } from 'lucide-react';
import styles from './ProtocolSelection.module.css';
import { T, useT, useTranslationContext } from './T';
import ConfirmationModal from './ConfirmationModal';

interface ProtocolSelectionProps {
    problems: PatientProblem[];
    treatmentNumber: number;
    isSensitivityTestCompleted?: boolean;
    onProtocolSelect: (protocolIds: string[], problemIds: string[], measureReadings: Array<{ measureId: string; value: string | number }>) => void;
    onTargetedPainSelect?: (protocol: Protocol, measureReadings: { measureId: string; value: string | number }[], problemId?: string) => void;
    onBack: () => void;
    onExit: () => void;
    onRequestMissingProblem?: (problemName: string) => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

interface ProblemRowData {
    problemId: string;
    problemName: string;
    protocols: Protocol[];
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({
    problems,
    onProtocolSelect,
    onTargetedPainSelect,
    onBack,
    onExit,
    onRequestMissingProblem,
    treatmentNumber,
    isSensitivityTestCompleted,
}) => {
    const { language, direction } = useTranslationContext();
    const tLoading = useT('Loading...');
    const tExit = useT('Exit');
    const tBack = useT('Back');
    const tProblem = useT('Problem');
    const tProtocols = useT('Protocols');
    const tNoActiveProblems = useT('No active problems found.');
    const tProblemPrompt = useT('Please describe the problem you need to treat:');
    const tSelectedMeasures = useT('Selected protocol measures');
    const tEnterMeasuresBeforeTreatment = useT('Enter measures values before treatment');
    const tAdhocSelection = useT('Ad-hoc / Targeted Pain');
    const tStartTreatment = useT('Start Treatment');

    const [isLoading, setIsLoading] = useState(true);
    const [problemRows, setProblemRows] = useState<ProblemRowData[]>([]);
    const [adhocProtocols, setAdhocProtocols] = useState<Protocol[]>([]);
    const [allMeasures, setAllMeasures] = useState<Measure[]>([]);
    const [adhocProblemId, setAdhocProblemId] = useState<string>('');

    // Selection State
    const [selectedProtocolIds, setSelectedProtocolIds] = useState<Set<string>>(new Set());
    const [selectedProblemIds, setSelectedProblemIds] = useState<Set<string>>(new Set());
    const [isSensitivityRequired, setIsSensitivityRequired] = useState(false);
    const [measureValues, setMeasureValues] = useState<Record<string, number | string>>({});
    const [selectedAdhocProblemId, setSelectedAdhocProblemId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Modal state for requesting missing problem
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestProblemName, setRequestProblemName] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [problemsSnap, protocolsSnap, configSnap, measuresSnap] = await Promise.all([
                getDocs(collection(db, 'cfg_problems')),
                getDocs(collection(db, 'cfg_protocols')),
                getDoc(doc(db, 'cfg_app_config', 'main')),
                getDocs(collection(db, 'cfg_measures')),
            ]);

            const allProblems: Problem[] = problemsSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Problem, 'id'>),
                id: doc.id,
            }));
            const allProtocols: Protocol[] = protocolsSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Protocol, 'id'>),
                id: doc.id,
            }));
            const allMs: Measure[] = measuresSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Measure, 'id'>),
                id: doc.id,
            }));
            setAllMeasures(allMs);

            // Build rows for active problems
            const rows: ProblemRowData[] = [];
            for (const p of problems) {
                if (p.problemStatus !== 'Active') continue;
                const problemObj = allProblems.find(ap => ap.id === p.problemId);
                if (!problemObj) continue;

                let linkedProtocolIds: string[] = [];
                if (problemObj.protocolId) linkedProtocolIds.push(problemObj.protocolId);
                if (Array.isArray(problemObj.protocolIds)) linkedProtocolIds.push(...problemObj.protocolIds);

                const linkedProtocols = allProtocols.filter(proto => linkedProtocolIds.includes(proto.id));

                rows.push({
                    problemId: problemObj.id,
                    problemName: getMLValue(problemObj.name, language),
                    protocols: linkedProtocols
                });
            }
            setProblemRows(rows);

            // Fetch Ad-hoc configuration
            if (configSnap.exists()) {
                const configData = configSnap.data();
                const adId = configData.treatmentSettings?.adhocProblemIdentifier;
                if (adId) {
                    setAdhocProblemId(adId);
                    setSelectedAdhocProblemId(prev => prev || adId);
                }
                
                const sensitivityLimit = Number(configData.treatmentSettings?.initialSensitivityTestTreatments ?? 0);
                const isSensitivity = treatmentNumber <= sensitivityLimit && !isSensitivityTestCompleted;
                
                console.log('ProtocolSelection: Sensitivity check', { 
                    treatmentNumber, 
                    sensitivityLimit, 
                    isSensitivityTestCompleted, 
                    isSensitivity 
                });

                if (isSensitivity) {
                    setIsSensitivityRequired(true);
                    const sensitivityProtocol = allProtocols.find(p => p.type === 'sensitivity' && p.status === 'active');
                    if (sensitivityProtocol) {
                        setSelectedProtocolIds(new Set([sensitivityProtocol.id]));
                    }
                }
            }
            
            // Ad-hoc section: only ad-hoc protocols
            const adhocOnly = allProtocols.filter(p => p.type === 'ad-hoc' || p.isAdhoc);
            setAdhocProtocols(adhocOnly);

        } catch (err) {
            console.error('ProtocolSelection: failed to load data', err);
        } finally {
            setIsLoading(false);
        }
    }, [problems, language, treatmentNumber, isSensitivityTestCompleted]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleProtocol = (protocolId: string, problemId: string) => {
        if (isSensitivityRequired) return; // Cannot change selection during sensitivity test period
        
        setSelectedProtocolIds(prev => {
            const next = new Set(prev);
            if (next.has(protocolId)) {
                next.delete(protocolId);
            } else {
                next.add(protocolId);
            }
            return next;
        });

        // Update problem IDs mapping (simplified: if any protocol for this problem is selected, problem is selected)
        // Actually, we'll re-calculate problem IDs on submit based on active selection
    };

    const selectedProtocols = useMemo(() => {
        const allProtos = [...adhocProtocols, ...problemRows.flatMap(r => r.protocols)];
        return allProtos.filter(p => selectedProtocolIds.has(p.id));
    }, [selectedProtocolIds, adhocProtocols, problemRows]);

    const activeMeasures = useMemo(() => {
        const measureIds = new Set<string>();
        selectedProtocols.forEach(p => {
            if (p.measureIds) p.measureIds.forEach(id => measureIds.add(id));
        });
        return allMeasures.filter(m => measureIds.has(m.id));
    }, [selectedProtocols, allMeasures]);

    const handleMeasureChange = (measureId: string, val: number | string) => {
        setMeasureValues(prev => ({ ...prev, [measureId]: val }));
    };

    const handleStartTreatment = () => {
        if (selectedProtocolIds.size === 0 || isSubmitting) return;
        setIsSubmitting(true); // Freeze the UI — component unmounts when parent transitions

        const problemIds = new Set<string>();
        const allProtos = [...adhocProtocols, ...problemRows.flatMap(r => r.protocols)];
        
        selectedProtocolIds.forEach(id => {
            const row = problemRows.find(r => r.protocols.some(p => p.id === id));
            if (row) {
                problemIds.add(row.problemId);
            } else {
                const proto = allProtos.find(p => p.id === id);
                if (proto?.type !== 'sensitivity') {
                    if (proto?.type === 'ad-hoc' && selectedAdhocProblemId) {
                        problemIds.add(selectedAdhocProblemId);
                    } else if (adhocProblemId) {
                        problemIds.add(adhocProblemId);
                    }
                }
            }
        });

        const readings = activeMeasures
            .filter(m => measureValues[m.id] !== undefined && measureValues[m.id] !== '')
            .map(m => ({
                measureId: m.id,
                value: measureValues[m.id],
            }));

        const selectedAdhoc = adhocProtocols.find(p => selectedProtocolIds.has(p.id) && p.type === 'ad-hoc');
        if (selectedAdhoc && onTargetedPainSelect) {
            onTargetedPainSelect(selectedAdhoc, readings, selectedAdhocProblemId);
        } else {
            onProtocolSelect(Array.from(selectedProtocolIds), Array.from(problemIds), readings);
        }
    };

    const isStartEnabled = !isSubmitting && selectedProtocolIds.size > 0 && activeMeasures.every(m => measureValues[m.id] !== undefined && measureValues[m.id] !== '');

    if (isLoading) {
        return (
            <div className={styles.container} dir={direction}>
                <div className={styles.loadingMessage}>
                    <Loader size={24} className={styles.spinner} />
                    <span>{tLoading}</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.header}>
                <h2 className={styles.stepTitle}><T>Select Treatment Protocols</T></h2>
            </div>

            {isSensitivityRequired && (
                <div className={styles.sensitivityAlert} style={{ padding: '1rem', backgroundColor: 'var(--color-warning-light)', color: 'var(--color-warning-dark)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontWeight: 'bold' }}>
                    <T>Initial Sessions: Sensitivity Protocol Required</T>
                </div>
            )}

            <div className={styles.formContainer}>
                {!isSensitivityRequired && (
                    <>
                        {/* 1. Active Problems Table */}
                        <div className={styles.tableSection}>
                            <h3 className={styles.sectionTitle}>{tProtocols}</h3>
                            <div className={styles.tableContainer}>
                                <table className={styles.selectionTable}>
                                    <thead>
                                        <tr>
                                            <th>{tProblem}</th>
                                            <th>{tProtocols}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {problemRows.map(row => (
                                            <tr key={row.problemId}>
                                                <td className={styles.problemNameCell}>{row.problemName}</td>
                                                <td className={styles.protocolsCell}>
                                                    <div className={styles.protocolsWrapper}>
                                                        {row.protocols.map(protocol => {
                                                            const isSelected = selectedProtocolIds.has(protocol.id);
                                                            return (
                                                                <button
                                                                    key={protocol.id}
                                                                    className={`${styles.protocolBadge} ${isSelected ? styles.badgeSelected : ''}`}
                                                                    style={{ opacity: isSensitivityRequired && !isSelected ? 0.5 : 1, cursor: isSensitivityRequired ? 'not-allowed' : 'pointer' }}
                                                                    onClick={() => toggleProtocol(protocol.id, row.problemId)}
                                                                    disabled={isSensitivityRequired}
                                                                >
                                                                    {isSelected && <Check size={14} />}
                                                                    {getMLValue(protocol.name, language)}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {problemRows.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className={styles.emptyRow}>{tNoActiveProblems}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 2. Ad-hoc Selection */}
                        <div className={styles.adhocSection}>
                            <h3 className={styles.sectionTitle}>{tAdhocSelection}</h3>
                            <div className={styles.protocolsWrapper}>
                                {adhocProtocols.map(protocol => {
                                    const isSelected = selectedProtocolIds.has(protocol.id);
                                    const isTargetedPain = protocol.type === 'ad-hoc' || protocol.isAdhoc;
                                    return (
                                        <button
                                            key={protocol.id}
                                            className={`${styles.protocolBadge} ${isSelected ? styles.badgeSelected : ''}`}
                                            style={{ opacity: isSensitivityRequired && !isSelected ? 0.5 : 1, cursor: isSensitivityRequired ? 'not-allowed' : 'pointer' }}
                                            onClick={() => {
                                                toggleProtocol(protocol.id, adhocProblemId);
                                            }}
                                            disabled={isSensitivityRequired}
                                        >
                                            {isSelected && <Check size={14} />}
                                            {getMLValue(protocol.name, language)}
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Ad-hoc Problem Linker */}
                            {adhocProtocols.some(p => selectedProtocolIds.has(p.id) && p.type === 'ad-hoc') && (
                                <div className={styles.adhocLinkSelector} style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: '500' }}><T>Link to Problem:</T></label>
                                    <select 
                                        className={styles.measureInput} 
                                        style={{ width: 'auto', padding: '0.3rem 0.5rem' }}
                                        value={selectedAdhocProblemId}
                                        onChange={e => setSelectedAdhocProblemId(e.target.value)}
                                    >
                                        <option value={adhocProblemId}><T>General Pain</T></option>
                                        {problemRows.map(row => (
                                            <option key={row.problemId} value={row.problemId}>{row.problemName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* 3. Selected Protocol Measures */}
                {activeMeasures.length > 0 && (
                    <div className={styles.measuresSection}>
                        <h3 className={styles.sectionTitle}>{isSensitivityRequired ? tEnterMeasuresBeforeTreatment : tSelectedMeasures}</h3>
                        <div className={styles.measuresGrid}>
                            {activeMeasures.map(measure => {
                                const name = getMLValue(measure.name, language);
                                const value = measureValues[measure.id] ?? '';
                                return (
                                    <div key={measure.id} className={styles.measureItem}>
                                        <label className={styles.measureLabel}>{name}</label>
                                        <input
                                            type="number"
                                            className={styles.measureInput}
                                            value={value}
                                            min={measure.min}
                                            max={measure.max}
                                            placeholder={`${measure.min ?? 0} – ${measure.max ?? 10}`}
                                            onChange={e => handleMeasureChange(measure.id, e.target.value === '' ? '' : Number(e.target.value))}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    <div className={styles.actionsLeft}>
                        <button className={styles.btnSecondary} onClick={onExit} disabled={isSubmitting}>{tExit}</button>
                        <button className={styles.btnSecondary} onClick={onBack} disabled={isSubmitting}>{tBack}</button>
                    </div>

                    <button
                        className={styles.btnPrimary}
                        disabled={!isStartEnabled}
                        onClick={handleStartTreatment}
                    >
                        {isSubmitting ? <Loader size={16} className={styles.spinner} /> : <ArrowRight size={18} />}
                        {tStartTreatment}
                    </button>
                </div>
            </div>

            <ConfirmationModal
                isOpen={isRequestModalOpen}
                title={<T>Request a New Problem/Protocol</T>}
                message={
                    <div className={styles.modalInputWrapper}>
                        <p>{tProblemPrompt}</p>
                        <textarea
                            className={styles.modalInput}
                            value={requestProblemName}
                            onChange={(e) => setRequestProblemName(e.target.value)}
                            placeholder="Type the problem or protocol here..."
                            rows={3}
                        />
                    </div>
                }
                onConfirm={() => {
                    if (requestProblemName.trim() && onRequestMissingProblem) {
                        onRequestMissingProblem(requestProblemName.trim());
                    }
                    setIsRequestModalOpen(false);
                }}
                onCancel={() => setIsRequestModalOpen(false)}
                confirmLabel={<T>Send Request</T>}
                cancelLabel={<T>Cancel</T>}
            />
        </div>
    );
};

export default ProtocolSelection;

