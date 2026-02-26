
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { T, useT, useTranslationContext } from './T';
import { PatientData } from '../types/patient';
import { Protocol } from '../types/protocol';
import { StingPoint } from '../types/apipuncture';
import { VitalSigns } from '../types/treatmentSession';
import BodyScene from './BodyScene';
import VitalsInputGroup from './VitalsInputGroup';
import { AlertTriangle, CheckCircle, XCircle, Trash2, Loader, MousePointerClick, List, ChevronLeft } from 'lucide-react';
import styles from './TreatmentExecution.module.css';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface HydratedProtocol extends Omit<Protocol, 'points'> {
    points: StingPoint[];
}

interface TreatmentExecutionProps {
    patient: PatientData;
    protocol: Protocol;
    onSave: (treatmentData: {
        stungPointCodes: string[];
        notes: string;
        postStingVitals?: Partial<VitalSigns>;
        finalVitals?: Partial<VitalSigns>;
    }) => void;
    onBack: () => void;
    onFinish: () => void;
    treatmentOnNext?: () => void;
    saveStatus: SaveStatus;
    isModal?: boolean;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        return value[lang] || value.en || '';
    }
    return '';
};

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({ patient, protocol, onSave, onBack, saveStatus, onFinish, treatmentOnNext, isModal }) => {
    const { language, direction } = useTranslationContext();
    const tFailedToLoadModel = useT('Failed to load 3D model data.');
    const tSaving = useT('Saving...');
    const tNotesPlaceholder = useT('Add any final observations or notes here...');
    const tSaveError = useT('Failed to save treatment. Please try again.');
    const tSaveSuccess = useT('Saved successfully!');
    const tSaveTreatment = useT('Save Treatment');
    const tNextStep = useT('Next Step');

    const [hydratedProtocol, setHydratedProtocol] = useState<HydratedProtocol | null>(null);
    const [isHydrating, setIsHydrating] = useState(true);
    const [hydrationError, setHydrationError] = useState<string | null>(null);

    const [stungPoints, setStungPoints] = useState<StingPoint[]>([]);
    const [activePointId, setActivePointId] = useState<string | null>(null);
    const [isRolling, setIsRolling] = useState(true);
    const [finalNotes, setFinalNotes] = useState('');
    const [postStingVitals, setPostStingVitals] = useState<Partial<VitalSigns>>({});
    const [finalVitals, setFinalVitals] = useState<Partial<VitalSigns>>({});

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
            setHydrationError(`${tFailedToLoadModel} ${errorMessage}`);
        } finally {
            setIsHydrating(false);
        }
    }, [protocol, tFailedToLoadModel]);

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
        const stungPointCodes = stungPoints.map(p => p.code);
        onSave({
            stungPointCodes,
            notes: finalNotes,
            postStingVitals,
            finalVitals
        });
    };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const areVitalsComplete = (vitals: Partial<VitalSigns>): boolean => {
        return vitals.systolic !== undefined && vitals.diastolic !== undefined && vitals.heartRate !== undefined;
    };

    const [isComponentDirty, setIsComponentDirty] = useState(false);
    const isInitialMount = useRef(true);

    // Track if treatment has been saved in this session
    useEffect(() => {
        if (saveStatus === 'success') {
            setIsComponentDirty(false);
            // Reset mount flag if we want to treat post-save as a new "clean" state
            // or just rely on the effect below skipping the next run if values haven't changed.
        }
    }, [saveStatus]);

    // Track changes to enable/disable save button
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        setIsComponentDirty(true);
    }, [stungPoints, postStingVitals, finalVitals, finalNotes]);

    const isSaveDisabled = saveStatus === 'saving' || 
        !isComponentDirty ||
        stungPoints.length === 0 ||
        !areVitalsComplete(postStingVitals) ||
        !areVitalsComplete(finalVitals);


    if (isHydrating) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader className="animate-spin h-10 w-10 text-red-500" />
                <p className="ml-4 text-slate-500"><T>Loading protocol points for 3D model...</T></p>
            </div>
        );
    }

    if (hydrationError) {
        return (
            <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-slate-100 max-w-lg mx-auto">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                <h3 className="mt-4 text-lg font-bold text-slate-800"><T>Error Loading Data</T></h3>
                <p className="mt-2 text-sm text-slate-600">{hydrationError}</p>
                <p className="mt-2 text-xs text-slate-500"><T>Please ensure all points in the protocol exist and have 3D coordinates.</T></p>
                <button onClick={onBack} className="mt-6 bg-slate-800 text-white font-bold py-2 px-6 rounded-lg"><T>Back</T></button>
            </div>
        )
    }

    return (
        <div className={styles.container} dir={direction}>
            {!isModal && (
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button onClick={onBack} className={styles.backButton}>
                            <ChevronLeft size={24} />
                        </button>
                        <h1 className={styles.headerTitle}>
                            <T>{`Treatment Execution: ${getMLValue(protocol.name, language)}`}</T>
                        </h1>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-12 gap-4">

                {/* Left Column: Protocol Points */}
                <div className="col-span-2 bg-white rounded-3xl p-6 border border-slate-100 shadow-lg flex flex-col h-[750px] min-w-0">
                    <div className="flex flex-col mb-4">
                        <h3 className="text-base font-black text-slate-900 tracking-tighter flex items-center mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                            <List size={18} className={direction === 'rtl' ? 'ml-2 flex-shrink-0' : 'mr-2 flex-shrink-0'} /> <T>Protocol Points</T>
                        </h3>
                        <label htmlFor="autorotate" className="flex items-center cursor-pointer">
                            <span className={`text-sm font-bold text-slate-600 ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`}><T>Auto-Rotate</T></span>
                            <div className="relative">
                                <input id="autorotate" type="checkbox" className="sr-only" checked={isRolling} onChange={() => setIsRolling(!isRolling)} />
                                <div className={`block w-10 h-6 rounded-full ${isRolling ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isRolling ? 'translate-x-full' : ''}`}></div>
                            </div>
                        </label>
                    </div>
                    <p className="text-xs text-slate-500 mb-3"><T>Hover over a point to locate it on the model.</T></p>
                    <div className="flex-grow space-y-2 overflow-y-auto pr-1">
                        {hydratedProtocol?.points.map(p => (
                            <div
                                key={p.id}
                                onMouseEnter={() => setActivePointId(p.id)}
                                onMouseLeave={() => setActivePointId(null)}
                                onClick={() => handlePointSelect(p)}
                                className={`flex justify-between items-center p-2 rounded-lg border-2 transition-all cursor-pointer ${activePointId === p.id ? 'bg-red-100 border-red-300' : 'bg-white border-slate-200 hover:border-red-400'}`}
                            >
                                <div className={direction === 'rtl' ? 'text-right' : 'text-left'}>
                                    <span className="font-bold text-red-600 text-sm">{p.code}</span>
                                    <span className="text-slate-600 text-xs"> - {getMLValue(p.label, language)}</span>
                                </div>
                                {stungPoints.some(sp => sp.id === p.id) && <CheckCircle size={16} className="text-green-500" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center Column: 3D Model */}
                <div className="col-span-5 bg-white rounded-3xl p-2 border border-slate-100 shadow-lg h-[650px] relative">
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
                <div className="col-span-5 bg-white rounded-3xl p-6 border border-slate-100 shadow-lg flex flex-col overflow-y-auto max-h-[750px]">
                    <h3 className="text-lg font-black text-slate-900 tracking-tighter flex items-center mb-2">
                        <MousePointerClick size={20} className={direction === 'rtl' ? 'ml-2' : 'mr-2'} /><T>Treatment Data</T>
                    </h3>
                    <div className="flex-grow flex flex-col mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">
                            <T>{`Stung Points (${stungPoints.length})`}</T>
                        </label>
                        <div className="mt-1 p-3 min-h-[12rem] max-h-[12rem] overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-2">
                            {stungPoints.length > 0 ? stungPoints.map(p => (
                                <div key={p.id} onClick={() => setActivePointId(p.id)} className={`flex justify-between items-center p-2 rounded-lg border transition-all cursor-pointer ${activePointId === p.id ? 'bg-red-100 border-red-300' : 'bg-white border-slate-200 hover:border-red-400'}`}>
                                    <div className={direction === 'rtl' ? 'text-right' : 'text-left'}>
                                        <span className="font-bold text-red-600">{p.code}</span> - <span className="font-semibold text-slate-800">{getMLValue(p.label, language)}</span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveStungPoint(p.id) }} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                </div>
                            )) : <p className="text-slate-400 text-center py-10"><T>No points have been marked as stung yet.</T></p>}
                        </div>
                    </div>
                    <VitalsInputGroup
                        title={useT('Post-Stinging Measures')}
                        vitals={postStingVitals}
                        onVitalsChange={setPostStingVitals}
                    />
                    <VitalsInputGroup
                        title={useT('Final Measures')}
                        vitals={finalVitals}
                        onVitalsChange={setFinalVitals}
                    />
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="finalNotes"><T>Final Notes</T></label>
                        <textarea id="finalNotes" value={finalNotes} onKeyDown={handleKeyDown} onChange={(e) => setFinalNotes(e.target.value)} className={styles.notesTextarea} rows={4} placeholder={tNotesPlaceholder}></textarea>
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-100">
                        {saveStatus === 'error' && <div className="text-red-600 text-xs mb-2 flex items-center"><XCircle size={14} className={direction === 'rtl' ? 'ml-1' : 'mr-1'} /> {tSaveError}</div>}
                        {saveStatus === 'success' && <div className="text-green-600 text-xs mb-2 flex items-center"><CheckCircle size={14} className={direction === 'rtl' ? 'ml-1' : 'mr-1'} /> {tSaveSuccess}</div>}
                        
                        {saveStatus === 'success' ? (
                            <div className="flex flex-col gap-2">
                                {treatmentOnNext && (
                                    <button 
                                        onClick={treatmentOnNext} 
                                        className="w-fit mx-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-10 rounded-xl transition flex items-center justify-center gap-2"
                                    >
                                        <T>Next Step</T>
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button 
                                onClick={handleSave} 
                                disabled={isSaveDisabled} 
                                className={`${styles.saveButton} whitespace-nowrap`}
                            >
                                {saveStatus === 'saving' ? tSaving : tSaveTreatment}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TreatmentExecution;
