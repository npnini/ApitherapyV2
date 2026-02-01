
import React, { useState, useEffect } from 'react';
import { User } from '../types/user';

interface CaretakerDetailsProps {
  user: User;
  onSave: (details: { userId: string; fullName: string; mobile: string; }) => void;
}

const CaretakerDetails: React.FC<CaretakerDetailsProps> = ({ user, onSave }) => {
  // Pre-fill state from the user prop
  const [userId, setUserId] = useState(user.userId || '');
  const [fullName, setFullName] = useState(user.fullName || '');
  const [mobile, setMobile] = useState(user.mobile || '');

  // Update state if the user prop changes (e.g., navigating between users in an admin view)
  useEffect(() => {
    setUserId(user.userId || '');
    setFullName(user.fullName || '');
    setMobile(user.mobile || '');
  }, [user]);

  const handleSave = () => {
    if (userId && fullName && mobile) {
      onSave({ userId, fullName, mobile });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl shadow-slate-900/10 border border-slate-200 animate-fade-in">
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Your Profile Details</h1>
        <p className="text-slate-500 mt-2 mb-6">{user.userId ? 'Update your information below.' : 'Please provide a few more details to set up your account.'}</p>
        
        <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Email Address</label>
              <p className="font-bold text-slate-700 p-3 mt-1 bg-slate-50 border border-slate-100 rounded-xl">{user.email}</p>
            </div>
           <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" htmlFor="userId">User ID / Handle</label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
              placeholder="e.g., DrJohn, ClinicA"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
              placeholder="Dr. John Smith"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" htmlFor="mobile">Mobile Number</label>
            <input
              id="mobile"
              type="text"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full p-3 mt-1 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500"
              placeholder="(123) 456-7890"
            />
          </div>
        </div>
        
        <button 
          onClick={handleSave}
          disabled={!userId || !fullName || !mobile}
          className="w-full mt-8 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
};

export default CaretakerDetails;
