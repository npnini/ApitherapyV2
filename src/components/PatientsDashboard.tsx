
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { PatientData } from '../types/patient';
import { PlusCircle, User as UserIcon, Edit, FileText, ChevronRight, Search, Mail, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface PatientsDashboardProps {
  user: AppUser;
  patients: PatientData[];
  onAddPatient: () => void;
  onStartTreatment: (patient: PatientData) => void;
  onUpdatePatient: (patient: PatientData) => void;
  onShowTreatments: (patient: PatientData) => void;
  onDeletePatient: (patientId: string) => void;
}

const PatientsDashboard: React.FC<PatientsDashboardProps> = ({ user, patients, onAddPatient, onStartTreatment, onUpdatePatient, onShowTreatments, onDeletePatient }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [patientToDelete, setPatientToDelete] = useState<PatientData | null>(null);

  const filteredPatients = patients.filter(p => 
    p.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.identityNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteClick = (patient: PatientData) => {
    setPatientToDelete(patient);
  };

  const confirmDelete = () => {
    if (patientToDelete) {
      onDeletePatient(patientToDelete.id);
      setPatientToDelete(null);
    }
  };

  const cancelDelete = () => {
    setPatientToDelete(null);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{t('welcome', { displayName: user.fullName || 'User' })}</h2>
          <p className="text-slate-500">{t('patient_hub_description')}</p>
        </div>
        <button onClick={onAddPatient} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-6 rounded-xl transition flex items-center gap-2 shadow-lg shadow-yellow-500/10">
          <PlusCircle size={16} />
          {t('add_new_patient')}
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input 
          type="text"
          placeholder={t('search_by_name_id_email')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>
      
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="p-6 grid grid-cols-12 gap-4 font-black text-slate-400 text-xs uppercase tracking-widest border-b">
            <div className="col-span-3">{t('patient')}</div>
            <div className="col-span-2">{t('contact')}</div>
            <div className="col-span-2">{t('condition')}</div>
            <div>{t('severity')}</div>
            <div>{t('last_treatment')}</div>
            <div className="col-span-2 text-right pr-4"></div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredPatients.length > 0 ? (
            filteredPatients.map(patient => (
              <div key={patient.id} className="grid grid-cols-12 gap-4 items-center p-6 group">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs">{patient.fullName.slice(0, 2)}</div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{patient.fullName}</p>
                    <p className="font-mono text-xs text-slate-500">{t('id_number', { identityNumber: patient.identityNumber })}</p>
                  </div>
                </div>
                <div className="col-span-2">
                    <a href={`mailto:${patient.email}`} className="text-xs text-slate-600 hover:text-yellow-600 flex items-center gap-2">
                      <Mail size={12}/> {patient.email}
                    </a>
                    <p className="font-mono text-xs text-slate-500 pt-1">{patient.mobile}</p>
                </div>
                <div className="col-span-2 text-xs font-bold text-slate-600 uppercase tracking-wider">{patient.condition}</div>
                <div>
                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${patient.severity === 'Severe' ? 'bg-red-100 text-red-800' : patient.severity === 'Moderate' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                    {t(patient.severity.toLowerCase())}
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-500">{patient.lastTreatment ? patient.lastTreatment : t('no_treatments')}</div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                    <button onClick={() => onUpdatePatient(patient)} className="p-2 text-slate-400 hover:text-slate-800 transition rounded-lg"><Edit size={14} /></button>
                    <button onClick={() => onShowTreatments(patient)} className="p-2 text-slate-400 hover:text-slate-800 transition rounded-lg"><FileText size={14} /></button>
                    {(!patient.lastTreatment || patient.lastTreatment === '') && 
                      <button onClick={() => handleDeleteClick(patient)} className="p-2 text-slate-400 hover:text-red-500 transition rounded-lg"><Trash2 size={14} /></button>
                    }
                    <button onClick={() => onStartTreatment(patient)} className="bg-slate-900 text-white font-bold py-2 pl-3 pr-2 rounded-lg text-xs flex items-center gap-1.5 group-hover:bg-yellow-500 group-hover:text-slate-900 transition-all">
                      {t('start')} <ChevronRight size={14} />
                    </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center p-12 text-slate-500">
              <UserIcon className="mx-auto mb-4" size={40} />
              <h3 className="font-bold text-lg">{t('no_patients_found')}</h3>
              <p className="text-sm">{t('no_patients_found_description')}</p>
            </div>
          )}
        </div>
      </div>

      {patientToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center">
            <AlertTriangle className="mx-auto text-red-500" size={48} />
            <h3 className="text-xl font-black text-slate-800 mt-4">{t('confirm_deletion')}</h3>
            <p className="text-slate-500 mt-2">
                <Trans i18nKey="confirm_deletion_description" components={[<span className="font-bold"></span>]} values={{ patientName: patientToDelete.fullName }}/>
            </p>
            <div className="flex gap-4 mt-6">
              <button onClick={cancelDelete} className="w-full py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">{t('cancel')}</button>
              <button onClick={confirmDelete} className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition">{t('delete_patient')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientsDashboard;
