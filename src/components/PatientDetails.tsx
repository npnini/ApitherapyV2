
import React, { useState, useEffect, useRef } from 'react';
import { PatientData } from '../types/patient';
import { ChevronLeft, ChevronDown, Plus, Calendar } from 'lucide-react';
import { AppUser } from '../types/user';

const formatDateForDisplay = (isoDate: string) => {
  if (!isoDate || !/\d{4}-\d{2}-\d{2}/.test(isoDate)) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

const DateInput = ({ value, onChange, ...props }) => {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleContainerClick = () => {
      dateInputRef.current?.showPicker();
  };

  return (
    <div className="relative w-full" onClick={handleContainerClick}>
      <input
        type="text"
        value={formatDateForDisplay(value)}
        readOnly
        placeholder="dd/mm/yyyy"
        className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl cursor-pointer pr-10"
      />
      <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400 pointer-events-none" />
      <input
          ref={dateInputRef}
          type="date"
          name={props.name}
          value={value || ''}
          onChange={onChange}
          className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
          tabIndex={-1}
      />
    </div>
  );
};

interface PatientDetailsProps {
  patient: PatientData;
  user: AppUser;
  onSave: (patient: PatientData) => void;
  onBack: () => void;
  onStartTreatment: () => void;
}

const PatientDetails: React.FC<PatientDetailsProps> = ({ patient, user, onSave, onBack, onStartTreatment }) => {
  const [formData, setFormData] = useState<PatientData>({ ...patient });

  // ***** THE CORRECT AND FINAL FIX *****
  // The application logic ensures that the `user` prop is the caretaker of the `patient`.
  // There is no need for a separate state or effect to fetch the name.
  const caretakerName = patient.caretakerId ? user.fullName : 'Not Assigned';

  const calculateAge = (birthDate: string): number | null => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(formData.birthDate);

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
            <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition"><ChevronLeft size={16} /> Back</button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <InputField label="Full Name" id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} required />
                <InputField label="Email Address" id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
                <InputField label="Mobile Number" id="mobile" name="mobile" value={formData.mobile} onChange={handleChange} required />
                <InputField label="Identity Number" id="identityNumber" name="identityNumber" value={formData.identityNumber} onChange={handleChange} required />
            </div>

            <div className="space-y-4">
                <InputField label="Condition" id="condition" name="condition" value={formData.condition} onChange={handleChange} required />
                <div className="relative">
                    <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="severity">Severity</label>
                    <select id="severity" name="severity" value={formData.severity} onChange={handleChange} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl appearance-none" required>
                        <option value="Mild">Mild</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Severe">Severe</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-10 text-slate-400 pointer-events-none" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor="birthDate">Birth Date</label>
                    <DateInput
                        id="birthDate"
                        name="birthDate"
                        value={formData.birthDate || ''}
                        onChange={handleChange}
                        required
                    />
                </div>
                <LockedField label="Age" value={age !== null ? `${age} years old` : 'N/A'} />
                <LockedField label="Caretaker" value={caretakerName} />
            </div>
        </div>
        
        <div className="mt-8 flex justify-between items-center">
            <button type="button" onClick={onStartTreatment} className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-yellow-500 hover:bg-yellow-400 transition flex items-center gap-2">
                <Plus size={16} />
                Start New Treatment
            </button>
            <div className="flex gap-4">
                <button type="button" onClick={onBack} className="px-6 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">Cancel</button>
                <button type="submit" className="px-8 py-3 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition">Save Changes</button>
            </div>
        </div>
    </form>
  );
};

const InputField = ({ label, id, ...props }) => (
  <div>
    <label className="text-[10px] font-bold text-slate-500 uppercase" htmlFor={id}>{label}</label>
    <input id={id} {...props} className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl" />
  </div>
);

const LockedField = ({ label, value }) => (
  <div>
    <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
    <p style={{ cursor: 'not-allowed' }} className="font-mono text-sm p-3 mt-1 bg-slate-50 border border-slate-100 rounded-xl">{value || 'Not Assigned'}</p>
  </div>
);

export default PatientDetails;
