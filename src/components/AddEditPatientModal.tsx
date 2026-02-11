
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import PatientPIIDetails from './PatientPIIDetails';
import PatientMedicalRecord from './PatientMedicalRecord';
import { PatientData, MedicalRecord } from '../types/patient';
import { useTranslation } from 'react-i18next';

interface AddEditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientToEdit?: PatientData | null;
  onSave: (patientData: PatientData) => void;
  isSaving: boolean;
}

const AddEditPatientModal: React.FC<AddEditPatientModalProps> = ({ isOpen, onClose, patientToEdit, onSave, isSaving }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState('pii');
  const [patientData, setPatientData] = useState<Partial<PatientData>>({});

  useEffect(() => {
    if (isOpen) {
      if (patientToEdit) {
        setPatientData(patientToEdit);
      } else {
        setPatientData({});
      }
      setCurrentStep('pii');
    } else {
        setPatientData({});
        setCurrentStep('pii');
    }
  }, [isOpen, patientToEdit]);

  const handlePiiNext = (piiData: Partial<PatientData>) => {
    setPatientData(prev => ({ ...prev, ...piiData }));
    setCurrentStep('medical');
  };

  const handleMedicalBack = () => {
    setCurrentStep('pii');
  };

  const handleSave = (medicalData: MedicalRecord) => {
    const finalData = { ...patientData, medicalRecord: medicalData } as PatientData;
    onSave(finalData);
  };

  const handleClose = () => {
    if (!isSaving) {
        onClose();
    }
  };

  const getModalTitle = () => {
    if (currentStep === 'pii') {
      return t('patient_pii_details');
    }
    return t('patient_medical_record');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={getModalTitle()}>
      {currentStep === 'pii' ? (
        <PatientPIIDetails
          patient={patientData}
          onNext={handlePiiNext}
          onBack={handleClose}
        />
      ) : (
        <PatientMedicalRecord
          medicalRecord={patientData.medicalRecord || { condition: '', severity: 'Mild'}}
          onSave={handleSave}
          onBack={handleMedicalBack}
          isSaving={isSaving}
        />
      )}
    </Modal>
  );
};

export default AddEditPatientModal;
