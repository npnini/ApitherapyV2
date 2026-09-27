import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AppUser } from '../types/user';
import { AppointmentPrefs } from '../types/appointments';
import styles from './UserDetails.module.css';
import { T, useT, useTranslationContext } from './T';
import { getLanguageName } from '../utils/languageNames';
import { getEffectiveAppointmentPrefs } from '../utils/appointments/prefs';
import { isWorkingDayInvalid } from '../utils/appointments/time';
import { DEFAULT_TIMEZONE, PATIENT_NAME_LEVEL_OPTIONS } from '../config/appointmentDefaults';
import WorkingWeekEditor from './Appointments/WorkingWeekEditor';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MEETING_MINUTES = 5;
const MAX_MEETING_MINUTES = 480;

type ProfileTab = 'details' | 'appointments';
const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
    { key: 'details', label: 'Personal Details' },
    { key: 'appointments', label: 'Appointments' },
];

interface UserDetailsProps {
    user: AppUser;
    onSave: (updatedUser: AppUser) => void;
    onBack?: () => void; // onBack is now optional
    isOnboarding?: boolean; // New prop to control the mode
}

const UserDetails: React.FC<UserDetailsProps> = ({ user, onSave, onBack, isOnboarding = false }) => {
    const { language, registerString } = useTranslationContext();
    const isRtl = language === 'he';
    const [formData, setFormData] = useState<AppUser>(user);
    const [error, setError] = useState<string | null>(null);

    const [supportedLanguages, setSupportedLanguages] = useState<string[]>(['en']);
    // Appointments section (not shown during onboarding). Null until the app config has loaded.
    const [apptPrefs, setApptPrefs] = useState<AppointmentPrefs | null>(null);
    const [activeTab, setActiveTab] = useState<ProfileTab>('details');
    const countryToLang: { [key: string]: string } = {
        'israel': 'he',
    };

    useEffect(() => {
        const fetchSupportedLanguages = async () => {
            let configData: any = {};
            try {
                const configDoc = await getDoc(doc(db, 'cfg_app_config', 'main'));
                if (configDoc.exists()) {
                    const data = configDoc.data();
                    configData = data;
                    setSupportedLanguages(data.languageSettings?.supportedLanguages || ['en']);
                }
            } catch (err) {
                console.error('Error fetching supported languages:', err);
            }
            // Users created before the feature have no appointmentPrefs: show the app defaults; Save persists them.
            setApptPrefs(getEffectiveAppointmentPrefs(user, configData));
        };
        fetchSupportedLanguages();
    }, []);

    const timezoneOptions = useMemo(() => {
        let zones: string[] = [];
        try {
            zones = Intl.supportedValuesOf('timeZone');
        } catch {
            zones = [];
        }
        const current = apptPrefs?.timezone;
        return [DEFAULT_TIMEZONE, ...(current && current !== DEFAULT_TIMEZONE ? [current] : []), ...zones.filter(z => z !== DEFAULT_TIMEZONE && z !== current)];
    }, [apptPrefs?.timezone]);

    const updateApptPrefs = (patch: Partial<AppointmentPrefs>) => {
        setApptPrefs(prev => (prev ? { ...prev, ...patch } : prev));
    };

    const inviteEmailRequired = useT('Invitation email is required when invitations are on');
    const inviteEmailInvalid = useT('Enter a valid invitation email address');
    const meetingLengthInvalid = useT(`Meeting length must be between ${MIN_MEETING_MINUTES} and ${MAX_MEETING_MINUTES} minutes`);
    const workingWeekInvalid = useT('Working week: on every working day, the end time must be after the start time');
    const tipText = useT('Appointments you book will appear in your own calendar (Google, Outlook, Apple…). The app does not see your other meetings, so please check your calendar for clashes.');

    const trimmedInviteEmail = apptPrefs?.inviteEmail.trim() || '';
    const inviteEmailError = !apptPrefs ? null
        : apptPrefs.sendInvitesToMe && !trimmedInviteEmail ? inviteEmailRequired
            : trimmedInviteEmail && !EMAIL_PATTERN.test(trimmedInviteEmail) ? inviteEmailInvalid
                : null;
    const meetingLengthError = apptPrefs && !(Number.isInteger(apptPrefs.defaultMeetingMinutes)
        && apptPrefs.defaultMeetingMinutes >= MIN_MEETING_MINUTES
        && apptPrefs.defaultMeetingMinutes <= MAX_MEETING_MINUTES) ? meetingLengthInvalid : null;
    const hasWorkingWeekError = !!apptPrefs && Object.values(apptPrefs.workingWeek).some(isWorkingDayInvalid);

    useEffect(() => {
        // Set initial language for new and existing users
        if (user.preferredLanguage) {
            setFormData(prev => ({ ...prev, preferredLanguage: user.preferredLanguage }));
        } else if (supportedLanguages.includes(language)) {
            setFormData(prev => ({ ...prev, preferredLanguage: language }));
        } else {
            setFormData(prev => ({ ...prev, preferredLanguage: 'en' }));
        }
    }, [user.preferredLanguage, language, supportedLanguages]);

    useEffect(() => {
        // This effect runs when a NEW user types in the country field
        if (isOnboarding) {
            const lang = countryToLang[formData.country?.toLowerCase() || ''] || 'en';
            if (supportedLanguages.includes(lang)) {
                setFormData(prev => ({ ...prev, preferredLanguage: lang }));
            }
        }
    }, [formData.country, isOnboarding, supportedLanguages]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const fullNameRequired = useT('Full name is required');
    const mobileNumberRequired = useT('Mobile number is required');
    const addressRequired = useT('Address is required');
    const cityRequired = useT('City is required');
    const countryRequired = useT('Country is required');
    const languageRequired = useT('Language is required');

    const handleSave = () => {
        // Show the tab that holds the failing field, so the error is never on a hidden tab.
        const failDetails = (message: string) => {
            setError(message);
            setActiveTab('details');
        };
        if (!formData.fullName.trim()) {
            failDetails(fullNameRequired);
            return;
        }
        if (!formData.mobile.trim()) {
            failDetails(mobileNumberRequired);
            return;
        }
        if (!formData.address?.trim()) {
            failDetails(addressRequired);
            return;
        }
        if (!formData.city?.trim()) {
            failDetails(cityRequired);
            return;
        }
        if (!formData.country?.trim()) {
            failDetails(countryRequired);
            return;
        }
        if (!formData.preferredLanguage) {
            failDetails(languageRequired);
            return;
        }
        const showAppointments = !isOnboarding && apptPrefs;
        if (showAppointments) {
            const apptError = inviteEmailError || meetingLengthError || (hasWorkingWeekError ? workingWeekInvalid : null);
            if (apptError) {
                setError(apptError);
                setActiveTab('appointments');
                return;
            }
        }
        setError(null);
        onSave(showAppointments
            ? { ...formData, appointmentPrefs: { ...apptPrefs, inviteEmail: trimmedInviteEmail } }
            : formData);
    };

    // Tabs appear only outside onboarding, once the appointment prefs have loaded.
    const showTabs = !isOnboarding && !!apptPrefs;

    const tabPanelProps = (tab: ProfileTab) => showTabs ? {
        role: 'tabpanel',
        id: `profile-panel-${tab}`,
        'aria-labelledby': `profile-tab-${tab}`,
        hidden: activeTab !== tab,
    } : {};

    // Arrow keys move between tabs (WAI-ARIA tabs pattern); direction follows the reading order.
    const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const index = PROFILE_TABS.findIndex(t => t.key === activeTab);
        const forward = (e.key === 'ArrowRight') !== isRtl;
        const next = PROFILE_TABS[(index + (forward ? 1 : PROFILE_TABS.length - 1)) % PROFILE_TABS.length].key;
        setActiveTab(next);
        document.getElementById(`profile-tab-${next}`)?.focus();
    };

    const myProfileTitle = useT('My Profile');
    const yourProfileDetailsTitle = useT('Your Profile Details');
    const saveAndContinue = useT('Save and Continue');
    const saveChanges = useT('Save Changes');

    return (
        <div className={styles.container} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className={styles.card}>
                <h2 className={styles.title}>{isOnboarding ? yourProfileDetailsTitle : myProfileTitle}</h2>
                <p className={styles.subtitle}>{isOnboarding ? <T>Update your information below</T> : ''}</p>
                {showTabs && (
                    <div className={styles.tabButtons} role="tablist" onKeyDown={handleTabKeyDown}>
                        {PROFILE_TABS.map(tab => (
                            <button
                                key={tab.key}
                                id={`profile-tab-${tab.key}`}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.key}
                                aria-controls={`profile-panel-${tab.key}`}
                                tabIndex={activeTab === tab.key ? 0 : -1}
                                className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <T>{tab.label}</T>
                            </button>
                        ))}
                    </div>
                )}
                {error && <p className={styles.error}>{error}</p>}
                <div {...tabPanelProps('details')}>
                <div className={styles.grid}>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="fullName">
                            <T>Full Name</T>
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="fullName" name="fullName" type="text" value={formData.fullName} onChange={handleChange} className={styles.input} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="email"><T>Email</T></label>
                        <p className={styles.readOnlyField}>{formData.email}</p>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="mobile">
                            <T>Mobile</T>
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="mobile" name="mobile" type="text" value={formData.mobile} onChange={handleChange} className={styles.input} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="address">
                            <T>Address</T>
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="address" name="address" type="text" value={formData.address || ''} onChange={handleChange} className={styles.input} placeholder={useT('Enter your address')} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="city">
                            <T>City</T>
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="city" name="city" type="text" value={formData.city || ''} onChange={handleChange} className={styles.input} placeholder={useT('Enter your city')} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="country">
                            <T>Country</T>
                            <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="country" name="country" type="text" value={formData.country || ''} onChange={handleChange} className={styles.input} placeholder={useT('Enter your country')} required />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label} htmlFor="preferredLanguage"><T>Preferred Language</T></label>
                        <select id="preferredLanguage" name="preferredLanguage" value={formData.preferredLanguage || ''} onChange={handleChange} className={styles.input}>
                            <option value=""><T>Select Language</T></option>
                            {supportedLanguages.map(lang => <LanguageOption key={lang} lang={lang} />)}
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}><T>Role</T></label>
                        <p className={`${styles.readOnlyField} ${styles.capitalize}`}><T>{formData.role}</T></p>
                    </div>
                </div>
                </div>
                {showTabs && apptPrefs && (
                    <div {...tabPanelProps('appointments')} className={styles.section}>
                        <div className={styles.grid}>
                            <div className={styles.field}>
                                <span className={styles.label}><T>Calendar invitations</T></span>
                                <label className={styles.checkboxRow}>
                                    <input
                                        id="sendInvitesToMe"
                                        type="checkbox"
                                        checked={apptPrefs.sendInvitesToMe}
                                        onChange={e => updateApptPrefs({ sendInvitesToMe: e.target.checked })}
                                    />
                                    <span><T>Send invitations to me</T></span>
                                </label>
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="inviteEmail">
                                    <T>Invitation email address</T>
                                    {apptPrefs.sendInvitesToMe && <span className={styles.requiredAsterisk}>*</span>}
                                </label>
                                <input
                                    id="inviteEmail"
                                    type="email"
                                    value={apptPrefs.inviteEmail}
                                    onChange={e => updateApptPrefs({ inviteEmail: e.target.value })}
                                    className={`${styles.input} ${inviteEmailError ? styles.inputError : ''}`}
                                    aria-invalid={!!inviteEmailError}
                                    aria-required={apptPrefs.sendInvitesToMe}
                                    aria-describedby={inviteEmailError ? 'inviteEmailError' : undefined}
                                />
                                {inviteEmailError && (
                                    <p id="inviteEmailError" className={styles.fieldError}>
                                        <span aria-hidden="true">⚠ </span>{inviteEmailError}
                                    </p>
                                )}
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="defaultMeetingMinutes"><T>Default meeting length (minutes)</T></label>
                                <input
                                    id="defaultMeetingMinutes"
                                    type="number"
                                    min={MIN_MEETING_MINUTES}
                                    max={MAX_MEETING_MINUTES}
                                    step={5}
                                    value={Number.isFinite(apptPrefs.defaultMeetingMinutes) ? apptPrefs.defaultMeetingMinutes : ''}
                                    onChange={e => updateApptPrefs({ defaultMeetingMinutes: e.target.value === '' ? NaN : Number(e.target.value) })}
                                    className={`${styles.input} ${meetingLengthError ? styles.inputError : ''}`}
                                    aria-invalid={!!meetingLengthError}
                                    aria-describedby={meetingLengthError ? 'defaultMeetingMinutesError' : undefined}
                                />
                                {meetingLengthError && (
                                    <p id="defaultMeetingMinutesError" className={styles.fieldError}>
                                        <span aria-hidden="true">⚠ </span>{meetingLengthError}
                                    </p>
                                )}
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="patientNameLevel"><T>Patient name in my invitations</T></label>
                                <select
                                    id="patientNameLevel"
                                    value={apptPrefs.patientNameLevel}
                                    onChange={e => updateApptPrefs({ patientNameLevel: e.target.value as AppointmentPrefs['patientNameLevel'] })}
                                    className={styles.input}
                                >
                                    {PATIENT_NAME_LEVEL_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}><T>{o.label}</T></option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label} htmlFor="timezone"><T>Time zone</T></label>
                                <select
                                    id="timezone"
                                    value={apptPrefs.timezone}
                                    onChange={e => updateApptPrefs({ timezone: e.target.value })}
                                    className={styles.input}
                                    dir="ltr"
                                >
                                    {timezoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
                                </select>
                            </div>
                            <div className={`${styles.field} ${styles.fullWidth}`}>
                                <span className={styles.label} id="workingWeekLabel"><T>Working week</T></span>
                                <div role="group" aria-labelledby="workingWeekLabel">
                                    <WorkingWeekEditor
                                        idPrefix="workingWeek"
                                        value={apptPrefs.workingWeek}
                                        onChange={workingWeek => updateApptPrefs({ workingWeek })}
                                    />
                                </div>
                            </div>
                        </div>
                        <p className={styles.tip}>
                            <span aria-hidden="true">ℹ </span>{tipText}
                        </p>
                    </div>
                )}
                <div className={styles.actions}>
                    {!isOnboarding && onBack && <button onClick={onBack} className={styles.backButton}><T>Back to Dashboard</T></button>}
                    <button onClick={handleSave} className={styles.saveButton}>{isOnboarding ? saveAndContinue : saveChanges}</button>
                </div>
            </div>
        </div>
    );
};

const LanguageOption: React.FC<{ lang: string }> = ({ lang }) => {
    return <option value={lang}>{useT(getLanguageName(lang))}</option>;
};

export default UserDetails;
