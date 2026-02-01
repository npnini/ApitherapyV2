
import React, { useEffect, useState } from 'react';
import { PatientData, Protocol } from '../types';
import { getProtocolRecommendation } from '../services/geminiService';
import { PROTOCOLS } from '../constants';
import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  patient: PatientData;
  onSelect: (protocol: Protocol) => void;
}

const ProtocolSelector: React.FC<Props> = ({ patient, onSelect }) => {
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<{ protocolId: string; reasoning: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    async function fetchRecommendation() {
      try {
        // SIMULATE API CALL
        setLoading(true);
        const rec = await new Promise<{ protocolId: string; reasoning: string }>(resolve => setTimeout(() => {
            resolve({ protocolId: 'ms_protocol', reasoning: 'Based on the patient having Multiple Sclerosis and moderate severity, the MS Support Protocol is recommended to manage symptoms and improve quality of life.' });
        }, 2000));
        // const rec = await getProtocolRecommendation(patient);
        setRecommendation(rec);
        setSelectedId(rec.protocolId);
      } catch (e) {
        console.error(e);
        // Fallback to a default or show an error
        const fallbackRec = { protocolId: 'general_wellness', reasoning: 'Could not fetch AI recommendation, defaulting to General Wellness.' };
        setRecommendation(fallbackRec);
        setSelectedId(fallbackRec.protocolId);
      } finally {
        setLoading(false);
      }
    }
    fetchRecommendation();
  }, [patient]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="animate-spin text-yellow-600" size={48} />
        <p className="text-gray-600 font-medium">AI is analyzing patient profile and selecting optimal protocol...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {recommendation && (
        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 rounded-r-lg shadow-sm">
          <div className="flex items-center gap-2 text-indigo-700 mb-2">
            <Sparkles size={20} />
            <h3 className="font-bold text-lg">AI Recommendation for {patient.fullName}</h3>
          </div>
          <p className="text-gray-700 leading-relaxed italic">"{recommendation?.reasoning}"</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PROTOCOLS.map(protocol => {
          const isRecommended = protocol.id === recommendation?.protocolId;
          const isSelected = selectedId === protocol.id;
          
          return (
            <div
              key={protocol.id}
              onClick={() => setSelectedId(protocol.id)}
              className={`relative cursor-pointer transition-all duration-300 p-6 rounded-xl border-2 flex flex-col h-full ${
                isSelected 
                  ? 'border-yellow-600 bg-yellow-50 shadow-md transform -translate-y-1' 
                  : 'border-gray-200 bg-white hover:border-yellow-300 hover:shadow-sm'
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest shadow-sm">
                  AI Choice
                </span>
              )}
              <h4 className="text-lg font-bold mb-2 pr-4">{protocol.name}</h4>
              <p className="text-sm text-gray-600 flex-grow">{protocol.description}</p>
              
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">
                  {protocol.recommendedPoints.length} Points
                </span>
                {isSelected && <CheckCircle2 className="text-yellow-600" size={20} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          disabled={!selectedId}
          onClick={() => {
            const p = PROTOCOLS.find(p => p.id === selectedId);
            if (p) onSelect(p);
          }}
          className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 px-12 rounded-full transition shadow-lg transform hover:scale-105 active:scale-95 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Confirm & Open 3D Map
        </button>
      </div>
    </div>
  );
};

export default ProtocolSelector;
