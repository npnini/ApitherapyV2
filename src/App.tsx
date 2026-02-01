
import React, { useState, useEffect } from 'react';
import { PatientData, User, TreatmentSession } from './types';
import Login from './components/Login'; // Corrected import path
import CaretakerDetails from './components/CaretakerDetails';
import PatientsDashboard from './components/PatientsDashboard';
import PatientDetails from './components/PatientDetails';
import TreatmentsList from './components/TreatmentsList';
import Treatment from './components/Treatment';
import { auth, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { collection, doc, getDoc, setDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { Beaker, ShieldCheck, Settings, Menu, ChevronRight, LayoutDashboard, BarChart3, ShieldAlert, User as UserIcon, LogOut } from 'lucide-react';

type AppView = 'dashboard' | 'treatment' | 'reporting' | 'admin' | 'patient_details' | 'treatments_list' | 'caretaker_details';

const LoadingSpinner: React.FC<{ message: string }> = ({ message }) => (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Beaker size={48} className="text-yellow-500 animate-pulse"/>
        <p className="text-lg font-black tracking-tighter mt-4">{message}</p>
    </div>
);

const App: React.FC = () => {
  const [appUser, setAppUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const [patients, setPatients] = useState<PatientData[]>([]);
  const [treatments, setTreatments] = useState<TreatmentSession[]>([]);

  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
            setIsLoading(true);
            await handleUserLogin(firebaseUser);
            setIsLoading(false);
        } else {
            setAppUser(null);
            setIsLoading(false);
        }
    });
    return () => unsubscribe();
  }, []);

  const handleUserLogin = async (firebaseUser: FirebaseUser) => {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data() as User;
      setAppUser(userData);
      await fetchData(userData);
      setNeedsOnboarding(false);
      setCurrentView('dashboard');
    } else {
      const newUser: User = {
        userId: firebaseUser.uid,
        email: firebaseUser.email || '',
        fullName: firebaseUser.displayName || '',
        mobile: firebaseUser.phoneNumber || '',
        role: 'caretaker'
      };
      try {
        await setDoc(userRef, newUser);
        setAppUser(newUser);
        if (!newUser.fullName) { setNeedsOnboarding(true); }
        else { await fetchData(newUser); }
      } catch (error) {
        console.error("Firebase Write Error:", error);
        await auth.signOut();
      }
    }
  };

  const fetchData = async (currentUser: User) => {
    const patientsQuery = query(collection(db, "patients"), where("caretakerId", "==", currentUser.userId));
    const patientsSnapshot = await getDocs(patientsQuery);
    const patientsList = patientsSnapshot.docs.map(doc => doc.data() as PatientData);
    setPatients(patientsList);
  };

  const handleSignOut = async () => {
      await auth.signOut();
  }

  const handleCaretakerSave = async (details: { userId: string; fullName: string; mobile: string; }) => {
    if (!appUser) return;
    setIsLoading(true);
    const updatedUser = { ...appUser, ...details };
    await setDoc(doc(db, "users", appUser.userId), updatedUser);
    setAppUser(updatedUser);
    setNeedsOnboarding(false);
    await fetchData(updatedUser);
    setCurrentView('dashboard');
    setIsLoading(false);
  };

  const handleAddPatient = () => {
    if (!appUser) return;
    const newPatient: PatientData = { id: `p${Date.now()}`, fullName: '', identityNumber: '', email: '', mobile: '', condition: '', severity: 'Mild', caretakerId: appUser.userId, lastTreatment: new Date().toISOString().split('T')[0] };
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

  const handleSaveTreatment = async (treatment: TreatmentSession) => {
    if(!appUser) return;
    setIsLoading(true);
    const batch = writeBatch(db);
    batch.set(doc(db, "treatments", treatment.id), treatment);
    batch.update(doc(db, "patients", treatment.patientId), { lastTreatment: treatment.date.split('T')[0] });
    await batch.commit();
    await fetchData(appUser);
    setCurrentView('dashboard');
    setIsLoading(false);
  };

  const handleStartTreatment = (p: PatientData) => { setSelectedPatient(p); setCurrentView('treatment'); };
  const handleUpdatePatient = (p: PatientData) => { setSelectedPatient(p); setCurrentView('patient_details'); };
  const handleShowTreatments = (p: PatientData) => { setSelectedPatient(p); setCurrentView('treatments_list'); };
  const handleBackToDashboard = () => { setSelectedPatient(null); setCurrentView('dashboard'); };
  const handleEditCaretaker = () => { setCurrentView('caretaker_details'); };

  if (isLoading) {
    return <LoadingSpinner message="Initializing..." />;
  }

  if (!appUser) {
    return <Login />;
  }

  if (needsOnboarding) {
      return <CaretakerDetails user={appUser} onSave={handleCaretakerSave} />
  }

  const renderMainView = () => {
      switch (currentView) {
          case 'dashboard': return <PatientsDashboard user={appUser} patients={patients} onAddPatient={handleAddPatient} onStartTreatment={handleStartTreatment} onUpdatePatient={handleUpdatePatient} onShowTreatments={handleShowTreatments} />;
          case 'patient_details': return selectedPatient && <PatientDetails patient={selectedPatient} onSave={handleSavePatient} onCancel={handleBackToDashboard} />;
          case 'treatments_list': return selectedPatient && <TreatmentsList patient={selectedPatient} treatments={treatments.filter(t => t.patientId === selectedPatient.id)} onBack={handleBackToDashboard} />;
          case 'treatment': return selectedPatient && <Treatment patient={selectedPatient} onSave={handleSaveTreatment} onExit={handleBackToDashboard} />;
          case 'caretaker_details': return <CaretakerDetails user={appUser} onSave={handleCaretakerSave} />;
          default: return <div>Unknown View</div>;
      }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans overflow-hidden">
        {/* Sidebar and Main Content... */}
    </div>
  );
};

export default App;
