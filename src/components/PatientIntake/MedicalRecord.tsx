import React from 'react';
import { PatientData } from '../../types/patient';
import QuestionnaireStep from './QuestionnaireStep';

interface MedicalRecordProps {
  patientData: Partial<PatientData>;
  onDataChange: (data: Partial<PatientData>) => void;
}

const MedicalRecord: React.FC<MedicalRecordProps> = ({ patientData, onDataChange }) => {

  return (
    <div>
        <QuestionnaireStep 
          patientData={patientData}
          onDataChange={onDataChange}
        />
    </div>
  );
};

export default MedicalRecord;
