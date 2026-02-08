import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { PatientData } from '../types/patient';
import { PlusCircle, User as UserIcon, Edit, FileText, ChevronRight, Search, Mail, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import styles from './PatientsDashboard.module.css';

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
  const { t, i18n } = useTranslation();
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

  const getSeverityClass = (severity: 'Severe' | 'Moderate' | 'Mild') => {
    switch (severity) {
      case 'Severe':
        return styles.severitySevere;
      case 'Moderate':
        return styles.severityModerate;
      case 'Mild':
      default:
        return styles.severityMild;
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('patient_list')}</h2>
        </div>
        <button onClick={onAddPatient} className={styles.addPatientButton}>
          <PlusCircle size={16} />
          {t('add_new_patient')}
        </button>
      </div>

      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder={t('search_by_name_id_email')}
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
                  <div className={styles.patientAvatar}>{patient.fullName.slice(0, 2)}</div>
                  <div>
                    <p className={styles.patientName}>{patient.fullName}</p>
                    <p className={styles.patientId}>{t('id_number', { identityNumber: patient.identityNumber })}</p>
                  </div>
                </div>
                <div className={styles.contactInfo}>
                    <a href={`mailto:${patient.email}`} className={styles.contactLink}>
                      <Mail size={12}/> {patient.email}
                    </a>
                    <p className={styles.contactMobile}>{patient.mobile}</p>
                </div>
                <div className={styles.conditionInfo}>{patient.condition}</div>
                <div>
                  <span className={`${styles.severityBadge} ${getSeverityClass(patient.severity)}`}>
                    {t(patient.severity.toLowerCase())}
                  </span>
                </div>
                <div className={styles.lastTreatment}>{patient.lastTreatment ? patient.lastTreatment : t('no_treatments')}</div>
                <div className={styles.actionsContainer}>
                    <button onClick={() => onUpdatePatient(patient)} className={styles.actionButton}><Edit size={14} /></button>
                    <button onClick={() => onShowTreatments(patient)} className={styles.actionButton}><FileText size={14} /></button>
                    {(!patient.lastTreatment || patient.lastTreatment === '') &&
                      <button onClick={() => handleDeleteClick(patient)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={14} /></button>
                    }
                    <button onClick={() => onStartTreatment(patient)} className={styles.startButton}>
                      {t('start')} <ChevronRight size={14} />
                    </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.noPatientsContainer}>
              <UserIcon className={styles.noPatientsIcon} size={40} />
              <h3 className={styles.noPatientsTitle}>{t('no_patients_found')}</h3>
              <p className={styles.noPatientsDescription}>{t('no_patients_found_description')}</p>
            </div>
          )}
        </div>
      </div>

      {patientToDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <AlertTriangle className={styles.modalIcon} size={48} />
            <h3 className={styles.modalTitle}>{t('confirm_deletion')}</h3>
            <p className={styles.modalDescription}>
                <Trans i18nKey="confirm_deletion_description" components={{ b: <b /> }} values={{ patientName: patientToDelete.fullName }}/>
            </p>
            <div className={styles.modalActions}>
              <button onClick={cancelDelete} className={styles.modalCancelButton}>{t('cancel')}</button>
              <button onClick={confirmDelete} className={styles.modalConfirmButton}>{t('delete_patient')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientsDashboard;
