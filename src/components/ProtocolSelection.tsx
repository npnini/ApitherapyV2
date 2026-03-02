import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { JoinedPatientData } from '../types/patient';
import { Problem } from '../types/problem';
import { Protocol } from '../types/protocol';
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import styles from './ProtocolSelection.module.css';
import { T, useT, useTranslationContext } from './T';

interface ProtocolSelectionProps {
    patient: Partial<JoinedPatientData>;
    onBack: () => void;
    onProtocolSelect: (protocol: Protocol, problemId: string) => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({ patient, onBack, onProtocolSelect }) => {
    const { language, direction } = useTranslationContext();

    const [problems, setProblems] = useState<Problem[]>([]);
    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const tSelectProblem = useT('Select a Problem');
    const tSelectProblemHint = useT('Select a Problem to view available protocols');
    const tSelectProtocol = useT('Select a Protocol');
    const tLoading = useT('Loading...');
    const tNoProblemsDefined = useT('No problems defined for this patient.');
    const tNoProtocols = useT('No protocols found for this problem.');
    const tBack = useT('Back');
    const tBackToProblem = useT('Back to Problems');

    const BackIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch all problems and all protocols in parallel
            const [problemsSnap, protocolsSnap] = await Promise.all([
                getDocs(collection(db, 'cfg_problems')),
                getDocs(collection(db, 'cfg_protocols')),
            ]);

            const allProblems: Problem[] = problemsSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Problem, 'id'>),
                id: doc.id,
            }));
            const fetchedProtocols: Protocol[] = protocolsSnap.docs.map(doc => ({
                ...(doc.data() as Omit<Protocol, 'id'>),
                id: doc.id,
            }));

            setAllProtocols(fetchedProtocols);

            // Filter to patient's problem IDs if defined
            const problemIds = patient.medicalRecord?.patient_level_data?.treatment_plan?.problemIds;
            if (problemIds && problemIds.length > 0) {
                setProblems(allProblems.filter(p => problemIds.includes(p.id)));
            } else {
                setProblems(allProblems);
            }
        } catch (err) {
            console.error('ProtocolSelection: failed to load data', err);
        } finally {
            setIsLoading(false);
        }
    }, [patient]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Protocols for the currently selected problem
    const problemProtocols: Protocol[] = selectedProblem
        ? allProtocols.filter(p => selectedProblem.protocolIds?.includes(p.id))
        : [];

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
            {/* Back button */}
            <div className={styles.header}>
                <button
                    className={styles.backButton}
                    onClick={selectedProblem ? () => setSelectedProblem(null) : onBack}
                >
                    <BackIcon size={20} />
                    {selectedProblem ? tBackToProblem : tBack}
                </button>
            </div>

            <div className={styles.formContainer}>
                {/* Step A: Problem list */}
                {!selectedProblem && (
                    <>
                        <h2 className={styles.stepTitle}>{tSelectProblem}</h2>
                        {problems.length === 0 ? (
                            <div className={styles.emptyState}>{tNoProblemsDefined}</div>
                        ) : (
                            <div className={styles.itemList}>
                                {problems.map(problem => (
                                    <button
                                        key={problem.id}
                                        className={styles.itemCard}
                                        onClick={() => setSelectedProblem(problem)}
                                    >
                                        <div className={styles.itemName}>
                                            {getMLValue(problem.name, language)}
                                        </div>
                                        <div className={styles.itemDescription}>
                                            {getMLValue(problem.description, language)}
                                        </div>
                                        <ChevronRight size={18} className={styles.itemChevron} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Step B: Protocol list for selected problem */}
                {selectedProblem && (
                    <>
                        <div className={styles.problemContext}>
                            <span className={styles.problemContextLabel}>
                                <T>Problem</T>:
                            </span>{' '}
                            <span className={styles.problemContextName}>
                                {getMLValue(selectedProblem.name, language)}
                            </span>
                        </div>
                        <h2 className={styles.stepTitle}>{tSelectProtocol}</h2>
                        {problemProtocols.length === 0 ? (
                            <div className={styles.emptyState}>{tNoProtocols}</div>
                        ) : (
                            <div className={styles.itemList}>
                                {problemProtocols.map(protocol => (
                                    <button
                                        key={protocol.id}
                                        className={styles.itemCard}
                                        onClick={() => onProtocolSelect(protocol, selectedProblem.id)}
                                    >
                                        <div className={styles.itemName}>
                                            {getMLValue(protocol.name, language)}
                                        </div>
                                        <div className={styles.itemDescription}>
                                            {getMLValue(protocol.description, language)}
                                        </div>
                                        <ChevronRight size={18} className={styles.itemChevron} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ProtocolSelection;
