import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb, Search, X } from 'lucide-react';
import { T, useT, useTranslationContext } from '../T';
import { logger } from '../../utils/logger';
import {
    EntityRef, KnowledgeBase, KnowledgeEntityType, entityName, loadKnowledgeBase, pickText, plainSearch, searchWords, sortedIds,
} from '../../services/knowledgeService';
import EntityView from './EntityView';
import ResultList, { ResultItem, TYPE_GROUPS } from './ResultList';
import styles from './Knowledge.module.css';

interface KnowledgePageProps {
    appConfig: any;
}

/** Shorter text does not search (one letter matches almost everything). */
const MIN_QUERY_LENGTH = 2;

/**
 * Caretaker Knowledge page (knowledge search plan, Steps 2-3): one search box above the type tabs.
 * Without a search each tab lists all its items alphabetically; with a search each tab lists only
 * its matches (best first) and shows their number. Items open the read-only entity pages, with an
 * in-page history (entity → entity → Back).
 */
const KnowledgePage: React.FC<KnowledgePageProps> = ({ appConfig }) => {
    const { language, direction } = useTranslationContext();
    const [kb, setKb] = useState<KnowledgeBase | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [tab, setTab] = useState<KnowledgeEntityType>('problem');
    const [query, setQuery] = useState('');
    // Opened entities, newest last; empty = the tabs.
    const [history, setHistory] = useState<EntityRef[]>([]);
    const topRef = useRef<HTMLDivElement>(null);
    const tBrowseByType = useT('Browse the knowledge base by type');
    const tSearchPlaceholder = useT('Search problems, protocols, points…');
    const tSearchLabel = useT('Search the knowledge base');
    const tClearSearch = useT('Clear search');
    const defaultLang = appConfig?.languageSettings?.defaultLanguage || 'he';
    const BackIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;

    const load = () => {
        setLoadError(false);
        loadKnowledgeBase()
            .then(setKb)
            .catch(err => {
                logger.error('Knowledge base load failed:', err);
                setLoadError(true);
            });
    };
    useEffect(load, []);

    // A new page starts at its top (the app scrolls inside <main>, not the window).
    useEffect(() => {
        topRef.current?.scrollIntoView({ block: 'start' });
    }, [history]);

    const current = history[history.length - 1];
    const open = (ref: EntityRef) => setHistory(h => [...h, ref]);
    const back = () => setHistory(h => h.slice(0, -1));

    // Search as you type; the deferred value keeps typing smooth on large knowledge bases.
    const deferredQuery = useDeferredValue(query);
    const searching = deferredQuery.trim().length >= MIN_QUERY_LENGTH;
    const words = useMemo(() => (searching ? searchWords(deferredQuery) : []), [searching, deferredQuery]);

    // Items per tab: all (alphabetical) without a search; the matches (best first) with one.
    const itemsByType = useMemo(() => {
        const byType = new Map<KnowledgeEntityType, ResultItem[]>(TYPE_GROUPS.map(g => [g.type, []]));
        if (!kb) return byType;
        if (!searching) {
            TYPE_GROUPS.forEach(({ type }) => byType.set(type, sortedIds(kb, type, language).map(id => {
                const ref = { type, id };
                const line = listSnippet(kb, ref, language);
                return { ref, snippet: line ? { text: line } : undefined };
            })));
            return byType;
        }
        const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' });
        plainSearch(kb, deferredQuery, language)
            .map(hit => ({ hit, name: entityName(kb, hit.ref, language).text }))
            .sort((a, b) => b.hit.score - a.hit.score || collator.compare(a.name, b.name))
            .forEach(({ hit }) => byType.get(hit.ref.type)!.push({ ref: hit.ref, snippet: hit.snippet }));
        return byType;
    }, [kb, searching, deferredQuery, language]);

    // While searching, a tab without matches gives way to the first tab (in tab order) that has some;
    // a tab the user chose that still has matches is kept. Runs when the results change, not when a
    // tab is clicked, so a greyed tab can still be opened.
    const tabRef = useRef(tab);
    tabRef.current = tab;
    useEffect(() => {
        if (!searching || (itemsByType.get(tabRef.current)?.length || 0) > 0) return;
        const first = TYPE_GROUPS.find(g => (itemsByType.get(g.type)?.length || 0) > 0);
        if (first) setTab(first.type);
    }, [searching, itemsByType]);

    const tabItems = itemsByType.get(tab) || [];
    const totalMatches = searching ? TYPE_GROUPS.reduce((n, g) => n + (itemsByType.get(g.type)?.length || 0), 0) : 0;

    return (
        <div className={styles.page} ref={topRef}>
            <header className={styles.pageHeader}>
                <h1 className={styles.pageTitle}><T>Knowledge</T></h1>
                <p className={styles.pageSubtitle}><T>Problems, protocols, points, point groups and measures, for reading and learning.</T></p>
            </header>

            {loadError ? (
                <section className={styles.card}>
                    <p className={styles.errorMessage} role="alert"><T>Could not load the knowledge base. Please try again.</T></p>
                    <button type="button" className={styles.secondaryButton} onClick={load}><T>Try again</T></button>
                </section>
            ) : !kb ? (
                <section className={styles.card}>
                    <p className={styles.message}><T>Loading...</T></p>
                </section>
            ) : current ? (
                <>
                    <div className={styles.entityTop}>
                        <button type="button" className={styles.secondaryButton} onClick={back}>
                            <BackIcon size={18} aria-hidden /> <T>Back</T>
                        </button>
                    </div>
                    <EntityView kb={kb} entity={current} onOpen={open} defaultLang={defaultLang} />
                </>
            ) : (
                <>
                    <div>
                        <div className={styles.searchBox} role="search">
                            <Search size={18} className={styles.searchIcon} aria-hidden />
                            <input
                                type="search"
                                className={styles.searchInput}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
                                placeholder={tSearchPlaceholder}
                                aria-label={tSearchLabel}
                                dir="auto"
                            />
                            {query && (
                                <button type="button" className={styles.clearButton} onClick={() => setQuery('')} aria-label={tClearSearch} title={tClearSearch}>
                                    <X size={18} aria-hidden />
                                </button>
                            )}
                        </div>
                        {searching && (
                            <p className={styles.searchHint} aria-live="polite">
                                <Lightbulb size={16} className={styles.searchHintIcon} aria-hidden />
                                {totalMatches === 0
                                    ? <T>Nothing found. Try other words or a point code such as LI4.</T>
                                    : <T>Showing matches in each type. The number on each tab is how many it has; click a tab to see them.</T>}
                            </p>
                        )}
                    </div>

                    <section className={styles.card}>
                        <div className={styles.tabs} role="tablist" aria-label={tBrowseByType}>
                            {TYPE_GROUPS.map(t => {
                                const count = itemsByType.get(t.type)?.length || 0;
                                return (
                                    <button
                                        key={t.type}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === t.type}
                                        className={`${styles.tab} ${tab === t.type ? styles.tabActive : ''} ${searching && count === 0 ? styles.tabEmpty : ''}`}
                                        onClick={() => setTab(t.type)}
                                    >
                                        <T>{t.label}</T> ({count})
                                    </button>
                                );
                            })}
                        </div>
                        <div role="tabpanel">
                            {tabItems.length === 0 ? (
                                !searching ? (
                                    <p className={styles.message}><T>Nothing here yet.</T></p>
                                ) : (
                                    <p className={`${styles.searchHint} ${styles.searchHintInList}`}>
                                        <Lightbulb size={16} className={styles.searchHintIcon} aria-hidden />
                                        {totalMatches > 0
                                            ? <T>No matches of this type. The numbers on the tabs show where matches were found.</T>
                                            : <T>No matches.</T>}
                                    </p>
                                )
                            ) : (
                                <ResultList kb={kb} items={tabItems} words={words} onOpen={open} />
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

/** First line of the description, shown under the name in the list. */
const listSnippet = (kb: KnowledgeBase, ref: EntityRef, lang: string): string | undefined => {
    const description = ref.type === 'problem' ? kb.problems.get(ref.id)?.description
        : ref.type === 'protocol' ? kb.protocols.get(ref.id)?.description
            : ref.type === 'point' ? kb.points.get(ref.id)?.description
                : ref.type === 'pointGroup' ? kb.pointGroups.get(ref.id)?.description
                    : kb.measures.get(ref.id)?.description;
    return pickText(description, lang)?.text.split('\n')[0];
};

export default KnowledgePage;
