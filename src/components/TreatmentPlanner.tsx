import React, { useState } from 'react';
import { PatientData } from '../../types/patient';
import { Treatment } from '../../types/treatment';

interface TreatmentPlannerProps {
    patient: PatientData;
    treatments: Treatment[];
    onSave: (treatments: Treatment[]) => void;
    onBack: () => void;
    isSaving: boolean;
}

const TreatmentPlanner: React.FC<TreatmentPlannerProps> = ({ patient, treatments, onSave, onBack, isSaving }) => {
    const [localTreatments, setLocalTreatments] = useState<Treatment[]>(treatments);

    const handleStatusChange = (index: number, status: 'pending' | 'done' | 'missed' | 'skipped') => {
        const updatedTreatments = [...localTreatments];
        updatedTreatments[index].status = status;
        setLocalTreatments(updatedTreatments);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white shadow-md rounded-lg p-6">
                <h1 className="text-2xl font-bold mb-4">Perform Treatment: {patient.fullName}</h1>
                {/* 3D model placeholder */}
                <div className="w-full h-96 bg-gray-200 flex items-center justify-center rounded-lg">
                    <p className="text-gray-500">3D model will be displayed here</p>
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg p-6">
                <h2 className="text-xl font-bold mb-4">Stinging Points</h2>
                <div className="space-y-4">
                    {localTreatments.map((treatment, index) => (
                        <div key={treatment.id} className="p-4 border rounded-lg">
                            <div className="font-bold mb-2">{treatment.point}</div>
                            <div className="flex space-x-2">
                                <button onClick={() => handleStatusChange(index, 'done')} className={`px-3 py-1 text-sm rounded ${treatment.status === 'done' ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>Done</button>
                                <button onClick={() => handleStatusChange(index, 'missed')} className={`px-3 py-1 text-sm rounded ${treatment.status === 'missed' ? 'bg-yellow-500 text-white' : 'bg-gray-200'}`}>Missed</button>
                                <button onClick={() => handleStatusChange(index, 'skipped')} className={`px-3 py-1 text-sm rounded ${treatment.status === 'skipped' ? 'bg-red-500 text-white' : 'bg-gray-200'}`}>Skipped</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex justify-between">
                    <button onClick={onBack} className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Back</button>
                    <button onClick={() => onSave(localTreatments)} disabled={isSaving} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400">
                        {isSaving ? 'Saving...' : 'Save Treatment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TreatmentPlanner;
