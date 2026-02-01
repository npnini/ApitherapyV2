import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { Login } from './components/Login';
import Dashboard from './components/Dashboard';
import PatientDetails from './components/PatientDetails';
import TreatmentPlanner from './components/TreatmentPlanner';
import Header from './components/Header';
import { PatientData } from './types/patient';
import { AppUser } from './types/user';
import { Treatment } from './types/treatment';

type View = 'dashboard' | 'patient_details' | 'treatment_planner';

const App: React.FC = () => {
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [patients, setPatients] = useState<PatientData[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const fetchData = useCallback(async (user: AppUser) => {
        setIsLoading(true);
        try {
            const q = query(collection(db, "patients"), where("caretakerId", "==", user.userId));
            const querySnapshot = await getDocs(q);
            const patientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PatientData));
            setPatients(patientsData);

            if (selectedPatient) {
                const treatmentsQuery = query(collection(db, `patients/${selectedPatient.id}/treatments`));
                const treatmentsSnapshot = await getDocs(treatmentsQuery);
                const treatmentsData = treatmentsSnapshot.docs.map(doc => ({ ...doc.data() } as Treatment));
                setTreatments(treatmentsData);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedPatient]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
            if (user && user.email) {
                const appUserData: AppUser = {
                    userId: user.uid,
                    email: user.email,
                    displayName: user.displayName || 'No Name',
                    photoURL: user.photoURL || ''
                };
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
        setCurrentView('dashboard');
    };

    const handleStartTreatment = () => {
        if (selectedPatient) {
            setCurrentView('treatment_planner');
        }
    };
    
    const handleSaveTreatments = async (updatedTreatments: Treatment[]) => {
        if (!selectedPatient) return;
        setIsSaving(true);
        try {
            const batch = [];
            for (const treatment of updatedTreatments) {
                const treatmentRef = doc(db, `patients/${selectedPatient.id}/treatments`, treatment.id);
                batch.push(setDoc(treatmentRef, treatment, { merge: true }));
            }
            await Promise.all(batch);
            setTreatments(updatedTreatments); 
        } catch (error) {
            console.error("Error saving treatments:", error);
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
            case 'treatment_planner':
                return selectedPatient && <TreatmentPlanner patient={selectedPatient} treatments={treatments} onSave={handleSaveTreatments} onBack={() => setCurrentView('patient_details')} isSaving={isSaving} />;
            default:
                return <Dashboard patients={patients} onSelectPatient={handleSelectPatient} onAddPatient={handleAddPatient} />;
        }
    };

    if (!appUser) {
        return <Login />;
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header user={appUser} onLogout={handleLogout} />
            <main className="p-4 md:p-8">
                {renderContent()}
            </main>
        </div>
    );
};

export default App;
