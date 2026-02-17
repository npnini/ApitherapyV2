import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where, getDoc, addDoc, updateDoc, deleteDoc, DocumentSnapshot, DocumentData } from 'firebase/firestore';
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
import { PatientData, MedicalRecord, QuestionnaireResponse } from './types/patient';
import { AppUser } from './types/user';
import { Protocol } from './types/protocol';
import { TreatmentSession, VitalSigns } from './types/treatmentSession';
import { logout } from './services/authService';
import PatientIntake from './components/PatientIntake/PatientIntake';
import Modal from './components/common/Modal';
import './globals.css';

type View = 'dashboard' | 'patient_intake' | 'protocol_selection' | 'treatment_execution' | 'admin_protocols' | 'admin_points' | 'admin_measures' | 'admin_problems' | 'admin_questionnaires' | 'treatment_history' | 'user_details' | 'onboarding_test';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

const App: React.FC = () => {
    const { i18n } = useTranslation();
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<PatientData[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<Partial<PatientData> | null>(null);
    const [activeProtocol, setActiveProtocol] = useState<Protocol | null>(null);
    const [activeTreatmentSession, setActiveTreatmentSession] = useState<Partial<TreatmentSession> | null>(null);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [authReady, setAuthReady] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [appConfig, setAppConfig] = useState<any>(null);

    useEffect(() => {
        document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
    }, [i18n.language]);

    useEffect(() => {
        const fetchAppConfig = async () => {
            const configDocRef = doc(db, 'app_config', 'main');
            const configDocSnap = await getDoc(configDocRef);
            if (configDocSnap.exists()) {
                setAppConfig(configDocSnap.data());
            }
        };
        fetchAppConfig();
    }, [isSettingsModalOpen]);

    const fetchUserData = async (user: User): Promise<AppUser> => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            return { uid: user.uid, ...userSnap.data() } as AppUser;
        } else {
            const newUser: AppUser = { uid: user.uid, userId: user.uid, email: user.email || '', fullName: user.displayName || 'New User', displayName: user.displayName || 'New User', mobile: '', role: 'caretaker' };
            await setDoc(userRef, newUser);
            setCurrentView('onboarding_test');
            return newUser;
        }
    };

    const fetchInitialData = useCallback(async (user: AppUser) => {
        if (!user || !user.userId || !appConfig) return;
        setIsLoading(true);
        try {
            const patientQuery = query(collection(db, "patients"), where("caretakerId", "==", user.userId));
            const patientQuerySnapshot = await getDocs(patientQuery);

            const domain = appConfig.patientDashboard?.domain;
            const conditionKey = appConfig.patientDashboard?.conditionQuestion;
            const severityKey = appConfig.patientDashboard?.severityQuestion;

            const patientDataPromises = patientQuerySnapshot.docs.map(async (patientDoc) => {
                const patientPii = { id: patientDoc.id, ...patientDoc.data() };

                let condition = 'N/A';
                let severity = 'N/A';
                let questionnaireResponse: QuestionnaireResponse = {};

                if (domain) {
                    const questionnaireResponseRef = doc(db, `patients/${patientDoc.id}/medical_records/patient_level_data/questionnaire_responses`, domain);
                    const questionnaireResponseSnap = await getDoc(questionnaireResponseRef);
                    if (questionnaireResponseSnap.exists()) {
                        questionnaireResponse = questionnaireResponseSnap.data();
                        if (conditionKey && questionnaireResponse[conditionKey]) {
                            condition = questionnaireResponse[conditionKey];
                        }
                        if (severityKey && questionnaireResponse[severityKey]) {
                            severity = questionnaireResponse[severityKey];
                        }
                    }
                }

                const medicalRecordRef = doc(db, `patients/${patientDoc.id}/medical_records`, 'patient_level_data');
                const medicalRecordSnap = await getDoc(medicalRecordRef);
                const patientLevelData = medicalRecordSnap.exists() ? medicalRecordSnap.data() : {};

                patientLevelData.condition = condition;
                patientLevelData.severity = severity;

                const medicalRecord: MedicalRecord = {
                    patient_level_data: patientLevelData
                };

                return {
                    ...patientPii,
                    medicalRecord,
                    questionnaireResponse,
                } as PatientData;
            });

            const patientsData = await Promise.all(patientDataPromises);
            setPatients(patientsData);
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
        i18n.changeLanguage(updatedUser.preferredLanguage);
        setSaveStatus('idle');
        setCurrentView('dashboard');
    };

    const handleUpdatePatient = (patient: PatientData) => {
        setSelectedPatient(patient);
        setCurrentView('patient_intake');
    };

    const handleAddPatient = () => {
        if (!appUser) return;
        const newPatient: Partial<PatientData> = {
            fullName: '',
            birthDate: '',
            identityNumber: '',
            email: '',
            mobile: '',
            medicalRecord: { patient_level_data: {} },
            questionnaireResponse: {},
            caretakerId: appUser.userId,
        };
        setSelectedPatient(newPatient);
        setCurrentView('patient_intake');
    };

    const handleSavePatient = async (patientData: PatientData, closeModal: boolean = true) => {
        if (!appUser) return;
        setSaveStatus('saving');
        setErrorMessage('');

        try {
            const isNewPatient = !patientData.id;
            let patientId = patientData.id;
            const now = new Date();

            const { medicalRecord, questionnaireResponse, ...patientPii } = patientData;
            let piiToSave: Omit<PatientData, 'id' | 'medicalRecord' | 'questionnaireResponse'> & { dateCreated?: Date; lastUpdated?: Date } = { 
                ...patientPii, 
                caretakerId: appUser.userId,
                lastUpdated: now,
            };

            delete (piiToSave as any).id;
            delete (piiToSave as any).age;

            const identityNumber = piiToSave.identityNumber;
            const email = piiToSave.email;

            if (!identityNumber) {
                throw new Error("Identity Number cannot be empty.");
            }

            const identityQuery = query(collection(db, "patients"), where("identityNumber", "==", identityNumber));
            const emailQuery = email ? query(collection(db, "patients"), where("email", "==", email)) : null;

            const [identitySnapshot, emailSnapshot] = await Promise.all([
                getDocs(identityQuery),
                emailQuery ? getDocs(emailQuery) : Promise.resolve({ empty: true, docs: [] })
            ]);

            if (isNewPatient) {
                if (!identitySnapshot.empty) {
                    throw new Error(`A patient with identity number '${identityNumber}' already exists.`);
                }
                if (email && !emailSnapshot.empty) {
                    throw new Error(`A patient with email '${email}' already exists.`);
                }
            } else {
                if (identitySnapshot.docs.some(doc => doc.id !== patientId)) {
                    throw new Error(`A patient with identity number '${identityNumber}' already exists.`);
                }
                if (email && emailSnapshot.docs.some(doc => doc.id !== patientId)) {
                    throw new Error(`A patient with email '${email}' already exists.`);
                }
            }

            if (isNewPatient) {
                piiToSave.dateCreated = now;
                const newPatientRef = await addDoc(collection(db, "patients"), piiToSave as DocumentData);
                patientId = newPatientRef.id;
            } else {
                const patientDocRef = doc(db, "patients", patientId!);
                await setDoc(patientDocRef, piiToSave as DocumentData, { merge: true });
            }

            if (medicalRecord && medicalRecord.patient_level_data) {
                const { condition, severity, ...restOfPatientLevelData } = medicalRecord.patient_level_data;
                const medicalRecordRef = doc(db, `patients/${patientId}/medical_records`, 'patient_level_data');
                await setDoc(medicalRecordRef, restOfPatientLevelData, { merge: true });
            }

            if (questionnaireResponse) {
                const { domain, ...restOfResponse } = questionnaireResponse;
                if (domain) {
                    const questionnaireRef = doc(db, `patients/${patientId}/medical_records/patient_level_data/questionnaire_responses`, domain);
                    await setDoc(questionnaireRef, { ...restOfResponse, dateUpdated: now }, { merge: true });
                }
            }

            await fetchInitialData(appUser);
            if (closeModal) {
                handleBackToDashboard();
            } else {
                const updatedPatient = { ...patientData, id: patientId };
                setSelectedPatient(updatedPatient);
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 2000);
            }

        } catch (error) {
            console.error("Error saving patient data:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to save patient data.";
            setErrorMessage(errorMessage);
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
    };

    const handleStartTreatmentFlow = (patient: PatientData) => {
        setSelectedPatient(patient);
        setCurrentView('protocol_selection');
    };

    const handleShowTreatments = (patient: PatientData) => {
        setSelectedPatient(patient);
        setCurrentView('treatment_history');
    };

    const handleProtocolSelection = (protocol: Protocol, patientReport: string, preStingVitals: VitalSigns) => {
        if (!appUser || !selectedPatient) return;
        setActiveProtocol(protocol);
        setActiveTreatmentSession({
            patientId: selectedPatient.id,
            date: new Date().toISOString(),
            protocolId: protocol.id,
            protocolName: protocol.name,
            patientReport: patientReport,
            preStingVitals: preStingVitals,
            caretakerId: appUser.userId,
        });
        setCurrentView('treatment_execution');
    };
    
    const handleSaveTreatment = async (data: { stungPointIds: string[]; notes: string; postStingVitals?: Partial<VitalSigns>; finalVitals?: Partial<VitalSigns>; }) => {
        if (!selectedPatient || !selectedPatient.id || !activeTreatmentSession) return;
        setSaveStatus('saving');
        try {
            const finalTreatmentRecord: TreatmentSession = {
                ...activeTreatmentSession,
                stungPoints: data.stungPointIds,
                postStingVitals: data.postStingVitals,
                finalVitals: data.finalVitals,
                finalNotes: data.notes,
            } as TreatmentSession;

            const treatmentsCollectionRef = collection(db, `patients/${selectedPatient.id}/medical_records/patient_level_data/treatments`);
            await addDoc(treatmentsCollectionRef, finalTreatmentRecord);

            const medicalRecordRef = doc(db, `patients/${selectedPatient.id}/medical_records`, 'patient_level_data');
            await setDoc(medicalRecordRef, { lastTreatment: new Date().toISOString().split('T')[0] }, { merge: true });

            await fetchInitialData(appUser!);
            setSaveStatus('success');
        } catch (error) {
            console.error("Error saving new treatment:", error);
            setSaveStatus('error');
        }
    };

    const renderContent = () => {
    if (!authReady) return <div className="flex justify-center items-center h-screen"><div>Initializing...</div></div>;
    if (!appUser) return <Login />;
    if (isLoading && currentView === 'dashboard') return <div className="flex justify-center items-center h-screen"><div>Loading Patient Data...</div></div>;

    const dashboardModalViews = ['patient_intake', 'protocol_selection', 'treatment_history'];
    const isDashboardView = currentView === 'dashboard' || dashboardModalViews.includes(currentView);

    return (
        <div className="flex h-screen">
            <Sidebar user={appUser} onLogout={handleLogout} onAdminClick={handleAdminClick} onPointsAdminClick={handlePointsAdminClick} onUserDetailsClick={handleUserDetailsClick} onPatientsClick={handleBackToDashboard} onAppSettingsClick={handleAppSettingsClick} onMeasuresAdminClick={handleMeasuresAdminClick} onProblemsAdminClick={handleProblemsAdminClick} onQuestionnaireAdminClick={handleQuestionnaireAdminClick} />
            <main className="flex-grow p-4 md:p-8 overflow-y-auto">
                {
                    isDashboardView ? 
                        <PatientsDashboard user={appUser} patients={patients} onAddPatient={handleAddPatient} onUpdatePatient={handleUpdatePatient} onShowTreatments={handleShowTreatments} onStartTreatment={handleStartTreatmentFlow} onDeletePatient={handleDeletePatient} isSaving={saveStatus === 'saving'} />
                    : currentView === 'user_details' ?
                        <UserDetails user={appUser} onSave={handleSaveUser} onBack={handleBackToDashboard} />
                    : currentView === 'onboarding_test' ?
                        <UserDetails user={appUser} onSave={handleSaveUser} isOnboarding={true} />
                    : currentView === 'treatment_execution' && selectedPatient && activeProtocol && activeTreatmentSession ?
                        <TreatmentExecution patient={selectedPatient as PatientData} protocol={activeProtocol} onSave={handleSaveTreatment} onBack={() => setCurrentView('protocol_selection')} saveStatus={saveStatus} onFinish={handleBackToDashboard} />
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

                {currentView === 'patient_intake' && selectedPatient && 
                    <PatientIntake patient={selectedPatient} onSave={handleSavePatient} onBack={handleBackToDashboard} saveStatus={saveStatus} errorMessage={errorMessage} onUpdate={(patientData) => handleSavePatient(patientData, false)} />
                }
                {currentView === 'protocol_selection' && selectedPatient && 
                    <ProtocolSelection patient={selectedPatient as PatientData} onBack={handleBackToDashboard} onProtocolSelect={handleProtocolSelection} />
                }
                {currentView === 'treatment_history' && selectedPatient && 
                    <TreatmentHistory patient={selectedPatient as PatientData} onBack={handleBackToDashboard} />
                }

                {appUser && isSettingsModalOpen && (
                    <Modal
                        isOpen={isSettingsModalOpen}
                        onClose={() => setIsSettingsModalOpen(false)}
                        title="Application Settings"
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

export default App;
