import React, { useState } from 'react';
import { PatientData } from '../types/patient';
import { Protocol, StingingPoint } from '../types/protocol';
import { Treatment } from '../types/treatment';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface TreatmentExecutionProps {
    patient: PatientData;
    protocol: Protocol;
    onSave: (treatments: Treatment[], notes: string) => void;
    onBack: () => void;
    saveStatus: SaveStatus;
    onFinish: () => void;
}

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({ patient, protocol, onSave, onBack, saveStatus, onFinish }) => {
    const [stungPoints, setStungPoints] = useState<StingingPoint[]>(protocol.points || []);
    const [manualPoint, setManualPoint] = useState('');
    const [finalNotes, setFinalNotes] = useState('');

    const handleAddManualPoint = () => {
        if (manualPoint.trim() !== '') {
            const newPoint: StingingPoint = { id: `manual-${Date.now()}`, name: manualPoint.trim(), quantity: 1 };
            setStungPoints([...stungPoints, newPoint]);
            setManualPoint('');
        }
    };

    const handleRemovePoint = (pointId: string) => {
        setStungPoints(stungPoints.filter(p => p.id !== pointId));
    };

    const handleSave = () => {
        const treatments: Treatment[] = stungPoints.map(p => ({ id: p.id, point: p.name, quantity: p.quantity, status: 'done' }));
        onSave(treatments, finalNotes);
    };

    const isSaving = saveStatus === 'saving';

    const renderSaveButton = () => {
        if (saveStatus === 'success') {
            return (
                <button onClick={onFinish} className="bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition">
                    Back to Dashboard
                </button>
            );
        }

        return (
            <button onClick={handleSave} disabled={isSaving || stungPoints.length === 0} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-xl transition shadow-lg shadow-yellow-500/10 disabled:bg-slate-200 disabled:shadow-none">
                {isSaving ? 'Saving...' : 'Save Final Treatment'}
            </button>
        );
    };

    const renderStatusMessage = () => {
        if (saveStatus === 'success') {
            return <div className="flex items-center text-green-600"><CheckCircle className="mr-2" /> Treatment saved successfully.</div>;
        }
        if (saveStatus === 'error') {
            return <div className="flex items-center text-red-600"><XCircle className="mr-2" /> Failed to save treatment. Please try again.</div>;
        }
        return null;
    };

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Perform Treatment</h2>
                    <p className="text-slate-500">For patient: {patient.fullName} | Protocol: {protocol.name}</p>
                </div>
                <button onClick={onBack} className="text-sm font-bold text-slate-600 hover:text-slate-900 transition">Back to Protocol Selection</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg flex flex-col items-center justify-center">
                    <div className="text-center">
                        <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                        <h3 className="mt-2 text-lg font-bold text-slate-800">3D Model Not Loaded</h3>
                        <p className="mt-1 text-sm text-slate-600">
                            The file <code className="bg-slate-200 px-1 py-0.5 rounded">body-model.glb</code> is missing.
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                            Please add the 3D model to the <code className="bg-slate-200 px-1 py-0.5 rounded">public</code> folder in your project directory.
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg flex flex-col">
                    <h3 className="text-xl font-black text-slate-900 tracking-tighter mb-4">Treatment Data</h3>
                    
                    <div className="mb-4 flex-grow">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Protocol Points</label>
                        <div className="mt-1 p-3 min-h-[8rem] bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-2">
                            {stungPoints.length > 0 ? stungPoints.map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200">
                                    <span>{p.name} (x{p.quantity})</span>
                                    <button onClick={() => handleRemovePoint(p.id)} className="text-red-500 hover:text-red-700 text-xs font-bold">Remove</button>
                                </div>
                            )) : <p className="text-slate-400">No protocol points defined.</p>}
                        </div>
                    </div>

                    <div className="flex items-center mb-4">
                        <input 
                            type="text" 
                            value={manualPoint}
                            onChange={(e) => setManualPoint(e.target.value)}
                            placeholder="Add a custom point..."
                            className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl"
                        />
                        <button onClick={handleAddManualPoint} className="ml-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-5 rounded-xl transition">
                            Add
                        </button>
                    </div>

                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="finalNotes">Final Notes</label>
                        <textarea 
                            id="finalNotes"
                            value={finalNotes}
                            onChange={(e) => setFinalNotes(e.target.value)}
                            className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl"
                            rows={4}
                            placeholder="Add any final observations..."
                        ></textarea>
                    </div>

                    <div className="flex justify-end items-center mt-4">
                        <div className="mr-4">{renderStatusMessage()}</div>
                        {renderSaveButton()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TreatmentExecution;
