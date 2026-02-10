
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import Login from './components/Login';
import PatientsDashboard from './components/PatientsDashboard';
import PatientDetails from './components/PatientDetails';
import Sidebar from './components/Sidebar';
import ProtocolAdmin from './components/ProtocolAdmin';
import PointsAdmin from './components/PointsAdmin';
import ProtocolSelection from './components/ProtocolSelection';
import TreatmentExecution from './components/TreatmentExecution';
import TreatmentHistory from './components/TreatmentHistory';
import UserDetails from './components/UserDetails';
import { PatientData } from './types/patient';
import { AppUser } from './types/user';
import { Protocol } from './types/protocol';
import { TreatmentSession, VitalSigns } from './types/treatmentSession';
import { logout } from './services/authService';

type View = 'dashboard' | 'patient_details' | 'protocol_selection' | 'treatment_execution' | 'admin_protocols' | 'admin_points' | 'treatment_history' | 'user_details' | 'onboarding_test';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

const App: React.FC = () => {
    const { i18n } = useTranslation();
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<PatientData[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
    const [activeProtocol, setActiveProtocol] = useState<Protocol | null>(null);
    const [activeTreatmentSession, setActiveTreatmentSession] = useState<Partial<TreatmentSession> | null>(null);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [authReady, setAuthReady] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');

    useEffect(() => {
        document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr';
    }, [i18n.language]);

    const fetchUserData = async (user: User): Promise<AppUser> => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            return { uid: user.uid, ...userSnap.data() } as AppUser;
        } else {
            const newUser: AppUser = { uid: user.uid, userId: user.uid, email: user.email || '', fullName: user.displayName || 'New User', displayName: user.displayName || 'New User', mobile: '', role: 'caretaker' };
            await setDoc(userRef, newUser);
            setCurrentView('onboarding_test'); // Redirect to onboarding
            return newUser;
        }
    };

    const fetchInitialData = useCallback(async (user: AppUser) => {
        if (!user || !user.userId) return;
        setIsLoading(true);
        try {
            const q = query(collection(db, "patients"), where("caretakerId", "==", user.userId));
            const querySnapshot = await getDocs(q);
            const patientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PatientData));
            setPatients(patientsData);
        } catch (error) {
            console.error("Error fetching patient data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Effect 1: Handle Authentication State
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

    // Effect 2: Fetch Data when User is Authenticated
    useEffect(() => {
        if (appUser) {
            fetchInitialData(appUser);
        }
    }, [appUser, fetchInitialData]);

    const handleLogout = async () => { await logout(); };
    const handleAdminClick = () => { setCurrentView('admin_protocols'); };
    const handlePointsAdminClick = () => { setCurrentView('admin_points'); };
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

    const handleSelectPatient = (patient: PatientData) => {
        setSelectedPatient(patient);
        setCurrentView('patient_details');
    };

    const handleAddPatient = () => {
        if (!appUser) return;
        const newPatient: PatientData = { 
            id: `p${Date.now()}`,
            fullName: '', 
            birthDate: '', 
            identityNumber: '', 
            email: '', 
            mobile: '', 
            condition: '', 
            severity: 'Mild', 
            caretakerId: appUser.userId, 
        };
        setSelectedPatient(newPatient);
        setCurrentView('patient_details');
    };
    
    const handleSavePatient = async (updatedPatient: PatientData) => {
        if (!appUser) return;
        setSaveStatus('saving');
        setErrorMessage('');

        const identityQuery = query(collection(db, "patients"), where("identityNumber", "==", updatedPatient.identityNumber));
        const emailQuery = query(collection(db, "patients"), where("email", "==", updatedPatient.email));

        const identityQuerySnapshot = await getDocs(identityQuery);
        const emailQuerySnapshot = await getDocs(emailQuery);

        const identityClash = identityQuerySnapshot.docs.find(doc => doc.id !== updatedPatient.id);
        if (identityClash) {
            const errorMsg = `Error: A patient with identity number '${updatedPatient.identityNumber}' already exists.`;
            console.error(errorMsg);
            setErrorMessage(errorMsg);
            setSaveStatus('error');
            return;
        }
        
        const emailClash = emailQuerySnapshot.docs.find(doc => doc.id !== updatedPatient.id);
        if (emailClash) {
            const errorMsg = `Error: A patient with email '${updatedPatient.email}' already exists.`;
            console.error(errorMsg);
            setErrorMessage(errorMsg);
            setSaveStatus('error');
            return;
        }

        await setDoc(doc(db, "patients", updatedPatient.id), updatedPatient, { merge: true });
        if(appUser) await fetchInitialData(appUser);
        setSelectedPatient(null);
        setCurrentView('dashboard');
        setSaveStatus('idle');
    };

    const handleDeletePatient = async (patientId: string) => {
        if (!appUser) return;
        try {
            await deleteDoc(doc(db, "patients", patientId));
            if(appUser) await fetchInitialData(appUser);
        } catch (error) {
            console.error("Error deleting patient:", error);
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

    const handleStartTreatmentFlow = () => {
        if (selectedPatient) {
            setCurrentView('protocol_selection');
        }
    };

    const handleStartTreatmentFromDashboard = (patient: PatientData) => {
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
        if (!selectedPatient || !activeTreatmentSession) return;
        setSaveStatus('saving');
        try {
            const finalTreatmentRecord: TreatmentSession = {
                ...activeTreatmentSession,
                stungPoints: data.stungPointIds,
                postStingVitals: data.postStingVitals,
                finalVitals: data.finalVitals,
                finalNotes: data.notes,
            } as TreatmentSession;

            await addDoc(collection(db, `patients/${selectedPatient.id}/treatments`), finalTreatmentRecord);
            await setDoc(doc(db, "patients", selectedPatient.id), { lastTreatment: new Date().toISOString().split('T')[0] }, { merge: true });
            if(appUser) await fetchInitialData(appUser);
            setSaveStatus('success');
        } catch (error) {
            console.error("Error saving new treatment:", error);
            setSaveStatus('error');
        }
    };

    const renderContent = () => {
        if (!authReady) {
            return <div className="flex justify-center items-center h-screen"><div>Initializing...</div></div>;
        }
        
        if (!appUser) {
            return <Login />;
        }

        if (isLoading) {
            return <div className="flex justify-center items-center h-screen"><div>Loading Patient Data...</div></div>;
        }

        return (
            <div className="flex h-screen bg-slate-50">
                <Sidebar 
                    user={appUser} 
                    onLogout={handleLogout} 
                    onAdminClick={handleAdminClick} 
                    onPointsAdminClick={handlePointsAdminClick} 
                    onUserDetailsClick={handleUserDetailsClick}
                    onPatientsClick={handleBackToDashboard} 
                />
                <main className="flex-grow p-4 md:p-8 overflow-y-auto">
                    {(() => {
                        switch (currentView) {
                            case 'user_details':
                                return <UserDetails user={appUser} onSave={handleSaveUser} onBack={handleBackToDashboard} />;
                            case 'onboarding_test':
                                return <UserDetails user={appUser} onSave={handleSaveUser} isOnboarding={true} />;
                            case 'patient_details':
                                return selectedPatient && appUser && <PatientDetails user={appUser} patient={selectedPatient} onSave={handleSavePatient} onBack={handleBackToDashboard} onStartTreatment={handleStartTreatmentFlow} saveStatus={saveStatus} errorMessage={errorMessage} />;
                            case 'protocol_selection':
                                return selectedPatient && <ProtocolSelection patient={selectedPatient} onBack={handleBackToDashboard} onProtocolSelect={handleProtocolSelection} />;
                            case 'treatment_execution':
                                return selectedPatient && activeProtocol && activeTreatmentSession && (
                                    <TreatmentExecution 
                                        patient={selectedPatient} 
                                        protocol={activeProtocol} 
                                        onSave={handleSaveTreatment} 
                                        onBack={() => setCurrentView('protocol_selection')} 
                                        saveStatus={saveStatus} 
                                        onFinish={handleBackToDashboard} 
                                    />
                                );
                            case 'treatment_history':
                                return selectedPatient && <TreatmentHistory patient={selectedPatient} onBack={handleBackToDashboard} />;
                            case 'admin_protocols':
                                return <ProtocolAdmin />;
                            case 'admin_points':
                                return <PointsAdmin />;
                            default:
                                return <PatientsDashboard user={appUser} patients={patients} onAddPatient={handleAddPatient} onUpdatePatient={handleSelectPatient} onShowTreatments={handleShowTreatments} onStartTreatment={handleStartTreatmentFromDashboard} onDeletePatient={handleDeletePatient} />;
                        }
                    })()}
                </main>
            </div>
        );
    };

    return <>{renderContent()}</>;
};

export default App;
