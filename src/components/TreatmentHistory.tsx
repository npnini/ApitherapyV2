
import React, { useState, useEffect, useCallback } from 'react';
import { PatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { ChevronLeft, Calendar, User, Syringe, FileText, Activity, MapPin, Loader, AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Stored data structure in Firestore
interface StoredTreatmentDoc {
    id: string;
    date: string;
    protocolName: string;
    patientReport?: string;
    vitals?: string;
    finalNotes?: string;
    stungPoints: string[]; // This is an array of point IDs
    caretakerId: string;
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
    const { t, i18n } = useTranslation();
    const [treatments, setTreatments] = useState<HydratedTreatment[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTreatments = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const treatmentsRef = collection(db, `patients/${patient.id}/treatments`);
            const q = query(treatmentsRef, orderBy("date", "desc"));
            const querySnapshot = await getDocs(q);
            const rawTreatments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoredTreatmentDoc));

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

            const pointPromises = Array.from(allPointIds).map(id => getDoc(doc(db, 'acupuncture_points', id)));
            const pointDocs = await Promise.all(pointPromises);

            const pointsMap = new Map<string, StingPoint>();
            pointDocs.forEach(doc => {
                if (doc.exists()) {
                    pointsMap.set(doc.id, { id: doc.id, ...doc.data() } as StingPoint);
                }
            });

            const hydratedTreatments = rawTreatments.map(treatment => {
                const hydratedPoints = (Array.isArray(treatment.stungPoints) ? treatment.stungPoints : [])
                    .map(id => pointsMap.get(id))
                    .filter((p): p is StingPoint => p !== undefined);

                return { ...treatment, stungPoints: hydratedPoints };
            });

            setTreatments(hydratedTreatments);
        } catch (err) {
            console.error("Error fetching treatment history:", err);
            setError(t('failed_to_load_treatment_history'));
        } finally {
            setIsLoading(false);
        }
    }, [patient.id, t]);

    useEffect(() => {
        fetchTreatments();
    }, [fetchTreatments]);

    const formatDate = (isoString: string) => {
        if (!isoString) return t('not_available');
        try {
            return new Date(isoString).toLocaleString(i18n.language, { 
                year: 'numeric', month: 'numeric', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            });
        } catch (e) {
            return t('invalid_date');
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader className="animate-spin h-8 w-8 text-red-500" />
                <p className="ml-3 text-slate-500">{t('loading_treatment_history')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-slate-100 max-w-lg mx-auto">
               <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
               <h3 className="mt-4 text-lg font-bold text-slate-800">{t('error_title')}</h3>
               <p className="mt-2 text-sm text-slate-600">{error}</p>
               <button onClick={onBack} className="mt-6 bg-slate-800 text-white font-bold py-2 px-6 rounded-lg">{t('back')}</button>
           </div>
       );
    }

    const direction = i18n.dir();
    const rtl = direction === 'rtl';
    const BackIcon = rtl ? ChevronRight : ChevronLeft;
    const marginClass = rtl ? 'ml-4' : 'mr-4';
    const iconMargin = rtl ? 'ml-2' : 'mr-2';

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in" dir={direction}>
            <div className="flex items-center mb-6">
                <button onClick={onBack} className={`p-2 rounded-full hover:bg-slate-200 ${marginClass}`}><BackIcon /></button>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">{t('treatment_history_for', {patientName: patient.fullName})}</h1>
            </div>

            {treatments.length === 0 ? (
                <p className="text-center text-slate-500 py-10 bg-white rounded-3xl shadow-md border border-slate-100">{t('no_treatments_recorded')}</p>
            ) : (
                <div className="space-y-6">
                    {treatments.map((treatment) => (
                        <div key={treatment.id} className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100">
                            <div className={`flex justify-between items-start mb-6`}>
                                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{treatment.protocolName}</h2>
                                <div className={rtl ? 'text-left' : 'text-right'}>
                                    <div className={`flex items-center justify-end text-sm text-slate-500 gap-2`}>
                                        {rtl ? (
                                            <>
                                                <span>{formatDate(treatment.date)}</span>
                                                <Calendar size={16} />
                                            </>
                                        ) : (
                                            <>
                                                <Calendar size={16} />
                                                <span>{formatDate(treatment.date)}</span>
                                            </>
                                        )}
                                    </div>
                                    <div className={`flex items-center justify-end text-xs text-slate-400 gap-2 mt-1`}>
                                        {rtl ? (
                                            <>
                                                <span>{treatment.caretakerId}</span>
                                                <User size={14} />
                                            </>
                                        ) : (
                                            <>
                                                <User size={14} />
                                                <span>{treatment.caretakerId}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                <div className='space-y-1'>
                                    <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center"><FileText size={16} className={iconMargin}/>{t('patient_report')}</h3>
                                    <p className="p-3 bg-slate-50 rounded-lg text-slate-800 h-24 overflow-y-auto">{treatment.patientReport || t('not_provided')}</p>
                                </div>
                                 <div className='space-y-1'>
                                    <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center"><Activity size={16} className={iconMargin}/>{t('vitals')}</h3>
                                    <p className="p-3 bg-slate-50 rounded-lg text-slate-800">{treatment.vitals || t('not_provided')}</p>
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center mb-2"><Syringe size={16} className={iconMargin}/>{t('stung_points')}</h3>
                                <ul className="p-4 bg-slate-50 rounded-lg space-y-2">
                                    {treatment.stungPoints.length > 0 ? treatment.stungPoints.map((point) => (
                                        <li key={point.id} className={`flex items-center justify-between text-slate-700 ${rtl ? 'flex-row-reverse' : ''}`}>
                                            <div className={`flex items-center gap-3 ${rtl ? 'flex-row-reverse' : ''}`}>
                                                <MapPin size={16} className="text-red-500" />
                                                <span className="text-sm">
                                                    <span className="font-bold text-red-700">{point.code}</span> - <span className="text-slate-800 font-semibold">{point.label}</span>
                                                </span>
                                            </div>
                                        </li>
                                    )) : <li>{t('no_points_for_treatment')}</li>}
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-bold text-slate-500 text-sm uppercase tracking-wider flex items-center"><FileText size={16} className={iconMargin}/>{t('final_notes')}</h3>
                                <p className="p-3 mt-1 bg-slate-50 rounded-lg text-slate-800 min-h-[5rem] overflow-y-auto">{treatment.finalNotes || t('no_notes')}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TreatmentHistory;
