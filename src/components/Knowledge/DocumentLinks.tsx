import React from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { T, useTranslationContext } from '../T';
import { useStorageUrl } from '../../hooks/useStorageUrl';
import { documentEntries, DocumentEntry } from '../../services/knowledgeService';
import { getLanguageName } from '../../utils/languageNames';
import styles from './Knowledge.module.css';

interface DocumentLinksProps {
    documentUrl: string | Record<string, string> | undefined | null;
    /** Language of a legacy single-string documentUrl (App Settings default language). */
    defaultLang: string;
}

/** An entity's documents: one link per language, the UI language first; others tagged "(Hebrew document)". */
const DocumentLinks: React.FC<DocumentLinksProps> = ({ documentUrl, defaultLang }) => {
    const { language } = useTranslationContext();
    const entries = documentEntries(documentUrl, language, defaultLang);
    if (entries.length === 0) return null;

    return (
        <section className={styles.card}>
            <h3 className={styles.sectionHeader}><T>Documents</T></h3>
            <ul className={styles.linkList}>
                {entries.map(entry => (
                    <li key={entry.lang}>
                        <DocumentLink entry={entry} otherLanguage={entry.lang !== language} />
                    </li>
                ))}
            </ul>
        </section>
    );
};

// Same loading as StorageLink (useStorageUrl), with a visible state while the file loads or when it is missing.
const DocumentLink: React.FC<{ entry: DocumentEntry; otherLanguage: boolean }> = ({ entry, otherLanguage }) => {
    const { language } = useTranslationContext();
    const { url, loading } = useStorageUrl(entry.path, language, 'doc');
    const tag = otherLanguage && <span className={styles.langTag}>(<T>{`${getLanguageName(entry.lang)} document`}</T>)</span>;

    if (loading) {
        return <span className={styles.documentPending}><Loader2 size={16} className="animate-spin" aria-hidden /> <T>Loading document...</T> {tag}</span>;
    }
    if (!url) {
        return <span className={styles.documentPending}><FileText size={16} aria-hidden /> <T>Document not available</T> {tag}</span>;
    }
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.documentLink}>
            <FileText size={16} aria-hidden /> <T>View document</T> {tag}
        </a>
    );
};

export default DocumentLinks;
