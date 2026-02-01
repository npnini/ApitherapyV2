
import React from 'react';
import { PatientData, TreatmentSession } from '../types';
import { ChevronLeft, FileText, Clock, Zap, Heart, Droplets, BookUser, Edit3, ArrowRight } from 'lucide-react';

interface TreatmentsListProps {
  patient: PatientData;
  treatments: TreatmentSession[];
  onBack: () => void;
}

const TreatmentsList: React.FC<TreatmentsListProps> = ({ patient, treatments, onBack }) => {

  // Sort treatments by date, newest first
  const sortedTreatments = [...treatments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const DataItem: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({ label, value, className }) => (
    <div className={className}>
      <p className="text-xs text-slate-500 font-semibold">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-md font-black text-slate-800">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Treatment History: {patient.fullName}</h2>
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition"><ChevronLeft size={16} />Back to Dashboard</button>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-lg border border-slate-100">
        {sortedTreatments.length > 0 ? (
          <div className="space-y-8">
            {sortedTreatments.map(session => (
              <div key={session.id} className="bg-white rounded-2xl border border-slate-200 p-5 transition hover:shadow-md hover:border-slate-300">
                
                <div className="flex justify-between items-start mb-4">
                    <div className="flex-grow pr-4">
                        <h4 className="font-bold text-sm text-slate-500 flex items-center mb-1"><BookUser size={14} className="text-yellow-600 mr-2"/>Patient's Report</h4>
                        <p className="text-slate-700 text-sm">{session.report || 'N/A'}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 p-2 rounded-lg border"><Clock size={14} /><span>{new Date(session.date).toLocaleString()}</span></div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-t border-b border-slate-100">
                    <DataItem label="Stings" value={
                        <span className='flex items-center'>
                            {session.beeStingCount}
                            {session.stungPoints && session.stungPoints.length > 0 && 
                                <span className='text-xs text-slate-400 font-mono ml-2 flex items-center'><ArrowRight size={12} className='mx-1'/> {session.stungPoints.map(p => p.name).join(', ')}</span>
                            }
                        </span>
                    }/>
                    <DataItem label="Pain Level" value={`${session.painLevel}/10`} />
                    <DataItem label="Heart Rate" value={`${session.heartRate} bpm`} />
                    <DataItem label="Blood Pressure" value={`${session.bloodPressure.systolic}/${session.bloodPressure.diastolic}`} />
                </div>

                <div className="mt-4">
                     <h4 className="font-bold text-sm text-slate-500 flex items-center mb-1"><Edit3 size={14} className="text-yellow-600 mr-2"/>Caretaker's Final Notes</h4>
                     <p className="text-slate-700 text-sm">{session.finalNotes || 'N/A'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-12 text-slate-500">
            <FileText className="mx-auto mb-4" size={40} />
            <h3 className="font-bold text-lg">No Treatment History</h3>
            <p className="text-sm">This patient has no recorded treatment sessions.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TreatmentsList;
