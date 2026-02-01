import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import Login from './components/Login';
import PatientsDashboard from './components/PatientsDashboard';
import PatientDetails from './components/PatientDetails';
import Sidebar from './components/Sidebar';
import ProtocolAdmin from './components/ProtocolAdmin';
import ProtocolSelection from './components/ProtocolSelection';
import TreatmentExecution from './components/TreatmentExecution';
import TreatmentHistory from './components/TreatmentHistory';
import UserDetails from './components/UserDetails';
import { PatientData } from './types/patient';
import { AppUser } from './types/user';
import { Treatment } from './types/treatment';
import { Protocol } from './types/protocol';

type View = 'dashboard' | 'patient_details' | 'protocol_selection' | 'treatment_execution' | 'admin' | 'treatment_history' | 'user_details';
type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

const App: React.FC = () => {
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<PatientData[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
    const [activeProtocol, setActiveProtocol] = useState<Protocol | null>(null);
    const [treatmentNotes, setTreatmentNotes] = useState<{report: string, bloodPressure: string, heartRate: string}>({ report: '', bloodPressure: '', heartRate: '' });
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

    const fetchUserData = async (user: User): Promise<AppUser> => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            return { ...userSnap.data(), userId: user.uid } as AppUser;
        } else {
            const newUser: AppUser = { userId: user.uid, email: user.email || '', fullName: user.displayName || 'No Name', mobile: '', role: 'caretaker' };
            await setDoc(userRef, newUser);
            return newUser;
        }
    };

    const fetchInitialData = useCallback(async (user: AppUser) => {
        try {
            const q = query(collection(db, "patients"), where("caretakerId", "==", user.userId));
            const querySnapshot = await getDocs(q);
            const patientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PatientData));
            setPatients(patientsData);
        } catch (error) {
            console.error("Error fetching patient data:", error);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
            setIsLoading(true);
            if (user && user.email) {
                const appUserData = await fetchUserData(user);
                setAppUser(appUserData);
                await fetchInitialData(appUserData);
            } else {
                setAppUser(null);
                setPatients([]);
                setSelectedPatient(null);
                setActiveProtocol(null);
                setCurrentView('dashboard');
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [fetchInitialData]);

    const handleLogout = async () => { await signOut(auth); };
    const handleAdminClick = () => { setCurrentView('admin'); };
    const handleUserDetailsClick = () => { setCurrentView('user_details'); };

    const handleSaveUser = async (updatedUser: AppUser) => {
        if (!appUser) return;
        setSaveStatus('saving');
        const userRef = doc(db, 'users', appUser.userId);
        await updateDoc(userRef, { ...updatedUser });
        setAppUser(updatedUser);
        setSaveStatus('idle');
        setCurrentView('dashboard');
    };

    const handleSelectPatient = (patient: PatientData) => {
        setSelectedPatient(patient);
        setCurrentView('patient_details');
    };

    const handleAddPatient = () => {
        if (!appUser) return;
        const newPatient: PatientData = { id: `p${Date.now()}`, fullName: '', age: 0, identityNumber: '', email: '', mobile: '', condition: '', severity: 'Mild', caretakerId: appUser.userId, lastTreatment: new Date().toISOString().split('T')[0] };
        setSelectedPatient(newPatient);
        setCurrentView('patient_details');
    };
    
    const handleSavePatient = async (updatedPatient: PatientData) => {
        if(!appUser) return;
        setSaveStatus('saving');
        await setDoc(doc(db, "patients", updatedPatient.id), updatedPatient, { merge: true });
        await fetchInitialData(appUser);
        setSelectedPatient(null);
        setCurrentView('dashboard');
        setSaveStatus('idle');
    };

    const handleBackToDashboard = () => {
        setSelectedPatient(null);
        setActiveProtocol(null);
        setTreatmentNotes({ report: '', bloodPressure: '', heartRate: '' });
        setCurrentView('dashboard');
        setSaveStatus('idle');
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

    const handleProtocolSelection = (protocol: Protocol) => {
        setActiveProtocol(protocol);
        setCurrentView('treatment_execution');
    };
    
    const handleSaveTreatment = async (stungPoints: Treatment[], finalNotes: string) => {
        if (!selectedPatient || !activeProtocol || !appUser) return;
        setSaveStatus('saving');
        try {
            const treatmentRecord = {
                date: new Date().toISOString(),
                protocolId: activeProtocol.id,
                protocolName: activeProtocol.name,
                patientReport: treatmentNotes.report,
                vitals: `BP: ${treatmentNotes.bloodPressure}, HR: ${treatmentNotes.heartRate}`,
                stungPoints: stungPoints.map(p => ({ point: p.point, quantity: p.quantity, status: p.status })),
                finalNotes: finalNotes,
                caretakerId: appUser.userId
            };
            await addDoc(collection(db, `patients/${selectedPatient.id}/treatments`), treatmentRecord);
            await setDoc(doc(db, "patients", selectedPatient.id), { lastTreatment: new Date().toISOString().split('T')[0] }, { merge: true });
            await fetchInitialData(appUser);
            setSaveStatus('success');
        } catch (error) {
            console.error("Error saving new treatment:", error);
            setSaveStatus('error');
        }
    };

    const renderContent = () => {
        if (isLoading) return <div className="flex justify-center items-center h-screen"><div>Loading...</div></div>;
        if (!appUser) return <Login />;

        const isSaving = saveStatus === 'saving';

        return (
            <div className="flex min-h-screen bg-slate-50">
                <Sidebar user={appUser} onLogout={handleLogout} onAdminClick={handleAdminClick} onUserDetailsClick={handleUserDetailsClick} />
                <main className="flex-grow p-4 md:p-8">
                    {(() => {
                        switch (currentView) {
                            case 'user_details':
                                return <UserDetails user={appUser} onSave={handleSaveUser} onBack={handleBackToDashboard} />;
                            case 'patient_details':
                                return selectedPatient && <PatientDetails patient={selectedPatient} onSave={handleSavePatient} onBack={handleBackToDashboard} onStartTreatment={handleStartTreatmentFlow} />;
                            case 'protocol_selection':
                                return selectedPatient && <ProtocolSelection patient={selectedPatient} onBack={handleBackToDashboard} onProtocolSelect={handleProtocolSelection} treatmentNotes={treatmentNotes} setTreatmentNotes={setTreatmentNotes} />;
                            case 'treatment_execution':
                                return selectedPatient && activeProtocol && <TreatmentExecution patient={selectedPatient} protocol={activeProtocol} onSave={handleSaveTreatment} onBack={() => setCurrentView('protocol_selection')} saveStatus={saveStatus} onFinish={handleBackToDashboard} />;
                            case 'treatment_history':
                                return selectedPatient && <TreatmentHistory patient={selectedPatient} onBack={handleBackToDashboard} />;
                            case 'admin':
                                return <ProtocolAdmin />;
                            default:
                                return <PatientsDashboard user={appUser} patients={patients} onAddPatient={handleAddPatient} onUpdatePatient={handleSelectPatient} onShowTreatments={handleShowTreatments} onStartTreatment={handleStartTreatmentFromDashboard} />;
                        }
                    })()}
                </main>
            </div>
        );
    };

    return <>{renderContent()}</>;
};

export default App;
