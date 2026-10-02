// Caretaker knowledge base (plan docs/Future/Knowledge-Search-Implementation-Plan.md §1.6):
// loads the active configuration entities once per session and builds the relations between
// them, for the read-only Knowledge pages. All cfg_* collections are readable by any signed-in user.

import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { StingPoint } from '../types/apipuncture';
import { Protocol } from '../types/protocol';
import { Problem } from '../types/problem';
import { PointGroup } from '../types/pointGroup';
import { Measure } from '../types/measure';

export type KnowledgeEntityType = 'problem' | 'protocol' | 'point' | 'pointGroup' | 'measure';

export interface EntityRef {
    type: KnowledgeEntityType;
    id: string;
}

/** Problems written by ProblemForm carry both protocolId and protocolIds. */
export type KnowledgeProblem = Problem & { protocolIds?: string[] };

export interface KnowledgeBase {
    problems: Map<string, KnowledgeProblem>;
    protocols: Map<string, Protocol>;
    points: Map<string, StingPoint>;
    pointGroups: Map<string, PointGroup>;
    measures: Map<string, Measure>;
    /** Forward relations, as stored (inactive targets removed). */
    protocolsOfProblem: Map<string, string[]>;
    pointsOfProtocol: Map<string, string[]>;
    /** Reverse relations, computed here (not stored in Firestore). */
    problemsOfProtocol: Map<string, string[]>;
    protocolsOfPoint: Map<string, string[]>;
    pointsOfGroup: Map<string, string[]>;
    problemsOfMeasure: Map<string, string[]>;
    protocolsOfMeasure: Map<string, string[]>;
}

/** Reloaded after this long, so admin edits reach caretakers without a page reload. */
const CACHE_TTL_MS = 10 * 60_000;

let cached: { promise: Promise<KnowledgeBase>; loadedAt: number } | null = null;

export function loadKnowledgeBase(force = false): Promise<KnowledgeBase> {
    if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.promise;
    const promise = fetchKnowledgeBase();
    cached = { promise, loadedAt: Date.now() };
    // A failed load is not cached: the next call tries again.
    promise.catch(() => { if (cached?.promise === promise) cached = null; });
    return promise;
}

async function fetchKnowledgeBase(): Promise<KnowledgeBase> {
    const [problemSnap, protocolSnap, pointSnap, groupSnap, measureSnap] = await Promise.all([
        getDocs(collection(db, 'cfg_problems')),
        getDocs(collection(db, 'cfg_protocols')),
        getDocs(collection(db, 'cfg_acupuncture_points')),
        getDocs(collection(db, 'cfg_point_groups')),
        getDocs(collection(db, 'cfg_measures')),
    ]);

    const activeMap = <E extends { id: string; status: string }>(docs: { id: string; data: () => any }[], keep: (e: E) => boolean = () => true) =>
        new Map(docs.map(d => ({ ...d.data(), id: d.id } as E)).filter(e => e.status === 'active' && keep(e)).map(e => [e.id, e]));

    const problems = activeMap<KnowledgeProblem>(problemSnap.docs);
    // The ad-hoc protocol is the placeholder for free point selection, not knowledge.
    const protocols = activeMap<Protocol>(protocolSnap.docs, p => p.type !== 'ad-hoc' && !p.isAdhoc);
    const points = activeMap<StingPoint>(pointSnap.docs);
    const pointGroups = activeMap<PointGroup>(groupSnap.docs);
    const measures = activeMap<Measure>(measureSnap.docs);

    const protocolsOfProblem = new Map<string, string[]>();
    const pointsOfProtocol = new Map<string, string[]>();
    const problemsOfProtocol = new Map<string, string[]>();
    const protocolsOfPoint = new Map<string, string[]>();
    const pointsOfGroup = new Map<string, string[]>();
    const problemsOfMeasure = new Map<string, string[]>();
    const protocolsOfMeasure = new Map<string, string[]>();
    const add = (map: Map<string, string[]>, key: string, value: string) => {
        const list = map.get(key);
        if (!list) map.set(key, [value]);
        else if (!list.includes(value)) list.push(value);
    };

    problems.forEach(problem => {
        const ids = [...(problem.protocolIds || []), ...(problem.protocolId ? [problem.protocolId] : [])];
        [...new Set(ids)].filter(id => protocols.has(id)).forEach(id => {
            add(protocolsOfProblem, problem.id, id);
            add(problemsOfProtocol, id, problem.id);
        });
        (problem.measureIds || []).filter(id => measures.has(id)).forEach(id => add(problemsOfMeasure, id, problem.id));
    });

    protocols.forEach(protocol => {
        // Points are stored as point ids; tolerate old entries stored as point objects.
        const ids: string[] = (Array.isArray(protocol.points) ? protocol.points : [])
            .map((p: any) => (typeof p === 'string' ? p : p?.id))
            .filter((id: any): id is string => !!id && points.has(id));
        ids.forEach(id => {
            add(pointsOfProtocol, protocol.id, id);
            add(protocolsOfPoint, id, protocol.id);
        });
        (protocol.measureIds || []).filter(id => measures.has(id)).forEach(id => add(protocolsOfMeasure, id, protocol.id));
    });

    points.forEach(point => {
        if (point.Point_Grouping && pointGroups.has(point.Point_Grouping)) add(pointsOfGroup, point.Point_Grouping, point.id);
    });

    return {
        problems, protocols, points, pointGroups, measures,
        protocolsOfProblem, pointsOfProtocol, problemsOfProtocol, protocolsOfPoint, pointsOfGroup, problemsOfMeasure, protocolsOfMeasure,
    };
}

// ─── Multilingual text ────────────────────────────────────────────────────────

export interface LocalizedText {
    text: string;
    /** Language of the text; undefined for plain (non-multilingual) strings. */
    lang?: string;
}

/** Empty values left behind by editors (same checks as TreatmentExecution's long text). */
const isBlank = (value: unknown): boolean => {
    if (typeof value !== 'string') return true;
    const text = value.trim();
    return text === '' || text === 'null' || text === '<p><br></p>' || text === '<p></p>';
};

/**
 * The text of a field in the UI language; if missing there, in another language (English
 * first, then the rest), returning which language was used so the UI can tag it.
 */
export function pickText(value: string | Record<string, string> | undefined | null, uiLang: string): LocalizedText | null {
    if (value == null) return null;
    if (typeof value === 'string') return isBlank(value) ? null : { text: value.trim() };
    const order = [uiLang, 'en', ...Object.keys(value).sort()];
    const lang = order.find(l => !isBlank(value[l]));
    return lang ? { text: value[lang].trim(), lang } : null;
}

/** Display name of an entity in the UI language (points and point groups: "code · name"). */
export function entityName(kb: KnowledgeBase, ref: EntityRef, uiLang: string): LocalizedText {
    switch (ref.type) {
        case 'problem': return pickText(kb.problems.get(ref.id)?.name, uiLang) || { text: ref.id };
        case 'protocol': return pickText(kb.protocols.get(ref.id)?.name, uiLang) || { text: ref.id };
        case 'measure': return pickText(kb.measures.get(ref.id)?.name, uiLang) || { text: ref.id };
        case 'point': {
            const point = kb.points.get(ref.id);
            const label = pickText(point?.label, uiLang);
            return { text: [point?.code, label?.text].filter(Boolean).join(' · ') || ref.id, lang: label?.lang };
        }
        case 'pointGroup': {
            const group = kb.pointGroups.get(ref.id);
            return { text: [group?.code, group?.name].filter(Boolean).join(' · ') || ref.id };
        }
    }
}

/** Ids of one type, sorted for browsing: points and groups by code (LI4 before LI11), others by name. */
export function sortedIds(kb: KnowledgeBase, type: KnowledgeEntityType, uiLang: string): string[] {
    const ids = [...entityMap(kb, type).keys()];
    const key = (id: string) => (type === 'point' ? kb.points.get(id)?.code
        : type === 'pointGroup' ? kb.pointGroups.get(id)?.code || kb.pointGroups.get(id)?.name
            : entityName(kb, { type, id }, uiLang).text) || '';
    const collator = new Intl.Collator(uiLang, { numeric: true, sensitivity: 'base' });
    return ids.sort((a, b) => collator.compare(key(a), key(b)));
}

export function entityMap(kb: KnowledgeBase, type: KnowledgeEntityType): Map<string, unknown> {
    switch (type) {
        case 'problem': return kb.problems;
        case 'protocol': return kb.protocols;
        case 'point': return kb.points;
        case 'pointGroup': return kb.pointGroups;
        case 'measure': return kb.measures;
    }
}

// ─── Plain word search (Phase A) ──────────────────────────────────────────────

/** One searchable text of an entity. */
interface SearchField {
    field: 'code' | 'name' | 'description' | 'longText' | 'rationale' | 'directive';
    lang?: string;
    text: string;
    norm: string;
}

interface SearchEntry {
    ref: EntityRef;
    fields: SearchField[];
    /** Code without spaces, dots or dashes ("LI4"), for exact code matches. */
    code?: string;
}

export interface SearchSnippet {
    text: string;
    lang?: string;
}

export interface PlainSearchHit {
    ref: EntityRef;
    score: number;
    /** The sentence that matched (or the first description line when only the name or code matched). */
    snippet?: SearchSnippet;
}

/** Hebrew final letters → regular forms, so "ברך" finds "ברכיים". */
const HEBREW_FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Lower case, Hebrew vowel marks removed, final letters as regular ones, spaces collapsed: what both texts and questions are compared as. */
export const normalizeForSearch = (text: string): string =>
    text.toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[ךםןףץ]/g, c => HEBREW_FINALS[c]).replace(/\s+/g, ' ').trim();

const compactCode = (text: string): string => normalizeForSearch(text).replace(/[\s.\-_·]/g, '');

/** The search words of a question (at least one character each). */
export const searchWords = (query: string): string[] => normalizeForSearch(query).split(' ').filter(Boolean);

const searchEntries = new WeakMap<KnowledgeBase, SearchEntry[]>();

/** Built once per loaded knowledge base. */
function getSearchEntries(kb: KnowledgeBase): SearchEntry[] {
    let entries = searchEntries.get(kb);
    if (!entries) {
        entries = buildSearchEntries(kb);
        searchEntries.set(kb, entries);
    }
    return entries;
}

function buildSearchEntries(kb: KnowledgeBase): SearchEntry[] {
    const entries: SearchEntry[] = [];
    const fieldsOf = (pairs: [SearchField['field'], string | Record<string, string> | undefined | null][]): SearchField[] =>
        pairs.flatMap(([field, value]) => {
            if (!value) return [];
            const texts: [string | undefined, string][] = typeof value === 'string' ? [[undefined, value]] : Object.entries(value);
            return texts.filter(([, text]) => typeof text === 'string' && !isBlank(text))
                .map(([lang, text]) => ({ field, lang, text: text.trim(), norm: normalizeForSearch(text) }));
        });

    kb.problems.forEach(p => entries.push({ ref: { type: 'problem', id: p.id }, fields: fieldsOf([['name', p.name], ['description', p.description]]) }));
    kb.protocols.forEach(p => entries.push({
        ref: { type: 'protocol', id: p.id },
        fields: fieldsOf([['name', p.name], ['description', p.description], ['rationale', p.rationale], ['directive', p.directive]]),
    }));
    kb.points.forEach(p => entries.push({
        ref: { type: 'point', id: p.id },
        code: p.code ? compactCode(p.code) : undefined,
        fields: fieldsOf([['code', p.code], ['name', p.label], ['description', p.description], ['longText', p.longText]]),
    }));
    kb.pointGroups.forEach(g => entries.push({
        ref: { type: 'pointGroup', id: g.id },
        code: g.code ? compactCode(g.code) : undefined,
        fields: fieldsOf([['code', g.code], ['name', g.name], ['description', g.description]]),
    }));
    kb.measures.forEach(m => entries.push({ ref: { type: 'measure', id: m.id }, fields: fieldsOf([['name', m.name], ['description', m.description]]) }));
    return entries;
}

// Word starts only (not inside a word: "tin" does not find "hurting"). Hebrew words may carry one
// or two attached prefix letters (ו ה ב כ ל מ ש: "ברך" finds "הברך", "וברך"), and Hebrew final
// letters match both forms, so the same pattern works on normalized and on original text.
const HEBREW_PREFIXES = '[ובכלמשה]{0,2}';
const HEBREW_BOTH_FORMS: Record<string, string> = { 'כ': '[כך]', 'מ': '[מם]', 'נ': '[נן]', 'פ': '[פף]', 'צ': '[צץ]' };
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pattern of one normalized search word (or phrase) at the start of a word.
 * Groups: 1 = the character before (or nothing at the start), 2 = Hebrew prefix letters, 3 = the match.
 */
export function wordMatcher(word: string, global = false): RegExp {
    const body = escapeRegExp(word).replace(/[כמנפצ]/g, c => HEBREW_BOTH_FORMS[c]);
    const prefix = /^[א-ת]/.test(word) ? HEBREW_PREFIXES : '';
    return new RegExp(`(^|[^\\p{L}\\p{N}])(${prefix})(${body})`, global ? 'giu' : 'iu');
}

/**
 * Plain word search over all text fields in all languages: an entity matches when every word of
 * the query starts a word in its texts (case-insensitive, Hebrew vowel marks ignored). An exact
 * code ("LI4", also typed "li 4") ranks first, then name matches, then matches in other texts.
 */
export function plainSearch(kb: KnowledgeBase, query: string, uiLang: string): PlainSearchHit[] {
    const words = searchWords(query);
    if (words.length === 0) return [];
    const matchers = words.map(w => wordMatcher(w));
    const phrase = wordMatcher(words.join(' '));
    const queryCode = compactCode(query);

    const hits: PlainSearchHit[] = [];
    for (const entry of getSearchEntries(kb)) {
        const codeExact = !!entry.code && entry.code === queryCode;
        const allWords = matchers.every(m => entry.fields.some(f => m.test(f.norm)));
        if (!codeExact && !allWords) continue;

        const names = entry.fields.filter(f => f.field === 'name' || f.field === 'code');
        const score = codeExact ? 100
            : entry.code?.startsWith(queryCode) && words.length === 1 ? 70
                : names.some(f => phrase.test(f.norm)) ? 50
                    : matchers.every(m => names.some(f => m.test(f.norm))) ? 40
                        : 10;
        hits.push({ ref: entry.ref, score, snippet: snippetFor(entry, matchers, uiLang) });
    }
    return hits;
}

/**
 * The sentence to show under a result: from the text (not name or code) where most query words
 * appear, the UI language preferred; else the first line of the description.
 */
function snippetFor(entry: SearchEntry, matchers: RegExp[], uiLang: string): SearchSnippet | undefined {
    let best: { sentence: string; lang?: string; rank: number } | undefined;
    for (const f of entry.fields) {
        if (f.field === 'name' || f.field === 'code') continue;
        for (const sentence of f.text.split(/\n+|(?<=[.!?;])\s+/)) {
            const norm = normalizeForSearch(sentence);
            const found = matchers.filter(m => m.test(norm)).length;
            if (found === 0) continue;
            const rank = found * 10 + (f.lang === uiLang || !f.lang ? 1 : 0);
            if (!best || rank > best.rank) best = { sentence: sentence.trim(), lang: f.lang, rank };
        }
    }
    if (best) return { text: shorten(best.sentence, matchers), lang: best.lang };

    const description = entry.fields.filter(f => f.field === 'description');
    const fallback = description.find(f => f.lang === uiLang) || description.find(f => !f.lang || f.lang === 'en') || description[0];
    return fallback ? { text: shorten(fallback.text.split('\n')[0], matchers), lang: fallback.lang } : undefined;
}

/** Long sentences: about 180 characters around the first matching word, with "…" where cut. */
function shorten(sentence: string, matchers: RegExp[], max = 180): string {
    if (sentence.length <= max) return sentence;
    const positions = matchers.map(m => m.exec(sentence)).filter((m): m is RegExpExecArray => !!m).map(m => m.index + m[1].length);
    const at = positions.length > 0 ? Math.min(...positions) : 0;
    const start = Math.max(0, Math.min(at - 60, sentence.length - max));
    return `${start > 0 ? '…' : ''}${sentence.slice(start, start + max).trim()}${start + max < sentence.length ? '…' : ''}`;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentEntry {
    lang: string;
    path: string;
}

/**
 * An entity's documents, one per language, the UI language first. A legacy single-string
 * documentUrl counts as the default language.
 */
export function documentEntries(documentUrl: string | Record<string, string> | undefined | null, uiLang: string, defaultLang: string): DocumentEntry[] {
    if (!documentUrl) return [];
    const entries: DocumentEntry[] = typeof documentUrl === 'string'
        ? (isBlank(documentUrl) ? [] : [{ lang: defaultLang, path: documentUrl }])
        : Object.entries(documentUrl).filter(([, path]) => !isBlank(path)).map(([lang, path]) => ({ lang, path }));
    return entries.sort((a, b) => (a.lang === uiLang ? -1 : b.lang === uiLang ? 1 : a.lang.localeCompare(b.lang)));
}
