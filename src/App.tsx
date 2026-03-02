import React, { useState, useEffect, useCallback } from 'react';

import { TranslationProvider, useTranslationContext, T, useT } from './components/T';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where, getDoc, addDoc, updateDoc, deleteDoc, DocumentSnapshot, DocumentData, orderBy, limit } from 'firebase/firestore';
import Login from './components/Login';
import PatientsDashboard from './components/PatientsDashboard';
import Sidebar from './components/Sidebar';
import ProtocolAdmin from './components/ProtocolAdmin';
import PointsAdmin from './components/PointsAdmin';
import MeasureAdmin from './components/MeasureAdmin/MeasureAdmin';
import ProblemAdmin from './components/ProblemAdmin/ProblemAdmin';
import QuestionnaireAdmin from './components/QuestionnaireAdmin/QuestionnaireAdmin';
import ProtocolSelection from './components/ProtocolSelection';
import TreatmentExecution from './components/TreatmentExecution';
import TreatmentHistory from './components/TreatmentHistory';
import UserDetails from './components/UserDetails';
import ApplicationSettings from './components/ApplicationSettings';
import { JoinedPatientData, MedicalData, QuestionnaireResponse } from './types/patient';
import { savePatient, saveMedicalData, addQuestionnaireResponse, addMeasuredValueReading, saveTreatment } from './firebase/patient';
import { AppUser } from './types/user';
import { Protocol } from './types/protocol';
import { TreatmentSession, VitalSigns } from './types/treatmentSession';
import { logout } from './services/authService';
import PatientIntake from './components/PatientIntake/PatientIntake';
import Modal from './components/common/Modal';
import './globals.css';

type View = 'dashboard' | 'patient_intake' | 'protocol_selection' | 'treatment_execution' | 'admin_protocols' | 'admin_points' | 'admin_measures' | 'admin_problems' | 'admin_questionnaires' | 'treatment_history' | 'user_details' | 'onboarding_test';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

const AppInner: React.FC = () => {
    const { language, setLanguage, direction } = useTranslationContext();
    const tMyProfile = useT('My Profile');
    const tAppSettings = useT('Application Settings');
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<JoinedPatientData[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Partial<JoinedPatientData> | null>(null);
    const [activeProtocol, setActiveProtocol] = useState<Protocol | null>(null);
    const [activeTreatmentSession, setActiveTreatmentSession] = useState<Partial<TreatmentSession> | null>(null);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [authReady, setAuthReady] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [appConfig, setAppConfig] = useState<any>(null);
    const [intakeInitialViewState, setIntakeInitialViewState] = useState<'tabs' | 'sessionOpening'>('tabs');
    const [intakeInitialTab, setIntakeInitialTab] = useState<any>('personal');

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
                }
            } catch (err) {
                console.error("Config fetch failed:", err);
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
            const newUser: AppUser = { uid: user.uid, email: user.email || '', fullName: user.displayName || 'New User', displayName: user.displayName || 'New User', mobile: '', role: 'caretaker' };
            const { uid, ...userDataToSave } = newUser;
            await setDoc(userRef, userDataToSave);
            setCurrentView('onboarding_test');
            return newUser;
        }
    };

    const fetchInitialData = useCallback(async (user: AppUser) => {
        if (!user || !user.uid || !appConfig) return;
        setIsLoading(true);
        try {
            const protocolsQuery = query(collection(db, 'cfg_protocols'));
            const problemsQuery = query(collection(db, 'cfg_problems'));
            const measuresQuery = query(collection(db, 'cfg_measures'));
            const questionnairesQuery = query(collection(db, 'cfg_questionnaires'));
            // 1. Fetch PII from 'patients'
            const patientQuery = query(collection(db, "patients"), where("caretakerId", "==", user.uid));
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
                        patient_level_data: {
                            ...medicalData,
                            condition,
                            severity
                        }
                    },
                    questionnaireResponse: latestQuestionnaire
                } as JoinedPatientData;
            });

            const resolvedPatients = await Promise.all(patientsDataPromises);
            setPatients(resolvedPatients);
        } catch (error) {
            console.error("Error fetching patient data:", error);
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

    useEffect(() => {
        if (appUser && appUser.preferredLanguage) {
            if (language !== appUser.preferredLanguage) {
                setLanguage(appUser.preferredLanguage);
            }
        }
    }, [appUser?.preferredLanguage, language, setLanguage]);

    useEffect(() => {
        if (appUser && appConfig) {
            fetchInitialData(appUser);
        }
    }, [appUser, appConfig, fetchInitialData]);

    const handleLogout = async () => { await logout(); };
    const handleAdminClick = () => { setCurrentView('admin_protocols'); };
    const handlePointsAdminClick = () => { setCurrentView('admin_points'); };
    const handleMeasuresAdminClick = () => { setCurrentView('admin_measures'); };
    const handleProblemsAdminClick = () => { setCurrentView('admin_problems'); };
    const handleQuestionnaireAdminClick = () => { setCurrentView('admin_questionnaires'); };
    const handleAppSettingsClick = () => { setIsSettingsModalOpen(true); };
    const handleUserDetailsClick = () => { setCurrentView('user_details'); };

    const handleSaveUser = async (updatedUser: AppUser) => {
        if (!appUser) return;
        setSaveStatus('saving');
        const userRef = doc(db, 'users', appUser.uid);
        const { uid, ...userDataToSave } = updatedUser;
        await updateDoc(userRef, userDataToSave);
        setAppUser(updatedUser);
        setLanguage(updatedUser.preferredLanguage || 'en');
        setSaveStatus('idle');
        setCurrentView('dashboard');
    };

    const handleUpdatePatient = (patient: JoinedPatientData) => {
        setSelectedPatient(patient);
        setIntakeInitialViewState('tabs');
        setCurrentView('patient_intake');
    };

    const handleAddPatient = () => {
        if (!appUser) return;
        const newPatient: Partial<JoinedPatientData> = {
            fullName: '',
            birthDate: '',
            identityNumber: '',
            email: '',
            mobile: '',
            medicalRecord: { patient_level_data: {} },
            questionnaireResponse: undefined,
            caretakerId: appUser.uid,
        };
        setSelectedPatient(newPatient);
        setCurrentView('patient_intake');
    };

    const handleSavePatient = async (patientData: JoinedPatientData, closeModal: boolean = true) => {
        if (!appUser) return;
        setSaveStatus('saving');
        setErrorMessage('');

        try {
            const isNewPatient = !patientData.id;
            const { medicalRecord, questionnaireResponse, pendingReadings, ...pii } = patientData;

            // 1. Validation (Duplicates)
            const identityNumber = pii.identityNumber;
            const email = pii.email;

            if (!identityNumber) throw new Error("Identity Number cannot be empty");

            const identityQuery = query(collection(db, "patients"), where("identityNumber", "==", identityNumber));
            const emailQuery = email ? query(collection(db, "patients"), where("email", "==", email)) : null;

            const [identitySnapshot, emailSnapshot] = await Promise.all([
                getDocs(identityQuery),
                emailQuery ? getDocs(emailQuery) : Promise.resolve({ empty: true, docs: [] })
            ]);

            if (isNewPatient) {
                if (!identitySnapshot.empty) throw new Error(`A patient with identity number '${identityNumber}' already exists.`);
                if (email && !emailSnapshot.empty) throw new Error(`A patient with email '${email}' already exists.`);
            } else {
                if (identitySnapshot.docs.some(doc => doc.id !== patientData.id)) throw new Error(`A patient with identity number '${identityNumber}' already exists.`);
                if (email && emailSnapshot.docs.some(doc => doc.id !== patientData.id)) throw new Error(`A patient with email '${email}' already exists.`);
            }

            // 2. Save PII
            const finalPatientId = await savePatient(pii, patientData.id);

            // 3. Save Medical Data
            if (medicalRecord?.patient_level_data) {
                // Filter out UI-only fields
                const { condition, severity, ...dataToSave } = medicalRecord.patient_level_data;
                await saveMedicalData(finalPatientId, dataToSave);
            }

            // 4. Save Questionnaire (if present and domain is set)
            if (questionnaireResponse && questionnaireResponse.domain) {
                await addQuestionnaireResponse(finalPatientId, questionnaireResponse);
            }

            // 5. Save measure readings (if entered in ProblemsProtocolsTab)
            if (pendingReadings && pendingReadings.length > 0) {
                await addMeasuredValueReading(finalPatientId, { readings: pendingReadings });
            }

            await fetchInitialData(appUser);
            if (closeModal) {
                handleBackToDashboard();
            } else {
                const updatedPatient = { ...patientData, id: finalPatientId };
                setSelectedPatient(updatedPatient);
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }

        } catch (error) {
            console.error("Error saving patient data:", error);
            setErrorMessage(error instanceof Error ? error.message : "Failed to save patient data.");
            setSaveStatus('error');
        }
    };

    const handleDeletePatient = async (patientId: string) => {
        if (!appUser) return;
        setSaveStatus('saving');
        try {
            await deleteDoc(doc(db, "patients", patientId));
            await fetchInitialData(appUser);
        } catch (error) {
            console.error("Error deleting patient:", error);
        } finally {
            setSaveStatus('idle');
        }
    };

    const handleBackToDashboard = () => {
        setSelectedPatient(null);
        setActiveProtocol(null);
        setActiveTreatmentSession(null);
        setCurrentView('dashboard');
        setSaveStatus('idle');
        setErrorMessage('');
        setIntakeInitialViewState('tabs');
        setIntakeInitialTab('personal');
    };

    const handleStartTreatmentFlow = (patient: JoinedPatientData) => {
        setSelectedPatient(patient);
        setIntakeInitialViewState('sessionOpening');
        setCurrentView('patient_intake');
    };

    const handleShowTreatments = (patient: JoinedPatientData) => {
        setSelectedPatient(patient);
        setIntakeInitialViewState('tabs');
        setIntakeInitialTab('treatments');
        setCurrentView('patient_intake');
    };


    const renderContent = () => {
        if (!authReady) return <div className="flex justify-center items-center h-screen"><div><T>Initializing...</T></div></div>;
        if (!appUser) return <Login />;
        if (isLoading && currentView === 'dashboard') return <div className="flex justify-center items-center h-screen"><div><T>Loading Patient Data...</T></div></div>;

        const dashboardModalViews = ['patient_intake', 'protocol_selection', 'treatment_history'];
        const isDashboardView = currentView === 'dashboard' || dashboardModalViews.includes(currentView);

        return (
            <div className="flex h-screen">
                <Sidebar user={appUser} onLogout={handleLogout} onAdminClick={handleAdminClick} onPointsAdminClick={handlePointsAdminClick} onUserDetailsClick={handleUserDetailsClick} onPatientsClick={handleBackToDashboard} onAppSettingsClick={handleAppSettingsClick} onMeasuresAdminClick={handleMeasuresAdminClick} onProblemsAdminClick={handleProblemsAdminClick} onQuestionnaireAdminClick={handleQuestionnaireAdminClick} />
                <main className="flex-grow p-4 md:p-8 overflow-y-auto">
                    {
                        isDashboardView ?
                            <PatientsDashboard user={appUser} patients={patients} onAddPatient={handleAddPatient} onUpdatePatient={handleUpdatePatient} onShowTreatments={handleShowTreatments} onStartTreatment={handleStartTreatmentFlow} onDeletePatient={handleDeletePatient} isSaving={saveStatus === 'saving'} />
                            : currentView === 'user_details' && appUser ?
                                <Modal isOpen={true} onClose={() => setCurrentView('dashboard')} title={tMyProfile}>
                                    <UserDetails user={appUser} onSave={handleSaveUser} onBack={() => setCurrentView('dashboard')} />
                                </Modal>
                                : currentView === 'onboarding_test' ?
                                    <UserDetails user={appUser} onSave={handleSaveUser} isOnboarding={true} onBack={() => { }} />
                                    : currentView === 'admin_protocols' ?
                                        <ProtocolAdmin />
                                        : currentView === 'admin_points' ?
                                            <PointsAdmin />
                                            : currentView === 'admin_measures' ?
                                                <MeasureAdmin />
                                                : currentView === 'admin_problems' ?
                                                    <ProblemAdmin />
                                                    : currentView === 'admin_questionnaires' ?
                                                        <QuestionnaireAdmin />
                                                        : null
                    }

                    {currentView === 'patient_intake' && selectedPatient && appUser &&
                        <PatientIntake
                            patient={selectedPatient}
                            user={appUser}
                            onSave={handleSavePatient}
                            onClose={handleBackToDashboard}
                            saveStatus={saveStatus}
                            errorMessage={errorMessage}
                            onUpdate={(patientData) => handleSavePatient(patientData, false)}
                            initialViewState={intakeInitialViewState}
                            initialTab={intakeInitialTab}
                        />
                    }

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
