
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData } from '../types/patient';
import { Protocol } from '../types/protocol';
import { ChevronLeft, BrainCircuit, List, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ProtocolSelectionProps {
    patient: PatientData;
    onBack: () => void;
    onProtocolSelect: (protocol: Protocol) => void;
    treatmentNotes: { report: string; bloodPressure: string; heartRate: string };
    setTreatmentNotes: (notes: { report: string; bloodPressure: string; heartRate: string }) => void;
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({ patient, onBack, onProtocolSelect, treatmentNotes, setTreatmentNotes }) => {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language === 'he';

    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [proposedProtocols, setProposedProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isFinding, setIsFinding] = useState<boolean>(false);
    const [showFullList, setShowFullList] = useState(false);

    const isFormValid = treatmentNotes.report.trim() !== '' && treatmentNotes.bloodPressure.trim() !== '' && treatmentNotes.heartRate.trim() !== '';

    useEffect(() => {
        const fetchProtocols = async () => {
            setIsLoading(true);
            const protocolSnapshot = await getDocs(collection(db, 'protocols'));
            const protocolsData = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol));
            setAllProtocols(protocolsData);
            setIsLoading(false);
        };
        fetchProtocols();
    }, []);

    const handleFindProtocol = async () => {
        if (!isFormValid) return;
        setIsFinding(true);
        setShowFullList(false);
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockProposals = allProtocols.slice(0, 3);
        setProposedProtocols(mockProposals);
        setIsFinding(false);
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex justify-between items-center mb-6">
                <div className="rtl:text-right">
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{t('start_new_treatment')}</h2>
                    <p className="text-slate-500">{t('for_patient')}: {patient.fullName}</p>
                </div>
                <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition">
                    {!isRtl && <ChevronLeft size={16} />}
                    {t('back_to_dashboard')}
                    {isRtl && <ChevronRight size={16} />}
                </button>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg">
                <div className="mb-6">
                    <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="patientReport">Patient Report *</label>
                    <textarea id="patientReport" value={treatmentNotes.report} onChange={(e) => setTreatmentNotes({ ...treatmentNotes, report: e.target.value })} className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl" rows={5} placeholder="Describe the patient's current condition and reason for treatment..."></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="bloodPressure">Blood Pressure *</label>
                        <input id="bloodPressure" type="text" value={treatmentNotes.bloodPressure} onChange={(e) => setTreatmentNotes({ ...treatmentNotes, bloodPressure: e.target.value })} className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl" placeholder="e.g., 120/80" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="heartRate">Heart Rate *</label>
                        <input id="heartRate" type="text" value={treatmentNotes.heartRate} onChange={(e) => setTreatmentNotes({ ...treatmentNotes, heartRate: e.target.value })} className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl" placeholder="e.g., 72 bpm" />
                    </div>
                </div>

                <div className="text-center mb-8">
                    <button onClick={handleFindProtocol} disabled={!isFormValid || isFinding} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-xl transition flex items-center gap-2 shadow-lg shadow-yellow-500/10 mx-auto disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed">
                        {isFinding ? (
                            <>Finding Protocols...</>
                        ) : (
                            <><BrainCircuit size={16} /> Find Suggested Protocols</>
                        )}
                    </button>
                </div>

                {isFinding ? (
                     <div className="text-center p-8 text-slate-500">Analyzing report and finding best protocols...</div>
                ) : proposedProtocols.length > 0 && (
                    <div className="animate-fade-in">
                        <h3 className="text-xl font-bold mb-4 text-center">AI Suggested Protocols</h3>
                        <div className="space-y-3 mb-8">
                            {proposedProtocols.map(p => (
                                <div key={p.id} onClick={() => onProtocolSelect(p)} className="bg-slate-50 border-2 border-slate-200 hover:border-yellow-500 rounded-xl p-4 cursor-pointer transition-all">
                                    <h4 className="font-bold text-slate-800">{p.name}</h4>
                                    <p className="text-sm text-slate-600">{p.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="flex items-center gap-4 my-8">
                    <div className="flex-grow h-px bg-slate-200"></div>
                    <span className="text-slate-400 font-semibold text-sm">OR</span>
                    <div className="flex-grow h-px bg-slate-200"></div>
                </div>

                <div className="text-center">
                     <button onClick={() => setShowFullList(!showFullList)} disabled={!isFormValid || (allProtocols.length === 0 && !isLoading)} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl transition flex items-center gap-2 shadow-lg shadow-slate-800/10 mx-auto disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed">
                        <List size={16} /> {showFullList ? 'Hide Full List' : 'Select from Full List'}
                    </button>
                </div>

                {showFullList && (
                     <div className="animate-fade-in mt-8">
                        <h3 className="text-xl font-bold mb-4 text-center">All Protocols</h3>
                        {isLoading ? (
                            <div className="text-center p-8 text-slate-500">Loading protocols...</div>
                        ) : allProtocols.length === 0 ? (
                             <div className="text-center p-8 text-slate-500">No protocols found. Please add protocols in the admin section.</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {allProtocols.map(p => (
                                    <div key={p.id} onClick={() => onProtocolSelect(p)} className="bg-white border-2 border-slate-200 hover:border-yellow-500 rounded-xl p-4 cursor-pointer transition-all">
                                        <h4 className="font-bold text-slate-800">{p.name}</h4>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProtocolSelection;
