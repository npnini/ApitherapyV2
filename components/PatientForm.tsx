
import React, { useState } from 'react';
import { PatientData } from '../types';
import { User, ClipboardList, AlertTriangle } from 'lucide-react';

interface Props {
  onSubmit: (data: PatientData) => void;
}

const PatientForm: React.FC<Props> = ({ onSubmit }) => {
  const [formData, setFormData] = useState<PatientData>({
    fullName: '',
    age: 45,
    gender: 'Other',
    condition: '',
    severity: 'moderate',
    allergiesConfirmed: false,
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.allergiesConfirmed) {
      alert("Please confirm that the patient has been screened for bee venom allergies.");
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6 border-b pb-4">
        <User className="text-yellow-600" size={28} />
        <h2 className="text-2xl font-bold">New Patient Intake</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              required
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-2 border"
              value={formData.fullName}
              onChange={e => setFormData({ ...formData, fullName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Age</label>
            <input
              required
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-2 border"
              value={formData.age}
              onChange={e => setFormData({ ...formData, age: parseInt(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Main Condition</label>
          <input
            required
            placeholder="e.g., Rheumatoid Arthritis, Multiple Sclerosis"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-2 border"
            value={formData.condition}
            onChange={e => setFormData({ ...formData, condition: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Severity</label>
          <select
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-2 border"
            value={formData.severity}
            onChange={e => setFormData({ ...formData, severity: e.target.value as any })}
          >
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Medical Notes</label>
          <textarea
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-yellow-500 focus:ring-yellow-500 p-2 border"
            rows={3}
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex items-center">
            <AlertTriangle className="text-yellow-600 mr-2" size={20} />
            <span className="text-sm text-yellow-800 font-bold uppercase tracking-wider">Safety Warning</span>
          </div>
          <p className="mt-2 text-sm text-yellow-700">
            Apitherapy involves live bee venom. Ensure the patient has had an allergy test.
          </p>
          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-yellow-600 focus:ring-yellow-500"
              checked={formData.allergiesConfirmed}
              onChange={e => setFormData({ ...formData, allergiesConfirmed: e.target.checked })}
            />
            <span className="text-sm font-semibold text-yellow-900">I confirm the patient is screened for allergies.</span>
          </label>
        </div>

        <button
          type="submit"
          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-md flex items-center justify-center gap-2"
        >
          <ClipboardList size={20} />
          Evaluate Patient Profile
        </button>
      </form>
    </div>
  );
};

export default PatientForm;
