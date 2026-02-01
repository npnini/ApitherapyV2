import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { PatientData } from '../../types/patient';
import { Protocol } from '../../types/protocol';

interface ProtocolSelectionProps {
    patient: PatientData;
    onBack: () => void;
    onProtocolSelect: (protocol: Protocol, report: string, vitals: string) => void;
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({ patient, onBack, onProtocolSelect }) => {
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
    const [patientReport, setPatientReport] = useState('');
    const [vitals, setVitals] = useState('');

    useEffect(() => {
        const fetchProtocols = async () => {
            setIsLoading(true);
            const querySnapshot = await getDocs(collection(db, 'protocols'));
            const protocolsData = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol));
            setProtocols(protocolsData);
            setIsLoading(false);
        };
        fetchProtocols();
    }, []);

    const handleProtocolSelect = (protocol: Protocol) => {
        setSelectedProtocol(protocol);
    };

    const handleNext = () => {
        if (selectedProtocol) {
            onProtocolSelect(selectedProtocol, patientReport, vitals);
        }
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">New Treatment</h1>
                <button onClick={onBack} className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Back</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div><span className="font-bold">Patient:</span> {patient.fullName}</div>
                <div><span className="font-bold">Date:</span> {new Date().toLocaleDateString()}</div>
                <div><span className="font-bold">Treatment No:</span> {/* Logic to be added */}</div>
                <div><span className="font-bold">Time:</span> {new Date().toLocaleTimeString()}</div>
            </div>

            <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2">Patient Report</label>
                <textarea value={patientReport} onChange={(e) => setPatientReport(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" rows={4}></textarea>
            </div>

            <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2">Vitals</label>
                <input type="text" value={vitals} onChange={(e) => setVitals(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" />
            </div>

            <h2 className="text-xl font-bold mb-4">Select a Protocol</h2>
            {isLoading ? (
                <div>Loading protocols...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {protocols.map(protocol => (
                        <div key={protocol.id} 
                             onClick={() => handleProtocolSelect(protocol)} 
                             className={`p-4 border rounded-lg cursor-pointer ${selectedProtocol?.id === protocol.id ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                            <h3 className="font-bold">{protocol.name}</h3>
                            <p>{protocol.description}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <button onClick={handleNext} disabled={!selectedProtocol} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400">
                    Next: Perform Treatment
                </button>
            </div>
        </div>
    );
};

export default ProtocolSelection;
