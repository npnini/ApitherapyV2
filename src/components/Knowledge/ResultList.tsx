import React from 'react';
import { T, useTranslationContext } from '../T';
import { EntityRef, KnowledgeBase, KnowledgeEntityType, SearchSnippet, entityName, wordMatcher } from '../../services/knowledgeService';
import { getLanguageName } from '../../utils/languageNames';
import styles from './Knowledge.module.css';

/** Entity types in tab order, with their tab labels. */
export const TYPE_GROUPS: { type: KnowledgeEntityType; label: string }[] = [
    { type: 'problem', label: 'Problems' },
    { type: 'protocol', label: 'Protocols' },
    { type: 'point', label: 'Points' },
    { type: 'pointGroup', label: 'Point groups' },
    { type: 'measure', label: 'Measures' },
];

export interface ResultItem {
    ref: EntityRef;
    /** Without a search: the first description line; with a search: the sentence that matched. */
    snippet?: SearchSnippet;
}

interface ResultListProps {
    kb: KnowledgeBase;
    items: ResultItem[];
    /** Normalized search words to mark in names and sentences (empty without a search). */
    words: string[];
    onOpen: (ref: EntityRef) => void;
}

/** The list of one tab: each item's name and one sentence; search words marked when searching. */
const ResultList: React.FC<ResultListProps> = ({ kb, items, words, onOpen }) => {
    const { language } = useTranslationContext();
    const searching = words.length > 0;
    return (
        <ul className={styles.list}>
            {items.map(({ ref, snippet }) => (
                <li key={ref.id}>
                    <button type="button" className={styles.listItem} onClick={() => onOpen(ref)}>
                        <span className={styles.listItemName} dir="auto"><Highlight text={entityName(kb, ref, language).text} words={words} /></span>
                        {snippet && (searching ? (
                            <span className={styles.resultSnippet}>
                                <span dir="auto">“<Highlight text={snippet.text} words={words} />”</span>
                                {snippet.lang && snippet.lang !== language && (
                                    <> <span className={styles.langTag}><T>{getLanguageName(snippet.lang)}</T></span></>
                                )}
                            </span>
                        ) : (
                            <span className={styles.listItemSnippet} dir="auto">{snippet.text}</span>
                        ))}
                    </button>
                </li>
            ))}
        </ul>
    );
};

/** The text with the search words marked where they start a word (same rule as the search). */
export const Highlight: React.FC<{ text: string; words: string[] }> = ({ text, words }) => {
    if (words.length === 0) return <>{text}</>;
    // Marked ranges [start, end) of every word, merged where they overlap.
    const ranges: [number, number][] = [];
    for (const word of words) {
        for (const m of text.matchAll(wordMatcher(word, true))) {
            const start = (m.index ?? 0) + m[1].length + m[2].length;
            ranges.push([start, start + m[3].length]);
        }
    }
    if (ranges.length === 0) return <>{text}</>;
    ranges.sort((a, b) => a[0] - b[0]);
    const parts: React.ReactNode[] = [];
    let pos = 0;
    for (const [start, end] of ranges) {
        if (end <= pos) continue;
        const from = Math.max(start, pos);
        if (from > pos) parts.push(text.slice(pos, from));
        parts.push(<mark key={from} className={styles.mark}>{text.slice(from, end)}</mark>);
        pos = end;
    }
    parts.push(text.slice(pos));
    return <>{parts}</>;
};

export default ResultList;
