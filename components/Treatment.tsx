
import React, { useState } from 'react';
import { PatientData, TreatmentSession, Protocol, StingPoint } from '../types';
import Interactive3DModel from './Interactive3DModel';
import { X, Zap, Activity, FileText, BrainCircuit, ChevronRight, Clock, Plus } from 'lucide-react';

// Helper component for form sections - moved outside the main component
const FormSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div>
        <h4 className="flex items-center text-sm font-bold text-slate-600 mb-2">
            {icon}
            <span className="ml-2">{title}</span>
        </h4>
        {children}
    </div>
);


// Mock data - In a real app, this would come from a backend or a configuration file.
const mockProtocols: Protocol[] = [
  { id: 'proto1', name: 'Protocol A: Anti-Inflammatory', points: [] }, // Points are now managed in the 3D component
  { id: 'proto2', name: 'Protocol B: Nerve & Systemic Balance', points: [] },
];

type TreatmentStep = 'vitals' | 'protocol' | 'mapping';

interface TreatmentProps {
  patient: PatientData;
  onSave: (treatment: TreatmentSession) => void;
  onExit: () => void;
}

const Treatment: React.FC<TreatmentProps> = ({ patient, onSave, onExit }) => {
    const [currentStep, setCurrentStep] = useState<TreatmentStep>('vitals');
    const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);

    // Form state
    const [treatmentDate] = useState(new Date());
    const [systolic, setSystolic] = useState(120);
    const [diastolic, setDiastolic] = useState(80);
    const [heartRate, setHeartRate] = useState(70);
    const [patientReport, setPatientReport] = useState('');
    const [stungPoints, setStungPoints] = useState<StingPoint[]>([]);
    const [manualStingPoint, setManualStingPoint] = useState('');
    const [painLevel, setPainLevel] = useState(3);
    const [finalNotes, setFinalNotes] = useState('');

    const handleSelectProtocol = (protocol: Protocol) => { 
        setSelectedProtocol(protocol); 
        setCurrentStep('mapping'); 
    }

    const handlePointSelected = (point: StingPoint) => {
        if (!stungPoints.find(p => p.id === point.id)) {
            setStungPoints(prev => [...prev, point]);
        }
    }
    
    const handleAddManualPoint = () => {
        if(manualStingPoint.trim()) {
            const newPoint: StingPoint = { 
                id: `manual_${Date.now()}`,
                name: manualStingPoint.trim(), 
                explanation: 'Manually added',
                position: { x: 0, y: 0, z: 0} // Manual points won't be visualized
            };
            setStungPoints(prev => [...prev, newPoint]);
            setManualStingPoint('');
        }
    }

    const handleSaveTreatment = () => {
        const newTreatment: TreatmentSession = {
            id: `treat_${Date.now()}`,
            patientId: patient.id,
            date: treatmentDate.toISOString(),
            durationMinutes: 30, // Mocked
            report: patientReport,
            finalNotes: finalNotes,
            beeStingCount: stungPoints.length,
            painLevel,
            bloodPressure: { systolic, diastolic },
            heartRate,
            stungPoints,
        };
        onSave(newTreatment);
        onExit();
    }

    return (
    <div className="flex h-full gap-6 animate-fade-in">
        {/* Left Panel: 3D Model */}
        <div className="w-1/2 h-full bg-slate-100 rounded-3xl overflow-hidden">
            <Interactive3DModel protocol={currentStep === 'mapping' ? selectedProtocol : null} stungPoints={stungPoints} onPointSelected={handlePointSelected} />
        </div>

        {/* Right Panel: Form */}
        <div className="w-1/2 bg-white rounded-3xl p-6 shadow-lg border border-slate-100 flex flex-col">
             <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tighter">New Treatment</h3>
                    <p className="text-sm text-slate-500">For: {patient.fullName}</p>
                </div>
                <button onClick={onExit} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-500"><X size={20}/></button>
            </div>
            
            <div className="mb-6 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 p-2 rounded-lg border"><Clock size={14} /><span>{treatmentDate.toLocaleString()}</span></div>

            {/* Form Content Area */}
            <div className="flex-grow overflow-y-auto custom-scrollbar -mr-3 pr-3 space-y-6">
                {currentStep === 'vitals' && (
                     <div className="animate-fade-in space-y-6">
                        <FormSection title="Patient's Report" icon={<FileText size={16} className="text-yellow-500"/>}>
                            <textarea value={patientReport} onChange={e => setPatientReport(e.target.value)} placeholder="e.g., Increased morning stiffness..." className="w-full p-2 border rounded-md h-28 bg-slate-50 border-slate-200 focus:outline-yellow-500"/>
                        </FormSection>

                         <FormSection title="Vitals" icon={<Activity size={16} className="text-yellow-500"/>}>
                            <div className="grid grid-cols-2 gap-x-4">
                                <label className="text-sm font-medium text-slate-700 col-span-1">Blood Pressure</label>
                                <label className="text-sm font-medium text-slate-700 col-span-1">Heart Rate (bpm)</label>
                                <div className="col-span-1 flex items-center gap-2">
                                    <input type="number" value={systolic} onChange={e => setSystolic(Number(e.target.value))} className="w-full p-2 border rounded-md bg-slate-50 border-slate-200 focus:outline-yellow-500"/>
                                    <span className="font-bold text-slate-400">/</span>
                                    <input type="number" value={diastolic} onChange={e => setDiastolic(Number(e.target.value))} className="w-full p-2 border rounded-md bg-slate-50 border-slate-200 focus:outline-yellow-500"/>
                                </div>
                                <div className="col-span-1">
                                   <input type="number" value={heartRate} onChange={e => setHeartRate(Number(e.target.value))} className="w-full p-2 border rounded-md bg-slate-50 border-slate-200 focus:outline-yellow-500"/>
                                </div>
                            </div>
                        </FormSection>
                    </div>
                )}

                {currentStep === 'protocol' && (
                    <div className="animate-fade-in space-y-4">
                        <FormSection title="AI Protocol Suggestions" icon={<BrainCircuit size={16} className="text-yellow-500"/>}>
                           {mockProtocols.map(proto => (
                                <div key={proto.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-yellow-500 transition cursor-pointer" onClick={() => handleSelectProtocol(proto)}>
                                    <h5 className="font-bold text-slate-800">{proto.name}</h5>
                                    <p className="text-xs text-slate-500 mt-1">Select this protocol to see points on the model.</p>
                                </div>
                            ))}
                        </FormSection>
                    </div>
                )}

                {currentStep === 'mapping' && (
                     <div className="animate-fade-in space-y-5">
                        <FormSection title="Live Treatment" icon={<Zap size={16} className="text-yellow-500"/>}>
                            <div className="flex gap-2">
                                <input type="text" value={manualStingPoint} onChange={e => setManualStingPoint(e.target.value)} placeholder="Add manual point, e.g., LV3" className="flex-grow w-full p-2 border rounded-md bg-slate-50 border-slate-200 focus:outline-yellow-500"/>
                                <button onClick={handleAddManualPoint} className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-800 transition"><Plus size={16}/></button>
                            </div>
                        </FormSection>

                        <div>
                            <label className="text-sm font-medium text-slate-700">Sting Points Applied ({stungPoints.length})</label>
                            <div className="mt-1 p-3 min-h-[4rem] bg-slate-50 border border-slate-100 rounded-xl text-xs font-mono text-slate-600">
                                {stungPoints.length > 0 ? stungPoints.map(p => p.name).join(', ') : "Double-click points on the model or add manually..."}
                            </div>
                        </div>

                         <div>
                            <label className="text-sm font-medium text-slate-700">Final Pain Level (1-10): <span className='font-bold'>{painLevel}</span></label>
                            <input type="range" min="1" max="10" value={painLevel} onChange={e => setPainLevel(Number(e.target.value))} className="w-full mt-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"/>
                        </div>

                         <div>
                            <label className="text-sm font-medium text-slate-700">Caretaker's Final Notes</label>
                            <textarea value={finalNotes} onChange={e => setFinalNotes(e.target.value)} placeholder="e.g., Patient tolerated well..." className="w-full p-2 border rounded-md h-24 bg-slate-50 border-slate-200 focus:outline-yellow-500"/>
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col gap-3 pt-4 border-t border-slate-200">
                {currentStep === 'vitals' && (
                    <button onClick={() => setCurrentStep('protocol')} className="w-full flex items-center justify-center gap-2 text-white bg-slate-800 hover:bg-slate-700 font-bold py-3 px-4 rounded-lg transition">
                        Find Protocol <ChevronRight size={16}/>
                    </button>
                )}
                {currentStep === 'mapping' && (
                    <button onClick={handleSaveTreatment} className="w-full text-slate-900 bg-yellow-500 hover:bg-yellow-400 font-bold py-3 px-4 rounded-lg transition">
                        Save Treatment Record
                    </button>
                )}
                <button onClick={onExit} className="w-full text-slate-600 bg-transparent hover:bg-slate-100 font-bold py-2 px-4 rounded-lg transition border border-slate-200">
                    Cancel
                </button>
            </div>
        </div>
    </div>
  );
};

export default Treatment;
