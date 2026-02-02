
import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { ChevronLeft, Calendar, Syringe, FileText, Activity, MapPin, Loader, AlertTriangle } from 'lucide-react';

// Stored data structure in Firestore
interface StoredTreatmentDoc {
    id: string;
    date: string;
    protocolName: string;
    patientReport?: string;
    vitals?: string;
    finalNotes?: string;
    stungPoints: string[]; // This is an array of point IDs
}

// Hydrated data structure for rendering
interface HydratedTreatment extends Omit<StoredTreatmentDoc, 'stungPoints'> {
    stungPoints: StingPoint[];
}

interface TreatmentHistoryProps {
    patient: PatientData;
    onBack: () => void;
}

const TreatmentHistory: React.FC<TreatmentHistoryProps> = ({ patient, onBack }) => {
    const [treatments, setTreatments] = useState<HydratedTreatment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTreatments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // 1. Fetch the raw treatment documents
            const treatmentsRef = collection(db, `patients/${patient.id}/treatments`);
            const q = query(treatmentsRef, orderBy("date", "desc"));
            const querySnapshot = await getDocs(q);
            const rawTreatments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoredTreatmentDoc));

            // 2. Gather all unique stung point IDs from all treatments
            const allPointIds = rawTreatments.reduce((acc, treatment) => {
                if (Array.isArray(treatment.stungPoints)) {
                    treatment.stungPoints.forEach(id => acc.add(id));
                }
                return acc;
            }, new Set<string>());

            if (allPointIds.size === 0) {
                setTreatments(rawTreatments.map(t => ({...t, stungPoints: []})));
                setIsLoading(false);
                return;
            }

            // 3. Fetch the full data for each unique point
            const pointPromises = Array.from(allPointIds).map(id => getDoc(doc(db, 'acupuncture_points', id)));
            const pointDocs = await Promise.all(pointPromises);

            // 4. Create a map for easy lookup (ID -> Point Data)
            const pointsMap = new Map<string, StingPoint>();
            pointDocs.forEach(doc => {
                if (doc.exists()) {
                    pointsMap.set(doc.id, { id: doc.id, ...doc.data() } as StingPoint);
                }
            });

            // 5. Hydrate the treatments with the full point data
            const hydratedTreatments = rawTreatments.map(treatment => {
                const hydratedPoints = (Array.isArray(treatment.stungPoints) ? treatment.stungPoints : [])
                    .map(id => pointsMap.get(id))
                    .filter((p): p is StingPoint => p !== undefined); // Filter out any points not found

                return { ...treatment, stungPoints: hydratedPoints };
            });

            setTreatments(hydratedTreatments);
        } catch (err) {
            console.error("Error fetching treatment history:", err);
            setError("Failed to load treatment history.");
        } finally {
            setIsLoading(false);
        }
    }, [patient.id]);

    useEffect(() => {
        fetchTreatments();
    }, [fetchTreatments]);

    const formatDate = (isoString: string) => {
        if (!isoString) return 'N/A';
        try {
            return new Date(isoString).toLocaleString(undefined, { 
                year: 'numeric', month: 'numeric', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            });
        } catch (e) {
            return 'Invalid Date';
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader className="animate-spin h-8 w-8 text-red-500" />
                <p className="ml-3 text-slate-500">Loading Treatment History...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-slate-100 max-w-lg mx-auto">
               <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
               <h3 className="mt-4 text-lg font-bold text-slate-800">Error</h3>
               <p className="mt-2 text-sm text-slate-600">{error}</p>
               <button onClick={onBack} className="mt-6 bg-slate-800 text-white font-bold py-2 px-6 rounded-lg">Back</button>
           </div>
       );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 mr-4"><ChevronLeft /></button>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Treatment History for {patient.fullName}</h1>
            </div>

            {treatments.length === 0 ? (
                <p className="text-center text-slate-500 py-10 bg-white rounded-3xl shadow-md border border-slate-100">No treatments recorded for this patient.</p>
            ) : (
                <div className="space-y-6">
                    {treatments.map((treatment) => (
                        <div key={treatment.id} className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100">
                            <div className="flex justify-between items-start mb-6">
                                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{treatment.protocolName}</h2>
                                <div className="flex items-center text-sm text-slate-500 gap-2">
                                    <Calendar size={16} />
                                    <span>{formatDate(treatment.date)}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                <div className='space-y-1'>
                                    <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center"><FileText size={16} className='mr-2'/>Patient Report</h3>
                                    <p className="p-3 bg-slate-50 rounded-lg text-slate-800 h-24 overflow-y-auto">{treatment.patientReport || 'Not provided'}</p>
                                </div>
                                 <div className='space-y-1'>
                                    <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center"><Activity size={16} className='mr-2'/>Vitals</h3>
                                    <p className="p-3 bg-slate-50 rounded-lg text-slate-800">{treatment.vitals || 'Not provided'}</p>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center mb-2"><Syringe size={16} className='mr-2'/>Stung Points</h3>
                                <ul className="p-4 bg-slate-50 rounded-lg space-y-2">
                                    {treatment.stungPoints.length > 0 ? treatment.stungPoints.map((point) => (
                                        <li key={point.id} className="flex items-center justify-between text-slate-700">
                                            <div className="flex items-center gap-3">
                                                <MapPin size={16} className="text-red-500" />
                                                <span className="text-sm">
                                                    <span className="font-bold text-red-700">{point.code}</span> - <span className="text-slate-800 font-semibold">{point.label}</span>
                                                </span>
                                            </div>
                                        </li>
                                    )) : <li>No points were recorded for this treatment.</li>}
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center"><FileText size={16} className='mr-2'/>Final Notes</h3>
                                <p className="p-3 mt-1 bg-slate-50 rounded-lg text-slate-800 min-h-[5rem] overflow-y-auto">{treatment.finalNotes || 'No notes.'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
