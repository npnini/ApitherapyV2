
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { LogOut, User as UserIcon, Shield, ChevronDown, Users, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
    user: AppUser | null;
    onLogout: () => void;
    onAdminClick: () => void; 
    onUserDetailsClick: () => void;
    onPatientsClick: () => void;
    onPointsAdminClick: () => void; // New prop for points admin
    onOnboardingTestClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, onAdminClick, onUserDetailsClick, onPatientsClick, onPointsAdminClick, onOnboardingTestClick }) => {
    const { t, i18n } = useTranslation();
    const [configOpen, setConfigOpen] = useState(false);
    const isRtl = i18n.language === 'he';

    if (!user) {
        return (
            <div className="w-64 bg-slate-900 text-white flex flex-col h-screen p-4">
                <div className="flex-grow">
                    <h2 className="text-xl font-black tracking-tighter">APITHERAPYCARE</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="w-64 bg-slate-900 text-white flex flex-col h-screen">
            <div className="p-4 border-b border-slate-800">
                <h2 className="text-xl font-black tracking-tighter">APITHERAPYCARE</h2>
            </div>
            <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
                <button onClick={onUserDetailsClick} className="w-full flex items-center p-3 rounded-xl hover:bg-slate-800 transition text-sm font-bold">
                    <UserIcon size={18} className={isRtl ? "ml-3" : "mr-3"} />
                    <span>{t('my_profile')}</span>
                </button>

                <button onClick={onPatientsClick} className="w-full flex items-center p-3 rounded-xl hover:bg-slate-800 transition text-sm font-bold">
                    <Users size={18} className={isRtl ? "ml-3" : "mr-3"} />
                    <span>{t('patients')}</span>
                </button>

                {user.role === 'admin' && (
                    <div>
                        <button onClick={() => setConfigOpen(!configOpen)} className="w-full flex justify-between items-center p-3 rounded-xl hover:bg-slate-800 transition text-sm font-bold">
                            <div className="flex items-center">
                                <Shield size={18} className={isRtl ? "ml-3" : "mr-3"} />
                                <span>{t('configuration')}</span>
                            </div>
                            <ChevronDown size={16} className={`transform transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {configOpen && (
                            <div className={`${isRtl ? 'pr-8' : 'pl-8'} mt-2 space-y-1`}>
                                <button onClick={onAdminClick} className={`w-full p-2 rounded-lg hover:bg-slate-700 transition text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                                    {t('protocol_configuration')}
                                </button>
                                <button onClick={onPointsAdminClick} className={`w-full p-2 rounded-lg hover:bg-slate-700 transition text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                                    {t('points_configuration')}
                                </button>
                                <button onClick={onOnboardingTestClick} className={`w-full p-2 rounded-lg hover:bg-slate-700 transition text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                                    {t('onboarding_test_page')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </nav>
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center mb-4">
                    <div className={isRtl ? "ml-3" : "mr-3"}>
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold">
                            {user.fullName?.charAt(0).toUpperCase() || 'A'}
                        </div>
                    </div>
                    <div>
                        <div className="font-bold text-sm">{user.fullName || t('anonymous_user')}</div>
                        <div className={`text-xs text-slate-400 capitalize ${isRtl ? 'text-right' : 'text-left'}`}>{user.role ? t(user.role) : t('user')}</div>
                    </div>
                </div>
                <button onClick={onLogout} className="w-full flex items-center justify-center p-3 rounded-xl bg-red-600 hover:bg-red-700 transition text-sm font-bold">
                    <LogOut size={16} className={isRtl ? "ml-2" : "mr-2"} />
                    <span>{t('logout')}</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
