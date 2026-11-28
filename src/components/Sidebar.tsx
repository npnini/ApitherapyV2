
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { LogOut, User as UserIcon, Shield, ChevronDown, Users, Settings, ListChecks, FileText, MapPin, Ruler, Bug, ShieldAlert, Eye, BarChart2, ClipboardList, Sun, ClipboardCheck, Layers, CalendarDays, CalendarClock, BookOpen } from 'lucide-react';
import { T, useT, useTranslationContext } from './T';
import { Appointment } from '../types/appointments';
import { useNow } from '../hooks/useNow';
import styles from './Sidebar.module.css'; // Import the new CSS module

interface SidebarProps {
    user: AppUser | null;
    onLogout: () => void;
    onAdminClick: () => void;
    onUserDetailsClick: () => void;
    onPatientsClick: () => void;
    onTodayClick: () => void;
    onCalendarClick: () => void;
    onKnowledgeClick: () => void;
    /** App Settings → Knowledge → enabled. */
    knowledgeEnabled: boolean;
    /** Today's appointments (live), for the Today badge: meetings still to come today. */
    todayAppointments: Appointment[];
    onDataAnalysisClick: () => void;
    onPointsAdminClick: () => void;
    onPointGroupsAdminClick: () => void;
    onBodyModelAdminClick: () => void;
    onPointSideAnalysisClick: () => void;
    onMeasuresAdminClick: () => void;
    onProblemsAdminClick: () => void;
    onQuestionnaireAdminClick: () => void;
    onAppSettingsClick: () => void;
    onUserManagementClick: () => void;
    onActivityLogClick: () => void;
    viewAsCaretakerId: string | null;
    onViewAsCaretakerChange: (id: string | null) => void;
    /** The screen on show, to highlight its item ('patients' for the patient list and the intake over it). */
    activeView?: string;
}

/** Brand mark: a honey hexagon (honeycomb cell) with a navy core. */
const BrandMark: React.FC = () => (
    <svg className={styles.brandMark} viewBox="0 0 34 34" aria-hidden="true" focusable="false">
        <path d="M17 2l13 7.5v15L17 32 4 24.5v-15z" fill="var(--color-honey)" />
        <path d="M17 9l7 4v8l-7 4-7-4v-8z" fill="var(--color-navy)" />
    </svg>
);

const Brand: React.FC = () => (
    <div className={styles.header}>
        <h2 className={styles.title}><BrandMark /><span>ApitherapyCare</span></h2>
    </div>
);

const Sidebar: React.FC<SidebarProps> = ({
    user,
    onLogout,
    onAdminClick,
    onUserDetailsClick,
    onPatientsClick,
    onTodayClick,
    onCalendarClick,
    onKnowledgeClick,
    knowledgeEnabled,
    todayAppointments,
    onDataAnalysisClick,
    onPointsAdminClick,
    onPointGroupsAdminClick,
    onBodyModelAdminClick,
    onPointSideAnalysisClick,
    onMeasuresAdminClick,
    onProblemsAdminClick,
    onQuestionnaireAdminClick,
    onAppSettingsClick,
    onUserManagementClick,
    onActivityLogClick,
    viewAsCaretakerId,
    onViewAsCaretakerChange,
    activeView,
}) => {
    const [configOpen, setConfigOpen] = useState(false);
    const [superAdminOpen, setSuperAdminOpen] = useState(false);
    const [dataAnalysisOpen, setDataAnalysisOpen] = useState(false);
    const [caretakers, setCaretakers] = useState<{ id: string, fullName: string }[]>([]);
    const [loadingCaretakers, setLoadingCaretakers] = useState(false);
    const { language } = useTranslationContext();
    const isRtl = language === 'he';
    const tStillToCome = useT('Meetings still to come today');

    // Today badge (spec §5): booked meetings of today that have not ended yet.
    const now = useNow(60_000);
    const todayCount = todayAppointments.filter(a => a.status === 'booked' && a.end > now).length;

    const direction = isRtl ? 'rtl' : 'ltr';

    const canImpersonate = user?.role === 'superadmin' || (user?.role === 'admin' && user?.canImpersonate);

    const userUid = user?.uid;

    // Learner (spec §7): the sidebar stays as for every role, but only My Profile and Knowledge
    // are active; the patient items are shown disabled, so a learner sees what the full app offers.
    const isLearner = user?.role === 'learner';
    const tCaretakersOnly = useT('Available to caretakers only. An administrator can give you caretaker access.');

    // A folded group opens when the screen on show is one of its items, so its highlight is visible.
    React.useEffect(() => {
        if (!activeView) return;
        if (activeView === 'data_analysis') setDataAnalysisOpen(true);
        if (['app_settings', 'admin_body_model', 'admin_point_groups', 'admin_points', 'point_side_analysis', 'admin_protocols',
            'admin_measures', 'admin_problems', 'admin_questionnaires'].includes(activeView)) setConfigOpen(true);
        if (activeView === 'admin_users' || activeView === 'activity_log') setSuperAdminOpen(true);
    }, [activeView]);

    // Current screen: highlighted item, announced to screen readers as the current page.
    const current = (...views: string[]) => (activeView && views.includes(activeView)
        ? { 'aria-current': 'page' as const, 'data-active': 'true' }
        : {});

    React.useEffect(() => {
        if (!userUid) return;
        if (canImpersonate && caretakers.length === 0) {
            const fetchCaretakers = async () => {
                setLoadingCaretakers(true);
                try {
                    const { db } = await import('../firebase');
                    const { collection, getDocs } = await import('firebase/firestore');
                    const usersRef = collection(db, 'users');
                    const querySnapshot = await getDocs(usersRef);
                    const list = querySnapshot.docs
                        .map(doc => ({ id: doc.id, fullName: doc.data().fullName }))
                        .filter(u => u.id !== userUid); // Don't list self
                    setCaretakers(list);
                } catch (err) {
                    console.error("Failed to fetch caretakers:", err);
                } finally {
                    setLoadingCaretakers(false);
                }
            };
            fetchCaretakers();
        }
    }, [canImpersonate, caretakers.length, userUid]);

    // A simple guard clause for when the user is not logged in.
    if (!user) {
        return (
            <div className={styles.sidebar} dir={direction}>
                <Brand />
            </div>
        );
    }

    return (
        <div className={styles.sidebar} dir={direction}>
            <Brand />
            <nav className={styles.nav}>
                <button onClick={onUserDetailsClick} className={styles.navButton} {...current('user_details', 'onboarding_test')}>
                    <UserIcon size={18} className={styles.iconPrimary} />
                    <span><T>My Profile</T></span>
                </button>

                {/* Appointments group: always open (spec §5). */}
                <div role="group" aria-labelledby="sidebarAppointmentsLabel">
                    <div id="sidebarAppointmentsLabel" className={`${styles.configDropdownButton} ${styles.navGroupLabel}`}>
                        <div className={styles.flexCenter}>
                            <CalendarDays size={18} className={styles.iconPrimary} />
                            <span><T>Appointments</T></span>
                        </div>
                    </div>
                    <div className={styles.configSubMenu}>
                        <button onClick={onTodayClick} className={styles.configButton} {...current('appointments_today')} disabled={isLearner} title={isLearner ? tCaretakersOnly : undefined}>
                            <CalendarClock size={16} className={styles.iconSecondary} />
                            <span><T>Today</T></span>
                            {todayCount > 0 && (
                                <span className={styles.countBadge} aria-label={`${tStillToCome}: ${todayCount}`} title={tStillToCome}>
                                    {todayCount}
                                </span>
                            )}
                        </button>
                        <button onClick={onCalendarClick} className={styles.configButton} {...current('appointments_calendar')} disabled={isLearner} title={isLearner ? tCaretakersOnly : undefined}>
                            <CalendarDays size={16} className={styles.iconSecondary} />
                            <span><T>Calendar</T></span>
                        </button>
                    </div>
                </div>

                <button onClick={onPatientsClick} className={styles.navButton} {...current('patients')} disabled={isLearner} title={isLearner ? tCaretakersOnly : undefined}>
                    <Users size={18} className={styles.iconPrimary} />
                    <span><T>Patients</T></span>
                </button>

                {knowledgeEnabled && (
                    <button onClick={onKnowledgeClick} className={styles.navButton} {...current('knowledge')}>
                        <BookOpen size={18} className={styles.iconPrimary} />
                        <span><T>Knowledge</T></span>
                    </button>
                )}

                <div>
                    <button onClick={() => setDataAnalysisOpen(!dataAnalysisOpen)} className={styles.configDropdownButton} data-keep-nav-open disabled={isLearner} title={isLearner ? tCaretakersOnly : undefined}>
                        <div className={styles.flexCenter}>
                            <BarChart2 size={18} className={styles.iconPrimary} />
                            <span><T>Data Analysis</T></span>
                        </div>
                        <ChevronDown size={16} className={`${styles.chevron} ${dataAnalysisOpen ? styles.chevronOpen : ''}`} />
                    </button>
                    {dataAnalysisOpen && !isLearner && (
                        <div className={styles.configSubMenu}>
                            <button onClick={onDataAnalysisClick} className={styles.configButton} {...current('data_analysis')}>
                                <BarChart2 size={16} className={styles.iconSecondary} />
                                <span><T>Treatment Effectiveness</T></span>
                            </button>
                        </div>
                    )}
                </div>

                {canImpersonate && (
                    <div className={styles.impersonationBox}>
                        <div className={styles.impersonationLabel}>
                            <Eye size={14} />
                            <span><T>View As</T></span>
                        </div>
                        <select
                            className={styles.caretakerSelect}
                            value={viewAsCaretakerId || ''}
                            onChange={(e) => onViewAsCaretakerChange(e.target.value || null)}
                            disabled={loadingCaretakers}
                        >
                            <option value=""><T>My Data</T></option>
                            {caretakers.map(ct => (
                                <option key={ct.id} value={ct.id}>{ct.fullName}</option>
                            ))}
                        </select>
                    </div>
                )}

                {(user.role === 'admin' || user.role === 'superadmin') && (
                    <div>
                        <button onClick={() => setConfigOpen(!configOpen)} className={styles.configDropdownButton} data-keep-nav-open>
                            <div className={styles.flexCenter}>
                                <Shield size={18} className={styles.iconPrimary} />
                                <span><T>Configuration</T></span>
                            </div>
                            <ChevronDown size={16} className={`${styles.chevron} ${configOpen ? styles.chevronOpen : ''}`} />
                        </button>
                        {configOpen && (
                            <div className={styles.configSubMenu}>
                                <button onClick={onAppSettingsClick} className={styles.configButton} {...current('app_settings')}>
                                    <Settings size={16} className={styles.iconSecondary} />
                                    <span><T>Application Settings</T></span>
                                </button>
                                <button onClick={onBodyModelAdminClick} className={styles.configButton} {...current('admin_body_model')}>
                                    <Sun size={16} className={styles.iconSecondary} />
                                    <span><T>3D Body Model Lighting</T></span>
                                </button>
                                <button onClick={onPointGroupsAdminClick} className={styles.configButton} {...current('admin_point_groups')}>
                                    <Layers size={16} className={styles.iconSecondary} />
                                    <span><T>Point Grouping</T></span>
                                </button>
                                <button onClick={onPointsAdminClick} className={styles.configButton} {...current('admin_points')}>
                                    <MapPin size={16} className={styles.iconSecondary} />
                                    <span><T>Points Configuration</T></span>
                                </button>
                                <button onClick={onPointSideAnalysisClick} className={styles.configButton} {...current('point_side_analysis')}>
                                    <ClipboardCheck size={16} className={styles.iconSecondary} />
                                    <span><T>Point Side &amp; Pairing Verification</T></span>
                                </button>
                                <button onClick={onAdminClick} className={styles.configButton} {...current('admin_protocols')}>
                                    <FileText size={16} className={styles.iconSecondary} />
                                    <span><T>Protocol Configuration</T></span>
                                </button>
                                <button onClick={onMeasuresAdminClick} className={styles.configButton} {...current('admin_measures')}>
                                    <Ruler size={16} className={styles.iconSecondary} />
                                    <span><T>Measure Configuration</T></span>
                                </button>
                                <button onClick={onProblemsAdminClick} className={styles.configButton} {...current('admin_problems')}>
                                    <Bug size={16} className={styles.iconSecondary} />
                                    <span><T>Problem Configuration</T></span>
                                </button>
                                <button onClick={onQuestionnaireAdminClick} className={styles.configButton} {...current('admin_questionnaires')}>
                                    <ListChecks size={16} className={styles.iconSecondary} />
                                    <span><T>Questionnaire Configuration</T></span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {user.role === 'superadmin' && (
                    <div>
                        <button onClick={() => setSuperAdminOpen(!superAdminOpen)} className={styles.configDropdownButton} data-keep-nav-open>
                            <div className={styles.flexCenter}>
                                <ShieldAlert size={18} className={styles.iconPrimary} />
                                <span><T>SuperAdmin</T></span>
                            </div>
                            <ChevronDown size={16} className={`${styles.chevron} ${superAdminOpen ? styles.chevronOpen : ''}`} />
                        </button>
                        {superAdminOpen && (
                            <div className={styles.configSubMenu}>
                                <button onClick={onUserManagementClick} className={styles.configButton} {...current('admin_users')}>
                                    <Users size={16} className={styles.iconSecondary} />
                                    <span><T>User Management</T></span>
                                </button>
                                <button onClick={onActivityLogClick} className={styles.configButton} {...current('activity_log')}>
                                    <ClipboardList size={16} className={styles.iconSecondary} />
                                    <span><T>Activity Log</T></span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </nav>
            <div className={styles.footer}>
                <div className={styles.userInfo}>
                    <div className={styles.avatar}>
                        {user.fullName?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div>
                        <div className={styles.userName}>{user.fullName || useT('Anonymous User')}</div>
                        <div className={styles.userRole}>{user.role ? useT(user.role) : useT('User')}</div>
                    </div>
                </div>
                <button onClick={onLogout} className={styles.logoutButton}>
                    <LogOut size={16} />
                    <span><T>Logout</T></span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
