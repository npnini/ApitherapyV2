import React, { useState } from 'react';
import { Protocol } from '../types/protocol';

const initialProtocols: Protocol[] = [
    { id: '1', name: 'Bee-Sting Facial Rejuvenation', description: 'A protocol for facial rejuvenation using bee venom.', stingingPoints: [{id: 'p1', name: 'Forehead'}, {id: 'p2', name: 'Cheeks'}] },
    { id: '2', name: 'Arthritis Relief Protocol', description: 'Targets major joints to reduce inflammation and pain.', stingingPoints: [{id: 'p3', name: 'Left Knee'}, {id: 'p4', name: 'Right Shoulder'}] },
    { id: '3', name: 'Back Pain Soother', description: 'Focuses on key points along the spine to alleviate back pain.', stingingPoints: [{id: 'p5', name: 'Lower Back'}, {id: 'p6', name: 'Upper Back'}] },
];

const ProtocolAdmin: React.FC = () => {
    const [protocols, setProtocols] = useState<Protocol[]>(initialProtocols);

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">Protocol Administration</h1>

            <div className="mb-6">
                <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Add New Protocol
                </button>
            </div>

            <div className="bg-white shadow-md rounded-lg p-4">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stinging Points</th>
                            <th scope="col" className="relative px-6 py-3">
                                <span className="sr-only">Edit</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {protocols.map((protocol) => (
                            <tr key={protocol.id}>
                                <td className="px-6 py-4 whitespace-nowrap">{protocol.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap">{protocol.name}</td>
                                <td className="px-6 py-4">{protocol.description}</td>
                                <td className="px-6 py-4">{protocol.stingingPoints.map(p => p.name).join(', ')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <a href="#" className="text-indigo-600 hover:text-indigo-900">Edit</a>
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
