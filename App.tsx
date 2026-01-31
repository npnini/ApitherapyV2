
import React, { useState, useCallback, useEffect } from 'react';
import { SessionState, PatientData, Protocol } from './types';
import PatientForm from './components/PatientForm';
import ProtocolSelector from './components/ProtocolSelector';
import HumanModel from './components/HumanModel';
import { TREATMENT_POINTS } from './constants';
import { generatePreFilledUrl } from './services/formService';
import { 
  Beaker, 
  UserCheck, 
  Stethoscope, 
  FileText, 
  RotateCw, 
  CheckCircle, 
  ExternalLink, 
  Settings, 
  Save, 
  Database,
  Trash2,
  X,
  Printer,
  Github,
  Copy,
  Clock,
  Zap,
  Download,
  AlertCircle,
  ShieldCheck,
  LayoutDashboard,
  LogIn,
  Users,
  BarChart3,
  ShieldAlert,
  ChevronRight,
  Menu,
  KeyRound
} from 'lucide-react';

// Main App Views
type AppView = 'login' | 'treatment' | 'onboarding' | 'reporting' | 'admin';

// Treatment Flow Steps
enum TreatmentStep {
  Intake,
  Selection,
  InteractiveMap,
  Summary
}

const STORAGE_KEY = 'apitherapy_current_session';

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<AppView>('treatment');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Treatment Flow State
  const [session, setSession] = useState<SessionState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return { patient: null, selectedProtocol: null, appliedPoints: [] };
  });

  const [treatmentStep, setTreatmentStep] = useState<TreatmentStep>(() => {
    if (!session.patient) return TreatmentStep.Intake;
    if (!session.selectedProtocol) return TreatmentStep.Selection;
    return TreatmentStep.InteractiveMap;
  });

  const [autoRotate, setAutoRotate] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [startTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date | null>(null);

  useEffect(() => {
    if (currentView === 'treatment') {
      setIsSaving(true);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      const timer = setTimeout(() => {
        setLastSaved(new Date());
        setIsSaving(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [session, currentView]);

  const handlePatientSubmit = (data: PatientData) => {
    setSession(prev => ({ ...prev, patient: data }));
    setTreatmentStep(TreatmentStep.Selection);
  };

  const handleProtocolSelect = (protocol: Protocol) => {
    setSession(prev => ({ ...prev, selectedProtocol: protocol }));
    setTreatmentStep(TreatmentStep.InteractiveMap);
  };

  const togglePoint = useCallback((id: string) => {
    setSession(prev => {
      const isApplied = prev.appliedPoints.includes(id);
      const newPoints = isApplied 
        ? prev.appliedPoints.filter(p => p !== id) 
        : [...prev.appliedPoints, id];
      return { ...prev, appliedPoints: newPoints };
    });
  }, []);

  const handleFinalize = () => {
    setEndTime(new Date());
    setTreatmentStep(TreatmentStep.Summary);
  };

  const resetTreatment = () => {
    if (window.confirm("Start a new session? Current patient data will be cleared.")) {
      localStorage.removeItem(STORAGE_KEY);
      setSession({ patient: null, selectedProtocol: null, appliedPoints: [] });
      setTreatmentStep(TreatmentStep.Intake);
      setShowSettings(false);
    }
  };

  // Sidebar Menu Items
  const menuItems = [
    { id: 'login', label: 'Login & Auth', icon: LogIn, sub: ['Authorized Caretaker', 'New Registration', 'Change Password'] },
    { id: 'treatment', label: 'Treatment Flow', icon: Stethoscope, sub: ['Patient Mapping', 'Protocol Selection'] },
    { id: 'onboarding', label: 'Onboarding', icon: Users, sub: ['Caretaker Onboarding', 'Patient Onboarding'] },
    { id: 'reporting', label: 'Reporting', icon: BarChart3, sub: ['Patients List', 'Treatments List'] },
    { id: 'admin', label: 'Admin & Control', icon: ShieldAlert, sub: ['Caretakers List', 'Block/Access Control'] },
  ];

  const PlaceholderView = ({ title, icon: Icon, subItems }: { title: string, icon: any, subItems: string[] }) => (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center animate-fade-in">
      <div className="bg-slate-100 p-8 rounded-full mb-6">
        <Icon size={64} className="text-slate-400" />
      </div>
      <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">{title.toUpperCase()}</h2>
      <p className="text-slate-500 max-w-md mb-8">This module is part of the planned roadmap. Development for the following workflows is in progress:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg w-full">
        {subItems.map(item => (
          <div key={item} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-3 text-left">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans overflow-hidden">
      {/* SIDEBAR */}
      <aside className={`${sidebarOpen ? 'w-80' : 'w-20'} bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col z-[70] shadow-2xl`}>
        <div className="p-6 flex items-center justify-between">
          <div className={`flex items-center gap-3 ${!sidebarOpen && 'hidden'}`}>
            <div className="bg-yellow-500 p-2 rounded-xl shadow-lg shadow-yellow-500/20">
              <Beaker size={20} className="text-slate-900" />
            </div>
            <h1 className="text-lg font-black tracking-tighter">APITHERAPY<span className="text-yellow-500">CARE</span></h1>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400">
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-grow p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as AppView)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all group ${
                currentView === item.id 
                  ? 'bg-yellow-500 text-slate-900 font-black shadow-lg shadow-yellow-500/10' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} className={currentView === item.id ? 'text-slate-900' : 'group-hover:text-yellow-500'} />
              {sidebarOpen && (
                <div className="flex-grow text-left">
                  <span className="text-xs uppercase tracking-widest">{item.label}</span>
                </div>
              )}
              {sidebarOpen && currentView === item.id && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-slate-800">
          <div className={`flex items-center gap-3 ${!sidebarOpen && 'justify-center'}`}>
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-yellow-500 font-black">
              JS
            </div>
            {sidebarOpen && (
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Authorized Caretaker</p>
                <p className="text-xs font-bold text-white">Dr. John Smith</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-grow flex flex-col h-screen overflow-hidden">
        {/* Top Header Bar */}
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
             <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
               {menuItems.find(i => i.id === currentView)?.label}
             </h2>
             {currentView === 'treatment' && (
               <div className="flex items-center gap-2">
                 <span className="text-slate-300">/</span>
                 <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded uppercase">
                   {TreatmentStep[treatmentStep]}
                 </span>
               </div>
             )}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
               <ShieldCheck size={14} className="text-green-500" />
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Security: Standard Compliance</span>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-2.5 hover:bg-slate-100 rounded-xl transition text-slate-400">
              <Settings size={20} />
            </button>
          </div>
        </header>

        {/* Dynamic Viewport */}
        <main className="flex-grow overflow-y-auto bg-gray-50 custom-scrollbar relative p-8">
          {currentView === 'treatment' ? (
            <div className="max-w-7xl mx-auto h-full">
              {treatmentStep === TreatmentStep.Intake && <PatientForm onSubmit={handlePatientSubmit} />}
              {treatmentStep === TreatmentStep.Selection && session.patient && (
                <ProtocolSelector patient={session.patient} onSelect={handleProtocolSelect} />
              )}
              {treatmentStep === TreatmentStep.InteractiveMap && session.selectedProtocol && (
                <div className="space-y-6 animate-fade-in h-full flex flex-col">
                  <div className="flex justify-between items-center shrink-0">
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Anatomical Mapping</h3>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Patient: {session.patient?.fullName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setAutoRotate(!autoRotate)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs transition border ${
                          autoRotate ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 shadow-sm'
                        }`}
                      >
                        <RotateCw size={14} className={autoRotate ? 'animate-spin-slow' : ''} />
                        {autoRotate ? 'AUTO-SPIN' : 'MANUAL'}
                      </button>
                      <button 
                        onClick={handleFinalize}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white font-black px-8 py-3 rounded-2xl shadow-xl shadow-yellow-500/20 flex items-center justify-center gap-2 transition transform active:scale-95 text-xs uppercase tracking-widest"
                      >
                        <CheckCircle size={16} />
                        Finalize Map
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-grow min-h-0">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-full">
                      <div className="lg:col-span-3 h-full min-h-[500px]">
                        <HumanModel 
                          protocol={session.selectedProtocol} 
                          appliedPoints={session.appliedPoints}
                          togglePoint={togglePoint}
                          autoRotate={autoRotate}
                        />
                      </div>
                      <div className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col h-full shadow-sm">
                        <h4 className="font-black text-slate-900 mb-6 flex items-center justify-between text-[10px] tracking-widest uppercase">
                          Applied Stings
                          <span className="bg-yellow-500 text-slate-900 px-2 py-0.5 rounded-full">{session.appliedPoints.length}</span>
                        </h4>
                        <div className="flex-grow overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                          {session.appliedPoints.length === 0 ? (
                            <div className="text-center py-12 px-4 opacity-40">
                              <Zap className="mx-auto mb-2" size={20} />
                              <p className="text-[10px] font-bold uppercase tracking-widest">Click model to log</p>
                            </div>
                          ) : (
                            session.appliedPoints.map(id => {
                              const pt = TREATMENT_POINTS.find(p => p.id === id);
                              return (
                                <div key={id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 group animate-fade-in">
                                  <span className="text-[10px] font-black text-slate-700 uppercase">{pt?.name}</span>
                                  <button onClick={() => togglePoint(id)} className="text-slate-300 hover:text-red-500 transition">✕</button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {treatmentStep === TreatmentStep.Summary && session.patient && session.selectedProtocol && (
                <div className="max-w-4xl mx-auto py-4">
                  <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100">
                    <div className="bg-slate-900 p-12 text-white flex justify-between items-center">
                       <div>
                         <p className="text-yellow-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Summary Report</p>
                         <h2 className="text-5xl font-black tracking-tighter">Session Record</h2>
                       </div>
                       <div className="bg-white/5 p-6 rounded-3xl backdrop-blur-md text-right border border-white/10">
                          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Ref ID</p>
                          <p className="text-lg font-black font-mono">ATP-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                       </div>
                    </div>
                    <div className="p-12 space-y-12">
                       <div className="grid grid-cols-2 gap-12">
                          <div className="space-y-2">
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Patient Profile</h4>
                             <p className="text-4xl font-black text-slate-900 tracking-tighter">{session.patient.fullName}</p>
                             <p className="text-sm font-bold text-slate-500 uppercase">{session.patient.condition} • {session.patient.severity}</p>
                          </div>
                          <div className="space-y-2 text-right">
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Treatment Stats</h4>
                             <div className="flex justify-end gap-8">
                                <div><p className="text-4xl font-black text-slate-900">{session.appliedPoints.length}</p><p className="text-[10px] font-black text-slate-400 uppercase">Stings</p></div>
                                <div><p className="text-4xl font-black text-slate-900">{Math.floor((new Date().getTime() - startTime.getTime()) / 60000)}m</p><p className="text-[10px] font-black text-slate-400 uppercase">Duration</p></div>
                             </div>
                          </div>
                       </div>
                       
                       <div className="flex gap-4">
                          <button onClick={() => window.print()} className="flex-1 bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-slate-800 transition flex items-center justify-center gap-3 uppercase text-[10px] tracking-widest">
                            <Printer size={16} /> PDF Report
                          </button>
                          <button onClick={resetTreatment} className="flex-1 bg-yellow-500 text-slate-900 font-black py-5 rounded-2xl hover:bg-yellow-400 transition flex items-center justify-center gap-3 uppercase text-[10px] tracking-widest">
                            <FileText size={16} /> New Session
                          </button>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <PlaceholderView 
              title={menuItems.find(i => i.id === currentView)?.label || 'Module'} 
              icon={menuItems.find(i => i.id === currentView)?.icon || LayoutDashboard}
              subItems={menuItems.find(i => i.id === currentView)?.sub || []}
            />
          )}
        </main>
      </div>

      {/* Control Panel Overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowSettings(false)} />
          <div className="relative w-96 bg-white h-full shadow-2xl flex flex-col animate-slide-in">
            <div className="p-8 border-b flex items-center justify-between">
              <h3 className="font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
                <Database size={18} className="text-yellow-600" /> System Control
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6 flex-grow overflow-y-auto custom-scrollbar">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Session Backup</p>
                <button 
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(session)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `apitherapy-dump-${new Date().getTime()}.json`;
                    a.click();
                  }}
                  className="w-full bg-white border border-slate-200 p-4 rounded-xl text-left flex items-center gap-3 hover:border-yellow-500 transition"
                >
                  <Download size={18} className="text-slate-400" />
                  <span className="text-xs font-black text-slate-700 uppercase">Export Raw Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slide-in { animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-spin-slow { animation: spin 12s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
};

export default App;
