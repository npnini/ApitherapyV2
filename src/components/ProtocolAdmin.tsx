
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { Protocol, StingingPoint } from '../types/protocol';
import { StingPoint as AcuPoint } from '../types/apipuncture'; // To avoid naming conflict
import { Trash2, Edit, Plus, X, Loader } from 'lucide-react';

// A type for the form state, where points are an array of strings (IDs)
interface ProtocolFormState extends Omit<Protocol, 'points'> {
    points: string[];
}

const ProtocolAdmin: React.FC = () => {
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [allAcuPoints, setAllAcuPoints] = useState<AcuPoint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isFormLoading, setIsFormLoading] = useState<boolean>(false);
    const [editingProtocol, setEditingProtocol] = useState<Partial<ProtocolFormState> | null>(null);

    const fetchProtocolsAndPoints = useCallback(async () => {
        setIsLoading(true);
        try {
            const protocolsCollection = collection(db, 'protocols');
            const protocolSnapshot = await getDocs(protocolsCollection);
            const protocolsList = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Protocol[]);
            setProtocols(protocolsList);

            const pointsCollection = collection(db, 'acupuncture_points');
            const pointsSnapshot = await getDocs(pointsCollection);
            const pointsList = pointsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AcuPoint));
            setAllAcuPoints(pointsList);

        } catch (error) {
            console.error("Error fetching data:", error);
            alert('Could not fetch data.');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchProtocolsAndPoints();
    }, [fetchProtocolsAndPoints]);

    const handleSave = async () => {
        if (!editingProtocol || !editingProtocol.name) {
            alert('Protocol name is required.');
            return;
        }

        setIsFormLoading(true);
        try {
            const protocolToSave: Omit<ProtocolFormState, 'id'> = {
                name: editingProtocol.name || '',
                description: editingProtocol.description || '',
                rationale: editingProtocol.rationale || '',
                points: editingProtocol.points || [],
            };

            if (editingProtocol.id) {
                const protocolRef = doc(db, 'protocols', editingProtocol.id);
                await updateDoc(protocolRef, protocolToSave);
            } else {
                await addDoc(collection(db, 'protocols'), protocolToSave);
            }
            setEditingProtocol(null);
            fetchProtocolsAndPoints(); 
        } catch (error) {
            console.error("Error saving protocol:", error);
            alert('Failed to save protocol.');
        }
        setIsFormLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this protocol?')) {
            try {
                await deleteDoc(doc(db, 'protocols', id));
                fetchProtocolsAndPoints();
            } catch (error) {
                console.error("Error deleting protocol:", error);
                alert('Failed to delete protocol.');
            }
        }
    };
    
    const handleStartEditing = (proto: Protocol) => {
        // Convert the full StingingPoint objects in the protocol to just their IDs for the form state.
        // This handles legacy data as well as the new format.
        const pointIds = (proto.points || []).map(p => typeof p === 'string' ? p : (p as StingingPoint).ID);
        setEditingProtocol({ ...proto, points: pointIds });
    };

    const renderProtocolForm = () => {
        if (!editingProtocol) return null;
        
        const handlePointSelection = (pointId: string) => {
            const currentPoints = editingProtocol.points || [];
            const newPoints =
                currentPoints.includes(pointId)
                    ? currentPoints.filter(id => id !== pointId)
                    : [...currentPoints, pointId];
            setEditingProtocol({ ...editingProtocol, points: newPoints });
        };

        return (
             <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
                <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-2xl m-4 transform transition-all">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tighter mb-6">{editingProtocol.id ? 'Edit Protocol' : 'Add New Protocol'}</h2>
                    {isFormLoading ? <div className="flex justify-center items-center"><Loader className="animate-spin" /></div> : (
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Protocol Name"
                            value={editingProtocol.name || ''}
                            onChange={(e) => setEditingProtocol({ ...editingProtocol, name: e.target.value })}
                            className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl"
                        />
                        <textarea
                            placeholder="Protocol Description"
                            value={editingProtocol.description || ''}
                            onChange={(e) => setEditingProtocol({ ...editingProtocol, description: e.target.value })}
                            className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl h-24"
                        />
                        <textarea
                            placeholder="Protocol Rationale"
                            value={editingProtocol.rationale || ''}
                            onChange={(e) => setEditingProtocol({ ...editingProtocol, rationale: e.target.value })}
                            className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl h-24"
                        />
                        <div>
                            <h3 className="text-sm font-bold text-slate-600 mb-2">Select Points</h3>
                            <div className="max-h-60 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 md:grid-cols-3 gap-2">
                                {allAcuPoints.sort((a,b) => a.code.localeCompare(b.code)).map(point => (
                                    <label key={point.id} className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${ (editingProtocol.points || []).includes(point.id) ? 'bg-red-100 text-red-800' : 'bg-white hover:bg-slate-100'}`}>
                                        <input
                                            type="checkbox"
                                            checked={(editingProtocol.points || []).includes(point.id)}
                                            onChange={() => handlePointSelection(point.id)}
                                            className="form-checkbox h-4 w-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                                        />
                                        <span className="font-bold">{point.code}</span>
                                        <span className="text-slate-600 truncate">{point.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                    )}
                    <div className="flex justify-end space-x-3 mt-6">
                        <button onClick={() => setEditingProtocol(null)} className="font-bold text-slate-600 py-2 px-5">Cancel</button>
                        <button onClick={handleSave} disabled={isFormLoading} className="bg-slate-800 text-white font-bold py-2 px-6 rounded-lg shadow hover:bg-slate-900 transition disabled:bg-slate-400">
                           {isFormLoading ? 'Saving...' : 'Save Protocol'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Protocol Configuration</h1>
                <button onClick={() => setEditingProtocol({ name: '', description: '', rationale: '', points: [] })} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center shadow-lg transition">
                    <Plus size={18} className="mr-2"/>Add New Protocol
                </button>
            </div>

            {isLoading ? <p>Loading protocols...</p> : (
                <div className="bg-white rounded-3xl shadow-lg border border-slate-100">
                    <ul className="divide-y divide-slate-100">
                        {protocols.length === 0 ? (
                            <p className="p-8 text-center text-slate-500">No protocols found. Click 'Add New Protocol' to start.</p>
                        ) : protocols.map(protocol => (
                            <li key={protocol.id} className="p-4 flex justify-between items-center hover:bg-slate-50">
                                <div>
                                    <p className="font-bold text-slate-800">{protocol.name}</p>
                                    <p className="text-sm text-slate-500 truncate max-w-xl">{protocol.description}</p>
                                    <p className="text-xs text-slate-400 font-mono mt-1">{(protocol.points || []).length} points</p>
                                </div>
                                <div className="flex space-x-4">
                                    <button onClick={() => handleStartEditing(protocol)} className="text-slate-600 hover:text-slate-900"><Edit size={18} /></button>
                                    <button onClick={() => protocol.id && handleDelete(protocol.id)} className="text-red-500 hover:text-red-700"><Trash2 size={18} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {renderProtocolForm()}
        </div>
    );
};

export default ProtocolAdmin;
