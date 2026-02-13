
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { PatientData } from '../types/patient';
import { PlusCircle, User as UserIcon, Edit, FileText, ChevronRight, ChevronLeft, Search, Mail, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import styles from './PatientsDashboard.module.css';

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
  const { t, i18n } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [patientToDelete, setPatientToDelete] = useState<PatientData | null>(null);

  const getFullName = (patient: PatientData) => patient.fullName;

  const filteredPatients = patients.filter(p =>
    getFullName(p).toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.identityNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteClick = (patient: PatientData) => setPatientToDelete(patient);
  const confirmDelete = () => {
    if (patientToDelete) {
      onDeletePatient(patientToDelete.id);
      setPatientToDelete(null);
    }
  };
  const cancelDelete = () => setPatientToDelete(null);

  const getSeverityClass = (severity?: 'Severe' | 'Moderate' | 'Mild') => {
    if (!severity) return '';
    return styles[`severity${severity}`];
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('patients')}</h2>
        <button onClick={onAddPatient} className={styles.addPatientButton}>
          <PlusCircle size={16} />
          {t('add_new_patient')}
        </button>
      </div>

      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder={t('search_patients')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={`${styles.headerCell} ${styles.headerCellCol3}`}>{t('patient')}</div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`}>{t('contact')}</div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`}>{t('condition')}</div>
          <div className={styles.headerCell}>{t('severity')}</div>
          <div className={styles.headerCell}>{t('last_treatment')}</div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`} />
        </div>
        <div className={styles.tableBody}>
          {filteredPatients.length > 0 ? (
            filteredPatients.map(patient => (
              <div key={patient.id} className={styles.tableRow}>
                <div className={styles.patientInfo}>
                  <div className={styles.patientAvatar}>{getFullName(patient).slice(0, 2).toUpperCase()}</div>
                  <div>
                    <p className={styles.patientName}>{getFullName(patient)}</p>
                    <p className={styles.patientId}>{t('identity_number')}: {patient.identityNumber}</p>
                  </div>
                </div>
                <div className={styles.contactInfo}>
                  <a href={`mailto:${patient.email}`} className={styles.contactLink}><Mail size={12}/> {patient.email}</a>
                  <p className={styles.contactMobile}>{patient.mobile}</p>
                </div>
                <div className={styles.conditionInfo}>{patient.medicalRecord?.condition}</div>
                <div>
                  <span className={`${styles.severityBadge} ${getSeverityClass(patient.medicalRecord?.severity)}`}>
                    {patient.medicalRecord?.severity ? t(patient.medicalRecord.severity.toLowerCase()) : ''}
                  </span>
                </div>
                <div className={styles.lastTreatment}>{patient.medicalRecord?.lastTreatment ? new Date(patient.medicalRecord.lastTreatment).toLocaleDateString() : t('no_treatments_found')}</div>
                <div className={styles.actionsContainer}>
                    <button onClick={() => onUpdatePatient(patient)} className={styles.actionButton} title={t('edit_patient')}><Edit size={14} /></button>
                    <button onClick={() => onShowTreatments(patient)} className={styles.actionButton} title={t('view_history')}><FileText size={14} /></button>
                    {(!patient.medicalRecord?.lastTreatment) &&
                      <button onClick={() => handleDeleteClick(patient)} className={`${styles.actionButton} ${styles.deleteButton}`} title={t('delete_patient')}><Trash2 size={14} /></button>
                    }
                    <button onClick={() => onStartTreatment(patient)} className={styles.startButton}>
                      {t('start_new_treatment')}{' '}
                      {i18n.dir() === 'rtl' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.noPatientsContainer}>
              <UserIcon className={styles.noPatientsIcon} size={40} />
              <h3 className={styles.noPatientsTitle}>{t('no_patients_found')}</h3>
              <p className={styles.noPatientsDescription}>{t('get_started_by_adding_a_new_patient')}</p>
            </div>
          )}
        </div>
      </div>

      {patientToDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <AlertTriangle className={styles.modalIcon} size={48} />
            <h3 className={styles.modalTitle}>{t('are_you_sure_delete_patient')}</h3>
            <p className={styles.modalDescription}>
                <Trans i18nKey="this_action_is_irreversible" components={{ b: <b /> }} values={{ patientName: getFullName(patientToDelete) }}/>
            </p>
            <div className={styles.modalActions}>
              <button onClick={cancelDelete} className={styles.modalCancelButton}>{t('cancel')}</button>
              <button onClick={confirmDelete} className={styles.modalConfirmButton}>{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientsDashboard;
