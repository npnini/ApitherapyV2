import React, { useState, useEffect, useCallback, useRef } from 'react';
import PersonalDetails from './PersonalDetails';
import QuestionnaireStep from './QuestionnaireStep';
import TreatmentHistory from '../TreatmentHistory';
import { PatientData } from '../../types/patient';
import styles from './PatientIntake.module.css';
import { T, useT } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import ConsentTab, { ConsentTabHandle } from './ConsentTab';
import InstructionsTab, { InstructionsTabHandle } from './InstructionsTab';
import ProblemsProtocolsTab from './ProblemsProtocolsTab';
import MeasuresHistoryTab from './MeasuresHistoryTab';
import ProtocolSelection from '../ProtocolSelection';
import TreatmentExecution from '../TreatmentExecution';
import { Protocol } from '../../types/protocol';
import { VitalSigns } from '../../types/treatmentSession';

// ─── Tab key type ────────────────────────────────────────────────────────────
type TabKey =
    | 'personal'
    | 'questionnaire'
    | 'consent'
    | 'instructions'
    | 'problems'
    | 'treatments'
    | 'measures';

type ViewState = 'tabs' | 'protocolSelection' | 'treatmentExecution';

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

import { AppUser } from '../../types/user';

// ─── Props ────────────────────────────────────────────────────────────────────
interface PatientIntakeProps {
    patient: Partial<PatientData>;
    user: AppUser;
    onSave: (patientData: PatientData) => void;
    onUpdate: (patientData: PatientData) => void;
    onClose: () => void;          // renamed from onBack (UX-2)
    saveStatus: 'idle' | 'saving' | 'success' | 'error';
    errorMessage: string;
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
}) => {
    // ── State ─────────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<TabKey>('personal');
    const [viewState, setViewState] = useState<ViewState>('tabs');
    const [savedTabs, setSavedTabs] = useState<Set<TabKey>>(new Set());
    const [isDirty, setIsDirty] = useState(false);

    // Guard modal states
    const [showCloseGuard, setShowCloseGuard] = useState(false);       // UX-2
    const [showTreatmentGuard, setShowTreatmentGuard] = useState(false); // UX-6
    const [pendingTab, setPendingTab] = useState<TabKey | null>(null);
    const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
    const [preStingVitals, setPreStingVitals] = useState<VitalSigns | null>(null);
    const [patientReport, setPatientReport] = useState('');

    const consentTabRef = useRef<ConsentTabHandle>(null);
    const instructionsTabRef = useRef<InstructionsTabHandle>(null);

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
    const initializePatientData = (p: Partial<PatientData>): Partial<PatientData> => ({
        ...p,
        fullName: p.fullName ?? '',
        identityNumber: p.identityNumber ?? '',
        email: p.email ?? '',
        mobile: p.mobile ?? '',
        birthDate: p.birthDate ?? '',
        profession: p.profession ?? '',
        address: p.address ?? '',
        medicalRecord: p.medicalRecord ?? {},
        questionnaireResponse: p.questionnaireResponse ?? {},
    });

    const [patientData, setPatientData] = useState<Partial<PatientData>>(
        initializePatientData(patient)
    );
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

    useEffect(() => {
        const data = initializePatientData(patient);
        setPatientData(data);

        // Initialize savedTabs based on existing data
        const initialSaved = new Set<TabKey>();

        // 1. Personal Details
        if (data.fullName && data.identityNumber && data.mobile) {
            initialSaved.add('personal');
        }

        // 2. Questionnaire
        const qResponse = data.questionnaireResponse || {};
        const hasAnswers = Object.keys(qResponse).some(
            key => key !== 'domain' && key !== 'version' && key !== 'dateUpdated' && key !== 'signature' && qResponse[key] !== undefined
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

        // 5. Treatments (Check if patient has id, assuming existing patients have history)
        if (patient.id) {
            // In a real app, we'd check treatment count from an API call or another prop.
            // For now, if it's an existing patient, we can assume they have history or at least the tab is "ready"
            initialSaved.add('treatments');
        }

        setSavedTabs(initialSaved);
    }, [patient]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleDataChange = (data: Partial<PatientData>, isInternal: boolean = false) => {
        setPatientData(data);
        if (!isInternal) {
            setIsDirty(true);
        }
    };

    const markTabSaved = (tab: TabKey) => {
        setSavedTabs(prev => new Set(prev).add(tab));
        setIsDirty(false);
    };

    const handleUpdate = async () => {
        setHasAttemptedSubmit(true);
        let finalData = { ...patientData };

        if (activeTab === 'consent' && consentTabRef.current) {
            const signatureUrl = await consentTabRef.current.onSave();
            if (!signatureUrl) return; // ConsentTab handles validation/alerts

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
            if (!signatureUrl) return;

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

        await onUpdate(finalData as PatientData);
        markTabSaved(activeTab);
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

        await onSave(finalData as PatientData);
        markTabSaved(activeTab);
    };

    // Tab navigation: advance to next tab
    const handleNextTab = () => {
        const idx = TAB_ORDER.indexOf(activeTab);
        if (idx < TAB_ORDER.length - 1) {
            setActiveTab(TAB_ORDER[idx + 1]);
        }
    };

    // Tab click — guard if currently in treatment view (UX-6)
    const handleTabClick = (tab: TabKey) => {
        if (viewState !== 'tabs') {
            setPendingTab(tab);
            setShowTreatmentGuard(true);
            return;
        }
        setActiveTab(tab);
    };

    // Step 5: Start New Treatment
    const handleStartNewTreatment = () => {
        setViewState('protocolSelection');
    };

    const handleProtocolSelect = (protocol: Protocol, report: string, vitals: VitalSigns) => {
        setSelectedProtocol(protocol);
        setPatientReport(report);
        setPreStingVitals(vitals);
        setViewState('treatmentExecution');
    };

    const handleTreatmentSave = (treatmentData: any) => {
        // Implement treatment saving logic here (e.g., call onSave with full treatment object)
        console.log('Saving treatment:', treatmentData);
    };

    const handleTreatmentFinish = () => {
        setViewState('tabs');
        setActiveTab('treatments');
        setSelectedProtocol(null);
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
    const canStartTreatment = !!(patient.id && allFirstFiveSaved);

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
                return <ProblemsProtocolsTab />;
            case 'treatments':
                return (
                    <TreatmentHistory
                        patient={patientData as PatientData}
                        onBack={() => { }}
                        isTab={true}
                    />
                );
            case 'measures':
                return <MeasuresHistoryTab />;
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

    // UX-4: hide Update on Treatments History tab
    const showUpdateButton = activeTab !== 'treatments';

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>

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
                        onClick={() => setViewState('protocolSelection')}
                    >
                        {tStartNewTreatment}
                    </button>
                </div>

                {/* ── Content Area ──────────────────────────────────────────── */}
                <div className={styles.contentArea}>
                    {viewState === 'tabs' && renderTabContent()}
                    {viewState === 'protocolSelection' && (
                        <ProtocolSelection
                            patient={patientData as PatientData}
                            onBack={() => setViewState('tabs')}
                            onProtocolSelect={handleProtocolSelect}
                            isModal={true}
                        />
                    )}
                    {viewState === 'treatmentExecution' && selectedProtocol && (
                        <TreatmentExecution
                            patient={patientData as PatientData}
                            protocol={selectedProtocol}
                            onSave={handleTreatmentSave}
                            onBack={() => setViewState('protocolSelection')}
                            saveStatus={saveStatus === 'saving' ? 'saving' : 'idle'}
                            onFinish={handleTreatmentFinish}
                            isModal={true}
                        />
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
                                <span className={styles.statusError}>{errorMessage}</span>
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
                                isExistingPatient ? null : (
                                    <button
                                        type="button"
                                        onClick={handleCompleteSubmission}
                                        disabled={saveStatus === 'saving'}
                                        className={styles.btnPrimary}
                                    >
                                        {tDone}
                                    </button>
                                )
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
        </div>
    );
};

export default PatientIntake;