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
import ProblemsTab, { ProblemsTabHandle } from './ProblemsTab';
import { addMeasuredValueReading, saveTreatment, hasMeasuredValueReadings, getTreatmentCount, requestMissingProblem } from '../../firebase/patient';
import { getQuestionnaire } from '../../firebase/questionnaire';
import { Questionnaire } from '../../types/questionnaire';
import { evaluateGroupVisibility } from '../../utils/questionnaireUtils';
import MeasuresHistoryTab from './MeasuresHistoryTab';
import ProtocolSelection from '../ProtocolSelection';
import TreatmentExecution from '../TreatmentExecution';
import SessionOpening, { SessionOpeningData } from './SessionOpening';
import TreatmentFeedback from './TreatmentFeedback';
import FreeProtocolPointSelection from '../FreeProtocolPointSelection';
import PostStingScreen from '../PostStingScreen';
import { Protocol } from '../../types/protocol';
import { VitalSigns, TreatmentSession } from '../../types/treatmentSession';
import { StingPoint } from '../../types/apipuncture';
import { AppUser } from '../../types/user';
import { getLatestTreatment } from '../../firebase/patient';

// ─── Tab key type ────────────────────────────────────────────────────────────
type TabKey =
    | 'personal'
    | 'questionnaire'
    | 'consent'
    | 'instructions'
    | 'problems'
    | 'treatments'
    | 'measures';

type ViewState = 'tabs' | 'sessionOpening' | 'problemSelection' | 'freeSelection' | 'treatmentExecution' | 'treatmentFeedback' | 'postSting';

const TAB_ORDER: TabKey[] = [
    'personal',
    'questionnaire',
    'instructions',
    'consent',
    'problems',
    'treatments',
    'measures',
];

// The first 5 tabs must all be saved before "Start New Treatment" is enabled (UX-1)
const FIRST_FIVE: TabKey[] = ['personal', 'questionnaire', 'instructions', 'consent', 'problems'];

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
    onTreatmentComplete?: () => void;
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
    onTreatmentComplete,
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

    // Active problems from patient record for this session
    const activeProblems = patient.medicalRecord?.problems?.filter((p: any) => p.problemStatus === 'Active') || [];

    const [freeProtocolPoints, setFreeProtocolPoints] = useState<StingPoint[]>([]);
    const [usedProtocolIds, setUsedProtocolIds] = useState<string[]>([]);
    const [usedProblemIds, setUsedProblemIds] = useState<string[]>([]);
    const [isSensitivitySession, setIsSensitivitySession] = useState(false);
    const [accumulatedStungPointIds, setAccumulatedStungPointIds] = useState<string[]>([]);
    const [sessionIsSensitivityTest, setSessionIsSensitivityTest] = useState(false);
    const [freeProtocolUsed, setFreeProtocolUsed] = useState(false);
    const [showTreatmentSavedModal, setShowTreatmentSavedModal] = useState(false);

    const [appConfig, setAppConfig] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [treatmentSaveStatus, setTreatmentSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [treatmentErrorMessage, setTreatmentErrorMessage] = useState<string | null>(null);
    const [latestTreatment, setLatestTreatment] = useState<TreatmentSession | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [showExitGuard, setShowExitGuard] = useState(false);
    const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);

    // Feature Modals
    const [showMissingProblemSuccessModal, setShowMissingProblemSuccessModal] = useState(false);
    const [showMissingProblemErrorModal, setShowMissingProblemErrorModal] = useState(false);

    const consentTabRef = useRef<ConsentTabHandle>(null);
    const instructionsTabRef = useRef<InstructionsTabHandle>(null);
    const problemsTabRef = useRef<ProblemsTabHandle>(null);

    // Translation labels
    const tPersonal = useT('Personal Details');
    const tQuestionnaire = useT('Questionnaire');
    const tConsent = useT('Consent');
    const tInstructions = useT('Guidelines');
    const tProblems = useT('Problems');
    const tTreatments = useT('Treatments History');
    const tMeasures = useT('Measures History');
    const tStartNewTreatment = useT('Start New Treatment');
    const tUpdate = useT('Update');
    const tNextStep = useT('Next Step');
    const tDone = useT('Done');
    const tTreatmentFeedback = useT('Treatment Feedback');
    const tSaveError = useT('Failed to save signed document. Please check your connection and try again.');
    const tTreatmentSaved = useT('Treatment Saved');
    const tOK = useT('OK');
    const tRequestSuccess = useT('Request sent successfully. The administrator will look into it.');
    const tRequestFail = useT('Failed to send request. Point names may contains invalid characters or connection issue.');
    const tProblemDescriptionPrompt = useT('Please describe the problem you need to treat:');

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
        medicalRecord: p.medicalRecord ?? {},
        questionnaireResponse: p.questionnaireResponse,
    });

    const [patientData, setPatientData] = useState<Partial<JoinedPatientData>>(
        initializePatientData(patient)
    );
    const [tabsWithAttemptedSubmit, setTabsWithAttemptedSubmit] = useState<Set<TabKey>>(new Set());
    const [globalAttemptedSubmit, setGlobalAttemptedSubmit] = useState(false);

    useEffect(() => {
        const data = initializePatientData(patient);
        setPatientData(data);
        // Load questionnaire
        getQuestionnaire("apitherapy").then(q => {
            setQuestionnaire(q);
            if (q) {
                setPatientData(prev => {
                    const updatedQuestionnaireResponse = {
                        ...(prev.questionnaireResponse || {}),
                        domain: q.domain,
                        version: q.versionNumber
                    };
                    return { ...prev, questionnaireResponse: updatedQuestionnaireResponse as any };
                });
            }
        });

        // Load appConfig for sensitivity test settings
        getDoc(doc(db, 'cfg_app_config', 'main')).then(snap => {
            if (snap.exists()) setAppConfig(snap.data());
        }).catch(() => { /* non-critical */ });

        // Load latest treatment for feedback button visibility (UX-9)
        if (patient.id) {
            getLatestTreatment(patient.id).then(setLatestTreatment);
        } else {
            setLatestTreatment(null);
        }
    }, [patient]);

    // Auto-initialize sessionOpeningData if starting from dashboard (UX-1)
    useEffect(() => {
        if (initialViewState === 'sessionOpening' && !sessionOpeningData && patient.id) {
            setIsLoading(true);
            getTreatmentCount(patient.id).then(count => {
                setSessionOpeningData({
                    patientReport: '',
                    measureReadings: [],
                    preTreatmentVitals: {},
                    problems: patient.medicalRecord?.problems || [],
                    treatmentNumber: count + 1
                });
                setIsLoading(false);
            }).catch(err => {
                console.error("Error auto-initializing sessionOpeningData:", err);
                setIsLoading(false);
            });
        }
    }, [initialViewState, patient.id]);

    useEffect(() => {
        const checkSavedStatus = async () => {
            const data = patientData;
            const updatedSaved = new Set<TabKey>();

            // 1. Personal Details
            if (data.fullName && data.identityNumber && data.mobile) {
                updatedSaved.add('personal');
            }

            // 2. Questionnaire
            const qResponse = (data.questionnaireResponse || {}) as any;
            const hasAnswers = Object.keys(qResponse).some(
                key => key !== 'domain' && key !== 'version' && key !== 'signature' && key !== 'patientId' && key !== 'createdTimestamp' && key !== 'updatedTimestamp' && qResponse[key] !== undefined
            );
            if (hasAnswers) {
                updatedSaved.add('questionnaire');
            }

            // 3. Consent
            if (data.medicalRecord?.consentSignedUrl) {
                updatedSaved.add('consent');
            }

            // 4. Instructions
            if (data.medicalRecord?.treatmentInstructionsSignedUrl) {
                updatedSaved.add('instructions');
            }

            // 5. Problems & Protocols
            if (data.medicalRecord?.problems && data.medicalRecord.problems.length > 0) {
                updatedSaved.add('problems');
            }

            // 6. Treatments & 7. Measures (Keep current state if not changed by data)
            if (patient.id) {
                const treatmentCount = await getTreatmentCount(patient.id);
                if (treatmentCount > 0) {
                    updatedSaved.add('treatments');
                }
                const hasReadings = await hasMeasuredValueReadings(patient.id);
                if (hasReadings) {
                    updatedSaved.add('measures');
                }
            }

            setSavedTabs(updatedSaved);
        };

        checkSavedStatus();
    }, [patientData, patient.id]);

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

    const isTabValid = (tab: TabKey): boolean => {
        if (tab === 'personal') {
            const d = patientData;
            return !!(d.fullName?.trim() && d.identityNumber?.trim() && d.mobile?.trim() && d.birthDate && d.gender);
        }
        if (tab === 'questionnaire') {
            if (!questionnaire) return true;
            const qResponse = (patientData.questionnaireResponse || {}) as any;

            // Determine which groups are visible for this patient
            const visibleGroupIds = new Set(
                (questionnaire.groups || []).filter(g => evaluateGroupVisibility(g, patientData as any)).map(g => g.id)
            );

            // Only validate questions that are visible (no group, or group is visible)
            const visibleQuestions = questionnaire.questions.filter(
                q => !q.groupId || visibleGroupIds.has(q.groupId)
            );

            return visibleQuestions.every(q => {
                const answer = qResponse[q.name];
                if (q.type === 'boolean') {
                    return answer === true || answer === false;
                }
                if (q.required) {
                    return answer !== undefined && answer !== null && answer !== '';
                }
                return true;
            });
        }
        if (tab === 'problems') {
            return (patientData.medicalRecord?.problems?.length ?? 0) > 0;
        }
        return true;
    };

    const handleUpdate = async (): Promise<boolean> => {
        setTabsWithAttemptedSubmit(prev => new Set(prev).add(activeTab));
        if (!isTabValid(activeTab)) {
            console.log('PatientIntake: Validation failed for tab', activeTab);
            return false;
        }

        let finalData = { ...patientData };

        if (activeTab === 'consent' && consentTabRef.current) {
            try {
                const signatureUrl = await consentTabRef.current.onSave();
                if (!signatureUrl) return false;

                finalData = {
                    ...finalData,
                    medicalRecord: {
                        ...(finalData.medicalRecord || {}),
                        consentSignedUrl: signatureUrl
                    }
                };
                setPatientData(finalData);
            } catch (err) {
                console.error('Failed to save consent:', err);
                setShowTreatmentErrorGuard(true);
                setTreatmentErrorMessage(tSaveError);
                return false;
            }
        }

        if (activeTab === 'instructions' && instructionsTabRef.current) {
            try {
                const signatureUrl = await instructionsTabRef.current.onSave();
                if (!signatureUrl) return false;

                finalData = {
                    ...finalData,
                    medicalRecord: {
                        ...(finalData.medicalRecord || {}),
                        treatmentInstructionsSignedUrl: signatureUrl
                    }
                };
                setPatientData(finalData);
            } catch (err) {
                console.error('Failed to save guidelines:', err);
                setShowTreatmentErrorGuard(true);
                setTreatmentErrorMessage(tSaveError);
                return false;
            }
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
        setGlobalAttemptedSubmit(true);

        const mandatoryTabs: TabKey[] = ['personal', 'questionnaire', 'instructions', 'consent', 'problems'];
        const firstInvalidTab = mandatoryTabs.find(tab => !isTabValid(tab));

        if (firstInvalidTab) {
            console.log('PatientIntake: Validation failed for registration on tab', firstInvalidTab);
            setActiveTab(firstInvalidTab); // Direct user to the first error
            return;
        }

        let finalData = { ...patientData };

        if (activeTab === 'consent' && consentTabRef.current) {
            const signatureUrl = await consentTabRef.current.onSave();
            if (!signatureUrl) return;

            finalData = {
                ...finalData,
                medicalRecord: {
                    ...(finalData.medicalRecord || {}),
                    consentSignedUrl: signatureUrl
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
        // If we are on a mandatory tab, or if isDirty,
        // we should attempt to update/validate before moving.
        if (FIRST_FIVE.includes(activeTab) || isDirty) {
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
    const handleStartNewTreatment = async () => {
        if (viewState !== 'tabs' && isDirty) {
            setShowAbortTreatmentGuard(true);
            return;
        }

        setIsLoading(true);
        let nextTreatmentNumber = 1;
        try {
            if (patient.id) {
                const count = await getTreatmentCount(patient.id);
                nextTreatmentNumber = count + 1;
            }
        } catch (err) {
            console.error("Error fetching treatment count:", err);
        }

        // Reset session accumulation state
        setSessionOpeningData({
            patientReport: '',
            measureReadings: [],
            preTreatmentVitals: {},
            problems: patientData.medicalRecord?.problems || [],
            treatmentNumber: nextTreatmentNumber
        });
        setSelectedProtocol(null);
        setSelectedProblemId(null);
        setIsSensitivitySession(false);
        setFreeProtocolPoints([]);
        setTreatmentSaveStatus('idle');
        setLastSavedAt(null);
        setUsedProblemIds([]);
        setUsedProtocolIds([]);
        setAccumulatedStungPointIds([]);
        setIsLoading(false);
        setViewState('sessionOpening');
    };


    const handleSessionOpeningComplete = async (data: SessionOpeningData) => {
        if (!patient.id) return;

        // UX-1: Use sequence-based ID if new, or reuse existing if resuming
        let generatedTreatmentId = data.generatedTreatmentId;
        let treatmentNumber = data.treatmentNumber;
        const count = await getTreatmentCount(patient.id);

        if (!generatedTreatmentId) {
            treatmentNumber = count + 1;
            generatedTreatmentId = `${patient.id}_${treatmentNumber}`;
        }

        let preTreatmentMeasureReadingId: string | undefined = undefined;
        // Write measure reading if any values entered
        if (data.measureReadings.length > 0) {
            try {
                // UX-2: Derive stable ID for this reading
                const readingDocId = `${generatedTreatmentId}_pre`;
                preTreatmentMeasureReadingId = await addMeasuredValueReading(patient.id, {
                    patientId: patient.id,
                    treatmentId: generatedTreatmentId,
                    readings: data.measureReadings,
                    usedMeasureIds: data.usedMeasureIds,
                    note: data.patientReport,
                }, readingDocId);
            } catch (err) {
                console.error('Failed to write measure reading:', err);
            }
        }
        setSessionOpeningData({ ...data, preTreatmentMeasureReadingId, generatedTreatmentId, treatmentNumber });
        console.log('PatientIntake: Session opening complete', { preTreatmentMeasureReadingId, generatedTreatmentId, treatmentNumber });

        // Fetch live config to avoid race condition where appConfig state may not yet be loaded
        let liveConfig: any = null;
        try {
            const configSnap = await getDoc(doc(db, 'cfg_app_config', 'main'));
            if (configSnap.exists()) liveConfig = configSnap.data();
        } catch { /* non-critical */ }
        const sensitivityThreshold = liveConfig?.treatmentSettings?.initialSensitivityTestTreatments ?? 0;
        const sensitivityProtocolId = liveConfig?.treatmentSettings?.sensitivityProtocolIdentifier;

        // Save (or update) initial incomplete draft to DB
        try {
            await saveTreatment(patient.id, {
                status: 'Incomplete',
                patientId: patient.id,
                caretakerId: user.uid,
                patientReport: data.patientReport,
                preTreatmentVitals: data.preTreatmentVitals,
                preTreatmentImage: data.preTreatmentImage,
                preTreatmentMeasureReadingId,
                isSensitivityTest: count < sensitivityThreshold, // Use < here because count was before this treatment if it's new? 
                treatmentNumber: treatmentNumber,
                protocolIds: [],
                problemIds: [],
                stungPointIds: [],
            }, generatedTreatmentId);
            setLastSavedAt(new Date());
        } catch (err) {
            console.error('Failed to save initial draft:', err);
        }

        if (sensitivityProtocolId && count < sensitivityThreshold) {
            // Load the sensitivity protocol from Firestore
            try {
                const protSnap = await getDoc(doc(db, 'cfg_protocols', sensitivityProtocolId));
                if (protSnap.exists()) {
                    const sensitivityProtocol = { ...protSnap.data(), id: protSnap.id } as Protocol;
                    setSelectedProtocol(sensitivityProtocol);
                    setSelectedProblemId(''); // Empty string for sensitivity
                    setIsSensitivitySession(true);
                    setSessionIsSensitivityTest(true);
                    setUsedProblemIds([]);
                    setUsedProtocolIds([sensitivityProtocol.id]);
                    setFreeProtocolUsed(false);
                    setAccumulatedStungPointIds([]);
                    setViewState('treatmentExecution');
                    return;
                }
            } catch (err) {
                console.error('Failed to load sensitivity protocol:', err);
            }
        }

        // Not sensitivity -> Jump to problem selection
        setViewState('problemSelection');
    };


    const handleProtocolSelect = async (protocolId: string | null, problemId: string | null) => {
        if (!protocolId) {
            // Free selection path
            setFreeProtocolUsed(true);
            const freeProtoId = appConfig?.treatmentSettings?.freeProtocolIdentifier;
            if (freeProtoId) {
                setUsedProtocolIds(prev => [...new Set([...prev, freeProtoId])]);
            }
            setViewState('freeSelection');
            setSelectedProblemId(null);
            setSelectedProtocol(null);
            return;
        }

        setIsLoading(true);
        try {
            const snap = await getDoc(doc(db, 'cfg_protocols', protocolId));
            if (snap.exists()) {
                setSelectedProtocol({ id: snap.id, ...snap.data() } as Protocol);
                setSelectedProblemId(problemId);

                // Track selected problem
                if (problemId) {
                    setUsedProblemIds(prev => [...new Set([...prev, problemId])]);
                }

                setViewState('treatmentExecution');
            }
        } catch (error) {
            console.error('Error loading protocol:', error);
            setTreatmentErrorMessage(error instanceof Error ? error.message : 'Failed to load protocol');
            setShowTreatmentErrorGuard(true);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFreePointsSelected = (points: StingPoint[]) => {
        setFreeProtocolPoints(points);
        setSelectedProtocol(null); // Signal it's free selection
        setSelectedProblemId(null);
        setViewState('treatmentExecution');
    };

    const handleRoundComplete = async (roundStungPointIds: string[]) => {
        // Called when user clicks "Another Protocol"
        if (!patient.id || !sessionOpeningData) return;

        try {
            // Buffer the points from this round
            setAccumulatedStungPointIds(prev => [...new Set([...prev, ...roundStungPointIds])]);

            // Track protocols used
            if (selectedProtocol) {
                setUsedProtocolIds(prev => [...new Set([...prev, selectedProtocol.id])]);
            }

            // Return to problem selection for next protocol
            setViewState('problemSelection');
        } catch (error) {
            console.error('Error transitioning to secondary protocol:', error);
            setTreatmentErrorMessage(error instanceof Error ? error.message : 'Failed to transition to secondary protocol');
            setShowTreatmentErrorGuard(true);
        }
    };

    const handleNextFromStinging = (roundStungPointIds: string[]) => {
        // Called when user clicks "Next Step" in TreatmentExecution
        setAccumulatedStungPointIds(prev => [...new Set([...prev, ...roundStungPointIds])]);

        if (selectedProtocol) {
            setUsedProtocolIds(prev => [...new Set([...prev, selectedProtocol.id])]);
        }

        // Screen 3/4 -> Screen 5
        setViewState('postSting');
    };

    const handlePostStingFinish = async (data: {
        postTreatmentVitals: Partial<VitalSigns>,
        finalVitals: Partial<VitalSigns>,
        finalNotes: string
    }) => {
        if (!patient.id || !sessionOpeningData) return;
        setTreatmentSaveStatus('saving');
        setTreatmentErrorMessage(null);

        try {
            await saveTreatment(patient.id, {
                status: data.finalVitals && Object.keys(data.finalVitals).length > 0 ? 'Completed' : 'Incomplete',
                patientId: patient.id,
                caretakerId: user.uid,
                patientReport: sessionOpeningData.patientReport,
                preTreatmentVitals: sessionOpeningData.preTreatmentVitals,
                preTreatmentImage: sessionOpeningData.preTreatmentImage,
                preTreatmentMeasureReadingId: sessionOpeningData.preTreatmentMeasureReadingId,
                isSensitivityTest: sessionIsSensitivityTest,
                protocolIds: usedProtocolIds,
                problemIds: usedProblemIds,
                stungPointIds: accumulatedStungPointIds,
                postStingingVitals: data.postTreatmentVitals,
                finalVitals: data.finalVitals,
                finalNotes: data.finalNotes,
                freeProtocolUsed: freeProtocolUsed,
            }, sessionOpeningData.generatedTreatmentId);

            setTreatmentSaveStatus('success');
            setIsDirty(false);
            setSessionOpeningData(null);
            setAccumulatedStungPointIds([]);
            setUsedProtocolIds([]);
            setUsedProblemIds([]);
            setLastSavedAt(null);
            setSessionIsSensitivityTest(false);

            setLatestTreatment({
                id: sessionOpeningData.generatedTreatmentId,
                status: data.finalVitals && Object.keys(data.finalVitals).length > 0 ? 'Completed' : 'Incomplete',
                patientId: patient.id,
                caretakerId: user.uid,
                protocolIds: usedProtocolIds,
                problemIds: usedProblemIds,
                stungPointIds: accumulatedStungPointIds,
                createdTimestamp: Date.now(),
                patientReport: sessionOpeningData.patientReport,
                finalNotes: data.finalNotes,
                treatmentNumber: sessionOpeningData.treatmentNumber,
            } as any);

            setShowTreatmentSavedModal(true);
            if (onTreatmentComplete) onTreatmentComplete();
        } catch (error) {
            console.error('Error saving final treatment:', error);
            setTreatmentSaveStatus('error');
            setTreatmentErrorMessage(error instanceof Error ? error.message : 'Failed to save treatment');
            setShowTreatmentErrorGuard(true);
        }
    };

    const handleExitIncomplete = async (currentData?: any) => {
        if (currentData && !currentData.nativeEvent && patient.id) {
            setIsLoading(true);
            try {
                // UX-1: Use sequence-based ID if new, or reuse existing if resuming
                const count = await getTreatmentCount(patient.id);
                const treatmentId = currentData.generatedTreatmentId || `${patient.id}_${count + 1}`;
                const treatmentNumber = currentData.treatmentNumber || (count + 1);

                const sensitivityThreshold = appConfig?.treatmentSettings?.initialSensitivityTestTreatments ?? 0;

                let preTreatmentMeasureReadingId = undefined;
                if (currentData.measureReadings && currentData.measureReadings.length > 0) {
                    // UX-2: Derive stable ID for this reading
                    const readingDocId = `${treatmentId}_pre`;
                    preTreatmentMeasureReadingId = await addMeasuredValueReading(patient.id, {
                        patientId: patient.id,
                        treatmentId: treatmentId,
                        readings: currentData.measureReadings.map((r: any) => ({
                            measureId: r.measureId,
                            value: r.value
                        })),
                        usedMeasureIds: currentData.usedMeasureIds || [],
                        note: currentData.patientReport,
                    }, readingDocId);
                }

                await saveTreatment(patient.id, {
                    status: 'Incomplete',
                    patientId: patient.id,
                    caretakerId: user.uid,
                    patientReport: currentData.patientReport || '',
                    preTreatmentVitals: currentData.preTreatmentVitals || {},
                    preTreatmentImage: currentData.preTreatmentImage,
                    preTreatmentMeasureReadingId,
                    isSensitivityTest: count < sensitivityThreshold,
                    treatmentNumber,
                    protocolIds: [],
                    problemIds: [],
                    stungPointIds: [],
                    freeProtocolUsed: false, // initial draft
                }, treatmentId);
            } catch (e) {
                console.error('Failed to sync before exit', e);
            }
            setIsLoading(false);

            // Bypass modal, directly exit
            setShowExitGuard(false);
            setSessionOpeningData(null);
            setSelectedProtocol(null);
            setSelectedProblemId(null);
            setIsSensitivitySession(false);
            setFreeProtocolPoints([]);
            setTreatmentSaveStatus('idle');
            setLastSavedAt(null);
            setUsedProblemIds([]);
            setUsedProtocolIds([]);
            setAccumulatedStungPointIds([]);
            setFreeProtocolUsed(false);
            setViewState('tabs');
            return;
        }

        setShowExitGuard(true);
    };

    const confirmExit = async () => {
        if (sessionOpeningData && patient.id) {
            setIsLoading(true);
            try {
                await saveTreatment(patient.id, {
                    status: 'Incomplete',
                    patientId: patient.id,
                    caretakerId: user.uid,
                    patientReport: sessionOpeningData.patientReport,
                    preTreatmentVitals: sessionOpeningData.preTreatmentVitals,
                    preTreatmentImage: sessionOpeningData.preTreatmentImage,
                    preTreatmentMeasureReadingId: sessionOpeningData.preTreatmentMeasureReadingId,
                    isSensitivityTest: sessionIsSensitivityTest,
                    protocolIds: usedProtocolIds,
                    problemIds: usedProblemIds,
                    stungPointIds: accumulatedStungPointIds,
                    freeProtocolUsed: freeProtocolUsed,
                }, sessionOpeningData.generatedTreatmentId);
            } catch (err) {
                console.error('Failed to sync before exit', err);
            }
            setIsLoading(false);
        }
        setShowExitGuard(false);
        setSessionOpeningData(null);
        setSelectedProtocol(null);
        setSelectedProblemId(null);
        setIsSensitivitySession(false);
        setFreeProtocolPoints([]);
        setTreatmentSaveStatus('idle');
        setLastSavedAt(null);
        setUsedProblemIds([]);
        setUsedProtocolIds([]);
        setAccumulatedStungPointIds([]);
        setFreeProtocolUsed(false);
        setViewState('tabs');
    };

    const handleResumeTreatment = async (treatment: any) => {
        setIsLoading(true);
        let measureReadings: Array<{ measureId: string; value: string | number }> = [];

        // If treatment already has hydrated measuredValues (from HistoryTab), use them.
        // Otherwise (from Dashboard), fetch them using the ID.
        if (treatment.measuredValues && Array.isArray(treatment.measuredValues)) {
            measureReadings = treatment.measuredValues.map((mv: any) => ({
                measureId: mv.measureId,
                value: mv.value
            }));
        } else if (treatment.preTreatmentMeasureReadingId) {
            try {
                const readingSnap = await getDoc(doc(db, 'measured_values', treatment.preTreatmentMeasureReadingId));
                if (readingSnap.exists()) {
                    const data = readingSnap.data();
                    measureReadings = (data.readings || []).map((r: any) => ({
                        measureId: r.measureId,
                        value: r.value
                    }));
                }
            } catch (err) {
                console.error('Failed to fetch measure reading for resume:', err);
            }
        }

        setSessionOpeningData({
            generatedTreatmentId: treatment.id,
            patientReport: treatment.patientReport || '',
            preTreatmentVitals: treatment.preTreatmentVitals || {},
            preTreatmentImage: treatment.preTreatmentImage,
            preTreatmentMeasureReadingId: treatment.preTreatmentMeasureReadingId,
            usedMeasureIds: [],
            measureReadings,
            problems: patientData.medicalRecord?.problems || [],
            treatmentNumber: treatment.treatmentNumber
        });
        setUsedProtocolIds(treatment.protocolIds || (treatment.protocolId ? [treatment.protocolId] : []));
        setUsedProblemIds(treatment.problemIds || (treatment.problemId ? [treatment.problemId] : []));
        setAccumulatedStungPointIds(treatment.stungPointIds || []);
        setIsSensitivitySession(treatment.isSensitivityTest || false);
        setFreeProtocolUsed(treatment.freeProtocolUsed || false);
        setIsLoading(false);
        setViewState('sessionOpening');
    };

    const handleRequestMissingProblem = async (problemName: string) => {
        try {
            if (!patient.id) throw new Error("Missing patient ID");
            await requestMissingProblem(problemName, patient.id);
            setShowMissingProblemSuccessModal(true);
        } catch (error) {
            console.error('Error requesting missing problem:', error);
            setShowMissingProblemErrorModal(true);
        }
    };

    const handleConfirmSaved = () => {
        setShowTreatmentSavedModal(false);
        setActiveTab('personal');
        setViewState('tabs');
    };

    const handleFeedbackComplete = () => {
        setViewState('tabs');
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
                        showErrors={globalAttemptedSubmit || tabsWithAttemptedSubmit.has('personal')}
                    />
                );
            case 'questionnaire':
                return (
                    <QuestionnaireStep
                        patientData={patientData}
                        onDataChange={handleDataChange}
                        showErrors={globalAttemptedSubmit || tabsWithAttemptedSubmit.has('questionnaire')}
                        questionnaire={questionnaire}
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
                return <ProblemsTab
                    ref={problemsTabRef}
                    patientData={patientData as JoinedPatientData}
                    onDataChange={handleDataChange}
                />;
            case 'treatments':
                return (
                    <TreatmentHistory
                        patient={patientData as JoinedPatientData}
                        onBack={() => { }}
                        isTab={true}
                        onResumeTreatment={handleResumeTreatment}
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
    const headerTitle = viewState === 'treatmentFeedback'
        ? tTreatmentFeedback
        : isExistingPatient
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

                    {viewState === 'tabs' && (
                        <div className={styles.tabActions}>
                            {/* Start New Treatment (UX-1) */}
                            <button
                                type="button"
                                className={styles.startTreatmentButton}
                                disabled={!canStartTreatment}
                                onClick={handleStartNewTreatment}
                            >
                                {tStartNewTreatment}
                            </button>

                            {/* Treatment Feedback (UX-9) */}
                            {latestTreatment && (latestTreatment.status === 'Incomplete' || !latestTreatment.patientFeedbackMeasureReadingId) && (
                                <button
                                    type="button"
                                    className={styles.resumeTreatmentButton}
                                    onClick={() => {
                                        if (latestTreatment.status === 'Incomplete') {
                                            handleResumeTreatment(latestTreatment);
                                        } else {
                                            setViewState('treatmentFeedback');
                                        }
                                    }}
                                >
                                    {latestTreatment.status === 'Incomplete' ? <T>Resume Treatment</T> : tTreatmentFeedback}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Treatment Stepper (UX-A) ──────────────────────────── */}
                {viewState !== 'tabs' && viewState !== 'treatmentFeedback' && (
                    <div className={styles.treatmentStepper}>
                        <div className={styles.stepperSteps}>
                            {[
                                { id: 'sessionOpening', label: 'Session Opening' },
                                { id: 'problemSelection', label: 'Protocol' },
                                { id: 'treatmentExecution', label: 'Execution' },
                                { id: 'freeSelection', label: 'Free Selection' },
                                { id: 'postSting', label: 'Post-Sting' },
                            ].map((step, idx) => (
                                <div
                                    key={step.id}
                                    className={`${styles.stepItem} ${viewState === step.id ? styles.stepActive : ''}`}
                                >
                                    <span className={styles.stepNum}>{idx + 1}</span>
                                    <span className={styles.stepLabel}><T>{step.label}</T></span>
                                </div>
                            ))}
                        </div>

                        <div className={styles.stepperRight}>
                            {sessionOpeningData?.treatmentNumber && (
                                <div className={styles.treatmentNumIndicator}>
                                    <T>Treatment</T> - {sessionOpeningData.treatmentNumber}
                                </div>
                            )}
                            {lastSavedAt && (
                                <div className={styles.draftIndicator}>
                                    <T>Draft saved</T> {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Content Area ──────────────────────────────────────────── */}
                <div className={`${styles.contentArea} ${viewState !== 'tabs' ? styles.contentAreaFlow : ''}`}>
                    {viewState === 'tabs' && renderTabContent()}

                    {viewState !== 'tabs' && (
                        <div key={viewState} className={styles.slideIn}>
                            {viewState === 'sessionOpening' && (
                                <SessionOpening
                                    patient={patientData}
                                    initialData={sessionOpeningData === null ? undefined : sessionOpeningData}
                                    onComplete={handleSessionOpeningComplete}
                                    onBack={() => setViewState('tabs')}
                                    onExit={handleExitIncomplete}
                                />
                            )}
                            {viewState === 'problemSelection' && (
                                <ProtocolSelection
                                    problems={(sessionOpeningData?.problems ?? patientData.medicalRecord?.problems ?? []).filter((p: any) => p.problemStatus === 'Active')}
                                    onBack={() => setViewState(sessionOpeningData ? 'sessionOpening' : 'tabs')}
                                    onProtocolSelect={(protocolId, problemId) => handleProtocolSelect(protocolId, problemId)}
                                    onFreeSelect={() => handleProtocolSelect(null, null)}
                                    onExit={handleExitIncomplete}
                                    onRequestMissingProblem={handleRequestMissingProblem}
                                />
                            )}
                            {viewState === 'treatmentExecution' && (
                                <TreatmentExecution
                                    protocol={selectedProtocol!}
                                    isSensitivityTest={sessionIsSensitivityTest}
                                    accumulatedStungPointIds={accumulatedStungPointIds}
                                    onRoundComplete={handleRoundComplete}
                                    onNext={handleNextFromStinging}
                                    onBack={() => setViewState(isSensitivitySession ? 'sessionOpening' : 'problemSelection')}
                                    preferredModel={user.preferredModel}
                                    customPoints={freeProtocolPoints}
                                    canGoToAnother={!!selectedProtocol} // Can only select another linked protocol if not in free selection
                                    onExit={handleExitIncomplete}
                                />
                            )}
                            {viewState === 'freeSelection' && (
                                <FreeProtocolPointSelection
                                    onBack={() => setViewState('problemSelection')}
                                    onPointsSelected={handleFreePointsSelected}
                                    onExit={handleExitIncomplete}
                                />
                            )}
                            {viewState === 'postSting' && (
                                <PostStingScreen
                                    stungPointIds={accumulatedStungPointIds}
                                    protocolIds={usedProtocolIds}
                                    onBack={() => setViewState('treatmentExecution')}
                                    onFinish={handlePostStingFinish}
                                    onExit={handleExitIncomplete}
                                />
                            )}
                            {viewState === 'treatmentFeedback' && (latestTreatment || sessionOpeningData) && (
                                <TreatmentFeedback
                                    patient={patientData as JoinedPatientData}
                                    treatment={latestTreatment || ({
                                        ...sessionOpeningData!.preTreatmentVitals,
                                        id: sessionOpeningData!.generatedTreatmentId,
                                        patientId: patient.id,
                                        caretakerId: user.uid,
                                        createdTimestamp: Date.now(),
                                        status: 'Completed',
                                        stungPointIds: accumulatedStungPointIds,
                                        protocolIds: usedProtocolIds,
                                        problemIds: usedProblemIds,
                                    } as any)}
                                    onComplete={handleFeedbackComplete}
                                    onBack={handleFeedbackComplete}
                                />
                            )}
                        </div>
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

            {/* ── Exit Treatment guard ────────────────────────────────────── */}
            <ConfirmationModal
                isOpen={showExitGuard}
                title={<T>Exit Treatment?</T>}
                message={<T>Are you sure you want to pause this treatment and exit? Your progress so far will be saved as incomplete.</T>}
                onConfirm={confirmExit}
                onCancel={() => setShowExitGuard(false)}
                showCancelButton
            />


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

            {/* ── Treatment Saved Modal ──────────────────────────────────── */}
            <ConfirmationModal
                isOpen={showTreatmentSavedModal}
                title={tTreatmentSaved}
                message={tTreatmentSaved}
                confirmLabel={tOK}
                onConfirm={handleConfirmSaved}
                showCancelButton={false}
            />

            {/* ── Missing Problem Modals ─────────────────────────────────── */}
            <ConfirmationModal
                isOpen={showMissingProblemSuccessModal}
                title={<T>Request Sent</T>}
                message={<T>Request sent successfully. The administrator will look into it.</T>}
                confirmLabel={<T>OK</T>}
                onConfirm={() => setShowMissingProblemSuccessModal(false)}
                showCancelButton={false}
            />
            <ConfirmationModal
                isOpen={showMissingProblemErrorModal}
                title={<T>Error</T>}
                message={<T>Failed to send request. Point names may contains invalid characters or connection issue.</T>}
                confirmLabel={<T>OK</T>}
                onConfirm={() => setShowMissingProblemErrorModal(false)}
                showCancelButton={false}
            />
        </div >
    );
};

export default PatientIntake;
