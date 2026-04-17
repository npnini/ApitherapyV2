import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientProblem } from '../types/patient';
import { Problem } from '../types/problem';
import { Protocol } from '../types/protocol';
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import styles from './ProtocolSelection.module.css';
import { T, useT, useTranslationContext } from './T';
import ConfirmationModal from './ConfirmationModal';

interface ProtocolSelectionProps {
    problems: PatientProblem[];
    onProtocolSelect: (protocolId: string, problemId: string) => void;
    onFreeSelect: () => void;
    onBack: () => void;
    onExit: () => void;
    onRequestMissingProblem?: (problemName: string) => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

// Internal model combining problem with its protocols
interface ProblemRowData {
    problemId: string;
    problemName: string;
    protocols: Protocol[];
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({
    problems,
    onProtocolSelect,
    onFreeSelect,
    onBack,
    onExit,
    onRequestMissingProblem,
}) => {
    const { language, direction } = useTranslationContext();
    const tLoading = useT('Loading...');
    const tFreeSelection = useT('Free Selection');
    const tExit = useT('Exit');
    const tProblem = useT('Problem');
    const tProtocols = useT('Protocols');
    const tNoActiveProblems = useT('No active problems found.');
    const tProblemPrompt = useT('Please describe the problem you need to treat:');

    const [isLoading, setIsLoading] = useState(true);
    const [problemRows, setProblemRows] = useState<ProblemRowData[]>([]);

    // Modal state for requesting missing problem
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestProblemName, setRequestProblemName] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch all problems and protocols
            const [problemsSnap, protocolsSnap] = await Promise.all([
                getDocs(collection(db, 'cfg_problems')),
                getDocs(collection(db, 'cfg_protocols')),
            ]);

            const allProblems: Problem[] = problemsSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Problem, 'id'>),
                id: doc.id,
            }));
            const allProtocols: Protocol[] = protocolsSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Protocol, 'id'>),
                id: doc.id,
            }));

            // Build rows
            const rows: ProblemRowData[] = [];
            for (const p of problems) {
                const problemObj = allProblems.find(ap => ap.id === p.problemId);
                if (!problemObj) continue;

                // A problem can have `protocolId` or `protocolIds`
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
        } catch (err) {
            console.error('ProtocolSelection: failed to load data', err);
        } finally {
            setIsLoading(false);
        }
    }, [problems, language]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
                <h2 className={styles.stepTitle}><T>Select Treatment Protocol</T></h2>
            </div>

            <div className={styles.formContainer}>
                {problemRows.length === 0 ? (
                    <div className={styles.emptyState}>{tNoActiveProblems}</div>
                ) : (
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
                                        <td className={styles.problemNameCell}>
                                            {row.problemName}
                                        </td>
                                        <td className={styles.protocolsCell}>
                                            <div className={styles.protocolsWrapper}>
                                                {row.protocols.map(protocol => (
                                                    <button
                                                        key={protocol.id}
                                                        className={styles.protocolBadge}
                                                        onClick={() => onProtocolSelect(protocol.id, row.problemId)}
                                                    >
                                                        {getMLValue(protocol.name, language)}
                                                    </button>
                                                ))}
                                                {row.protocols.length === 0 && (
                                                    <span className={styles.noProtocolsText}><T>No protocols</T></span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className={styles.actions}>
                    <button className={styles.btnSecondary} onClick={onExit}>
                        {tExit}
                    </button>
                    <button className={styles.btnPrimary} onClick={onFreeSelect}>
                        {tFreeSelection}
                    </button>
                </div>

                <div className={styles.requestProblemWrapper}>
                    <p className={styles.missingProblemText}><T>Didn't find what you were looking for?</T></p>
                    <button
                        className={styles.btnSecondary}
                        onClick={() => {
                            setRequestProblemName('');
                            setIsRequestModalOpen(true);
                        }}
                    >
                        <T>Request a new problem/protocol</T>
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
