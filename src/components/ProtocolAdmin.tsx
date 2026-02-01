import React, { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Protocol, StingingPoint } from '../../types/protocol';

const ProtocolAdmin: React.FC = () => {
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [editingProtocol, setEditingProtocol] = useState<Protocol | null>(null);

    useEffect(() => {
        fetchProtocols();
    }, []);

    const fetchProtocols = async () => {
        setIsLoading(true);
        const querySnapshot = await getDocs(collection(db, 'protocols'));
        const protocolsData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol));
        setProtocols(protocolsData);
        setIsLoading(false);
    };

    const handleEdit = (protocol: Protocol) => {
        setEditingProtocol({ ...protocol });
    };

    const handleSave = async () => {
        if (!editingProtocol) return;
        const { id, ...data } = editingProtocol;
        await setDoc(doc(db, 'protocols', id), data, { merge: true });
        setEditingProtocol(null);
        fetchProtocols();
    };

    const handleDelete = async (protocolId: string) => {
        await deleteDoc(doc(db, 'protocols', protocolId));
        fetchProtocols();
    };

    const handleAddNew = () => {
        setEditingProtocol({
            id: `proto_${Date.now()}`,
            name: '',
            description: '',
            stingingPoints: []
        });
    };

    const handleStingingPointChange = (index: number, field: keyof StingingPoint, value: string) => {
        if (!editingProtocol) return;
        const updatedPoints = [...editingProtocol.stingingPoints];
        updatedPoints[index] = { ...updatedPoints[index], [field]: value };
        setEditingProtocol({ ...editingProtocol, stingingPoints: updatedPoints });
    };

    const addStingingPoint = () => {
        if (!editingProtocol) return;
        const newPoint: StingingPoint = { id: `sp_${Date.now()}`, name: '' };
        setEditingProtocol({ ...editingProtocol, stingingPoints: [...editingProtocol.stingingPoints, newPoint] });
    };

    const removeStingingPoint = (index: number) => {
        if (!editingProtocol) return;
        const updatedPoints = editingProtocol.stingingPoints.filter((_, i) => i !== index);
        setEditingProtocol({ ...editingProtocol, stingingPoints: updatedPoints });
    };


    if (isLoading) {
        return <div>Loading protocols...</div>;
    }

    if (editingProtocol) {
        return (
            <div className="bg-white shadow-md rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">{editingProtocol.name ? 'Edit Protocol' : 'Add New Protocol'}</h2>
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2">Protocol Name</label>
                    <input type="text" value={editingProtocol.name} onChange={(e) => setEditingProtocol({ ...editingProtocol, name: e.target.value })} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" />
                </div>
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2">Description</label>
                    <textarea value={editingProtocol.description} onChange={(e) => setEditingProtocol({ ...editingProtocol, description: e.target.value })} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700"></textarea>
                </div>

                <h3 className="text-lg font-bold mt-6 mb-2">Stinging Points</h3>
                {editingProtocol.stingingPoints.map((point, index) => (
                    <div key={index} className="flex items-center mb-2">
                        <input type="text" placeholder="Point ID" value={point.id} onChange={(e) => handleStingingPointChange(index, 'id', e.target.value)} className="shadow appearance-none border rounded w-1/3 py-2 px-3 mr-2" />
                        <input type="text" placeholder="Point Name" value={point.name} onChange={(e) => handleStingingPointChange(index, 'name', e.target.value)} className="shadow appearance-none border rounded w-2/3 py-2 px-3 mr-2" />
                        <button onClick={() => removeStingingPoint(index)} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">Remove</button>
                    </div>
                ))}
                <button onClick={addStingingPoint} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mt-2">Add Stinging Point</button>

                <div className="mt-6 flex justify-end">
                    <button onClick={() => setEditingProtocol(null)} className="mr-4 bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Cancel</button>
                    <button onClick={handleSave} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Save Protocol</button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Protocol Management</h1>
                <button onClick={handleAddNew} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Add New Protocol
                </button>
            </div>
            <div className="bg-white shadow-md rounded-lg p-6">
                <table className="min-w-full table-auto">
                    <thead className="bg-gray-200">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Description</th>
                            <th className="px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {protocols.map(protocol => (
                            <tr key={protocol.id}>
                                <td className="border px-4 py-2">{protocol.name}</td>
                                <td className="border px-4 py-2">{protocol.description}</td>
                                <td className="border px-4 py-2">
                                    <button onClick={() => handleEdit(protocol)} className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded mr-2">Edit</button>
                                    <button onClick={() => handleDelete(protocol.id)} className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded">Delete</button>
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
