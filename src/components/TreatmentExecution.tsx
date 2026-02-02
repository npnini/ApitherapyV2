import React, { useState } from 'react';
import { PatientData } from '../types/patient';
import { Protocol, StingingPoint } from '../types/protocol';
import { Treatment } from '../types/treatment';
import { AlertTriangle, CheckCircle, XCircle, Trash2 } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

interface TreatmentExecutionProps {
    patient: PatientData;
    protocol: Protocol;
    onSave: (treatments: any[], notes: string) => void; // Changed to any[] to accommodate new structure
    onBack: () => void;
    saveStatus: SaveStatus;
    onFinish: () => void;
}

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({ patient, protocol, onSave, onBack, saveStatus, onFinish }) => {
    const protocolPoints = protocol.points || [];
    const [stungPoints, setStungPoints] = useState<StingingPoint[]>([]);
    const [manualPointID, setManualPointID] = useState('');
    const [manualPointName, setManualPointName] = useState('');
    const [addPointError, setAddPointError] = useState('');
    const [finalNotes, setFinalNotes] = useState('');

    const handleSelectPoint = (pointToAdd: StingingPoint) => {
        if (!stungPoints.some(p => p.ID === pointToAdd.ID)) {
            setStungPoints([...stungPoints, pointToAdd]);
        }
    };

    const handleAddManualPoint = () => {
        setAddPointError('');
        if (manualPointID.trim() === '' || manualPointName.trim() === '') {
            setAddPointError('Both ID and Name are required for custom points.');
            return;
        }
        const newPoint: StingingPoint = {
            ID: manualPointID.trim(),
            name: manualPointName.trim(),
            quantity: 1
        };
        setStungPoints([...stungPoints, newPoint]);
        setManualPointID('');
        setManualPointName('');
    };

    const handleRemoveStungPoint = (pointIdToRemove: string) => {
        setStungPoints(stungPoints.filter(p => p.ID !== pointIdToRemove));
    };

    const handleSave = () => {
        const treatmentsToSave = stungPoints.map(p => ({
            ID: p.ID,
            name: p.name,
            quantity: p.quantity,
        }));
        onSave(treatmentsToSave, finalNotes);
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
            return <div className="flex items-center text-red-600"><XCircle className="mr-2" /> Failed to save treatment.</div>;
        }
        return null;
    };

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Perform Treatment</h2>
                    <p className="text-slate-500">For: {patient.fullName} | Protocol: {protocol.name}</p>
                </div>
                <button onClick={onBack} className="text-sm font-bold text-slate-600 hover:text-slate-900">Back to Protocol Selection</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg flex items-center justify-center">
                    <div className="text-center">
                        <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
                        <h3 className="mt-2 text-lg font-bold text-slate-800">3D Model Not Loaded</h3>
                        <p className="mt-1 text-sm text-slate-600">File <code className="bg-slate-200 px-1 rounded">body-model.glb</code> is missing.</p>
                        <p className="mt-2 text-xs text-slate-500">Add the 3D model to the <code className="bg-slate-200 px-1 rounded">public</code> folder.</p>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg flex flex-col">
                    <h3 className="text-xl font-black text-slate-900 tracking-tighter mb-4">Treatment Data</h3>
                    
                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Protocol Points</label>
                        <div className="mt-1 p-3 min-h-[6rem] bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-2">
                            {protocolPoints.length > 0 ? protocolPoints.map(p => (
                                <div key={p.ID} onClick={() => handleSelectPoint(p)} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 cursor-pointer hover:border-yellow-500">
                                    <span>{p.ID} - {p.name}</span>
                                </div>
                            )) : <p className="text-slate-400">No protocol points defined.</p>}
                        </div>
                    </div>

                    <div className="mb-4 flex-grow">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Stung Points</label>
                        <div className="mt-1 p-3 min-h-[8rem] bg-slate-50 border border-slate-200 rounded-xl text-sm space-y-2">
                            {stungPoints.length > 0 ? stungPoints.map(p => (
                                <div key={p.ID} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 animate-fade-in-fast">
                                    <span>{p.ID} - {p.name}</span>
                                    <button onClick={() => handleRemoveStungPoint(p.ID)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                </div>
                            )) : <p className="text-slate-400">No points stung yet.</p>}
                        </div>
                    </div>

                    <div className="mb-4">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Add Custom Point</label>
                        <div className="flex items-start gap-2 mt-1">
                            <input type="text" value={manualPointID} onChange={(e) => setManualPointID(e.target.value)} placeholder="ID (e.g., ST36)" className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            <input type="text" value={manualPointName} onChange={(e) => setManualPointName(e.target.value)} placeholder="Name (e.g., Zusanli)" className="flex-grow p-3 bg-slate-50 border border-slate-200 rounded-xl" />
                            <button onClick={handleAddManualPoint} className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-5 rounded-xl transition self-stretch">Add</button>
                        </div>
                        {addPointError && <p className="text-red-500 text-xs mt-1 px-1">{addPointError}</p>}
                    </div>

                    <div className="mb-4">
                        <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="finalNotes">Final Notes</label>
                        <textarea id="finalNotes" value={finalNotes} onChange={(e) => setFinalNotes(e.target.value)} className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl" rows={3} placeholder="Add any final observations..."></textarea>
                    </div>

                    <div className="flex justify-end items-center mt-auto pt-4">
                        <div className="mr-4">{renderStatusMessage()}</div>
                        {renderSaveButton()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TreatmentExecution;
