/**
 * Knowledge index passages ("chunks") built from the configuration entities
 * (docs/Future/Knowledge-Search-Implementation-Plan.md §1.1, §1.4). Pure functions: no Firestore,
 * no network, so the same chunks come out in Cloud Functions and in the build script.
 *
 * Per entity and language: one chunk with the title line alone (type, code, name), one or more
 * per text field (long text split at paragraphs into ~1,500 characters), and one with its
 * relations (a protocol's points and measures, a problem's protocols and measures, a point's
 * group). Every chunk starts with the title line, so a passage describes itself.
 * Plain strings (point groups, legacy single-language values) get the language "any".
 * Documents (Step 5): per transcribed PDF page, text chunks and, separately, the text inside
 * its drawings, in the document's language (its documentUrl key).
 */

import { createHash } from "crypto";

export type EntityType = "problem" | "protocol" | "point" | "pointGroup" | "measure";

export const ENTITY_TYPES: EntityType[] = ["problem", "protocol", "point", "pointGroup", "measure"];

export const COLLECTIONS: Record<EntityType, string> = {
  problem: "cfg_problems",
  protocol: "cfg_protocols",
  point: "cfg_acupuncture_points",
  pointGroup: "cfg_point_groups",
  measure: "cfg_measures",
};

/** Language of plain (not multilingual) strings. */
export const ANY_LANG = "any";

export const CHUNK_SIZE = 1500;

type Data = Record<string, any>;

/**
 * The indexable (active) entities of every type, by id, and the App Settings default language
 * (the language of a legacy single-string documentUrl, as on the Knowledge pages).
 */
export type KnowledgeData = Record<EntityType, Map<string, Data>> & { defaultLang: string };

export interface Chunk {
  id: string;
  entityType: EntityType;
  entityId: string;
  lang: string;
  /**
   * `field:<name>` | `relations` | `doc:<storagePath>` (a document page's text) |
   * `docfig:<storagePath>` (text inside the page's drawings; ranked lower in the search, plan §1.3).
   */
  source: string;
  /** Document chunks: the PDF page (1-based). */
  page?: number;
  text: string;
  textHash: string;
}

/** Same rule as the Knowledge pages (src/services/knowledgeService.ts): active only, no ad-hoc protocol. */
export function isIndexable(type: EntityType, data: Data | undefined): boolean {
  if (!data || data.status !== "active") return false;
  return type !== "protocol" || (data.type !== "ad-hoc" && !data.isAdhoc);
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

/** Rich-text leftovers to plain text with paragraph line breaks. */
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Cleaned text, or "" for empty values left behind by editors ("null", "<p><br></p>"). */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "null") return "";
  return stripHtml(trimmed)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** The non-empty texts of a field by language; a plain string is language "any". */
export function textsByLang(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === "string") {
    const text = cleanText(value);
    if (text) out.set(ANY_LANG, text);
  } else if (value && typeof value === "object") {
    for (const [lang, text] of Object.entries(value as Record<string, unknown>)) {
      const clean = cleanText(text);
      if (clean) out.set(lang, clean);
    }
  }
  return out;
}

/** A field's text in `lang`, else English, else any other language. */
function textIn(value: unknown, lang: string): string {
  const texts = textsByLang(value);
  if (texts.size === 0) return "";
  const fallback = [lang, "en", ANY_LANG, ...[...texts.keys()].sort()].find((l) => texts.has(l));
  return fallback ? texts.get(fallback) || "" : "";
}

/** Long text → pieces of at most `max` characters, cut at paragraphs, else sentences, else hard. */
export function splitText(text: string, max = CHUNK_SIZE): string[] {
  const pieces = text.split("\n").flatMap((p) => (p.length <= max ? [p] : splitLong(p, max)));
  return pack(pieces, max, "\n");
}

function splitLong(paragraph: string, max: number): string[] {
  const sentences = (paragraph.match(/[^.!?;]+[.!?;]*\s*/g) || [paragraph]).map((s) => s.trim()).filter(Boolean);
  const pieces = sentences.flatMap((s) => {
    if (s.length <= max) return [s];
    const parts: string[] = [];
    for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
    return parts;
  });
  return pack(pieces, max, " ");
}

function pack(pieces: string[], max: number, joiner: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + joiner.length + piece.length > max) {
      out.push(current);
      current = piece;
    } else {
      current = current ? `${current}${joiner}${piece}` : piece;
    }
  }
  if (current) out.push(current);
  return out;
}

export const hashText = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 32);

/** Deterministic Firestore id: `<type>_<entityId>_<lang>_<source>_<n>`, sanitised. */
export const chunkId = (type: EntityType, entityId: string, lang: string, source: string, n: number): string =>
  `${type}_${entityId}_${lang}_${source}_${n}`.replace(/[^A-Za-z0-9_-]/g, "-");

// ─── Labels written into the passages ─────────────────────────────────────────

const TYPE_LABELS: Record<string, Record<EntityType, string>> = {
  en: { problem: "Problem", protocol: "Protocol", point: "Point", pointGroup: "Point group", measure: "Measure" },
  he: { problem: "בעיה", protocol: "פרוטוקול", point: "נקודה", pointGroup: "קבוצת נקודות", measure: "מדד" },
};

const RELATION_LABELS: Record<string, { points: string; protocols: string; measures: string; pointGroup: string }> = {
  en: { points: "Points", protocols: "Protocols", measures: "Measures", pointGroup: "Point group" },
  he: { points: "נקודות", protocols: "פרוטוקולים", measures: "מדדים", pointGroup: "קבוצת נקודות" },
};

const labelsIn = <T>(table: Record<string, T>, lang: string): T => table[lang] || table.en;

// ─── Entity shapes ────────────────────────────────────────────────────────────

/** Per type: the name field (in the title line) and the other text fields (§1.1). */
const FIELDS: Record<EntityType, { name: string; texts: string[] }> = {
  problem: { name: "name", texts: ["description"] },
  protocol: { name: "name", texts: ["description", "rationale", "directive"] },
  point: { name: "label", texts: ["description", "longText"] },
  pointGroup: { name: "name", texts: ["description"] },
  measure: { name: "name", texts: ["description"] },
};

/** "Point: LI4 · He Gu", "פרוטוקול: כאבי ברכיים". */
function titleLine(type: EntityType, data: Data, lang: string): string {
  const code = type === "point" || type === "pointGroup" ? cleanText(data.code) : "";
  const name = textIn(data[FIELDS[type].name], lang);
  return `${labelsIn(TYPE_LABELS, lang)[type]}: ${[code, name].filter(Boolean).join(" · ")}`;
}

/** Ids from a list that may hold ids or old embedded objects ({ id, … }). */
const idsOf = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter((id): id is string => typeof id === "string" && id !== "");

/** The relations passage body in `lang`, or "" when the entity has no (active) relations. */
function relationsText(kd: KnowledgeData, type: EntityType, data: Data, lang: string): string {
  const labels = labelsIn(RELATION_LABELS, lang);
  const names = (target: EntityType, ids: string[]) => [...new Set(ids)]
    .map((id) => kd[target].get(id))
    .filter((d): d is Data => !!d)
    .map((d) => [target === "point" || target === "pointGroup" ? cleanText(d.code) : "", textIn(d[FIELDS[target].name], lang)]
      .filter(Boolean).join(" "));
  const lines: string[] = [];
  const add = (label: string, list: string[]) => {
    if (list.length > 0) lines.push(`${label}: ${list.join("; ")}`);
  };
  switch (type) {
    case "protocol":
      add(labels.points, names("point", idsOf(data.points)));
      add(labels.measures, names("measure", idsOf(data.measureIds)));
      break;
    case "problem":
      add(labels.protocols, names("protocol", [...idsOf(data.protocolIds), ...idsOf([data.protocolId])]));
      add(labels.measures, names("measure", idsOf(data.measureIds)));
      break;
    case "point":
      add(labels.pointGroup, names("pointGroup", idsOf([data.Point_Grouping])));
      break;
    default:
      break;
  }
  return lines.join("\n");
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocumentRef {
  lang: string;
  storagePath: string;
}

/** A Storage path from a stored value: a path, or a legacy gs:// or Firebase download URL. */
export function storagePathOf(value: string): string {
  const v = value.trim();
  if (v.startsWith("gs://")) return v.replace(/^gs:\/\/[^/]+\//, "");
  if (/^https?:\/\//.test(v)) {
    const match = v.match(/\/o\/([^?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
  return v;
}

/** An entity's documents (documentUrl: `{lang: path}`, or a legacy string = the default language). */
export function documentRefs(kd: KnowledgeData, type: EntityType, entityId: string): DocumentRef[] {
  const value = kd[type].get(entityId)?.documentUrl;
  const entries: [string, unknown][] = typeof value === "string" ? [[kd.defaultLang, value]]
    : value && typeof value === "object" ? Object.entries(value) : [];
  return entries
    .map(([lang, path]) => ({ lang, storagePath: typeof path === "string" && path.trim() !== "null" ? storagePathOf(path) : "" }))
    .filter((d) => d.storagePath !== "");
}

/** One transcribed page (kb_doc_text, see pdf.ts). */
export interface DocPage {
  page: number;
  text: string;
  illustrationText?: string;
}

/** Transcribed text: whitespace tidied, empty lines dropped (no HTML stripping: "<5" is real text). */
const tidyLines = (text: unknown): string => (typeof text === "string" ? text : "")
  .split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");

/** Short, stable part of a chunk id for a document (its path is too long and changes on re-upload). */
const docKey = (storagePath: string) => hashText(storagePath).slice(0, 12);

/**
 * The chunks of one document of an entity: per page, its text split like long fields, and the
 * text inside its drawings as separate `docfig:` chunks; each starts with the entity's title line
 * in the document's language.
 */
export function buildDocChunks(kd: KnowledgeData, type: EntityType, entityId: string, doc: DocumentRef, pages: DocPage[]): Chunk[] {
  const data = kd[type].get(entityId);
  if (!data) return [];
  const title = titleLine(type, data, doc.lang);
  const chunks: Chunk[] = [];
  for (const p of pages) {
    const parts: [string, string][] = [["doc", tidyLines(p.text)], ["docfig", tidyLines(p.illustrationText)]];
    for (const [kind, text] of parts) {
      if (!text) continue;
      const source = `${kind}:${doc.storagePath}`;
      splitText(text).forEach((part, n) => {
        const body = `${title}\n${part}`;
        chunks.push({
          id: chunkId(type, entityId, doc.lang, `${kind}-${docKey(doc.storagePath)}-p${p.page}`, n),
          entityType: type, entityId, lang: doc.lang, source, page: p.page, text: body, textHash: hashText(body),
        });
      });
    }
  }
  return chunks;
}

/** All Firestore-field chunks of one entity; [] when it is not indexable (inactive, deleted, ad-hoc). */
export function buildChunks(kd: KnowledgeData, type: EntityType, entityId: string): Chunk[] {
  const data = kd[type].get(entityId);
  if (!data) return [];
  const { name: nameField, texts: textFields } = FIELDS[type];
  const names = textsByLang(data[nameField]);
  const textValues = textFields.map((field) => ({ field, texts: textsByLang(data[field]) }));

  // Real languages get the full set (title, fields, relations). "any" (plain strings) is a full
  // language only when there is no real one (point groups); otherwise a legacy plain-string field
  // just adds its own field chunks, so title and relations are not repeated.
  const allLangs = new Set<string>([...names.keys(), ...textValues.flatMap((f) => [...f.texts.keys()])]);
  const langs = [...allLangs].filter((l) => l !== ANY_LANG).sort();
  const fullLangs = langs.length > 0 ? langs : [ANY_LANG];

  const chunks: Chunk[] = [];
  const push = (lang: string, source: string, n: number, text: string) =>
    chunks.push({ id: chunkId(type, entityId, lang, source, n), entityType: type, entityId, lang, source, text, textHash: hashText(text) });
  const pushFields = (lang: string, title: string) => {
    for (const { field, texts } of textValues) {
      const text = texts.get(lang);
      if (text) splitText(text).forEach((part, n) => push(lang, `field:${field}`, n, `${title}\n${part}`));
    }
  };

  for (const lang of fullLangs) {
    const title = titleLine(type, data, lang);
    // The title chunk only where the name exists in this language (or once when there is no name at all).
    if (names.has(lang) || (names.size === 0 && lang === fullLangs[0])) push(lang, `field:${nameField}`, 0, title);
    pushFields(lang, title);
    const relations = relationsText(kd, type, data, lang);
    if (relations) push(lang, "relations", 0, `${title}\n${relations}`);
  }
  if (fullLangs[0] !== ANY_LANG && allLangs.has(ANY_LANG)) {
    if (names.has(ANY_LANG) && !langs.some((l) => names.has(l))) push(ANY_LANG, `field:${nameField}`, 0, titleLine(type, data, ANY_LANG));
    pushFields(ANY_LANG, titleLine(type, data, ANY_LANG));
  }
  return chunks;
}
