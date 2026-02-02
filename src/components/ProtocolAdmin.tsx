
import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Protocol, StingingPoint } from '../types/protocol';
import { Plus, Trash2, Edit } from 'lucide-react';

const ProtocolAdmin: React.FC = () => {
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingProtocol, setEditingProtocol] = useState<Partial<Protocol> | null>(null);

    useEffect(() => {
        fetchProtocols();
    }, []);

    const fetchProtocols = async () => {
        setIsLoading(true);
        const protocolSnapshot = await getDocs(collection(db, 'protocols'));
        const protocolsData = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol));
        setProtocols(protocolsData);
        setIsLoading(false);
    };

    const handleAddNew = () => {
        setEditingProtocol({
            name: '',
            description: '',
            points: [],
        });
    };

    const handleEdit = (protocol: Protocol) => {
        setEditingProtocol(JSON.parse(JSON.stringify(protocol))); // Deep copy
    };

    const handleCancel = () => {
        setEditingProtocol(null);
    };

    const handleSave = async () => {
        if (!editingProtocol) return;

        const protocolToSave = {
            ...editingProtocol,
            points: editingProtocol.points?.map(p => ({ ...p, quantity: Number(p.quantity) || 1 })) || [],
        };

        setIsLoading(true);
        try {
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

    const handleDelete = async (protocolId: string) => {
        if (window.confirm('Are you sure you want to delete this protocol?')) {
            try {
                await deleteDoc(doc(db, 'protocols', protocolId));
                fetchProtocols();
            } catch (error) {
                console.error("Error deleting protocol:", error);
            }
        }
    };

    const handlePointChange = (index: number, field: keyof StingingPoint, value: string | number) => {
        if (!editingProtocol || !editingProtocol.points) return;

        const updatedPoints = [...editingProtocol.points];
        const pointToUpdate = { ...updatedPoints[index], [field]: value };
        updatedPoints[index] = pointToUpdate;

        setEditingProtocol({ ...editingProtocol, points: updatedPoints });
    };

    const handleAddPoint = () => {
        if (!editingProtocol) return;
        const newPoint: StingingPoint = { ID: '', name: '', quantity: 1 };
        setEditingProtocol({
            ...editingProtocol,
            points: [...(editingProtocol.points || []), newPoint],
        });
    };

    const handleRemovePoint = (index: number) => {
        if (!editingProtocol || !editingProtocol.points) return;
        const updatedPoints = editingProtocol.points.filter((_, i) => i !== index);
        setEditingProtocol({ ...editingProtocol, points: updatedPoints });
    };

    if (isLoading && !editingProtocol) {
        return <div className="p-6 text-center">Loading...</div>;
    }

    if (editingProtocol) {
        return (
            <div className="p-6 bg-white rounded-lg shadow-md">
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

                    <div>
                        <h3 className="font-bold">Stinging Points</h3>
                        {editingProtocol.points?.map((point, index) => (
                            <div key={index} className="flex items-center space-x-2 mt-2">
                                <input
                                    type="text"
                                    placeholder="ID (e.g., ST36)"
                                    value={point.ID}
                                    onChange={(e) => handlePointChange(index, 'ID', e.target.value)}
                                    className="w-1/3 p-2 border rounded"
                                />
                                <input
                                    type="text"
                                    placeholder="Name (e.g., Zusanli)"
                                    value={point.name}
                                    onChange={(e) => handlePointChange(index, 'name', e.target.value)}
                                    className="w-1/3 p-2 border rounded"
                                />
                                <input
                                    type="number"
                                    placeholder="Quantity"
                                    value={point.quantity}
                                    onChange={(e) => handlePointChange(index, 'quantity', e.target.value)}
                                    className="w-1/6 p-2 border rounded"
                                />
                                <button onClick={() => handleRemovePoint(index)} className="text-red-500"><Trash2 /></button>
                            </div>
                        ))}
                        <button onClick={handleAddPoint} className="mt-2 text-blue-500"><Plus /> Add Point</button>
                    </div>
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                    <button onClick={handleCancel} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
                    <button onClick={handleSave} className="bg-blue-500 text-white px-4 py-2 rounded">Save</button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Protocol Administration</h1>
                <button onClick={handleAddNew} className="bg-blue-500 text-white px-4 py-2 rounded"><Plus /> Add New</button>
            </div>
            <div className="bg-white shadow-md rounded-lg p-4">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                        <th className="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {protocols.map((protocol) => (
                        <tr key={protocol.id}>
                            <td className="px-6 py-4 whitespace-nowrap">{protocol.name}</td>
                            <td className="px-6 py-4">{protocol.description}</td>
                            <td className="px-6 py-4">{protocol.points?.map(p => `${p.ID} (${p.quantity})`).join(', ') || 'N/A'}</td>
                            <td className="px-6 py-4 text-right">
                                <button onClick={() => handleEdit(protocol)} className="text-blue-500"><Edit /></button>
                                <button onClick={() => handleDelete(protocol.id)} className="text-red-500 ml-2"><Trash2 /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
    );
};

export default ProtocolAdmin;
