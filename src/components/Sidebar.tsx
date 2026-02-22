
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { LogOut, User as UserIcon, Shield, ChevronDown, Users, Settings, ListChecks, FileText, MapPin, Ruler, Bug } from 'lucide-react';
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
}

const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, onAdminClick, onUserDetailsClick, onPatientsClick, onPointsAdminClick, onMeasuresAdminClick, onProblemsAdminClick, onQuestionnaireAdminClick, onAppSettingsClick }) => {
    const [configOpen, setConfigOpen] = useState(false);
    const { language } = useTranslationContext();
    const isRtl = language === 'he';

    const direction = isRtl ? 'rtl' : 'ltr';

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

                {user.role === 'admin' && (
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
                                <button onClick={onAdminClick} className={styles.configButton}>
                                    <FileText size={16} className={styles.iconSecondary} />
                                    <span><T>Protocol Configuration</T></span>
                                </button>
                                <button onClick={onPointsAdminClick} className={styles.configButton}>
                                    <MapPin size={16} className={styles.iconSecondary} />
                                    <span><T>Points Configuration</T></span>
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
