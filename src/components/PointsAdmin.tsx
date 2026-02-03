
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { StingPoint } from '../types/apipuncture';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader } from 'lucide-react';

const PointsAdmin: React.FC = () => {
    const [points, setPoints] = useState<StingPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<StingPoint | null>(null);
    const [deletingPoint, setDeletingPoint] = useState<StingPoint | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const pointsCollectionRef = React.useMemo(() => collection(db, 'acupuncture_points'), []);

    const fetchPoints = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await getDocs(pointsCollectionRef);
            const fetchedPoints = data.docs.map(doc => ({ ...(doc.data() as Omit<StingPoint, 'id'>), id: doc.id }));
            fetchedPoints.sort((a, b) => a.code.localeCompare(b.code));
            setPoints(fetchedPoints);
        } catch (err) {
            setError('Failed to fetch points. Please try again.');
            console.error(err);
        }
        setIsLoading(false);
    }, [pointsCollectionRef]);

    useEffect(() => {
        fetchPoints();
    }, [fetchPoints]);

    const validatePointForm = (point: StingPoint, isNew: boolean): boolean => {
        if (!point.code.trim()) {
            setFormError('Point code is required.');
            return false;
        }
        if (!point.label.trim()) {
            setFormError('Point label is required.');
            return false;
        }
        if (!point.description.trim()) {
            setFormError('Point description is required.');
            return false;
        }

        if (isNew) {
            const codeExists = points.some(p => p.code.toLowerCase() === point.code.trim().toLowerCase());
            if (codeExists) {
                setFormError(`A point with the code "${point.code.trim().toUpperCase()}" already exists.`);
                return false;
            }
        }
        
        setFormError(null);
        return true;
    }

    const handleSave = async (pointToSave: StingPoint) => {
        const isNewPoint = !pointToSave.id;
        if (!validatePointForm(pointToSave, isNewPoint)) {
            return;
        }

        setIsSubmitting(true);

        const code = pointToSave.code.trim().toUpperCase();

        const dataToSave = {
            code,
            label: pointToSave.label.trim(),
            description: pointToSave.description.trim(),
            position: pointToSave.position,
        };
        
        try {
            if (isNewPoint) {
                // For new points, the ID is the uppercased code
                const newPointRef = doc(db, 'acupuncture_points', code);
                await setDoc(newPointRef, dataToSave);
            } else {
                // For existing points, use their original ID
                const pointDoc = doc(db, 'acupuncture_points', pointToSave.id);
                await updateDoc(pointDoc, dataToSave);
            }
            
            setIsEditing(null);
            fetchPoints();
        } catch (err) {
            setFormError('Failed to save point. Please try again.');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingPoint) return;

        setIsSubmitting(true);
        try {
            const pointDoc = doc(db, 'acupuncture_points', deletingPoint.id);
            await deleteDoc(pointDoc);
            fetchPoints();
        } catch (err) {
            setError('Failed to delete point.');
            console.error(err);
        } 
        setIsSubmitting(false);
        setDeletingPoint(null);
    };

    const handleCancelEdit = () => {
        setIsEditing(null);
        setFormError(null); 
    };

    return (
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Acupuncture Points</h1>
                <div>
                    <button
                        onClick={() => {
                            setFormError(null);
                            setIsEditing({ id: '', code: '', label: '', description: '', position: { x: 0, y: 0, z: 0 }});
                        }}
                        className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg flex items-center shadow-lg hover:bg-red-700 transition"
                    >
                        <PlusCircle size={18} className="mr-2" /> Add New Point
                    </button>
                </div>
            </div>

            {error && <p className="text-red-500 bg-red-100 p-3 rounded-lg mb-4 text-center">{error}</p>}

            {isEditing && (
                <EditPointForm 
                    point={isEditing} 
                    onSave={handleSave} 
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                    points={points} // Pass existing points for validation
                />
            )}

            {deletingPoint && (
                 <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in-fast">
                    <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-md m-4">
                        <div className='flex items-start'>
                            <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10 mr-4">
                               <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Delete Point</h2>
                                <p className="text-slate-600 mt-2">Are you sure you want to delete <span className="font-bold">{deletingPoint.code}</span>? This action cannot be undone.</p>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3 mt-6">
                            <button onClick={() => setDeletingPoint(null)} disabled={isSubmitting} className="font-bold text-slate-600 py-2 px-5 rounded-lg hover:bg-slate-100 transition disabled:opacity-50">Cancel</button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className="bg-red-600 text-white font-bold py-2 px-5 rounded-lg shadow hover:bg-red-700 transition disabled:bg-red-400 disabled:cursor-wait">
                                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                        </div>
                    </div>
                </div>
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
                            {isLoading && !deletingPoint ? (
                                <tr><td colSpan={5} className="text-center p-16"><Loader className='animate-spin text-red-600' size={32}/></td></tr>
                            ) : points.length === 0 ? (
                                <tr><td colSpan={5} className="text-center p-8 text-slate-500">No points found.</td></tr>
                            ) : (
                                points.map(point => (
                                    <tr key={point.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600">{point.code}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800">{point.label}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={point.description}>{point.description}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">{`(${point.position.x}, ${point.position.y}, ${point.position.z})`}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => { setFormError(null); setIsEditing(point);}} className="text-slate-600 hover:text-slate-900 mr-4"><Edit size={18}/></button>
                                            <button onClick={() => setDeletingPoint(point)} className="text-red-500 hover:text-red-700"><Trash2 size={18}/></button>
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


interface EditPointFormProps {
    point: StingPoint;
    points: StingPoint[];
    onSave: (point: StingPoint) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
}

const EditPointForm: React.FC<EditPointFormProps> = ({ point, points, onSave, onCancel, error, isSubmitting }) => {
    const [formData, setFormData] = useState(point);
    const [localError, setLocalError] = useState<string | null>(null);

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
        
        // Validation logic
        if (!formData.code.trim()) {
            setLocalError("Point code is required."); return;
        }
        if (!formData.label.trim()) {
            setLocalError("Point label is required."); return;
        }
        if (!formData.description.trim()) {
            setLocalError("Description is required."); return;
        }

        const isNew = !point.id;
        if (isNew) {
            const codeExists = points.some(p => p.code.toLowerCase() === formData.code.trim().toLowerCase());
            if (codeExists) {
                setLocalError(`A point with the code "${formData.code.trim().toUpperCase()}" already exists.`);
                return;
            }
        }

        setLocalError(null);
        onSave(formData);
    };

    const isEditing = !!formData.id;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in-fast">
            <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-lg m-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <h2 className="text-xl font-black text-slate-900 tracking-tighter mb-4">{isEditing ? 'Edit Point' : 'Add New Point'}</h2>
                    
                    {(error || localError) && <p className="bg-red-100 text-red-700 p-3 rounded-lg text-sm">{error || localError}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input 
                            type="text" 
                            name="code" 
                            value={formData.code} 
                            onChange={handleChange} 
                            placeholder="Code (e.g. ST36)" 
                            className="p-3 bg-slate-100 border border-slate-200 rounded-xl disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed" 
                            required 
                            disabled={isEditing}
                        />
                        <input 
                            type="text" 
                            name="label" 
                            value={formData.label} 
                            onChange={handleChange} 
                            placeholder="Label (e.g. Zusanli)" 
                            className="p-3 bg-slate-100 border border-slate-200 rounded-xl" 
                            required 
                        />
                    </div>
                    <textarea 
                        name="description" 
                        value={formData.description} 
                        onChange={handleChange} 
                        placeholder="Description" 
                        className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl" 
                        rows={3}
                        required
                    ></textarea>
                    <div>
                        <label className="text-sm font-bold text-slate-600">3D Position</label>
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            <input type="number" name="x" step="0.01" value={formData.position.x} onChange={handlePosChange} placeholder="X" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" />
                            <input type="number" name="y" step="0.01" value={formData.position.y} onChange={handlePosChange} placeholder="Y" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" />
                            <input type="number" name="z" step="0.01" value={formData.position.z} onChange={handlePosChange} placeholder="Z" className="p-3 bg-slate-100 border border-slate-200 rounded-xl" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className="font-bold text-slate-600 py-2 px-5">Cancel</button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="bg-slate-800 text-white font-bold py-2 px-5 rounded-lg flex items-center shadow hover:bg-slate-900 transition disabled:bg-slate-400 disabled:cursor-wait"
                        >
                            <Save size={16} className="mr-2" /> 
                            {isSubmitting ? 'Saving...' : 'Save Point'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PointsAdmin;
