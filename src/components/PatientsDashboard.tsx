import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { PatientData } from '../types/patient';
import { PlusCircle, User as UserIcon, Edit, FileText, ChevronRight, ChevronLeft, Search, Mail, Phone, Trash2, AlertTriangle } from 'lucide-react';
import styles from './PatientsDashboard.module.css';
import Tooltip from './common/Tooltip';
import { T, useT, useTranslationContext } from '../components/T';

interface PatientsDashboardProps {
  user: AppUser;
  patients: PatientData[];
  onStartTreatment: (patient: PatientData) => void;
  onUpdatePatient: (patient: PatientData) => void;
  onAddPatient: () => void;
  onShowTreatments: (patient: PatientData) => void;
  onDeletePatient: (patientId: string) => void;
  isSaving: boolean;
}

const PatientsDashboard: React.FC<PatientsDashboardProps> = ({ user, patients, onAddPatient, onStartTreatment, onUpdatePatient, onShowTreatments, onDeletePatient, isSaving }) => {
  const { language } = useTranslationContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [patientToDelete, setPatientToDelete] = useState<PatientData | null>(null);

  const getFullName = (patient: PatientData) => patient.fullName;

  const filteredPatients = patients.filter(p =>
    getFullName(p).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.identityNumber && p.identityNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteClick = (patient: PatientData) => setPatientToDelete(patient);
  const confirmDelete = () => {
    if (patientToDelete) {
      onDeletePatient(patientToDelete.id!);
      setPatientToDelete(null);
    }
  };
  const cancelDelete = () => setPatientToDelete(null);

  const isRtl = language === 'he';

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}><T>Patients</T></h2>
        <button onClick={onAddPatient} className={styles.addPatientButton}>
          <PlusCircle size={16} />
          <T>Add New Patient</T>
        </button>
      </div>

      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder={useT('Search by name, ID, or email...')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={`${styles.headerCell} ${styles.headerCellCol3}`}><T>Patient</T></div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`}><T>Contact</T></div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`}><T>Condition</T></div>
          <div className={styles.headerCell}><T>Severity</T></div>
          <div className={styles.headerCell}><T>Last Treatment</T></div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`} />
        </div>
        <div className={styles.tableBody}>
          {filteredPatients.length > 0 ? (
            filteredPatients.map(patient => (
              <div key={patient.id} className={styles.tableRow}>
                <div className={styles.patientInfo}>
                  <div className={styles.patientAvatar}>{(getFullName(patient) || '').slice(0, 2).toUpperCase()}</div>
                  <div>
                    <p className={styles.patientName}>{getFullName(patient)}</p>
                    <p className={styles.patientId}>
                      <T>{`Identity: ${patient.identityNumber}`}</T>
                    </p>
                  </div>
                </div>
                <div className={styles.contactInfo}>
                  <a href={`mailto:${patient.email}`} className={styles.contactLink}>
                    <Mail size={12} style={{ [isRtl ? 'marginLeft' : 'marginRight']: '5px' }} />
                    {patient.email}
                  </a>
                  <a href={`tel:${patient.mobile}`} className={styles.contactLink}>
                    <Phone size={12} style={{ [isRtl ? 'marginLeft' : 'marginRight']: '5px' }} />
                    {patient.mobile}
                  </a>
                </div>
                <div className={styles.conditionInfo}>
                  <Tooltip text={patient.medicalRecord?.patient_level_data?.condition || ''} className={styles.conditionTooltip}>
                    <span className={styles.truncate}>
                      {patient.medicalRecord?.patient_level_data?.condition}
                    </span>
                  </Tooltip>
                </div>
                <div className={styles.severityInfo}>
                  <span className={styles.truncate}>
                    {patient.medicalRecord?.patient_level_data?.severity}
                  </span>
                </div>
                <div className={styles.lastTreatment}>
                  {patient.medicalRecord?.patient_level_data?.lastTreatment
                    ? new Date(patient.medicalRecord.patient_level_data.lastTreatment).toLocaleDateString()
                    : <T>N/A</T>}
                </div>
                <div className={styles.actionsContainer}>
                  <button onClick={() => onUpdatePatient(patient)} className={styles.actionButton} title={useT('Edit Patient Details')}><Edit size={14} /></button>
                  {/* Treatment history is now in the Patient Intake modal */}
                  {/* <button onClick={() => onShowTreatments(patient)} className={styles.actionButton} title={useT('View Treatment History')}><FileText size={14} /></button> */}
                  <button
                    onClick={() => handleDeleteClick(patient)}
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    style={{ visibility: patient.medicalRecord?.patient_level_data?.lastTreatment ? 'hidden' : 'visible' }}
                    disabled={!!patient.medicalRecord?.patient_level_data?.lastTreatment}
                    title={useT('Delete Patient')}>
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => onStartTreatment(patient)} className={styles.startButton}>
                    <T>Start New Treatment</T>{' '}
                    {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.noPatientsContainer}>
              <UserIcon className={styles.noPatientsIcon} size={40} />
              <h3 className={styles.noPatientsTitle}><T>No Patients Found</T></h3>
              <p className={styles.noPatientsDescription}><T>Get started by adding a new patient record.</T></p>
            </div>
          )}
        </div>
      </div>

      {patientToDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <AlertTriangle className={styles.modalIcon} size={48} />
            <h3 className={styles.modalTitle}><T>Are you sure?</T></h3>
            <p className={styles.modalDescription}>
              <T>{`This action is irreversible. Patient: ${getFullName(patientToDelete)}`}</T>
            </p>
            <div className={styles.modalActions}>
              <button onClick={cancelDelete} className={styles.modalCancelButton}><T>Cancel</T></button>
              <button onClick={confirmDelete} className={styles.modalConfirmButton}><T>Delete</T></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientsDashboard;
