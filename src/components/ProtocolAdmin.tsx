
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { Protocol } from '../types/protocol';
import { Trash2, Edit, Plus, X } from 'lucide-react';

const ProtocolAdmin: React.FC = () => {
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [editingProtocol, setEditingProtocol] = useState<Partial<Protocol> | null>(null);

    const fetchProtocols = async () => {
        setIsLoading(true);
        try {
            const protocolsCollection = collection(db, 'protocols');
            const protocolSnapshot = await getDocs(protocolsCollection);
            const protocolsList = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Protocol[];
            setProtocols(protocolsList);
        } catch (error) {
            console.error("Error fetching protocols:", error);
            alert('Could not fetch protocols.');
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchProtocols();
    }, []);

    const handleSave = async () => {
        if (!editingProtocol || !editingProtocol.name) {
            alert('Protocol name is required.');
            return;
        }

        setIsLoading(true);
        try {
            const protocolToSave = { ...editingProtocol };
            if (editingProtocol.id) {
                const protocolRef = doc(db, 'protocols', editingProtocol.id);
                const { id, ...dataToUpdate } = protocolToSave;
                await updateDoc(protocolRef, dataToUpdate);
            } else {
                const { id, ...dataToAdd } = protocolToSave;
                await addDoc(collection(db, 'protocols'), dataToAdd);
            }
            setEditingProtocol(null);
            fetchProtocols();
        } catch (error) {
            console.error("Error saving protocol:", error);
            alert('Failed to save protocol.');
        }
        setIsLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this protocol?')) {
            try {
                await deleteDoc(doc(db, 'protocols', id));
                fetchProtocols();
            } catch (error) {
                console.error("Error deleting protocol:", error);
                alert('Failed to delete protocol.');
            }
        }
    };
    
    const renderProtocolForm = () => {
        if (editingProtocol) {
                return (
                    <div className="p-6 bg-white rounded-lg shadow-md mt-6">
                        <h2 className="text-xl font-bold mb-4">{editingProtocol.id ? 'Edit Protocol' : 'Add New Protocol'}</h2>
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Protocol Name"
                                value={editingProtocol.name || ''}
                                onChange={(e) => setEditingProtocol({ ...editingProtocol, name: e.target.value })}
                                className="w-full p-2 border rounded"
                            />
                            <textarea
                                placeholder="Protocol Description"
                                value={editingProtocol.description || ''}
                                onChange={(e) => setEditingProtocol({ ...editingProtocol, description: e.target.value })}
                                className="w-full p-2 border rounded"
                            />
                            <textarea
                                placeholder="Protocol Rationale"
                                value={editingProtocol.rationale || ''}
                                onChange={(e) => setEditingProtocol({ ...editingProtocol, rationale: e.target.value })}
                                className="w-full p-2 border rounded"
                            />
                             <div>
                                <h3 class="text-lg font-bold">Points</h3>
                                {editingProtocol.points?.map((point, index) => (
                                    <div key={index} class="flex items-center space-x-2 p-2 bg-gray-100 rounded">
                                        <input type="text" placeholder="ID" value={point.ID} onChange={(e) => {
                                            const points = [...(editingProtocol.points || [])];
                                            points[index].ID = e.target.value;
                                            setEditingProtocol({...editingProtocol, points});
                                        }} class="p-1 border rounded w-1/4" />
                                        <input type="text" placeholder="Name" value={point.name} onChange={(e) => {
                                            const points = [...(editingProtocol.points || [])];
                                            points[index].name = e.target.value;
                                            setEditingProtocol({...editingProtocol, points});
                                        }} class="p-1 border rounded w-1/2" />
                                        <input type="number" placeholder="Qty" value={point.quantity} onChange={(e) => {
                                            const points = [...(editingProtocol.points || [])];
                                            points[index].quantity = Number(e.target.value);
                                            setEditingProtocol({...editingProtocol, points});
                                        }} class="p-1 border rounded w-1/6" />
                                        <button onClick={() => {
                                            const points = [...(editingProtocol.points || [])].filter((_, i) => i !== index);
                                            setEditingProtocol({...editingProtocol, points});
                                        }}><Trash2 size={16} /></button>
                                    </div>
                                ))}
                                <button onClick={() => {
                                     const points = [...(editingProtocol.points || []), {ID: '', name: '', quantity: 1}];
                                     setEditingProtocol({...editingProtocol, points});
                                }} class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"><Plus size={16} /> Add Point</button>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-4 mt-4">
                            <button onClick={() => setEditingProtocol(null)} className="px-4 py-2 bg-gray-300 rounded">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-green-500 text-white rounded">Save Protocol</button>
                        </div>
                    </div>
                );
            }
            return null;
        };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Protocol Configuration</h1>
                <button onClick={() => setEditingProtocol({ name: '', description: '', rationale: '', points: [] })} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"><Plus size={16} className="mr-2"/>Add New Protocol</button>
            </div>

            {isLoading ? <p>Loading protocols...</p> : (
                <div className="bg-white shadow rounded-lg">
                    <ul className="divide-y divide-gray-200">
                        {protocols.map(protocol => (
                            <li key={protocol.id} className="p-4 flex justify-between items-center">
                                <div>
                                    <p className="font-semibold">{protocol.name}</p>
                                    <p className="text-sm text-gray-500">{protocol.description}</p>
                                </div>
                                <div className="flex space-x-2">
                                    <button onClick={() => setEditingProtocol(protocol)}><Edit size={16} /></button>
                                    <button onClick={() => protocol.id && handleDelete(protocol.id)}><Trash2 size={16} /></button>
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
