
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { LogOut, User as UserIcon, Shield, ChevronDown, Users, Settings, ListChecks, FileText, MapPin, Ruler, Bug, ShieldAlert, Eye } from 'lucide-react';
import { T, useT, useTranslationContext } from './T';
import styles from './Sidebar.module.css'; // Import the new CSS module

interface SidebarProps {
    user: AppUser | null;
    onLogout: () => void;
    onAdminClick: () => void;
    onUserDetailsClick: () => void;
    onPatientsClick: () => void;
    onPointsAdminClick: () => void;
    onMeasuresAdminClick: () => void;
    onProblemsAdminClick: () => void;
    onQuestionnaireAdminClick: () => void;
    onAppSettingsClick: () => void;
    onUserManagementClick: () => void;
    viewAsCaretakerId: string | null;
    onViewAsCaretakerChange: (id: string | null) => void;
    appConfig: any;
}

const Sidebar: React.FC<SidebarProps> = ({
    user,
    onLogout,
    onAdminClick,
    onUserDetailsClick,
    onPatientsClick,
    onPointsAdminClick,
    onMeasuresAdminClick,
    onProblemsAdminClick,
    onQuestionnaireAdminClick,
    onAppSettingsClick,
    onUserManagementClick,
    viewAsCaretakerId,
    onViewAsCaretakerChange,
    appConfig
}) => {
    const [configOpen, setConfigOpen] = useState(false);
    const [superAdminOpen, setSuperAdminOpen] = useState(false);
    const [caretakers, setCaretakers] = useState<{ id: string, fullName: string }[]>([]);
    const [loadingCaretakers, setLoadingCaretakers] = useState(false);
    const { language } = useTranslationContext();
    const isRtl = language === 'he';

    const direction = isRtl ? 'rtl' : 'ltr';

    const canImpersonate = user?.role === 'superadmin' || (user?.role === 'admin' && user?.canImpersonate && appConfig?.adminSettings?.enableGlobalImpersonation);

    const userUid = user?.uid;

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
                <div className={styles.header}>
                    <h2 className={styles.title}>APITHERAPYCARE</h2>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.sidebar} dir={direction}>
            <div className={styles.header}>
                <h2 className={styles.title}>APITHERAPYCARE</h2>
            </div>
            <nav className={styles.nav}>
                <button onClick={onUserDetailsClick} className={styles.navButton}>
                    <UserIcon size={18} className={styles.iconPrimary} />
                    <span><T>My Profile</T></span>
                </button>

                <button onClick={onPatientsClick} className={styles.navButton}>
                    <Users size={18} className={styles.iconPrimary} />
                    <span><T>Patients</T></span>
                </button>

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
                        <button onClick={() => setConfigOpen(!configOpen)} className={styles.configDropdownButton}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <Shield size={18} className={styles.iconPrimary} />
                                <span><T>Configuration</T></span>
                            </div>
                            <ChevronDown size={16} className={`${styles.chevron} ${configOpen ? styles.chevronOpen : ''}`} />
                        </button>
                        {configOpen && (
                            <div className={styles.configSubMenu}>
                                <button onClick={onAppSettingsClick} className={styles.configButton}>
                                    <Settings size={16} className={styles.iconSecondary} />
                                    <span><T>Application Settings</T></span>
                                </button>
                                <button onClick={onPointsAdminClick} className={styles.configButton}>
                                    <MapPin size={16} className={styles.iconSecondary} />
                                    <span><T>Points Configuration</T></span>
                                </button>
                                <button onClick={onAdminClick} className={styles.configButton}>
                                    <FileText size={16} className={styles.iconSecondary} />
                                    <span><T>Protocol Configuration</T></span>
                                </button>
                                <button onClick={onMeasuresAdminClick} className={styles.configButton}>
                                    <Ruler size={16} className={styles.iconSecondary} />
                                    <span><T>Measure Configuration</T></span>
                                </button>
                                <button onClick={onProblemsAdminClick} className={styles.configButton}>
                                    <Bug size={16} className={styles.iconSecondary} />
                                    <span><T>Problem Configuration</T></span>
                                </button>
                                <button onClick={onQuestionnaireAdminClick} className={styles.configButton}>
                                    <ListChecks size={16} className={styles.iconSecondary} />
                                    <span><T>Questionnaire Configuration</T></span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {user.role === 'superadmin' && (
                    <div>
                        <button onClick={() => setSuperAdminOpen(!superAdminOpen)} className={styles.configDropdownButton}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <ShieldAlert size={18} className={styles.iconPrimary} />
                                <span><T>SuperAdmin</T></span>
                            </div>
                            <ChevronDown size={16} className={`${styles.chevron} ${superAdminOpen ? styles.chevronOpen : ''}`} />
                        </button>
                        {superAdminOpen && (
                            <div className={styles.configSubMenu}>
                                <button onClick={onUserManagementClick} className={styles.configButton}>
                                    <Users size={16} className={styles.iconSecondary} />
                                    <span><T>User Management</T></span>
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
