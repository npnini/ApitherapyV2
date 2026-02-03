import React, { useState } from 'react';
import { AppUser } from '../types/user';

interface UserDetailsProps {
    user: AppUser;
    onSave: (updatedUser: AppUser) => void;
    onBack: () => void;
}

const UserDetails: React.FC<UserDetailsProps> = ({ user, onSave, onBack }) => {
    const [formData, setFormData] = useState<AppUser>(user);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (!formData.fullName.trim()) {
            setError('Full name is required.');
            return;
        }
        if (!formData.mobile.trim()) {
            setError('Mobile number is required.');
            return;
        }
        setError(null);
        onSave(formData);
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">My Profile</h2>
            <div className="mt-6 bg-white rounded-3xl p-8 border border-slate-100 shadow-lg">
                {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg text-sm mb-4">{error}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-sm font-bold text-slate-500 uppercase" htmlFor="fullName">Full Name</label>
                        <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl" required />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-slate-500 uppercase" htmlFor="email">Email</label>
                        <p style={{ cursor: 'not-allowed' }} className="w-full p-3 mt-1 bg-slate-100 border border-slate-200 rounded-xl text-slate-600">{formData.email}</p>
                    </div>
                    <div>
                        <label className="text-sm font-bold text-slate-500 uppercase" htmlFor="mobile">Mobile</label>
                        <input id="mobile" name="mobile" type="text" value={formData.mobile} onChange={handleChange} className="w-full p-3 mt-1 bg-slate-50 border border-slate-200 rounded-xl" required />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-slate-500 uppercase" htmlFor="userId">User ID</label>
                        <p style={{ cursor: 'not-allowed' }} className="w-full p-3 mt-1 bg-slate-100 border border-slate-200 rounded-xl text-slate-600">{formData.userId}</p>
                    </div>
                     <div>
                        <label className="text-sm font-bold text-slate-500 uppercase">Role</label>
                        <p style={{ cursor: 'not-allowed' }} className="w-full p-3 mt-1 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 capitalize">{formData.role}</p>
                    </div>
                </div>
                <div className="flex justify-end mt-8 space-x-4">
                    <button onClick={onBack} className="text-sm font-bold text-slate-600 hover:text-slate-900 transition">Back to Dashboard</button>
                    <button onClick={handleSave} className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold py-3 px-8 rounded-xl transition shadow-lg shadow-yellow-500/10">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

export default UserDetails;
