
import React, { useState, useEffect } from 'react';
import { PatientData } from '../types';
import { ChevronLeft, ChevronDown } from 'lucide-react';

interface PatientDetailsProps {
  patient: PatientData;
  onSave: (patient: PatientData) => void;
  onCancel: () => void;
}

const PatientDetails: React.FC<PatientDetailsProps> = ({ patient, onSave, onCancel }) => {
  const [formData, setFormData] = useState<PatientData>(patient);

  useEffect(() => { setFormData(patient); }, [patient]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto bg-white rounded-3xl p-8 shadow-lg border border-slate-100 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Patient Information</h2>
        <button type="button" onClick={onCancel} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition"><ChevronLeft size={16} /> Back</button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="fullName">Full Name</label>
            <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl" required />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="email">Email Address</label>
            <input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl" required />
          </div>
           <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="mobile">Mobile Number</label>
            <input id="mobile" name="mobile" type="text" value={formData.mobile} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="identityNumber">Identity Number</label>
            <input id="identityNumber" name="identityNumber" type="text" value={formData.identityNumber} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl" />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="condition">Condition</label>
            <input id="condition" name="condition" type="text" value={formData.condition} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl" />
          </div>
          <div className="relative">
            <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="severity">Severity</label>
            <select id="severity" name="severity" value={formData.severity} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl appearance-none">
              <option>Mild</option>
              <option>Moderate</option>
              <option>Severe</option>
            </select>
            <ChevronDown size={16} className="absolute right-4 top-10 text-slate-400 pointer-events-none" />
          </div>
           <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Caretaker ID</label>
              <p className="font-mono text-sm p-3 mt-1 bg-slate-50 border border-slate-100 rounded-xl">{formData.caretakerId}</p>
            </div>
        </div>
      </div>
      
      <div className="mt-8 flex justify-end gap-4">
        <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">Cancel</button>
        <button type="submit" className="px-8 py-3 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition">Save Changes</button>
      </div>
    </form>
  );
};

export default PatientDetails;
