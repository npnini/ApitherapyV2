import React from 'react';
import { AppUser } from '../types/user';

interface HeaderProps {
    user: AppUser;
    onLogout: () => void;
    onAdminClick: () => void; // Function to handle click on Admin button
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, onAdminClick }) => {
    return (
        <header className="bg-white shadow-md">
            <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                <h1 className="text-xl font-bold">ApiTherapy</h1>
                <div className="flex items-center">
                    {user.role === 'admin' && (
                        <button onClick={onAdminClick} className="mr-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                            Admin
                        </button>
                    )}
                    <span className="mr-4">Welcome, {user.displayName}</span>
                    <button onClick={onLogout} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
