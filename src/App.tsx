import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from './utils/logger';

import { TranslationProvider, useTranslationContext, T, useT } from './components/T';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where, getDoc, addDoc, updateDoc, DocumentSnapshot, DocumentData, orderBy, limit, increment } from 'firebase/firestore';
import Login from './components/Login';
import PatientsDashboard from './components/PatientsDashboard';
import Sidebar from './components/Sidebar';
import ProtocolAdmin from './components/ProtocolAdmin';
import PointsAdmin from './components/PointsAdmin';
import MeasureAdmin from './components/MeasureAdmin/MeasureAdmin';
import PointGroupAdmin from './components/PointGroupAdmin/PointGroupAdmin';
import ProblemAdmin from './components/ProblemAdmin/ProblemAdmin';
import QuestionnaireAdmin from './components/QuestionnaireAdmin/QuestionnaireAdmin';
import ProtocolSelection from './components/ProtocolSelection';
import TreatmentExecution from './components/TreatmentExecution';
import TreatmentHistory from './components/TreatmentHistory';
import UserDetails from './components/UserDetails';
import ApplicationSettings from './components/ApplicationSettings';
import BodyModelTuner from './components/BodyModelTuner';
import PointSideAnalysis from './components/PointSideAnalysis';
import UserManagement from './components/UserManagement';
import ActivityLog from './components/ActivityLog';
import TreatmentEffectiveness from './components/DataAnalysis/TreatmentEffectiveness';
import CalendarPage from './components/Appointments/CalendarPage';
import TodayPage from './components/Appointments/TodayPage';
import { useTodayAppointments } from './hooks/useTodayAppointments';
import { JoinedPatientData, MedicalData, QuestionnaireResponse } from './types/patient';
import { savePatient, saveMedicalData, addQuestionnaireResponse, addMeasuredValueReading, saveTreatment, getLatestTreatment } from './firebase/patient';
import { AppUser } from './types/user';
import { getEffectiveAppointmentPrefs } from './utils/appointments/prefs';
import { Protocol } from './types/protocol';
import { TreatmentSession, VitalSigns } from './types/treatmentSession';
import { logout } from './services/authService';
import { logAction } from './services/auditLogService';
import PatientIntake from './components/PatientIntake/PatientIntake';
import FeedbackStandaloneView from './components/PatientIntake/FeedbackStandaloneView';
import Modal from './components/common/Modal';
import ConfirmationModal from './components/ConfirmationModal';
import { countPatientTreatments, hasTreatmentToday } from './services/appointmentService';
import './globals.css';

type View = 'dashboard' | 'patient_intake' | 'protocol_selection' | 'treatment_execution' | 'admin_protocols' | 'admin_points' | 'admin_point_groups' | 'admin_body_model' | 'point_side_analysis' | 'admin_measures' | 'admin_problems' | 'admin_questionnaires' | 'admin_users' | 'treatment_history' | 'user_details' | 'onboarding_test' | 'data_analysis' | 'activity_log' | 'appointments_today' | 'appointments_calendar';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

const AppInner: React.FC = () => {
    const { language, setLanguage, direction } = useTranslationContext();
    const tMyProfile = useT('My Profile');
    const tAppSettings = useT('Application Settings');
    const tTreatmentEffectiveness = useT('Treatment Effectiveness');
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<JoinedPatientData[]>([]);
    // Treatments recorded per patient id (patient list "Progress"); kept apart from the patient data it is saved from.
    const [treatmentCounts, setTreatmentCounts] = useState<Record<string, number>>({});
    const [selectedPatient, setSelectedPatient] = useState<Partial<JoinedPatientData> | null>(null);
    const [activeProtocol, setActiveProtocol] = useState<Protocol | null>(null);
    const [activeTreatmentSession, setActiveTreatmentSession] = useState<Partial<TreatmentSession> | null>(null);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [viewAsCaretakerId, setViewAsCaretakerId] = useState<string | null>(null);
    const [impersonatedUser, setImpersonatedUser] = useState<AppUser | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [authReady, setAuthReady] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [appConfig, setAppConfig] = useState<any>(null);
    const [intakeInitialViewState, setIntakeInitialViewState] = useState<'tabs' | 'sessionOpening'>('tabs');
    const [intakeInitialTab, setIntakeInitialTab] = useState<any>('personal');
    // Appointments tab → Calendar and back (plan §1.5): the week to open, and the patient to return to.
    const [calendarFocusDate, setCalendarFocusDate] = useState<Date | null>(null);
    const [calendarReturnPatient, setCalendarReturnPatient] = useState<Partial<JoinedPatientData> | null>(null);
    // Start Treatment for a patient who already had one today: waits for "Start another one?".
    const [sameDayStartPatient, setSameDayStartPatient] = useState<JoinedPatientData | null>(null);
    // Where closing the intake returns to: Today when it was opened from there (Step 6).
    const [intakeReturnView, setIntakeReturnView] = useState<View | null>(null);
    // Today's appointments of the viewed caretaker, live: the Today page and its sidebar badge.
    const todayAppointments = useTodayAppointments(appUser ? (viewAsCaretakerId || appUser.uid) : undefined);
    // Landing rule (spec §5) is applied once per login, after the first patient load.
    const landedRef = useRef(false);

    useEffect(() => {
        document.documentElement.dir = direction;
    }, [direction]);

    useEffect(() => {
        if (!appUser) return;

        const fetchAppConfig = async () => {
            try {
                const configDocRef = doc(db, 'cfg_app_config', 'main');
                const configDocSnap = await getDoc(configDocRef);
                if (configDocSnap.exists()) {
                    setAppConfig(configDocSnap.data());
                } else {
                    setAppConfig({}); // Fallback if it doesn't exist
                }
            } catch (err) {
                logger.error("Config fetch failed:", err);
                setAppConfig({}); // Fallback so the app doesn't freeze forever
            }
        };
        fetchAppConfig();
    }, [appUser]);

    const fetchUserData = async (user: User): Promise<AppUser> => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            return { uid: user.uid, ...userSnap.data() } as AppUser;
        } else {
            // App config is not loaded yet at this point (it waits for appUser), so read it here
            // to copy the current appointment defaults into the new user.
            let configData: any = {};
            try {
                const configSnap = await getDoc(doc(db, 'cfg_app_config', 'main'));
                if (configSnap.exists()) configData = configSnap.data();
            } catch (err) {
                logger.error("Config fetch for new user defaults failed:", err);
            }
            const email = user.email || '';
            const newUser: AppUser = {
                uid: user.uid, email, fullName: user.displayName || 'New User', displayName: user.displayName || 'New User', mobile: '', role: 'caretaker',
                appointmentPrefs: getEffectiveAppointmentPrefs({ email }, configData),
            };
            const { uid, ...userDataToSave } = newUser;
            await setDoc(userRef, userDataToSave);
            setCurrentView('onboarding_test');
            return newUser;
        }
    };

    const fetchInitialData = useCallback(async (user: AppUser, targetCaretakerId?: string) => {
        if (!user || !user.uid || !appConfig) return;
        const effectiveCaretakerId = targetCaretakerId || user.uid;
        setIsLoading(true);
        try {
            const protocolsQuery = query(collection(db, 'cfg_protocols'));
            const problemsQuery = query(collection(db, 'cfg_problems'));
            const measuresQuery = query(collection(db, 'cfg_measures'));
            const questionnairesQuery = query(collection(db, 'cfg_questionnaires'));
            // 1. Fetch PII from 'patients'
            const patientQuery = query(collection(db, "patients"), where("caretakerId", "==", effectiveCaretakerId));
            const patientQuerySnapshot = await getDocs(patientQuery);

            const dashboardConfig = appConfig.patientDashboard || {};
            const domain = dashboardConfig.domain;
            const conditionKey = dashboardConfig.conditionQuestion;
            const severityKey = dashboardConfig.severityQuestion;

            const patientsDataPromises = patientQuerySnapshot.docs.map(async (patientDoc) => {
                const pii = { id: patientDoc.id, ...patientDoc.data() } as JoinedPatientData;

                // 2. Fetch Singleton Medical Data
                const medicalDataRef = doc(db, 'patient_medical_data', patientDoc.id);
                const medicalDataSnap = await getDoc(medicalDataRef);
                const medicalData = medicalDataSnap.exists() ? medicalDataSnap.data() as MedicalData : {} as MedicalData;

                // Fallback for missing lastTreatment date if any previous sessions exist
                if (!medicalData.lastTreatment) {
                    const latest = await getLatestTreatment(patientDoc.id);
                    if (latest && latest.createdTimestamp) {
                        const ts = latest.createdTimestamp;
                        if (ts && typeof ts.toDate === 'function') {
                            medicalData.lastTreatment = ts.toDate().toISOString();
                        } else if (ts) {
                            medicalData.lastTreatment = new Date(ts).toISOString();
                        }
                    }
                }

                // 3. Fetch Latest Questionnaire Response (for dashboard summary)
                let condition = 'N/A';
                let severity = 'N/A';
                let latestQuestionnaire: QuestionnaireResponse | undefined = undefined;

                if (domain) {
                    const qDocRef = doc(db, 'questionnaire_responses', `${patientDoc.id}_${domain}`);
                    const qSnap = await getDoc(qDocRef);
                    if (qSnap.exists()) {
                        latestQuestionnaire = { id: qSnap.id, ...qSnap.data() } as QuestionnaireResponse;
                        if (conditionKey && latestQuestionnaire[conditionKey]) condition = latestQuestionnaire[conditionKey];
                        if (severityKey && latestQuestionnaire[severityKey]) severity = latestQuestionnaire[severityKey];
                    }
                }

                return {
                    ...pii,
                    medicalRecord: {
                        ...medicalData,
                        condition,
                        severity
                    },
                    questionnaireResponse: latestQuestionnaire
                } as JoinedPatientData;
            }, [appConfig]);

            // Patient list "Progress" (spec §10): treatments done per patient, loaded alongside.
            const countsPromise = Promise.all(patientQuerySnapshot.docs.map(async patientDoc => {
                try {
                    return [patientDoc.id, await countPatientTreatments(patientDoc.id)] as const;
                } catch (err) {
                    logger.error("Treatment count failed:", err);
                    return [patientDoc.id, null] as const;
                }
            }));

            const [resolvedPatients, counts] = await Promise.all([Promise.all(patientsDataPromises), countsPromise]);
            setPatients(resolvedPatients);
            setTreatmentCounts(Object.fromEntries(counts.filter(([, n]) => n !== null)) as Record<string, number>);
        } catch (error) {
            logger.error("Error fetching patient data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [appConfig]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
            if (user) {
                const appUserData = await fetchUserData(user);
                setAppUser(appUserData);
            } else {
                setAppUser(null);
                setPatients([]);
            }
            setAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // [TRACER] Handle URL-based deep linking on mount/auth
    useEffect(() => {
        if (authReady && appUser && appConfig) {
            const params = new URLSearchParams(window.location.search);
            const urlPatientId = params.get('patientId');
            if (urlPatientId) {
                logger.trace("App", `Detected patientId in URL: "${urlPatientId}"`);
                handlePatientClick(urlPatientId);
                // Clear the param from URL to prevent re-triggering on manual refreshes if desired, 
                // but usually keeping it is fine for SPAs.
            }
        }
    }, [authReady, appUser, appConfig]);

    useEffect(() => {
        if (appUser && appUser.preferredLanguage) {
            if (language !== appUser.preferredLanguage) {
                setLanguage(appUser.preferredLanguage);
            }
        }
    }, [appUser?.preferredLanguage, language, setLanguage]);

    useEffect(() => {
        const fetchImpersonatedUser = async () => {
            if (viewAsCaretakerId) {
                const userRef = doc(db, 'users', viewAsCaretakerId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    setImpersonatedUser({ uid: viewAsCaretakerId, ...userSnap.data() } as AppUser);
                }
            } else {
                setImpersonatedUser(null);
            }
        };
        fetchImpersonatedUser();
    }, [viewAsCaretakerId]);

    useEffect(() => {
        if (appUser && appConfig) {
            fetchInitialData(appUser, viewAsCaretakerId || undefined);
        }
    }, [appUser, appConfig, fetchInitialData, viewAsCaretakerId]);

    // Landing rule (spec §5): after the first patient load of a login, a caretaker with at least
    // one patient lands on Today; with none, they stay on the patient list. Never overrides the
    // ?patientId= deep link or onboarding (those have already left the patient list).
    useEffect(() => {
        if (!appUser) { landedRef.current = false; return; }
        if (landedRef.current || isLoading || !appConfig) return;
        landedRef.current = true;
        const deepLink = new URLSearchParams(window.location.search).has('patientId');
        if (!deepLink && currentView === 'dashboard' && patients.length > 0) setCurrentView('appointments_today');
    }, [appUser, appConfig, isLoading, patients, currentView]);

    // Opens the patient intake. Opened from the Today page, closing it (or finishing a treatment)
    // returns to Today (plan Step 6); from anywhere else, to the patient list as before.
    const showIntake = () => {
        setIntakeReturnView(currentView === 'appointments_today' ? 'appointments_today' : null);
        setCurrentView('patient_intake');
    };

    const handleLogout = async () => { await logout(); };
    const handleAdminClick = () => { setCurrentView('admin_protocols'); };
    const handlePointsAdminClick = () => { setCurrentView('admin_points'); };
    const handlePointGroupsAdminClick = () => { setCurrentView('admin_point_groups'); };
    const handleBodyModelAdminClick = () => { setCurrentView('admin_body_model'); };
    const handlePointSideAnalysisClick = () => { setCurrentView('point_side_analysis'); };
    const handleMeasuresAdminClick = () => { setCurrentView('admin_measures'); };
    const handleProblemsAdminClick = () => { setCurrentView('admin_problems'); };
    const handleQuestionnaireAdminClick = () => { setCurrentView('admin_questionnaires'); };
    const handleAppSettingsClick = () => { setIsSettingsModalOpen(true); };
    const handleUserDetailsClick = () => { setCurrentView('user_details'); };
    const handleDataAnalysisClick = () => { setCurrentView('data_analysis'); };
    const handleActivityLogClick = () => { setCurrentView('activity_log'); };
    const handleTodayClick = () => { setCurrentView('appointments_today'); };

    // Today → "Open patient": the intake on its Appointments tab.
    const handleOpenPatientFromToday = (patient: JoinedPatientData) => {
        setSelectedPatient(patient);
        setIntakeInitialViewState('tabs');
        setIntakeInitialTab('appointments');
        showIntake();
    };

    const handleCalendarClick = () => {
        // From the sidebar: the current week, no "Back to patient".
        setCalendarFocusDate(null);
        setCalendarReturnPatient(null);
        setCurrentView('appointments_calendar');
    };

    // Appointments tab "Open in calendar": the Calendar on that week, with "Back to patient".
    const handleOpenCalendarFromPatient = (date: Date) => {
        setCalendarFocusDate(date);
        setCalendarReturnPatient(selectedPatient);
        setCurrentView('appointments_calendar');
    };

    // "Back to patient": reopen the intake on its Appointments tab, with the latest patient data.
    const handleBackToPatient = () => {
        const saved = calendarReturnPatient;
        setCalendarFocusDate(null);
        setCalendarReturnPatient(null);
        if (!saved) return;
        const latest = patients.find(p => p.id === saved.id) || saved;
        setSelectedPatient(latest);
        setIntakeInitialViewState('tabs');
        setIntakeInitialTab('appointments');
        showIntake();
    };

    const handleSaveUser = async (updatedUser: AppUser) => {
        if (!appUser) return;
        setSaveStatus('saving');
        const userRef = doc(db, 'users', updatedUser.uid);
        const { uid, ...userDataToSave } = updatedUser;
        await updateDoc(userRef, userDataToSave);

        logAction(appUser, {
            category: 'config',
            action: 'update',
            entityType: 'user',
            entityId: updatedUser.uid,
            entityName: updatedUser.fullName || updatedUser.displayName || '',
            detail: 'profile',
        });

        if (updatedUser.uid === appUser.uid) {
            setAppUser(updatedUser);
            setLanguage(updatedUser.preferredLanguage || 'en');
        } else {
            setImpersonatedUser(updatedUser);
        }

        setSaveStatus('idle');
        setCurrentView('dashboard');
    };

    const handleUpdatePatient = (patient: JoinedPatientData) => {
        setSelectedPatient(patient);
        setIntakeInitialViewState('tabs');
        showIntake();
    };

    const handleAddPatient = () => {
        if (!appUser) return;
        const newPatient: Partial<JoinedPatientData> = {
            fullName: '',
            birthDate: '',
            identityNumber: '',
            email: '',
            mobile: '',
            medicalRecord: {},
            questionnaireResponse: undefined,
            caretakerId: viewAsCaretakerId || appUser.uid,
        };
        setSelectedPatient(newPatient);
        showIntake();
    };

    const handleSavePatient = async (patientData: JoinedPatientData, closeModal: boolean = true): Promise<boolean> => {
        if (!appUser) return false;
        setSaveStatus('saving');
        setErrorMessage('');

        try {
            const isNewPatient = !patientData.id;
            const { medicalRecord, questionnaireResponse, pendingReadings, ...pii } = patientData;

            // 1. Validation (Duplicates)
            const identityNumber = pii.identityNumber;
            const email = pii.email;

            if (!identityNumber) throw new Error("Identity Number cannot be empty");

            const identityQuery = query(collection(db, "patients"), where("identityNumber", "==", identityNumber), where("caretakerId", "==", appUser.uid));
            const emailQuery = email ? query(collection(db, "patients"), where("email", "==", email), where("caretakerId", "==", appUser.uid)) : null;

            const [identitySnapshot, emailSnapshot] = await Promise.all([
                getDocs(identityQuery),
                emailQuery ? getDocs(emailQuery) : Promise.resolve({ empty: true, docs: [] })
            ]);

            if (isNewPatient) {
                if (!identitySnapshot.empty) throw new Error("A patient with this identity number already exists.");
                if (email && !emailSnapshot.empty) throw new Error("A patient with this email already exists.");
            } else {
                if (identitySnapshot.docs.some(doc => doc.id !== patientData.id)) throw new Error("A patient with this identity number already exists.");
                if (email && emailSnapshot.docs.some(doc => doc.id !== patientData.id)) throw new Error("A patient with this email already exists.");
            }

            // 2. Save PII
            const finalPatientId = await savePatient(pii, patientData.id);

            // 3. Save Medical Data
            if (medicalRecord) {
                // Manage Problem Reference Counts
                const newProblems: { problemId: string }[] = medicalRecord.problems || [];
                const oldMedicalDataRef = doc(db, 'patient_medical_data', finalPatientId);
                const oldMedicalDataSnap = await getDoc(oldMedicalDataRef);
                const oldData = oldMedicalDataSnap.exists() ? oldMedicalDataSnap.data() : {};
                const oldProblems: { problemId: string }[] = oldData.problems || [];

                const newProblemIds = new Set(newProblems.map(p => p.problemId));
                const oldProblemIds = new Set(oldProblems.map(p => p.problemId));

                const addedProblemIds = [...newProblemIds].filter(id => !oldProblemIds.has(id));
                const removedProblemIds = [...oldProblemIds].filter(id => !newProblemIds.has(id));

                for (const pid of addedProblemIds) {
                    if (pid) {
                        await updateDoc(doc(db, 'cfg_problems', pid), {
                            reference_count: increment(1)
                        }).catch(err => console.error("Failed to increment problem ref count", err));
                    }
                }
                for (const pid of removedProblemIds) {
                    if (pid) {
                        await updateDoc(doc(db, 'cfg_problems', pid), {
                            reference_count: increment(-1)
                        }).catch(err => logger.error("Failed to decrement problem ref count", err));
                    }
                }

                // Filter out UI-only fields (if any remained)
                const { condition, severity, lastTreatment, ...dataToSave } = medicalRecord as any;
                // medicalRecord is already mostly clean, but we ensure we don't overwrite server-only fields if they exist
                await saveMedicalData(finalPatientId, medicalRecord);
            }

            // 4. Save Questionnaire (if present and domain is set)
            if (questionnaireResponse && questionnaireResponse.domain) {
                await addQuestionnaireResponse(finalPatientId, questionnaireResponse);
            }

            // 5. Save measure readings (if entered in ProblemsProtocolsTab)
            if (pendingReadings && pendingReadings.length > 0) {
                await addMeasuredValueReading(finalPatientId, {
                    readings: pendingReadings,
                    usedMeasureIds: pendingReadings.map((r: any) => r.measureId)
                });
            }

            if (isNewPatient || closeModal) {
                logAction(appUser, {
                    category: 'patient',
                    action: isNewPatient ? 'create' : 'update',
                    entityType: 'patient',
                    entityId: finalPatientId,
                    entityName: patientData.fullName || '',
                });
            }

            await fetchInitialData(appUser);
            if (closeModal) {
                handleCloseIntake();
            } else {
                const updatedPatient = { ...patientData, id: finalPatientId };
                setSelectedPatient(updatedPatient);
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }
            return true;

        } catch (error) {
            logger.error("Error saving patient data:", error);
            setErrorMessage(error instanceof Error ? error.message : "Failed to save patient data.");
            setSaveStatus('error');
            return false;
        }
    };

    // Leaves the intake / treatment state and shows `view` (the patient list by default).
    const leaveIntake = (view: View) => {
        setSelectedPatient(null);
        setActiveProtocol(null);
        setActiveTreatmentSession(null);
        setCurrentView(view);
        setSaveStatus('idle');
        setErrorMessage('');
        setIntakeInitialViewState('tabs');
        setIntakeInitialTab('personal');
        setIntakeReturnView(null);
    };

    // Sidebar "Patients" (always the patient list).
    const handleBackToDashboard = () => leaveIntake('dashboard');

    // Closing the intake: back to Today when it was opened from there, else the patient list.
    const handleCloseIntake = () => leaveIntake(intakeReturnView ?? 'dashboard');

    const handleStartTreatmentFlow = async (patient: JoinedPatientData, confirmedSameDay = false) => {
        // Appointments Step 6: warn (never block) when this patient already had a treatment today.
        if (!confirmedSameDay && patient.id && await hasTreatmentToday(patient.id).catch(() => false)) {
            setSameDayStartPatient(patient);
            return;
        }
        setSelectedPatient(patient);
        setIntakeInitialViewState('sessionOpening');
        showIntake();
    };

    const handleShowTreatments = (patient: JoinedPatientData) => {
        setSelectedPatient(patient);
        setIntakeInitialViewState('tabs');
        setIntakeInitialTab('treatments');
        showIntake();
    };

    const handlePatientClick = async (patientIdInput: string | number) => {
        const patientId = String(patientIdInput).trim();
        logger.trace("App.handlePatientClick", `Received ID: "${patientId}" (input: ${patientIdInput})`);
        if (!patientId) return;

        let patient = patients.find(p => p.id === patientId || p.identityNumber === patientId);
        if (patient) {
            logger.trace("App.handlePatientClick", `Found patient in local state: "${patient.fullName}" (id: ${patient.id})`);
        }

        if (!patient) {
            logger.trace("App.handlePatientClick", `Patient not found in local state, fetching from Firestore...`);
            setIsLoading(true);
            try {
                // Try technical ID first
                let pDoc = await getDoc(doc(db, 'patients', patientId));

                // If not found, it might be an identity number used as an ID, or we need to query by identityNumber field
                if (!pDoc.exists()) {
                    logger.trace("App.handlePatientClick", `Doc "${patientId}" not found, trying identityNumber query...`);
                    const q = query(collection(db, 'patients'), where('identityNumber', '==', patientId));
                    const qSnap = await getDocs(q);
                    if (!qSnap.empty) {
                        pDoc = qSnap.docs[0];
                        logger.trace("App.handlePatientClick", `Found doc via identityNumber query. Doc ID: ${pDoc.id}`);
                    }
                }

                if (pDoc.exists()) {
                    const data = pDoc.data();
                    logger.trace("App.handlePatientClick", `Fetched data for "${data.fullName}". Document ID: ${pDoc.id}`);
                    const pii = { ...data, id: pDoc.id, patientId: pDoc.id } as any;
                    const mDoc = await getDoc(doc(db, 'patient_medical_data', pDoc.id));
                    const medicalRecord = mDoc.exists() ? { ...mDoc.data(), id: mDoc.id, patientId: pDoc.id } : { patientId: pDoc.id };
                    patient = { ...pii, medicalRecord };
                } else {
                    logger.warn(`[TRACER] App.handlePatientClick: No patient document found for "${patientId}"`);
                }
            } catch (err) {
                logger.error("[TRACER] App.handlePatientClick: Deep link fetch failed:", err);
            } finally {
                setIsLoading(false);
            }
        }
        if (patient) {
            logger.trace("App.handlePatientClick", `Successfully resolved patient, showing treatments view.`);
            handleShowTreatments(patient);
        }
    };


    const renderContent = () => {
        const path = window.location.pathname;
        if (path.startsWith('/feedback/')) {
            const sessionId = path.split('/')[2];
            if (sessionId) {
                return <FeedbackStandaloneView sessionId={sessionId} />;
            }
        }

        if (!authReady) return <div className="flex justify-center items-center h-screen"><div><T>Initializing...</T></div></div>;
        if (!appUser) return <Login />;
        if (isLoading && currentView === 'dashboard') return <div className="flex justify-center items-center h-screen"><div><T>Loading Patient Data...</T></div></div>;

        const dashboardModalViews = ['patient_intake', 'protocol_selection', 'treatment_history'];
        // The intake is an overlay: opened from Today, Today stays underneath it (not the patient list).
        const todayUnderIntake = currentView === 'patient_intake' && intakeReturnView === 'appointments_today';
        const isDashboardView = !todayUnderIntake && (currentView === 'dashboard' || dashboardModalViews.includes(currentView));
        const effectiveUser = impersonatedUser || appUser;

        return (
            <div className="flex h-screen">
                <Sidebar
                    user={appUser}
                    onLogout={handleLogout}
                    onAdminClick={handleAdminClick}
                    onPointsAdminClick={handlePointsAdminClick}
                    onPointGroupsAdminClick={handlePointGroupsAdminClick}
                    onBodyModelAdminClick={handleBodyModelAdminClick}
                    onPointSideAnalysisClick={handlePointSideAnalysisClick}
                    onUserDetailsClick={handleUserDetailsClick}
                    onPatientsClick={handleBackToDashboard}
                    onTodayClick={handleTodayClick}
                    onCalendarClick={handleCalendarClick}
                    todayAppointments={todayAppointments.appointments}
                    onDataAnalysisClick={handleDataAnalysisClick}
                    onAppSettingsClick={handleAppSettingsClick}
                    onMeasuresAdminClick={handleMeasuresAdminClick}
                    onProblemsAdminClick={handleProblemsAdminClick}
                    onQuestionnaireAdminClick={handleQuestionnaireAdminClick}
                    onUserManagementClick={() => setCurrentView('admin_users')}
                    onActivityLogClick={handleActivityLogClick}
                    viewAsCaretakerId={viewAsCaretakerId}
                    onViewAsCaretakerChange={setViewAsCaretakerId}
                />
                <main className="flex-grow p-4 md:p-8 overflow-y-auto">
                    {
                        isDashboardView ?
                            <PatientsDashboard user={appUser} patients={patients} onAddPatient={handleAddPatient} onUpdatePatient={handleUpdatePatient} onShowTreatments={handleShowTreatments} onStartTreatment={handleStartTreatmentFlow} isSaving={saveStatus === 'saving'} caretakerId={viewAsCaretakerId || appUser.uid} treatmentCounts={treatmentCounts} onOpenToday={handleTodayClick} />
                            : currentView === 'user_details' && effectiveUser ?
                                <Modal isOpen={true} onClose={() => setCurrentView('dashboard')} title={tMyProfile}>
                                    <UserDetails user={effectiveUser} onSave={handleSaveUser} onBack={() => setCurrentView('dashboard')} />
                                </Modal>
                                : currentView === 'onboarding_test' ?
                                    <UserDetails user={appUser} onSave={handleSaveUser} isOnboarding={true} onBack={() => { }} />
                                    : currentView === 'admin_protocols' ?
                                        <ProtocolAdmin />
                                        : currentView === 'admin_points' ?
                                            <PointsAdmin />
                                            : currentView === 'admin_point_groups' ?
                                                <PointGroupAdmin />
                                            : currentView === 'admin_body_model' ?
                                                <BodyModelTuner />
                                            : currentView === 'point_side_analysis' ?
                                                <PointSideAnalysis />
                                            : currentView === 'admin_measures' ?
                                                <MeasureAdmin />
                                                : currentView === 'admin_problems' ?
                                                    <ProblemAdmin />
                                                    : currentView === 'admin_questionnaires' ?
                                                        <QuestionnaireAdmin />
                                                        : currentView === 'admin_users' ?
                                                            <UserManagement />
                                                            : currentView === 'activity_log' ?
                                                                <ActivityLog />
                                                                : currentView === 'data_analysis' && effectiveUser ?
                                                                <Modal isOpen={true} onClose={() => setCurrentView('dashboard')} title={tTreatmentEffectiveness} isFlex={true}>
                                                                    <TreatmentEffectiveness user={effectiveUser} onPatientClick={handlePatientClick} />
                                                                </Modal>
                                                                : (currentView === 'appointments_today' || todayUnderIntake) ?
                                                                    // Wait for the viewed caretaker's profile under "View As" (their working hours).
                                                                    (viewAsCaretakerId && !impersonatedUser)
                                                                        ? <div><T>Loading...</T></div>
                                                                        : <TodayPage
                                                                            caretaker={effectiveUser}
                                                                            actor={appUser}
                                                                            appConfig={appConfig}
                                                                            appointments={todayAppointments.appointments}
                                                                            loadError={!!todayAppointments.error}
                                                                            patients={patients}
                                                                            readOnly={!!viewAsCaretakerId && viewAsCaretakerId !== appUser.uid}
                                                                            onStartTreatment={p => handleStartTreatmentFlow(p)}
                                                                            onOpenPatient={handleOpenPatientFromToday}
                                                                        />
                                                                : currentView === 'appointments_calendar' ?
                                                                    // Wait for the viewed caretaker's profile under "View As" (their working hours).
                                                                    (viewAsCaretakerId && !impersonatedUser)
                                                                        ? <div><T>Loading...</T></div>
                                                                        : <CalendarPage
                                                                            caretaker={effectiveUser}
                                                                            actor={appUser}
                                                                            appConfig={appConfig}
                                                                            patients={patients.filter(p => p.id).map(p => ({ id: p.id as string, fullName: p.fullName, mobile: p.mobile, identityNumber: p.identityNumber, email: p.email }))}
                                                                            readOnly={!!viewAsCaretakerId && viewAsCaretakerId !== appUser.uid}
                                                                            initialDate={calendarFocusDate}
                                                                            onBackToPatient={calendarReturnPatient ? handleBackToPatient : undefined}
                                                                            backToPatientName={calendarReturnPatient?.fullName}
                                                                        />
                                                                : null
                    }

                    {currentView === 'patient_intake' && selectedPatient && appUser &&
                        <PatientIntake
                            patient={selectedPatient}
                            user={appUser}
                            onSave={handleSavePatient}
                            onClose={handleCloseIntake}
                            saveStatus={saveStatus}
                            errorMessage={errorMessage}
                            onUpdate={(patientData) => handleSavePatient(patientData, false)}
                            initialViewState={intakeInitialViewState}
                            initialTab={intakeInitialTab}
                            onTreatmentComplete={() => fetchInitialData(appUser, viewAsCaretakerId || undefined)}
                            onOpenCalendar={handleOpenCalendarFromPatient}
                        />
                    }

                    {/* Second treatment today (Appointments Step 6): warn, never block. Same text as in the intake. */}
                    <ConfirmationModal
                        isOpen={!!sameDayStartPatient}
                        title={<T>Treatment already recorded today</T>}
                        message={<T>This patient already had a treatment today. Start another one?</T>}
                        confirmLabel={<T>Start another treatment</T>}
                        onConfirm={() => {
                            const p = sameDayStartPatient;
                            setSameDayStartPatient(null);
                            if (p) handleStartTreatmentFlow(p, true);
                        }}
                        onCancel={() => setSameDayStartPatient(null)}
                        showCancelButton
                    />

                    {appUser && isSettingsModalOpen && (
                        <Modal
                            isOpen={isSettingsModalOpen}
                            onClose={() => setIsSettingsModalOpen(false)}
                            title={tAppSettings}
                        >
                            <ApplicationSettings user={appUser} onClose={() => setIsSettingsModalOpen(false)} />
                        </Modal>
                    )}

                </main>
            </div>
        );
    };

    return <>{renderContent()}</>;
};

const App: React.FC = () => (
    <TranslationProvider>
        <AppInner />
    </TranslationProvider>
);

export default App;
