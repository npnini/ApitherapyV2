
import React, { useState, useEffect } from 'react';
import { PatientData } from '../types/patient';
import { Treatment } from '../types/treatment';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { ChevronLeft, Calendar, Syringe, FileText, Activity } from 'lucide-react';

interface TreatmentHistoryProps {
    patient: PatientData;
    onBack: () => void;
}

const TreatmentHistory: React.FC<TreatmentHistoryProps> = ({ patient, onBack }) => {
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTreatments = async () => {
            setIsLoading(true);
            try {
                const treatmentsRef = collection(db, `patients/${patient.id}/treatments`);
                const q = query(treatmentsRef, orderBy('date', 'desc'));
                const querySnapshot = await getDocs(q);
                const treatmentsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Treatment);
                setTreatments(treatmentsData);
            } catch (error) {
                console.error("Error fetching treatment history:", error);
            }
            setIsLoading(false);
        };

        fetchTreatments();
    }, [patient.id]);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Treatment History</h2>
                    <p className="text-slate-500">Patient: {patient.fullName}</p>
                </div>
                <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition"><ChevronLeft size={16} /> Back to Dashboard</button>
            </div>

            {isLoading ? (
                <div className="text-center p-12">Loading history...</div>
            ) : treatments.length === 0 ? (
                <div className="text-center bg-white rounded-3xl p-12 border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-lg">No Treatments Found</h3>
                    <p className="text-sm text-slate-500">This patient has no recorded treatments yet.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {treatments.map(treatment => (
                        <div key={treatment.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-slate-800">{treatment.protocolName}</h3>
                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Calendar size={14} />
                                    <span>{new Date(treatment.date).toLocaleDateString()}</span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                <div>
                                    <h4 className="font-bold text-slate-600 flex items-center gap-2 mb-2"><FileText size={14} /> Patient Report</h4>
                                    <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">{treatment.patientReport}</p>
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-600 flex items-center gap-2 mb-2"><Activity size={14} /> Vitals</h4>
                                    <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">{treatment.vitals}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <h4 className="font-bold text-slate-600 flex items-center gap-2 mb-2"><Syringe size={14} /> Stung Points</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {treatment.stungPoints.map((point, index) => (
                                            <span key={index} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
                                                {point.id} - {point.name} (Qty: {point.quantity})
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                 <div className="md:col-span-2">
                                    <h4 className="font-bold text-slate-600 flex items-center gap-2 mb-2"><FileText size={14} /> Final Notes</h4>
                                    <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">{treatment.finalNotes}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
