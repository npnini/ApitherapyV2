
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PatientData } from '../types/patient';
import { Protocol } from '../types/protocol';
import { StingPoint } from '../types/apipuncture';
import BodyScene from './BodyScene';
import { AlertTriangle, CheckCircle, XCircle, Trash2, Loader, MousePointerClick, List } from 'lucide-react';
import styles from './TreatmentExecution.module.css';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface HydratedProtocol extends Omit<Protocol, 'points'> {
    points: StingPoint[];
}

interface TreatmentExecutionProps {
    patient: PatientData;
    protocol: Protocol;
    onSave: (stungPointIds: string[], notes: string) => void;
    onBack: () => void;
    saveStatus: SaveStatus;
    onFinish: () => void;
}

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({ patient, protocol, onSave, onBack, saveStatus, onFinish }) => {
    const [hydratedProtocol, setHydratedProtocol] = useState<HydratedProtocol | null>(null);
    const [isHydrating, setIsHydrating] = useState(true);
    const [hydrationError, setHydrationError] = useState<string | null>(null);

    const [stungPoints, setStungPoints] = useState<StingPoint[]>([]);
    const [activePointId, setActivePointId] = useState<string | null>(null);
    const [isRolling, setIsRolling] = useState(true);
    const [finalNotes, setFinalNotes] = useState('');

    const hydrateProtocol = useCallback(async () => {
        setIsHydrating(true);
        setHydrationError(null);
        try {
            const pointIds = (protocol as any).points as string[];
            if (!pointIds || pointIds.length === 0) {
                setHydratedProtocol({ ...(protocol as any), points: [] });
                return;
            }

            const pointPromises = pointIds.map(id => getDoc(doc(db, 'acupuncture_points', id)));
            const pointDocs = await Promise.all(pointPromises);

            const points: StingPoint[] = pointDocs.map(doc => {
                if (!doc.exists()) {
                    throw new Error(`Point with ID ${doc.id} not found.`);
                }
                const data = doc.data();
                if (!data.position || data.position.x === undefined || data.position.y === undefined || data.position.z === undefined) {
                    console.warn(`Point ${doc.id} is missing 3D coordinate data.`);
                }
                return { ...data, id: doc.id } as StingPoint;
            });
            
            setHydratedProtocol({ ...(protocol as any), points });

        } catch (error) {
            console.error("Error hydrating protocol:", error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            setHydrationError(`Failed to load 3D model data. ${errorMessage}`);
        } finally {
            setIsHydrating(false);
        }
    }, [protocol]);

    useEffect(() => {
        hydrateProtocol();
    }, [hydrateProtocol]);

    const handlePointSelect = useCallback((pointToAdd: StingPoint) => {
        if (!stungPoints.some(p => p.id === pointToAdd.id)) {
            setStungPoints(currentStungPoints => [...currentStungPoints, pointToAdd]);
        }
        setActivePointId(pointToAdd.id);
    }, [stungPoints]);

    const handleRemoveStungPoint = (pointIdToRemove: string) => {
        setStungPoints(stungPoints.filter(p => p.id !== pointIdToRemove));
        if (activePointId === pointIdToRemove) {
            setActivePointId(null);
        }
    };

    const handleSave = () => {
        const stungPointIds = stungPoints.map(p => p.id);
        onSave(stungPointIds, finalNotes);
    };

    if (isHydrating) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader className="animate-spin h-10 w-10 text-red-500" />
                <p className="ml-4 text-slate-500">Loading protocol points...</p>
            </div>
        );
    }

    if (hydrationError) {
        return (
             <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-slate-100 max-w-lg mx-auto">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                <h3 className="mt-4 text-lg font-bold text-slate-800">Error Loading Data</h3>
                <p className="mt-2 text-sm text-slate-600">{hydrationError}</p>
                <p className="mt-2 text-xs text-slate-500">Please ensure all points in the protocol exist in the database and have valid coordinate data.</p>
                <button onClick={onBack} className="mt-6 bg-slate-800 text-white font-bold py-2 px-6 rounded-lg">Back</button>
            </div>
        )
    }

    return (
        <div className="max-w-full mx-auto animate-fade-in px-4">
            <div className="flex justify-between items-center mb-4">
                 <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Perform Treatment</h2>
                    <p className="text-slate-500">For: <span className='font-bold'>{patient.fullName}</span> | Protocol: <span className='font-bold'>{protocol.name}</span></p>
                </div>
                <button onClick={onBack} className="text-sm font-bold text-slate-600 hover:text-slate-900">Back</button>
            </div>

            <div className="grid grid-cols-12 gap-4">

                {/* Left Column: Protocol Points */}
                <div className="col-span-3 bg-white rounded-3xl p-6 border border-slate-100 shadow-lg flex flex-col">
                     <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-black text-slate-900 tracking-tighter flex items-center"><List size={20} className="mr-2"/> Protocol Points</h3>
                        <label htmlFor="autorotate" className="flex items-center cursor-pointer">
                            <span className="text-sm font-bold text-slate-600 mr-2">Auto-Rotate</span>
                            <div className="relative">
                                <input id="autorotate" type="checkbox" className="sr-only" checked={isRolling} onChange={() => setIsRolling(!isRolling)} />
                                <div className={`block w-10 h-6 rounded-full ${isRolling ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isRolling ? 'translate-x-full' : ''}`}></div>
                            </div>
                        </label>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">Hover to find, click to add.</p>
                    <div className="flex-grow space-y-2 overflow-y-auto pr-1">
                        {hydratedProtocol?.points.map(p => (
                            <div 
                                key={p.id}
                                onMouseEnter={() => setActivePointId(p.id)}
                                onMouseLeave={() => setActivePointId(null)}
                                onClick={() => handlePointSelect(p)}
                                className={`flex justify-between items-center p-2 rounded-lg border-2 transition-all cursor-pointer ${activePointId === p.id ? 'bg-red-100 border-red-300' : 'bg-white border-slate-200 hover:border-red-400'}`}
                            >
                                <div>
                                    <span className="font-bold text-red-600 text-sm">{p.code}</span>
                                    <span className="text-slate-600 text-xs"> - {p.label}</span>
                                </div>
                                {stungPoints.some(sp => sp.id === p.id) && <CheckCircle size={16} className="text-green-500" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center Column: 3D Model */}
                <div className="col-span-6 bg-white rounded-3xl p-2 border border-slate-100 shadow-lg h-[650px] relative">
                    <Canvas className="bg-slate-50 rounded-2xl">
                        <BodyScene 
                            protocol={hydratedProtocol} 
                            onPointSelect={handlePointSelect}
                            activePointId={activePointId}
                            isRolling={isRolling}
                        />
                    </Canvas>
                </div>

                {/* Right Column: Treatment Data */}
                <div className="col-span-3 bg-white rounded-3xl p-6 border border-slate-100 shadow-lg flex flex-col">
                     <h3 className="text-lg font-black text-slate-900 tracking-tighter flex items-center mb-2"><MousePointerClick size={20} className="mr-2"/>Treatment Data</h3>
                     <div className="flex-grow flex flex-col mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Stung Points ({stungPoints.length})</label>
                        <div className="mt-1 p-3 min-h-[12rem] max-h-[12rem] overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-2">
                            {stungPoints.length > 0 ? stungPoints.map(p => (
                                <div key={p.id} onClick={() => setActivePointId(p.id)} className={`flex justify-between items-center p-2 rounded-lg border transition-all cursor-pointer ${activePointId === p.id ? 'bg-red-100 border-red-300' : 'bg-white border-slate-200 hover:border-red-400'}`}>
                                    <div>
                                        <span className="font-bold text-red-600">{p.code}</span> - <span className="font-semibold text-slate-800">{p.label}</span>
                                    </div>
                                    <button onClick={(e) => {e.stopPropagation(); handleRemoveStungPoint(p.id)}} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                </div>
                            )) : <p className="text-slate-400 text-center py-10">No points stung yet.</p>}
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="finalNotes">Final Notes</label>
                        <textarea id="finalNotes" value={finalNotes} onChange={(e) => setFinalNotes(e.target.value)} className={styles.notesTextarea} rows={4} placeholder="Add any final observations..."></textarea>
                    </div>
                    <div className="mt-auto">
                         {saveStatus === 'error' && <div className="text-red-600 text-xs mb-2 flex items-center"><XCircle size={14} className="mr-1" /> Failed to save.</div>}
                         {saveStatus === 'success' && <div className="text-green-600 text-xs mb-2 flex items-center"><CheckCircle size={14} className="mr-1" /> Saved successfully.</div>}
                        {saveStatus === 'success' ? 
                            <button onClick={onFinish} className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition">Back to Dashboard</button>
                            :
                            <button onClick={handleSave} disabled={saveStatus === 'saving' || stungPoints.length === 0} className={styles.saveButton}>{saveStatus === 'saving' ? 'Saving...' : 'Save Final Treatment'}</button>
                        }
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TreatmentExecution;
