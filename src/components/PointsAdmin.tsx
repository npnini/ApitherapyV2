
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { APITHERAPY_PROTOCOLS } from '../data/apipunctureData'; 
import { PlusCircle, Edit, Trash2, Save, X, AlertTriangle } from 'lucide-react';

const PointsAdmin: React.FC = () => {
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<StingPoint | null>(null);
    const [error, setError] = useState<string | null>(null);

    const pointsCollectionRef = collection(db, 'acupuncture_points');

    const fetchPoints = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getDocs(pointsCollectionRef);
            const fetchedPoints = data.docs.map(doc => ({ ...doc.data(), id: doc.id } as StingPoint));
            setPoints(fetchedPoints);
        } catch (err) {
            setError('Failed to fetch points. Please try again.');
            console.error(err);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchPoints();
    }, [fetchPoints]);

    const handleSeedDatabase = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const allPoints = new Map<string, Omit<StingPoint, 'id'>>();
            APITHERAPY_PROTOCOLS.forEach(protocol => {
                protocol.points.forEach(point => {
                    if (!allPoints.has(point.code)) {
                        allPoints.set(point.code, {
                            code: point.code,
                            label: point.label,
                            description: point.description,
                            position: point.position,
                        });
                    }
                });
            });

            for (const [code, pointData] of allPoints.entries()) {
                // Use the point's 'code' (e.g., "ST36") as the document ID
                await setDoc(doc(db, 'acupuncture_points', code), pointData);
            }
            alert('Database has been successfully seeded with initial points.');
            fetchPoints();
        } catch (err) {
            setError('Failed to seed database.');
            console.error(err);
        }
        setIsLoading(false);
    };

    const handleSave = async (pointToSave: StingPoint) => {
        if (!pointToSave.code || !pointToSave.label) {
            setError("Point Code and Label are required.");
            return;
        }

        setIsLoading(true);
        try {
            if (pointToSave.id) { // Editing existing point
                const pointDoc = doc(db, 'acupuncture_points', pointToSave.id);
                const { id, ...dataToUpdate } = pointToSave;
                await updateDoc(pointDoc, dataToUpdate);
            } else { // Adding new point
                await addDoc(pointsCollectionRef, pointToSave);
            }
            setIsEditing(null);
            fetchPoints();
        } catch (err) {
            setError('Failed to save point.');
            console.error(err);
        }
        setIsLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this point? This action cannot be undone.')) {
            setIsLoading(true);
            try {
                const pointDoc = doc(db, 'acupuncture_points', id);
                await deleteDoc(pointDoc);
                fetchPoints();
            } catch (err) {
                setError('Failed to delete point.');
                console.error(err);
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Acupuncture Points</h1>
                <div>
                    <button
                        onClick={() => setIsEditing({ id: '', code: '', label: '', description: '', position: { x: 0, y: 0, z: 0 }})}
                        className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg flex items-center shadow-lg hover:bg-red-700 transition"
                    >
                        <PlusCircle size={18} className="mr-2" /> Add New Point
                    </button>
                </div>
            </div>

            {error && <p className="text-red-500 bg-red-100 p-3 rounded-lg mb-4">{error}</p>}
            
            <div className="mb-6 p-4 border-l-4 border-yellow-400 bg-yellow-50">
                <div className="flex items-start">
                    <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
                    <div>
                        <h2 className="font-bold text-yellow-800">One-Time Action</h2>
                        <p className="text-sm text-yellow-700">
                            Click this button once to populate your Firestore database with the initial set of acupuncture points from the code. 
                            This is a necessary first step.
                        </p>
                        <button
                            onClick={handleSeedDatabase}
                            disabled={isLoading}
                            className="mt-2 bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg shadow hover:bg-yellow-600 disabled:bg-slate-400 transition"
                        >
                            {isLoading ? 'Processing...' : 'Seed Database'}
                        </button>
                    </div>
                </div>
            </div>

            {isEditing && (
                <EditPointForm point={isEditing} onSave={handleSave} onCancel={() => setIsEditing(null)} />
            )}

            <div className="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Code</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Label</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Position (x, y, z)</th>
                                <th scope="col" className="relative px-6 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center p-8 text-slate-500">Loading points...</td></tr>
                            ) : points.length === 0 ? (
                                <tr><td colSpan={5} className="text-center p-8 text-slate-500">No points found. Try seeding the database.</td></tr>
                            ) : (
                                points.map(point => (
                                    <tr key={point.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600">{point.code}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">{point.label}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{point.description}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">{`${point.position.x}, ${point.position.y}, ${point.position.z}`}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => setIsEditing(point)} className="text-slate-600 hover:text-slate-900 mr-4"><Edit size={18}/></button>
                                            <button onClick={() => handleDelete(point.id)} className="text-red-500 hover:text-red-700"><Trash2 size={18}/></button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};


const EditPointForm: React.FC<{point: StingPoint, onSave: (point: StingPoint) => void, onCancel: () => void}> = ({ point, onSave, onCancel }) => {
    const [formData, setFormData] = useState(point);

    useEffect(() => {
        setFormData(point);
    }, [point]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            position: { ...prev.position, [name]: parseFloat(value) || 0 }
        }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in-fast">
            <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-lg m-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <h2 className="text-xl font-black text-slate-900 tracking-tighter mb-4">{formData.id ? 'Edit Point' : 'Add New Point'}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" name="code" value={formData.code} onChange={handleChange} placeholder="Code (e.g. ST36)" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" required />
                        <input type="text" name="label" value={formData.label} onChange={handleChange} placeholder="Label (e.g. Zusanli)" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" required />
                    </div>
                    <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description" className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl" rows={3}></textarea>
                    <div>
                        <label className="text-sm font-bold text-slate-600">3D Position</label>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            <input type="number" name="x" step="0.01" value={formData.position.x} onChange={handlePosChange} placeholder="X" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" />
                            <input type="number" name="y" step="0.01" value={formData.position.y} onChange={handlePosChange} placeholder="Y" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" />
                            <input type="number" name="z" step="0.01" value={formData.position.z} onChange={handlePosChange} placeholder="Z" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onCancel} className="font-bold text-slate-600 py-2 px-5">Cancel</button>
                        <button type="submit" className="bg-slate-800 text-white font-bold py-2 px-5 rounded-lg flex items-center shadow hover:bg-slate-900 transition">
                            <Save size={16} className="mr-2" /> Save Point
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PointsAdmin;
