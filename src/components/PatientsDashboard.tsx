import React, { useState, useEffect } from 'react';
import { AppUser } from '../types/user';
import { JoinedPatientData } from '../types/patient';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { PlusCircle, User as UserIcon, Users, Edit, FileText, ChevronRight, ChevronLeft, Search, Mail, Phone, X, Check } from 'lucide-react';
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
  /** Optional details to show (keys from config/patientListFields); the patient initials and actions are always shown. */
  visibleFields: string[];
}

/** Patient list filter pills (UI redesign Tier 2). "Series finished": sessions done reached the planned sessions. */
type ListFilter = 'all' | 'withNext' | 'noNext' | 'finished';
const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'withNext', label: 'With next meeting' },
  { id: 'noNext', label: 'No next meeting' },
  { id: 'finished', label: 'Treatment series finished' },
];

const PatientsDashboard: React.FC<PatientsDashboardProps> = ({ user, patients, onAddPatient, onStartTreatment, onUpdatePatient, onShowTreatments, isSaving, caretakerId, treatmentCounts, onOpenToday, visibleFields }) => {
  const show = (field: string) => visibleFields.includes(field);
  const { language } = useTranslationContext();
  const now = useNow(60_000);
  const nextAppointments = useNextAppointments(caretakerId, now);
  const [searchTerm, setSearchTerm] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [allProblems, setAllProblems] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cfg_problems'), snaps => {
      setAllProblems(snaps.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const getActiveProblemNames = (patient: JoinedPatientData): string[] => {
    const problems = patient.medicalRecord?.problems || [];
    return problems
      .filter(p => p.problemStatus === 'Active')
      .map(p => p.problemId)
      .map(id => {
        const prob = allProblems.find((ap: any) => ap.id === id);
        if (!prob) return id;
        return typeof prob.name === 'string' ? prob.name : (prob.name[language] || prob.name.en || Object.values(prob.name)[0] || id);
      });
  };

  const tSearchPlaceholder = useT('Search patients...');
  const tEditPatient = useT('Edit Patient Details');
  const tViewHistory = useT('View Treatment History');
  const tOpenToday = useT("Open today's appointments");
  const tFilterPatients = useT('Filter patients');
  const tSeriesFinished = useT('Treatment series finished');
  const tOverPlan = useT('More sessions than planned');

  const getFullName = (patient: JoinedPatientData) => patient.fullName;

  const searchedPatients = patients.filter(p =>
    getFullName(p).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.identityNumber && p.identityNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const hasNextMeeting = (p: JoinedPatientData) => !!p.id && nextAppointments.has(p.id);
  const isSeriesFinished = (p: JoinedPatientData) => {
    const done = p.id !== undefined ? treatmentCounts[p.id] : undefined;
    const planned = p.appointmentPlan?.plannedSessions;
    return typeof done === 'number' && typeof planned === 'number' && planned > 0 && done >= planned;
  };
  const matchesFilter = (p: JoinedPatientData, f: ListFilter) =>
    f === 'all' ? true
      : f === 'withNext' ? hasNextMeeting(p)
        // "No next meeting" = needs a booking: a patient whose series is finished does not
        : f === 'noNext' ? !hasNextMeeting(p) && !isSeriesFinished(p)
          : isSeriesFinished(p);
  // Counts on the pills follow the search, so they always match what a click would show.
  const filterCounts = Object.fromEntries(
    LIST_FILTERS.map(f => [f.id, searchedPatients.filter(p => matchesFilter(p, f.id)).length])
  ) as Record<ListFilter, number>;
  const filteredPatients = searchedPatients.filter(p => matchesFilter(p, listFilter));

  const isRtl = language === 'he';

  // "Next meeting" (spec §10; UI redesign Tier 2): dd/mm/yyyy on the first line, the short weekday and the time below.
  // A meeting today (still booked, so not attended yet) opens the Today page, where its actions are; other days are plain text.
  const renderNextMeeting = (patient: JoinedPatientData) => {
    const next = patient.id ? nextAppointments.get(patient.id) : undefined;
    if (!next) return <span className={styles.noValue}>—</span>;
    const content = (
      <>
        <span className={styles.nextDate} dir="ltr">{formatDate(next.start)}</span>
        <span className={styles.nextWhen}>{formatWeekday(next.start, language, 'short')} <span dir="ltr">{toHHmm(next.start)}</span></span>
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
    const pct = typeof planned === 'number' && planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : null;
    // Series state (UI redesign): finished = done equals planned (green, check); over plan = more than planned (amber)
    const hasPlan = typeof planned === 'number' && planned > 0;
    const finished = hasPlan && done === planned;
    const overPlan = hasPlan && done > (planned as number);
    const stateTitle = finished ? tSeriesFinished : overPlan ? tOverPlan : undefined;
    return (
      <span
        className={`${styles.progressValue} ${finished ? styles.progressFinished : ''} ${overPlan ? styles.progressOver : ''}`}
        title={stateTitle}
      >
        <span className={styles.progressCount}>
          {finished && <Check size={14} strokeWidth={3} aria-hidden="true" />}
          <bdi dir="ltr">{done} / {typeof planned === 'number' ? planned : '—'}</bdi>
          {stateTitle && <span className={styles.srOnly}>{stateTitle}</span>}
        </span>
        {pct !== null && (
          <span className={styles.progressBar} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
    );
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon} aria-hidden="true"><Users size={22} /></span>
          <div>
            <h2 className={styles.title}><T>Patients</T></h2>
            <p className={styles.subtitle}><T>Your patients, their next meeting and their last treatment at a glance.</T></p>
          </div>
        </div>
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

      <div className={styles.filterPills} role="group" aria-label={tFilterPatients}>
        {LIST_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterPill} ${listFilter === f.id ? styles.filterPillOn : ''}`}
            aria-pressed={listFilter === f.id}
            onClick={() => setListFilter(f.id)}
          >
            <T>{f.label}</T> <bdi className={styles.filterCount}>({filterCounts[f.id]})</bdi>
          </button>
        ))}
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={`${styles.headerCell} ${styles.headerCellCol3}`}><T>Patient</T></div>
          {show('contact') && <div className={`${styles.headerCell} ${styles.headerCellCol2} ${styles.colContact}`}><T>Contact</T></div>}
          {show('problems') && <div className={`${styles.headerCell} ${styles.headerCellCol2} ${styles.colProblems}`}><T>Problems</T></div>}
          {(show('lastTreatment') || show('nextMeeting')) && (
            <div className={styles.datesCells}>
              {show('nextMeeting') && <div className={`${styles.headerCell} ${styles.headerCellCol15}`}><T>Next meeting</T></div>}
              {show('lastTreatment') && <div className={`${styles.headerCell} ${styles.colLastTreatment}`}><T>Last Treatment</T></div>}
            </div>
          )}
          {show('sessionsDone') && (
            <div className={styles.appointmentCells}>
              <div className={styles.headerCell}><T>Sessions done</T></div>
            </div>
          )}
          <div className={`${styles.headerCell} ${styles.headerCellCol3}`} />
        </div>
        <div className={styles.tableBody}>
          {filteredPatients.length > 0 ? (
            filteredPatients.map(patient => (
              <div key={patient.id} className={styles.tableRow}>
                <div className={styles.patientInfo}>
                  <div className={styles.patientAvatar}>{(getFullName(patient) || '').slice(0, 2).toUpperCase()}</div>
                  {(show('patientName') || show('identity')) && (
                    <div>
                      {show('patientName') && <p className={styles.patientName}>{getFullName(patient)}</p>}
                      {show('identity') && (
                        <p className={styles.patientId}>
                          <T>Identity</T>: {patient.identityNumber}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {show('contact') && (
                  <div className={`${styles.contactInfo} ${styles.colContact}`}>
                    <a href={`mailto:${patient.email}`} className={styles.contactLink}>
                      <Mail size={12} className={styles.contactIcon} />
                      {patient.email}
                    </a>
                    <a href={`tel:${patient.mobile}`} className={styles.contactLink}>
                      <Phone size={12} className={styles.contactIcon} />
                      {patient.mobile}
                    </a>
                  </div>
                )}
                {show('problems') && (
                  <div className={`${styles.problemsInfo} ${styles.colProblems}`}>
                    {(() => {
                      // One problem per line (UI redesign Tier 2): a narrower column, no "a, b" running off the end
                      const names = getActiveProblemNames(patient);
                      if (names.length === 0) return <span className={styles.noValue}>N/A</span>;
                      return (
                        <Tooltip text={names.join(', ')} className={styles.problemsTooltip}>
                          <ul className={styles.problemsList}>
                            {names.map((name, i) => <li key={i} className={styles.truncate}>{name}</li>)}
                          </ul>
                        </Tooltip>
                      );
                    })()}
                  </div>
                )}
                {(show('lastTreatment') || show('nextMeeting')) && (
                  <div className={styles.datesCells}>
                    {show('nextMeeting') && (
                      <div className={styles.nextMeeting}>
                        {renderNextMeeting(patient)}
                      </div>
                    )}
                    {show('lastTreatment') && (
                      <div className={`${styles.lastTreatment} ${styles.colLastTreatment}`}>
                        {patient.medicalRecord?.lastTreatment
                          ? formatDate(new Date(patient.medicalRecord.lastTreatment))
                          : <T>N/A</T>}
                      </div>
                    )}
                  </div>
                )}
                {show('sessionsDone') && (
                  <div className={styles.appointmentCells}>
                    <div className={styles.progress}>
                      {renderProgress(patient)}
                    </div>
                  </div>
                )}
                <div className={styles.actionsContainer}>
                  {/* Icons centred between the sessions value and the Start button (UI redesign Tier 2) */}
                  <div className={styles.iconActions}>
                    <button onClick={() => onUpdatePatient(patient)} className={styles.actionButton} title={tEditPatient}><Edit size={14} /></button>
                    <button onClick={() => onShowTreatments(patient)} className={styles.actionButton} title={tViewHistory}><FileText size={14} /></button>
                  </div>
                  <button onClick={() => onStartTreatment(patient)} className={styles.startButton}>
                    <span className={styles.labelFull}><T>Start New Treatment</T></span>
                    <span className={styles.labelShort}><T>New Treatment</T></span>{' '}
                    {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.noPatientsContainer}>
              <UserIcon className={styles.noPatientsIcon} size={40} />
              <h3 className={styles.noPatientsTitle}><T>No Patients Found</T></h3>
              {patients.length === 0 && (
                <p className={styles.noPatientsDescription}><T>Get started by adding a new patient record.</T></p>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default PatientsDashboard;
