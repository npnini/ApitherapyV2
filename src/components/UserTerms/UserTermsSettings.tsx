import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ref as sRef, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase';
import { T, useT } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import { uploadFile } from '../../services/storageService';
import { getUserTermsConfig, saveUserTermsFile, publishUserTerms, callableErrorMessage } from '../../services/userService';
import { UserTermsConfig } from '../../types/userTerms';
import { formatDate, toDateValue } from '../../utils/appointments/time';
import { getLanguageName } from '../../utils/languageNames';
import { logger } from '../../utils/logger';
import styles from '../ApplicationSettings.module.css';

interface UserTermsSettingsProps {
    /** cfg_app_config/main.languageSettings.supportedLanguages: a version can be published only with a file in each. */
    supportedLanguages: string[];
}

const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,19}$/;
const USER_DOCUMENTS_FOLDER = 'App_config/user_documents';

/**
 * User Terms management in Application Settings (spec §4). Superadmin only.
 * Upload: a PDF for a version and language (a new version starts as draft).
 * Publish: only when the version has a file in every supported language; every user must then accept it.
 * History: all versions and files stay visible; published versions cannot be changed.
 * Changes here are saved immediately (Cloud Functions), not with the dialog's Save button.
 */
const UserTermsSettings: React.FC<UserTermsSettingsProps> = ({ supportedLanguages }) => {
    const [cfg, setCfg] = useState<UserTermsConfig>({});
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState('');
    const [language, setLanguage] = useState(supportedLanguages[0] || 'en');
    const [file, setFile] = useState<File | null>(null);
    const [fileInputKey, setFileInputKey] = useState(0);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
    const [publishCandidate, setPublishCandidate] = useState<string | null>(null);

    const tInvalidVersion = useT('Enter a version number, e.g. 1.0 (letters, digits, dot, dash or underscore).');
    const tPdfOnly = useT('The User Terms file must be a PDF.');
    const tChooseFile = useT('Choose a PDF file to upload.');
    const tUploadFailed = useT('The User Terms file could not be uploaded.');
    const tUploaded = useT('User Terms file uploaded. The version is a draft until it is published.');
    const tPublishFailed = useT('The User Terms version could not be published.');
    const tPublished = useT('User Terms version published. Every user must accept it at the next sign-in.');
    const tOpenFailed = useT('The file could not be opened.');
    const tPublishTitle = useT('Publish User Terms version');
    const tPublishMessage = useT('After publishing, every user must accept this version at the next sign-in, and the version can no longer be changed. Publish?');
    const tPublish = useT('Publish');

    const load = useCallback(async () => {
        try {
            setCfg(await getUserTermsConfig());
        } catch (err) {
            logger.error('Failed to load User Terms config:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const versions = useMemo(() => Object.entries(cfg.versions || {})
        .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true })), [cfg]);

    const missingLanguages = (v: string) =>
        supportedLanguages.filter(l => !cfg.versions?.[v]?.files?.[l]?.path);

    const handleUpload = async () => {
        setMessage(null);
        const v = version.trim();
        if (!VERSION_PATTERN.test(v)) { setMessage({ kind: 'error', text: tInvalidVersion }); return; }
        if (!file) { setMessage({ kind: 'error', text: tChooseFile }); return; }
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!isPdf) { setMessage({ kind: 'error', text: tPdfOnly }); return; }
        setBusy(true);
        try {
            // Always uploaded as application/pdf: the storage rule for user_documents requires it
            const pdf = new File([file], file.name, { type: 'application/pdf' });
            const path = await uploadFile(pdf, USER_DOCUMENTS_FOLDER, `user_terms_${v}_${language}.pdf`);
            await saveUserTermsFile(v, language, path);
            await load();
            setFile(null);
            setFileInputKey(k => k + 1);
            setMessage({ kind: 'success', text: tUploaded });
        } catch (err) {
            logger.error('User Terms upload failed:', err);
            setMessage({ kind: 'error', text: callableErrorMessage(err, tUploadFailed) });
        } finally {
            setBusy(false);
        }
    };

    const handlePublish = async (v: string) => {
        setPublishCandidate(null);
        setMessage(null);
        setBusy(true);
        try {
            await publishUserTerms(v);
            await load();
            setMessage({ kind: 'success', text: tPublished });
        } catch (err) {
            logger.error('User Terms publish failed:', err);
            setMessage({ kind: 'error', text: callableErrorMessage(err, tPublishFailed) });
        } finally {
            setBusy(false);
        }
    };

    const openFile = async (path: string) => {
        try {
            const url = await getDownloadURL(sRef(storage, path));
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            logger.error('Failed to open User Terms file:', err);
            setMessage({ kind: 'error', text: tOpenFailed });
        }
    };

    return (
        <fieldset className={styles.group}>
            <legend className={styles.groupLabel}><T>User Terms</T></legend>
            <p className={styles.groupDescription}>
                <T>Upload the User Terms PDF for each language, then publish the version. Changes in this section are saved immediately.</T>
            </p>

            <div className="flex flex-col items-start gap-2">
                <label className={styles.settingLabel}><T>Upload a User Terms file</T></label>
                <p className={styles.settingDescription}>
                    <T>Enter a new version number or the number of an unpublished draft, choose the language and the PDF file.</T>
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col text-sm">
                        <T>Version</T>
                        <input
                            className={styles.input}
                            value={version}
                            onChange={e => setVersion(e.target.value)}
                            list="userTermsDraftVersions"
                            placeholder="1.0"
                            disabled={busy}
                        />
                        <datalist id="userTermsDraftVersions">
                            {versions.filter(([, d]) => d.status === 'draft').map(([v]) => <option key={v} value={v} />)}
                        </datalist>
                    </label>
                    <label className="flex flex-col text-sm">
                        <T>Language</T>
                        <select className={styles.input} value={language} onChange={e => setLanguage(e.target.value)} disabled={busy}>
                            {supportedLanguages.map(l => <option key={l} value={l}>{getLanguageName(l)}</option>)}
                        </select>
                    </label>
                    <input
                        key={fileInputKey}
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={e => setFile(e.target.files?.[0] || null)}
                        disabled={busy}
                    />
                    <button type="button" className={`${styles.button} ${styles.saveButton}`} onClick={handleUpload} disabled={busy}>
                        <T>Upload</T>
                    </button>
                </div>
            </div>

            {message && (
                <p className={message.kind === 'error' ? styles.errorMessage : styles.successMessage} role={message.kind === 'error' ? 'alert' : 'status'}>
                    {message.text}
                </p>
            )}

            <div className="flex flex-col items-start gap-2">
                <label className={styles.settingLabel}><T>User Terms versions</T></label>
                {cfg.currentVersion
                    ? <p className={styles.settingDescription}><T>Current version that users must accept:</T> {cfg.currentVersion}</p>
                    : <p className={styles.settingDescription}><T>No version is published yet. Until one is published, users are not asked to accept User Terms.</T></p>}
                {loading ? (
                    <p><T>Loading...</T></p>
                ) : versions.length === 0 ? (
                    <p className={styles.settingDescription}><T>No User Terms files have been uploaded yet.</T></p>
                ) : (
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-start border-b">
                                    <th className="p-2 text-start"><T>Version</T></th>
                                    <th className="p-2 text-start"><T>Status</T></th>
                                    <th className="p-2 text-start"><T>Published on</T></th>
                                    <th className="p-2 text-start"><T>Files</T></th>
                                    <th className="p-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {versions.map(([v, data]) => {
                                    const missing = missingLanguages(v);
                                    const published = toDateValue(data.publishedTimestamp);
                                    return (
                                        <tr key={v} className="border-b align-top">
                                            <td className="p-2 font-semibold">{v}{cfg.currentVersion === v && <> (<T>current</T>)</>}</td>
                                            <td className="p-2">{data.status === 'published' ? <T>Published</T> : <T>Draft</T>}</td>
                                            <td className="p-2">{published ? formatDate(published) : '—'}</td>
                                            <td className="p-2">
                                                <div className="flex flex-col gap-1">
                                                    {Object.entries(data.files || {}).sort(([a], [b]) => a.localeCompare(b)).map(([lang, f]) => {
                                                        const uploaded = toDateValue(f.uploadedTimestamp);
                                                        return (
                                                            <button key={lang} type="button" className="underline text-blue-700 text-start" onClick={() => openFile(f.path)}>
                                                                {getLanguageName(lang)}{uploaded ? ` · ${formatDate(uploaded)}` : ''}
                                                            </button>
                                                        );
                                                    })}
                                                    {data.status === 'draft' && missing.length > 0 && (
                                                        <span className="text-amber-700">
                                                            <T>Missing:</T> {missing.map(getLanguageName).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                {data.status === 'draft' && (
                                                    <button
                                                        type="button"
                                                        className={`${styles.button} ${styles.saveButton}`}
                                                        disabled={busy || missing.length > 0}
                                                        title={missing.length > 0 ? missing.map(getLanguageName).join(', ') : undefined}
                                                        onClick={() => setPublishCandidate(v)}
                                                    >
                                                        <T>Publish</T>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={publishCandidate !== null}
                title={tPublishTitle}
                message={<>{tPublishMessage} ({publishCandidate})</>}
                onConfirm={() => publishCandidate && handlePublish(publishCandidate)}
                onCancel={() => setPublishCandidate(null)}
                showCancelButton={true}
                confirmLabel={tPublish}
                type="warning"
            />
        </fieldset>
    );
};

export default UserTermsSettings;
