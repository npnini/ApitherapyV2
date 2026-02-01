import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where, getDoc } from 'firebase/firestore';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import PatientDetails from './components/PatientDetails';
import TreatmentPlanner from './components/TreatmentPlanner';
import Header from './components/Header';
import ProtocolAdmin from './components/ProtocolAdmin';
import ProtocolSelection from './components/ProtocolSelection';
import { PatientData } from './types/patient';
import { AppUser } from './types/user';
import { Treatment } from './types/treatment';
import { Protocol } from './types/protocol';

type View = 'dashboard' | 'patient_details' | 'protocol_selection' | 'treatment_planner' | 'admin';

const App: React.FC = () => {
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<PatientData[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [activeProtocol, setActiveProtocol] = useState<Protocol | null>(null);
    const [treatmentNotes, setTreatmentNotes] = useState<{report: string, vitals: string} | null>(null);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const fetchUserData = async (user: User): Promise<AppUser> => {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            return userSnap.data() as AppUser;
        } else {
            const newUser: AppUser = {
                userId: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'No Name',
                photoURL: user.photoURL || '',
                role: 'caretaker'
            };
            await setDoc(userRef, newUser);
            return newUser;
        }
    };

    const fetchData = useCallback(async (user: AppUser) => {
        setIsLoading(true);
        try {
            const q = query(collection(db, "patients"), where("caretakerId", "==", user.userId));
            const querySnapshot = await getDocs(q);
            const patientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PatientData));
            setPatients(patientsData);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
            if (user && user.email) {
                const appUserData = await fetchUserData(user);
                setAppUser(appUserData);
                await fetchData(appUserData);
            } else {
                setAppUser(null);
                setPatients([]);
                setSelectedPatient(null);
                setTreatments([]);
                setCurrentView('dashboard');
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [fetchData]);

    const handleLogout = async () => {
        await signOut(auth);
    };

    const handleAdminClick = () => {
        setCurrentView('admin');
    }

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
        setIsLoading(true);
        await setDoc(doc(db, "patients", updatedPatient.id), updatedPatient, { merge: true });
        await fetchData(appUser);
        setSelectedPatient(null);
        setCurrentView('dashboard');
        setIsLoading(false);
      };

    const handleBackToDashboard = () => {
        setSelectedPatient(null);
        setActiveProtocol(null);
        setTreatmentNotes(null);
        setCurrentView('dashboard');
    };

    const handleStartTreatment = () => {
        if (selectedPatient) {
            setCurrentView('protocol_selection');
        }
    };

    const handleProtocolSelection = (protocol: Protocol, report: string, vitals: string) => {
        setActiveProtocol(protocol);
        setTreatmentNotes({ report, vitals });
        const initialTreatments = protocol.stingingPoints.map(point => ({
            id: point.id,
            point: point.name,
            status: 'pending'
        }));
        setTreatments(initialTreatments);
        setCurrentView('treatment_planner');
    };
    
    const handleSaveTreatments = async (updatedTreatments: Treatment[]) => {
        if (!selectedPatient || !activeProtocol || !treatmentNotes || !appUser) return;
        setIsSaving(true);
        try {
            const treatmentRecord = {
                date: new Date().toISOString(),
                protocolId: activeProtocol.id,
                protocolName: activeProtocol.name,
                report: treatmentNotes.report,
                vitals: treatmentNotes.vitals,
                points: updatedTreatments,
                caretakerId: appUser.userId
            };

            const newTreatmentRef = doc(collection(db, `patients/${selectedPatient.id}/treatments`));
            await setDoc(newTreatmentRef, treatmentRecord);

            await setDoc(doc(db, "patients", selectedPatient.id), { lastTreatment: new Date().toISOString().split('T')[0] }, { merge: true });
            
            await fetchData(appUser);
            setCurrentView('dashboard');
            setSelectedPatient(null);
            setActiveProtocol(null);
            setTreatmentNotes(null);

        } catch (error) {
            console.error("Error saving new treatment:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex justify-center items-center h-full"><div>Initializing...</div></div>;
        }

        switch (currentView) {
            case 'patient_details':
                return selectedPatient && <PatientDetails patient={selectedPatient} onSave={handleSavePatient} onBack={handleBackToDashboard} onStartTreatment={handleStartTreatment} />;
            case 'protocol_selection':
                return selectedPatient && <ProtocolSelection patient={selectedPatient} onBack={() => setCurrentView('patient_details')} onProtocolSelect={handleProtocolSelection} />;
            case 'treatment_planner':
                return selectedPatient && activeProtocol && <TreatmentPlanner patient={selectedPatient} treatments={treatments} onSave={handleSaveTreatments} onBack={() => setCurrentView('protocol_selection')} isSaving={isSaving} />;
            case 'admin':
                return <ProtocolAdmin />;
            default:
                return <Dashboard patients={patients} onSelectPatient={handleSelectPatient} onAddPatient={handleAddPatient} />;
        }
    };

    if (!appUser) {
        return <Login />;
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header user={appUser} onLogout={handleLogout} onAdminClick={handleAdminClick} />
            <main className="p-4 md:p-8">
                {renderContent()}
            </main>
        </div>
    );
};

export default App;
