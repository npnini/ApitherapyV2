
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser } from '../types/user';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface CaretakerDetailsProps {
  user: AppUser;
  onSave: (details: { userId: string; fullName: string; mobile: string; }) => void;
}

const CaretakerDetails: React.FC<CaretakerDetailsProps> = ({ user, onSave }) => {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(user.userId || '');
  const [fullName, setFullName] = useState(user.fullName || '');
  const [mobile, setMobile] = useState(user.mobile || '');
  const [errors, setErrors] = useState({ nickname: '', fullName: '', mobile: '', form: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNickname(user.userId || '');
    setFullName(user.fullName || '');
    setMobile(user.mobile || '');
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    let validationErrors = { nickname: '', fullName: '', mobile: '', form: '' };
    setErrors(validationErrors);

    if (!nickname) validationErrors.nickname = t('nickname_required');
    if (!fullName) validationErrors.fullName = t('full_name_required');
    if (!mobile) validationErrors.mobile = t('mobile_number_required');

    if (validationErrors.nickname || validationErrors.fullName || validationErrors.mobile) {
      setErrors(validationErrors);
      setIsSaving(false);
      return;
    }

    try {
        const usersRef = collection(db, 'users');

        const nicknameQuery = query(usersRef, where('userId', '==', nickname));
        const nicknameSnapshot = await getDocs(nicknameQuery);
        if (nicknameSnapshot.docs.some(doc => doc.id !== user.uid)) {
            validationErrors.nickname = t('nickname_taken');
        }

        const mobileQuery = query(usersRef, where('mobile', '==', mobile));
        const mobileSnapshot = await getDocs(mobileQuery);
        if (mobileSnapshot.docs.some(doc => doc.id !== user.uid)) {
            validationErrors.mobile = t('mobile_taken');
        }

        const emailQuery = query(usersRef, where('email', '==', user.email));
        const emailSnapshot = await getDocs(emailQuery);
        if (emailSnapshot.docs.some(doc => doc.id !== user.uid)) {
            validationErrors.form = t('email_taken');
        }

        if (validationErrors.nickname || validationErrors.mobile || validationErrors.form) {
            setErrors(validationErrors);
            setIsSaving(false);
            return;
        }

        onSave({ userId: nickname, fullName, mobile });

    } catch (error) {
        console.error("Error saving caretaker details:", error);
        setErrors({ ...validationErrors, form: 'An unexpected error occurred.' });
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-lg border border-slate-200">
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter">{t('caretaker_details_title')}</h1>
        <p className="text-slate-500 mt-2 mb-6">{user.userId ? t('caretaker_details_update_subtitle') : t('caretaker_details_new_subtitle')}</p>
        
        <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('email_address')}</label>
              <p className="font-bold text-slate-700 p-3 mt-1 bg-slate-50 border border-slate-100 rounded-xl">{user.email}</p>
            </div>
           <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" htmlFor="nickname">{t('nickname')}</label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className={`w-full p-3 mt-1 bg-white border rounded-xl focus:outline-none focus:ring-2 ${errors.nickname ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 focus:ring-yellow-500'}`}
              placeholder={t('nickname_placeholder')}
            />
            {errors.nickname && <p className="text-xs text-red-500 mt-1">{errors.nickname}</p>}
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" htmlFor="fullName">{t('full_name')}</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`w-full p-3 mt-1 bg-white border rounded-xl focus:outline-none focus:ring-2 ${errors.fullName ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 focus:ring-yellow-500'}`}
              placeholder={t('full_name_placeholder')}
            />
            {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest" htmlFor="mobile">{t('mobile')}</label>
            <input
              id="mobile"
              type="text"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className={`w-full p-3 mt-1 bg-white border rounded-xl focus:outline-none focus:ring-2 ${errors.mobile ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 focus:ring-yellow-500'}`}
              placeholder={t('mobile_placeholder')}
            />
            {errors.mobile && <p className="text-xs text-red-500 mt-1">{errors.mobile}</p>}
          </div>
        </div>
        
        {errors.form && <p className="text-xs text-red-500 mt-4 text-center">{errors.form}</p>}

        <button 
          onClick={handleSave}
          disabled={isSaving || !nickname || !fullName || !mobile}
          className="w-full mt-8 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {isSaving ? t('saving') : t('save_and_continue')}
        </button>
      </div>
    </div>
  );
};

export default CaretakerDetails;
