
import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { LogOut, User as UserIcon, Shield, ChevronDown, Users } from 'lucide-react';

interface SidebarProps {
    user: AppUser | null;
    onLogout: () => void;
    onAdminClick: () => void; 
    onUserDetailsClick: () => void;
    onPatientsClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, onAdminClick, onUserDetailsClick, onPatientsClick }) => {
    const [configOpen, setConfigOpen] = useState(false);

    if (!user) {
        return (
            <div className="w-64 bg-slate-900 text-white flex flex-col min-h-screen p-4">
                <div className="flex-grow">
                    <h2 className="text-xl font-black tracking-tighter">APITHERAPYCARE</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
            <div className="p-4 border-b border-slate-800">
                <h2 className="text-xl font-black tracking-tighter">APITHERAPYCARE</h2>
            </div>
            <nav className="flex-grow p-4 space-y-2">
                <button onClick={onUserDetailsClick} className="w-full flex items-center p-3 rounded-xl hover:bg-slate-800 transition text-sm font-bold">
                    <UserIcon size={18} className="mr-3" />
                    <span>My Profile</span>
                </button>

                <button onClick={onPatientsClick} className="w-full flex items-center p-3 rounded-xl hover:bg-slate-800 transition text-sm font-bold">
                    <Users size={18} className="mr-3" />
                    <span>Patients</span>
                </button>

                {user.role === 'admin' && (
                    <div>
                        <button onClick={() => setConfigOpen(!configOpen)} className="w-full flex justify-between items-center p-3 rounded-xl hover:bg-slate-800 transition text-sm font-bold">
                            <div className="flex items-center">
                                <Shield size={18} className="mr-3" />
                                <span>Configuration</span>
                            </div>
                            <ChevronDown size={16} className={`transform transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {configOpen && (
                            <div className="pl-8 mt-2 space-y-1">
                                <button onClick={onAdminClick} className="w-full text-left p-2 rounded-lg hover:bg-slate-700 transition text-sm">
                                    Protocol Configuration
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </nav>
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center mb-4">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold mr-3">
                        {user.fullName?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div>
                        <div className="font-bold text-sm">{user.fullName || 'Anonymous User'}</div>
                        <div className="text-xs text-slate-400 capitalize">{user.role || 'User'}</div>
                    </div>
                </div>
                <button onClick={onLogout} className="w-full flex items-center justify-center p-3 rounded-xl bg-red-600 hover:bg-red-700 transition text-sm font-bold">
                    <LogOut size={16} className="mr-2" />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
