import React, { useState, useEffect } from 'react';
import { AppUser } from '../types/user';
import { JoinedPatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { PlusCircle, User as UserIcon, Edit, FileText, ChevronRight, ChevronLeft, Search, Mail, Phone, X } from 'lucide-react';
import styles from './PatientsDashboard.module.css';
import Tooltip from './common/Tooltip';
import { T, useT, useTranslationContext } from '../components/T';
import { useNow } from '../hooks/useNow';
import { useNextAppointments } from '../hooks/useNextAppointments';
import { formatDate, formatWeekday, toHHmm } from '../utils/appointments/time';

interface PatientsDashboardProps {
  user: AppUser;
  patients: JoinedPatientData[];
  onStartTreatment: (patient: JoinedPatientData) => void;
  onUpdatePatient: (patient: JoinedPatientData) => void;
  onAddPatient: () => void;
  onShowTreatments: (patient: JoinedPatientData) => void;
  isSaving: boolean;
  /** The caretaker whose appointments are shown (the viewed one under "View As"). */
  caretakerId: string;
  /** Treatments recorded per patient id ("Progress" = done / planned). */
  treatmentCounts: Record<string, number>;
  /** Opens the Today page (click on a next meeting that is today). */
  onOpenToday: () => void;
}

const PatientsDashboard: React.FC<PatientsDashboardProps> = ({ user, patients, onAddPatient, onStartTreatment, onUpdatePatient, onShowTreatments, isSaving, caretakerId, treatmentCounts, onOpenToday }) => {
  const { language } = useTranslationContext();
  const now = useNow(60_000);
  const nextAppointments = useNextAppointments(caretakerId, now);
  const [searchTerm, setSearchTerm] = useState('');
  const [allProblems, setAllProblems] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cfg_problems'), snaps => {
      setAllProblems(snaps.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const getActiveProblemsText = (patient: JoinedPatientData) => {
    const problems = patient.medicalRecord?.problems || [];
    const activeIds = problems
      .filter(p => p.problemStatus === 'Active')
      .map(p => p.problemId);

    if (activeIds.length === 0) return 'N/A';

    return activeIds.map(id => {
      const prob = allProblems.find((ap: any) => ap.id === id);
      if (!prob) return id;
      return typeof prob.name === 'string' ? prob.name : (prob.name[language] || prob.name.en || prob.name);
    }).join(', ');
  };

  const tSearchPlaceholder = useT('Search patients...');
  const tEditPatient = useT('Edit Patient Details');
  const tViewHistory = useT('View Treatment History');
  const tOpenToday = useT("Open today's appointments");

  const getFullName = (patient: JoinedPatientData) => patient.fullName;

  const filteredPatients = patients.filter(p =>
    getFullName(p).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.identityNumber && p.identityNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isRtl = language === 'he';

  // "Next meeting" (spec §10): weekday, dd/mm/yyyy and time. A meeting today (still booked, so
  // not attended yet) opens the Today page, where its actions are; other days are plain text.
  const renderNextMeeting = (patient: JoinedPatientData) => {
    const next = patient.id ? nextAppointments.get(patient.id) : undefined;
    if (!next) return <span className={styles.noValue}>—</span>;
    const content = (
      <>
        <span>{formatWeekday(next.start, language, 'short')} {formatDate(next.start)}</span>
        <span className={styles.nextMeetingTime}>{toHHmm(next.start)}</span>
      </>
    );
    if (next.start.toDateString() !== now.toDateString()) {
      return <span className={styles.nextMeetingText}>{content}</span>;
    }
    return (
      <button type="button" className={styles.nextMeetingButton} onClick={onOpenToday} title={tOpenToday}>
        {content}
      </button>
    );
  };

  // "Sessions done" (spec §10): treatments recorded / planned sessions; "—" where unknown or no plan.
  const renderProgress = (patient: JoinedPatientData) => {
    const done = patient.id !== undefined ? treatmentCounts[patient.id] : undefined;
    const planned = patient.appointmentPlan?.plannedSessions;
    if (done === undefined) return <span className={styles.noValue}>—</span>;
    return <bdi dir="ltr">{done} / {typeof planned === 'number' ? planned : '—'}</bdi>;
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}><T>Patients</T></h2>
        <div className={styles.headerActions}>
          <div className={styles.searchContainer}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder={tSearchPlaceholder}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
            {searchTerm && (
              <button
                className={styles.clearSearch}
                onClick={() => setSearchTerm('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button onClick={onAddPatient} className={styles.addPatientButton}>
            <PlusCircle size={16} />
            <T>Add New Patient</T>
          </button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={`${styles.headerCell} ${styles.headerCellCol3}`}><T>Patient</T></div>
          <div className={`${styles.headerCell} ${styles.headerCellCol2}`}><T>Contact</T></div>
          <div className={`${styles.headerCell} ${styles.headerCellCol3}`}><T>Problems</T></div>
          <div className={styles.headerCell}><T>Last Treatment</T></div>
          <div className={styles.appointmentCells}>
            <div className={`${styles.headerCell} ${styles.headerCellCol15}`}><T>Next meeting</T></div>
            <div className={styles.headerCell}><T>Sessions done</T></div>
          </div>
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
                      <T>Identity</T>: {patient.identityNumber}
                    </p>
                  </div>
                </div>
                <div className={styles.contactInfo}>
                  <a href={`mailto:${patient.email}`} className={styles.contactLink}>
                    <Mail size={12} className={styles.contactIcon} />
                    {patient.email}
                  </a>
                  <a href={`tel:${patient.mobile}`} className={styles.contactLink}>
                    <Phone size={12} className={styles.contactIcon} />
                    {patient.mobile}
                  </a>
                </div>
                <div className={styles.problemsInfo}>
                  <Tooltip text={getActiveProblemsText(patient)} className={styles.problemsTooltip}>
                    <span className={styles.truncate}>
                      {getActiveProblemsText(patient)}
                    </span>
                  </Tooltip>
                </div>
                <div className={styles.lastTreatment}>
                  {patient.medicalRecord?.lastTreatment
                    ? new Date(patient.medicalRecord.lastTreatment).toLocaleDateString(isRtl ? 'en-GB' : undefined)
                    : <T>N/A</T>}
                </div>
                <div className={styles.appointmentCells}>
                  <div className={styles.nextMeeting}>
                    {renderNextMeeting(patient)}
                  </div>
                  <div className={styles.progress}>
                    {renderProgress(patient)}
                  </div>
                </div>
                <div className={styles.actionsContainer}>
                  <button onClick={() => onUpdatePatient(patient)} className={styles.actionButton} title={tEditPatient}><Edit size={14} /></button>
                  <button onClick={() => onShowTreatments(patient)} className={styles.actionButton} title={tViewHistory}><FileText size={14} /></button>
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

    </div>
  );
};

export default PatientsDashboard;
