import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import PersonalDetails from './PersonalDetails';
import QuestionnaireStep from './QuestionnaireStep';
import TreatmentHistory from '../TreatmentHistory';
import { JoinedPatientData, PatientData } from '../../types/patient';
import styles from './PatientIntake.module.css';
import { T, useT } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import ConsentTab, { ConsentTabHandle } from './ConsentTab';
import InstructionsTab, { InstructionsTabHandle } from './InstructionsTab';
import ProblemsProtocolsTab, { ProblemsProtocolsTabHandle } from './ProblemsProtocolsTab';
import { addMeasuredValueReading, saveTreatment, hasMeasuredValueReadings, getTreatmentCount } from '../../firebase/patient';
import MeasuresHistoryTab from './MeasuresHistoryTab';
import ProtocolSelection from '../ProtocolSelection';
import TreatmentExecution from '../TreatmentExecution';
import SessionOpening, { SessionOpeningData } from './SessionOpening';
import { Protocol } from '../../types/protocol';
import { ProtocolRound, VitalSigns } from '../../types/treatmentSession';
import { AppUser } from '../../types/user';

// ─── Tab key type ────────────────────────────────────────────────────────────
type TabKey =
    | 'personal'
    | 'questionnaire'
    | 'consent'
    | 'instructions'
    | 'problems'
    | 'treatments'
    | 'measures';

type ViewState = 'tabs' | 'sessionOpening' | 'protocolSelection' | 'treatmentExecution';

const TAB_ORDER: TabKey[] = [
    'personal',
    'questionnaire',
    'consent',
    'instructions',
    'problems',
    'treatments',
    'measures',
];

// The first 5 tabs must all be saved before "Start New Treatment" is enabled (UX-1)
const FIRST_FIVE: TabKey[] = ['personal', 'questionnaire', 'consent', 'instructions', 'problems'];

// ─── Props ────────────────────────────────────────────────────────────────────
interface PatientIntakeProps {
    patient: Partial<JoinedPatientData>;
    user: AppUser;
    onSave: (patientData: any) => Promise<boolean>;
    onUpdate: (patientData: any) => Promise<boolean>;
    onClose: () => void;
    saveStatus: 'idle' | 'saving' | 'success' | 'error';
    errorMessage: string;
    initialViewState?: ViewState;
    initialTab?: TabKey;
}

// ─── Component ───────────────────────────────────────────────────────────────
const PatientIntake: React.FC<PatientIntakeProps> = ({
    patient,
    user,
    onSave,
    onUpdate,
    onClose,
    saveStatus,
    errorMessage,
    initialViewState,
    initialTab,
}) => {
    // ── State ─────────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? 'personal');
    const [viewState, setViewState] = useState<ViewState>(initialViewState ?? 'tabs');
    const [savedTabs, setSavedTabs] = useState<Set<TabKey>>(new Set());
    const [isDirty, setIsDirty] = useState(false);

    // Guard modal states
    const [showCloseGuard, setShowCloseGuard] = useState(false);       // UX-2
    const [showTreatmentGuard, setShowTreatmentGuard] = useState(false); // UX-6
    const [showAbortTreatmentGuard, setShowAbortTreatmentGuard] = useState(false);
    const [showTreatmentErrorGuard, setShowTreatmentErrorGuard] = useState(false);
    const [pendingTab, setPendingTab] = useState<TabKey | null>(null);
    const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
    const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
    const [sessionOpeningData, setSessionOpeningData] = useState<SessionOpeningData | null>(null);
    const [rounds, setRounds] = useState<ProtocolRound[]>([]);
    const [isSensitivitySession, setIsSensitivitySession] = useState(false);
    const [appConfig, setAppConfig] = useState<any>(null);
    const [treatmentSaveStatus, setTreatmentSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [treatmentErrorMessage, setTreatmentErrorMessage] = useState<string | null>(null);

    const consentTabRef = useRef<ConsentTabHandle>(null);
    const instructionsTabRef = useRef<InstructionsTabHandle>(null);
    const problemsTabRef = useRef<ProblemsProtocolsTabHandle>(null);

    // Translation labels
    const tPersonal = useT('Personal Details');
    const tQuestionnaire = useT('Questionnaire');
    const tConsent = useT('Consent');
    const tInstructions = useT('Instructions');
    const tProblems = useT('Problems & Protocols');
    const tTreatments = useT('Treatments History');
    const tMeasures = useT('Measures History');
    const tStartNewTreatment = useT('Start New Treatment');
    const tUpdate = useT('Update');
    const tNextStep = useT('Next Step');
    const tDone = useT('Done');

    const tabLabels: Record<TabKey, string> = {
        personal: tPersonal,
        questionnaire: tQuestionnaire,
        consent: tConsent,
        instructions: tInstructions,
        problems: tProblems,
        treatments: tTreatments,
        measures: tMeasures,
    };

    // ── Patient data ──────────────────────────────────────────────────────────
    const initializePatientData = (p: Partial<JoinedPatientData>): Partial<JoinedPatientData> => ({
        ...p,
        fullName: p.fullName ?? '',
        identityNumber: p.identityNumber ?? '',
        email: p.email ?? '',
        mobile: p.mobile ?? '',
        birthDate: p.birthDate ?? '',
        profession: p.profession ?? '',
        address: p.address ?? '',
        caretakerId: p.caretakerId ?? user.uid,
        medicalRecord: p.medicalRecord ?? { patient_level_data: {} },
        questionnaireResponse: p.questionnaireResponse,
    });

    const [patientData, setPatientData] = useState<Partial<JoinedPatientData>>(
        initializePatientData(patient)
    );
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

    useEffect(() => {
        const data = initializePatientData(patient);
        setPatientData(data);

        const checkSavedStatus = async () => {
            // Initialize savedTabs based on existing data
            const initialSaved = new Set<TabKey>();

            // 1. Personal Details
            if (data.fullName && data.identityNumber && data.mobile) {
                initialSaved.add('personal');
            }

            // 2. Questionnaire
            const qResponse = (data.questionnaireResponse || {}) as any;
            const hasAnswers = Object.keys(qResponse).some(
                key => key !== 'domain' && key !== 'version' && key !== 'signature' && key !== 'patientId' && key !== 'createdTimestamp' && key !== 'updatedTimestamp' && qResponse[key] !== undefined
            );
            if (hasAnswers) {
                initialSaved.add('questionnaire');
            }

            // 3. Consent
            if (data.medicalRecord?.patient_level_data?.consentSignedUrl) {
                initialSaved.add('consent');
            }

            // 4. Instructions
            if (data.medicalRecord?.patient_level_data?.treatmentInstructionsSignedUrl) {
                initialSaved.add('instructions');
            }

            // 5. Problems & Protocols
            if (data.medicalRecord?.patient_level_data?.treatment_plan?.problemIds?.length) {
                initialSaved.add('problems');
            }

            // 6. Treatments (Check if patient has id, assuming existing patients have history)
            if (patient.id) {
                // In a real app, we'd check treatment count from an API call or another prop.
                // For now, if it's an existing patient, we can assume they have history or at least the tab is "ready"
                initialSaved.add('treatments');

                // 7. Measures History - check if there are actual readings
                const hasReadings = await hasMeasuredValueReadings(patient.id);
                if (hasReadings) {
                    initialSaved.add('measures');
                }
            }

            setSavedTabs(initialSaved);
        };

        checkSavedStatus();

        // Load appConfig for sensitivity test settings
        getDoc(doc(db, 'cfg_app_config', 'main')).then(snap => {
            if (snap.exists()) setAppConfig(snap.data());
        }).catch(() => { /* non-critical */ });
    }, [patient]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleDataChange = (data: Partial<JoinedPatientData>, isInternal: boolean = false) => {
        setPatientData(data);
        if (!isInternal) {
            setIsDirty(true);
        }
    };

    const markTabSaved = (tab: TabKey) => {
        setSavedTabs(prev => new Set(prev).add(tab));
        setIsDirty(false);
    };

    const handleUpdate = async (): Promise<boolean> => {
        setHasAttemptedSubmit(true);
        let finalData = { ...patientData };

        if (activeTab === 'consent' && consentTabRef.current) {
            const signatureUrl = await consentTabRef.current.onSave();
            if (!signatureUrl) return false;

            finalData = {
                ...finalData,
                medicalRecord: {
                    ...(finalData.medicalRecord || {}),
                    patient_level_data: {
                        ...(finalData.medicalRecord?.patient_level_data || {}),
                        consentSignedUrl: signatureUrl
                    }
                }
            };
            setPatientData(finalData);
        }

        if (activeTab === 'instructions' && instructionsTabRef.current) {
            const signatureUrl = await instructionsTabRef.current.onSave();
            if (!signatureUrl) return false;

            finalData = {
                ...finalData,
                medicalRecord: {
                    ...(finalData.medicalRecord || {}),
                    patient_level_data: {
                        ...(finalData.medicalRecord?.patient_level_data || {}),
                        treatmentInstructionsSignedUrl: signatureUrl
                    }
                }
            };
            setPatientData(finalData);
        }

        if (activeTab === 'problems' && problemsTabRef.current) {
            const readings = problemsTabRef.current.getReadings();
            if (problemsTabRef.current.isDirty && readings.length > 0) {
                finalData = { ...finalData, pendingReadings: readings };
            }
        }

        const success = await onUpdate(finalData);
        if (success) {
            if (problemsTabRef.current) {
                problemsTabRef.current.clearDirty();
            }
            markTabSaved(activeTab);
        }
        return success;
    };

    // Save (new patient last step → full submission)
    const handleCompleteSubmission = async () => {
        setHasAttemptedSubmit(true);
        let finalData = { ...patientData };

        if (activeTab === 'consent' && consentTabRef.current) {
            const signatureUrl = await consentTabRef.current.onSave();
            if (!signatureUrl) return;

            finalData = {
                ...finalData,
                medicalRecord: {
                    ...(finalData.medicalRecord || {}),
                    patient_level_data: {
                        ...(finalData.medicalRecord?.patient_level_data || {}),
                        consentSignedUrl: signatureUrl
                    }
                }
            };
            setPatientData(finalData);
        }

        if (activeTab === 'problems' && problemsTabRef.current) {
            const readings = problemsTabRef.current.getReadings();
            if (readings.length > 0) {
                finalData = { ...finalData, pendingReadings: readings };
            }
        }

        await onSave(finalData);
        if (problemsTabRef.current) {
            problemsTabRef.current.clearDirty();
        }
        markTabSaved(activeTab);
    };

    // Tab navigation: advance to next tab
    const handleNextTab = async () => {
        // If we are on a tab that requires saving (like Personal Details), or if isDirty,
        // we should attempt to update/validate before moving.
        if (activeTab === 'personal' || isDirty) {
            const success = await handleUpdate();
            if (!success) return; // Stay on current tab if validation fails
        }

        const idx = TAB_ORDER.indexOf(activeTab);
        if (idx < TAB_ORDER.length - 1) {
            setActiveTab(TAB_ORDER[idx + 1]);
        }
    };

    // Tab click — guard if currently in treatment view (UX-6)
    const handleTabClick = (tab: TabKey) => {
        if (viewState !== 'tabs' && isDirty) {
            setPendingTab(tab);
            setShowTreatmentGuard(true);
            return;
        }
        if (viewState !== 'tabs') {
            setSelectedProtocol(null);
        }
        setViewState('tabs');
        setActiveTab(tab);
    };

    // Step 5: Start New Treatment → now goes to sessionOpening
    const handleStartNewTreatment = () => {
        if (viewState !== 'tabs' && isDirty) {
            setShowAbortTreatmentGuard(true);
            return;
        }
        // Reset session accumulation state
        setRounds([]);
        setSessionOpeningData(null);
        setSelectedProtocol(null);
        setSelectedProblemId(null);
        setIsSensitivitySession(false);
        setTreatmentSaveStatus('idle');
        setViewState('sessionOpening');
    };

    const handleSessionOpeningComplete = async (data: SessionOpeningData) => {
        if (!patient.id) return;
        let measureReadingId: string | undefined = undefined;
        // Write measure reading if any values entered
        if (data.measureReadings.length > 0) {
            try {
                measureReadingId = await addMeasuredValueReading(patient.id, {
                    patientId: patient.id,
                    readings: data.measureReadings,
                });
            } catch (err) {
                console.error('Failed to write measure reading:', err);
            }
        }
        setSessionOpeningData({ ...data, measureReadingId });
        console.log('PatientIntake: Session opening complete', { measureReadingId });

        // Check treatment count for sensitivity test routing
        const count = await getTreatmentCount(patient.id);
        const sensitivityThreshold = appConfig?.treatmentSettings?.initialSensitivityTestTreatments ?? 0;
        const sensitivityProtocolId = appConfig?.treatmentSettings?.sensitivityProtocolIdentifier;

        if (sensitivityProtocolId && count <= sensitivityThreshold) {
            // Load the sensitivity protocol from Firestore
            try {
                const protSnap = await getDoc(doc(db, 'cfg_protocols', sensitivityProtocolId));
                if (protSnap.exists()) {
                    const sensitivityProtocol = { ...protSnap.data(), id: protSnap.id } as Protocol;
                    setSelectedProtocol(sensitivityProtocol);
                    setSelectedProblemId(''); // Empty string for sensitivity
                    setIsSensitivitySession(true);
                    setViewState('treatmentExecution');
                    return;
                }
            } catch (err) {
                console.error('Failed to load sensitivity protocol:', err);
            }
        }

        setViewState('protocolSelection');
    };

    const handleProtocolSelect = (protocol: Protocol, problemId: string) => {
        setSelectedProtocol(protocol);
        setSelectedProblemId(problemId);
        setViewState('treatmentExecution');
    };

    const handleRoundComplete = (round: ProtocolRound) => {
        setRounds(prev => [...prev, round]);
        setIsSensitivitySession(false); // After sensitivity round, allow free protocol choice
        setSelectedProtocol(null);
        setSelectedProblemId(null);
        setViewState('protocolSelection');
    };

    const handleEndTreatment = async (finalRound: ProtocolRound, finalVitals: Partial<VitalSigns>, finalNotes: string) => {
        if (!patient.id || !sessionOpeningData) return;
        setTreatmentSaveStatus('saving');
        setTreatmentErrorMessage(null);

        const allRounds = [...rounds, finalRound];

        console.log('PatientIntake: Saving treatment session', {
            patientId: patient.id,
            measureReadingId: sessionOpeningData.measureReadingId,
            roundsCount: allRounds.length,
            isSensitivitySession
        });

        try {
            await saveTreatment(patient.id, {
                patientId: patient.id,
                caretakerId: user.uid,
                patientReport: sessionOpeningData.patientReport,
                preSessionVitals: sessionOpeningData.preSessionVitals,
                measureReadingId: sessionOpeningData.measureReadingId,
                rounds: allRounds,
                finalVitals,
                finalNotes,
                isSensitivityTest: isSensitivitySession,
            });
            setTreatmentSaveStatus('success');
            setIsDirty(false);
            setRounds([]);
            setSessionOpeningData(null);
            setViewState('tabs');
            setActiveTab('treatments');
        } catch (error) {
            console.error('Error saving treatment:', error);
            setTreatmentSaveStatus('error');
            setTreatmentErrorMessage(error instanceof Error ? error.message : 'Failed to save treatment');
            setShowTreatmentErrorGuard(true);
        }
    };

    // X click — dirty state guard (UX-2)
    const handleXClick = () => {
        if (isDirty) {
            setShowCloseGuard(true);
        } else {
            onClose();
        }
    };

    // UX-1: Start New Treatment gate
    const allFirstFiveSaved = FIRST_FIVE.every(t => savedTabs.has(t));
    const canStartTreatment = !!(patient.id && allFirstFiveSaved && viewState === 'tabs');

    // ── Render helpers ────────────────────────────────────────────────────────
    const isLastTab = activeTab === TAB_ORDER[TAB_ORDER.length - 1];
    const isExistingPatient = !!patient.id;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'personal':
                return (
                    <PersonalDetails
                        patientData={patientData}
                        onDataChange={handleDataChange}
                        showErrors={hasAttemptedSubmit}
                    />
                );
            case 'questionnaire':
                return (
                    <QuestionnaireStep
                        patientData={patientData}
                        onDataChange={handleDataChange}
                    />
                );
            case 'consent':
                return <ConsentTab
                    ref={consentTabRef}
                    patientData={patientData}
                    user={user}
                    onDataChange={handleDataChange}
                />;
            case 'instructions':
                return <InstructionsTab
                    ref={instructionsTabRef}
                    patientData={patientData}
                    user={user}
                    onDataChange={handleDataChange}
                />;
            case 'problems':
                return <ProblemsProtocolsTab
                    ref={problemsTabRef}
                    patientData={patientData as JoinedPatientData}
                    onDataChange={handleDataChange}
                />;
            case 'treatments':
                return (
                    <TreatmentHistory
                        patient={patientData as PatientData}
                        onBack={() => { }}
                        isTab={true}
                    />
                );
            case 'measures':
                return <MeasuresHistoryTab patientData={patientData as PatientData} />;
            default:
                return (
                    <div className={styles.placeholderTab}>
                        <h2>{tabLabels[activeTab]}</h2>
                        <p><T>Coming Soon</T></p>
                    </div>
                );
        }
    };

    // ── Modal header title (UX-7: name updates live) ─────────────────────────
    const headerTitle = isExistingPatient
        ? <><T>Patient Details</T> — {patientData.fullName || patient.fullName}</>
        : <T>Patient Intake Process</T>;

    // ── Bottom bar visibility (UX-8) ─────────────────────────────────────────
    const showBottomBar = viewState === 'tabs';

    // UX-4: hide Update on Treatments History & Measures History tabs
    const showUpdateButton = activeTab !== 'treatments' && activeTab !== 'measures';

    return (
        <div className={`${styles.overlay} ${viewState !== 'tabs' ? styles.overlayWide : ''}`}>
            <div className={`${styles.modal} ${viewState !== 'tabs' ? styles.modalWide : ''}`}>

                {/* ── Modal Header ─────────────────────────────────────────── */}
                <div className={styles.modalHeader}>
                    <h3 className={styles.headerTitle}>{headerTitle}</h3>
                    <div className={styles.headerRight}>
                        <button
                            type="button"
                            onClick={handleXClick}
                            className={styles.closeButton}
                            aria-label="Close"
                        >
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" width="14" height="14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Tab Bar Row ───────────────────────────────────────────── */}
                <div className={styles.tabBar}>
                    <div className={styles.tabButtons}>
                        {TAB_ORDER.map((tab, idx) => (
                            <button
                                key={tab}
                                className={`${styles.tabButton} ${activeTab === tab ? styles.tabButtonActive : ''}`}
                                onClick={() => handleTabClick(tab)}
                                type="button"
                            >
                                {/* UX-5: green dot when saved */}
                                {savedTabs.has(tab) && (
                                    <span className={styles.savedDot} aria-label="saved" />
                                )}
                                <span className={styles.tabIndex}>{idx + 1}</span>
                                {tabLabels[tab]}
                            </button>
                        ))}
                    </div>

                    {/* Start New Treatment (UX-1) */}
                    <button
                        type="button"
                        className={styles.startTreatmentButton}
                        disabled={!canStartTreatment}
                        onClick={handleStartNewTreatment}
                    >
                        {tStartNewTreatment}
                    </button>
                </div>

                {/* ── Content Area ──────────────────────────────────────────── */}
                <div className={`${styles.contentArea} ${viewState !== 'tabs' ? styles.contentAreaFlow : ''}`}>
                    {viewState === 'tabs' && renderTabContent()}

                    {viewState !== 'tabs' && (
                        <>
                            {viewState === 'sessionOpening' && (
                                <SessionOpening
                                    patient={patientData}
                                    onComplete={handleSessionOpeningComplete}
                                    onBack={() => setViewState('tabs')}
                                />
                            )}
                            {viewState === 'protocolSelection' && (
                                <ProtocolSelection
                                    patient={patientData}
                                    onBack={() => setViewState(sessionOpeningData ? 'sessionOpening' : 'tabs')}
                                    onProtocolSelect={handleProtocolSelect}
                                />
                            )}
                            {viewState === 'treatmentExecution' && selectedProtocol && (
                                <TreatmentExecution
                                    protocol={selectedProtocol}
                                    problemId={selectedProblemId ?? ''}
                                    isSensitivityTest={isSensitivitySession}
                                    onRoundComplete={handleRoundComplete}
                                    onEndTreatment={handleEndTreatment}
                                    onBack={() => setViewState('protocolSelection')}
                                />
                            )}
                        </>
                    )}
                </div>

                {/* ── Bottom Bar (UX-8: hidden when not in tabs view) ───────── */}
                {showBottomBar && (
                    <div className={styles.bottomBar}>
                        <div className={styles.statusMessages}>
                            {saveStatus === 'saving' && (
                                <span className={styles.statusSaving}><T>Saving</T>...</span>
                            )}
                            {saveStatus === 'success' && (
                                <span className={styles.statusSuccess}><T>Saved successfully!</T></span>
                            )}
                            {saveStatus === 'error' && errorMessage && (
                                <span className={styles.statusError}><T>{errorMessage}</T></span>
                            )}
                        </div>
                        <div className={styles.bottomActions}>
                            {/* Update (UX-4: hidden on treatments tab) */}
                            {showUpdateButton && (
                                <button
                                    type="button"
                                    onClick={handleUpdate}
                                    disabled={saveStatus === 'saving'}
                                    className={styles.btnPrimary}
                                >
                                    {tUpdate}
                                </button>
                            )}

                            {/* Next Step → Done on last tab */}
                            {isLastTab ? (
                                <button
                                    type="button"
                                    onClick={isExistingPatient ? onClose : handleCompleteSubmission}
                                    disabled={saveStatus === 'saving'}
                                    className={styles.btnPrimary}
                                >
                                    {tDone}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleNextTab}
                                    className={styles.btnPrimary}
                                >
                                    {tNextStep}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Close guard (UX-2) ──────────────────────────────────────── */}
            <ConfirmationModal
                isOpen={showCloseGuard}
                title={<T>Unsaved Changes</T>}
                message={<T>You have unsaved changes. Are you sure you want to close without saving?</T>}
                onConfirm={() => { setShowCloseGuard(false); onClose(); }}
                onCancel={() => setShowCloseGuard(false)}
                showCancelButton
            />

            {/* ── Tab-click guard during treatment (UX-6) ─────────────────── */}
            <ConfirmationModal
                isOpen={showTreatmentGuard}
                title={<T>Terminate Treatment?</T>}
                message={<T>Are you sure you want to terminate the treatment without saving?</T>}
                onConfirm={() => {
                    setShowTreatmentGuard(false);
                    setViewState('tabs');
                    if (pendingTab) setActiveTab(pendingTab);
                    setPendingTab(null);
                }}
                onCancel={() => { setShowTreatmentGuard(false); setPendingTab(null); }}
                showCancelButton
            />
            {/* ── Abort Treatment guard (Start New Treatment click) ──────── */}
            <ConfirmationModal
                isOpen={showAbortTreatmentGuard}
                title={<T>Leave Treatment?</T>}
                message={<T>Are you sure you want to leave the current treatment? Any unsaved data will be lost.</T>}
                onConfirm={() => {
                    setShowAbortTreatmentGuard(false);
                    setRounds([]);
                    setSessionOpeningData(null);
                    setSelectedProtocol(null);
                    setViewState('sessionOpening');
                }}
                onCancel={() => setShowAbortTreatmentGuard(false)}
                showCancelButton
            />
            {/* ── Treatment Error guard ──────────────────────────────────── */}
            <ConfirmationModal
                isOpen={showTreatmentErrorGuard}
                title={<T>Update Failed</T>}
                message={<T>Update failed. Please notify the administrator.</T>}
                onConfirm={() => setShowTreatmentErrorGuard(false)}
                showCancelButton={false}
            />
        </div>
    );
};

export default PatientIntake;