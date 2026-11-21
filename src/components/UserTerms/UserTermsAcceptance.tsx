import React, { useEffect, useMemo, useState } from 'react';
import { ref as sRef, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import { T, useT, useTranslationContext } from '../T';
import { AppUser } from '../../types/user';
import { UserTermsConfig } from '../../types/userTerms';
import { acceptUserTerms, logUserTermsDeclined, callableErrorMessage } from '../../services/userService';
import { logger } from '../../utils/logger';
import styles from './UserTermsAcceptance.module.css';

interface UserTermsAcceptanceProps {
    user: AppUser;
    termsConfig: UserTermsConfig;
    /** Called after a successful acceptance; re-reads the user record. */
    onAccepted: () => Promise<void>;
    /** Called after Decline; signs the user out. */
    onDeclined: () => Promise<void>;
}

const LANGUAGE_NAMES: Record<string, string> = { he: 'עברית', en: 'English' };

/**
 * F3 – User Terms acceptance screen (Functional Spec – Registration, Roles, Plans and User Terms, §4, §6).
 * Shows the current version's PDF in the user's language (with a switch to the other languages and a
 * download link). Accept is enabled only after the checkbox is ticked. Decline signs the user out.
 * No other screen is reachable until the current version is accepted.
 */
const UserTermsAcceptance: React.FC<UserTermsAcceptanceProps> = ({ user, termsConfig, onAccepted, onDeclined }) => {
    const { language, direction } = useTranslationContext();
    const version = termsConfig.currentVersion || '';
    const files = termsConfig.versions?.[version]?.files || {};
    const languages = useMemo(() => Object.keys(files).sort(), [files]);

    const initialLang = languages.includes(language) ? language
        : (user.preferredLanguage && languages.includes(user.preferredLanguage)) ? user.preferredLanguage
        : languages.includes('he') ? 'he' : (languages[0] || '');
    const [fileLang, setFileLang] = useState<string>(initialLang);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const tAcceptFailed = useT('Your acceptance could not be saved. Please try again.');
    const tDocumentTitle = useT('User Terms');

    // Follow the app language when it changes and a file exists in it
    useEffect(() => {
        if (languages.includes(language)) setFileLang(language);
    }, [language, languages]);

    useEffect(() => {
        const path = files[fileLang]?.path;
        if (!path) { setFileUrl(null); return; }
        let cancelled = false;
        setLoadError(false);
        setFileUrl(null);
        getDownloadURL(sRef(storage, path))
            .then(url => { if (!cancelled) setFileUrl(url); })
            .catch(err => {
                logger.error('Failed to load User Terms file:', err);
                if (!cancelled) setLoadError(true);
            });
        return () => { cancelled = true; };
    }, [fileLang, files]);

    const handleAccept = async () => {
        if (!checked || busy) return;
        setBusy(true);
        setError(null);
        try {
            await acceptUserTerms(version, fileLang);
            await onAccepted();
        } catch (err) {
            logger.error('User Terms acceptance failed:', err);
            setError(callableErrorMessage(err, tAcceptFailed));
            setBusy(false);
        }
    };

    const handleDecline = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await logUserTermsDeclined(version);
        } catch (err) {
            logger.error('Logging the User Terms decline failed:', err);
        }
        await onDeclined();
    };

    // Layout (UserTermsAcceptance.module.css): one screen high. Header and footer stay visible;
    // the document area in the middle takes the remaining height and scrolls inside the PDF viewer.
    return (
        <div dir={direction} className={styles.page}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.titleRow}>
                        <div className={styles.title}>
                            <h1><T>User Terms</T></h1>
                            <span className={styles.version}><T>Version</T> {version}</span>
                        </div>
                        <div className={styles.tools}>
                            {languages.length > 1 && (
                                <div className="flex flex-wrap gap-2" role="group">
                                    {languages.map(l => (
                                        <button
                                            key={l}
                                            type="button"
                                            onClick={() => setFileLang(l)}
                                            className={`px-3 py-1 rounded-full border text-sm ${l === fileLang ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-800 border-gray-300'}`}
                                            aria-pressed={l === fileLang}
                                        >
                                            {LANGUAGE_NAMES[l] || l.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {fileUrl && (
                                <a href={fileUrl} target="_blank" rel="noopener noreferrer" download className="text-sm underline text-blue-700">
                                    <T>Download the User Terms (PDF)</T>
                                </a>
                            )}
                        </div>
                    </div>
                    <p className={styles.intro}>
                        <T>To use the app, please read and accept the User Terms.</T>
                    </p>
                </div>

                <div className={styles.document}>
                    {fileUrl ? (
                        <iframe src={fileUrl} title={tDocumentTitle} />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 p-4 text-center">
                            {loadError ? <T>The User Terms document could not be loaded. Please try again later.</T> : <T>Loading...</T>}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    {error && <p className="text-sm text-red-700 w-full" role="alert">{error}</p>}
                    <label className={styles.consent}>
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => setChecked(e.target.checked)}
                            disabled={busy}
                        />
                        <span><T>I have read and accept the User Terms, including the Privacy Policy and the Data Processing Agreement.</T></span>
                    </label>
                    <div className={styles.buttons}>
                        <button
                            type="button"
                            onClick={handleAccept}
                            disabled={!checked || busy || !fileUrl}
                            className={`${styles.button} ${styles.acceptButton}`}
                        >
                            <T>Accept</T>
                        </button>
                        <button
                            type="button"
                            onClick={handleDecline}
                            disabled={busy}
                            className={`${styles.button} ${styles.declineButton}`}
                        >
                            <T>Decline and sign out</T>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserTermsAcceptance;
