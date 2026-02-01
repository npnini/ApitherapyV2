import React, { useState } from 'react';
import { AppUser } from '../types/user';
import { LogOut, User as UserIcon, Settings, ChevronDown } from 'lucide-react';

interface SidebarProps {
    user: AppUser | null;
    onLogout: () => void;
    onAdminClick: () => void;
    onUserDetailsClick: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, onAdminClick, onUserDetailsClick }) => {
    const [configOpen, setConfigOpen] = useState(false);

    if (!user) {
        return (
            <div className="w-64 bg-slate-900 text-white flex flex-col min-h-screen p-4">
                <div className="flex-grow">
                    <h2 className="text-xl font-black tracking-tighter">APITHERAPYCARE</h2>
                </div>
                <div className="text-center">
                    <p>Not logged in</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
            <div className="p-4 border-b border-slate-800">
                <h2 className="text-xl font-black tracking-tighter">APITHERAPYCARE</h2>
            </div>
            <nav className="flex-grow p-4">
                <button onClick={onUserDetailsClick} className="w-full flex items-center p-2 rounded-lg hover:bg-slate-800 transition">
                    <UserIcon className="mr-3" />
                    <span>My Profile</span>
                </button>
                {user.role === 'admin' && (
                    <div>
                        <button onClick={() => setConfigOpen(!configOpen)} className="w-full flex justify-between items-center p-2 rounded-lg hover:bg-slate-800 transition">
                            <div className="flex items-center">
                                <Settings className="mr-3" />
                                <span>Configuration</span>
                            </div>
                            <ChevronDown className={`transform transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {configOpen && (
                            <div className="pl-8 mt-2">
                                <button onClick={onAdminClick} className="w-full text-left p-2 rounded-lg hover:bg-slate-700 transition">
                                    Protocols
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </nav>
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center mb-4">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold mr-3">
                        {user.displayName?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div>
                        <div className="font-bold">{user.displayName || 'Anonymous User'}</div>
                        <div className="text-sm text-slate-400 capitalize">{user.role || 'User'}</div>
                    </div>
                </div>
                <button onClick={onLogout} className="w-full flex items-center p-2 rounded-lg bg-red-600 hover:bg-red-700 transition">
                    <LogOut className="mr-3" />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
