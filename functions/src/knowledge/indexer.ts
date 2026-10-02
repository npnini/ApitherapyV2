/**
 * Knowledge index writer (docs/Future/Knowledge-Search-Implementation-Plan.md §1.2, Steps 4-5).
 *
 * Compares the chunks an entity should have (chunks.ts: its Firestore fields, plus the pages of
 * its documents from pdf.ts) with those stored in kb_chunks: unchanged ones (same textHash and
 * embedding model) are skipped, new or changed ones are embedded and written, and stored chunks
 * no longer wanted are deleted. Used by the build script (scripts/migrations/build-knowledge-index.js,
 * which loads the compiled lib/ version) and, from Step 6, by the Firestore triggers and the admin
 * "Re-index all" callable. Firestore, the Storage bucket and the Vertex client are passed in,
 * so each caller brings its own credentials.
 */

import { FieldValue, Firestore } from "firebase-admin/firestore";
import {
  buildChunks, buildDocChunks, Chunk, COLLECTIONS, documentRefs, ENTITY_TYPES, EntityType, isIndexable, KnowledgeData,
} from "./chunks.js";
import { DocBucket, getDocText, SkipReason } from "./pdf.js";
import { EMBEDDING_KEY, embedMany, VertexClient } from "./vertex.js";

export const CHUNKS = "kb_chunks";
export const STATUS_DOC = "kb_status/main";

/** Embedded and written together, so an interrupted run keeps what it finished. */
const WRITE_GROUP = 50;
const DELETE_BATCH = 400;
/** Documents read (and transcribed) at the same time. */
const DOC_CONCURRENCY = 3;

/** The active, indexable entities of all five types (one read of each cfg_* collection). */
export async function loadKnowledgeData(db: Firestore): Promise<KnowledgeData> {
  const [config, ...snaps] = await Promise.all([
    db.collection("cfg_app_config").doc("main").get(),
    ...ENTITY_TYPES.map((type) => db.collection(COLLECTIONS[type]).get()),
  ]);
  const kd = { defaultLang: config.data()?.languageSettings?.defaultLanguage || "he" } as KnowledgeData;
  ENTITY_TYPES.forEach((type, i) => {
    kd[type] = new Map(snaps[i].docs.filter((d) => isIndexable(type, d.data())).map((d) => [d.id, d.data()]));
  });
  return kd;
}

interface StoredChunk {
  entityType: string;
  entityId: string;
  source: string;
  textHash: string;
  model: string;
}

/** Stored chunks (without their vectors), all or one entity's. */
async function storedChunks(db: Firestore, entity?: { type: EntityType; id: string }): Promise<Map<string, StoredChunk>> {
  let query = db.collection(CHUNKS).select("entityType", "entityId", "source", "textHash", "model");
  if (entity) query = query.where("entityType", "==", entity.type).where("entityId", "==", entity.id);
  const snap = await query.get();
  return new Map(snap.docs.map((d) => [d.id, d.data() as StoredChunk]));
}

export interface SyncPlan {
  wanted: Chunk[];
  toEmbed: Chunk[];
  unchanged: number;
  toDelete: string[];
}

/**
 * `keepSources`: sources whose stored chunks stay even though they are not wanted now (documents
 * that could not be read this run, so a failed read never removes a document from the index).
 */
export function planSync(wanted: Chunk[], stored: Map<string, StoredChunk>, keepSources: Set<string> = new Set()): SyncPlan {
  const wantedIds = new Set(wanted.map((c) => c.id));
  const toEmbed = wanted.filter((c) => {
    const s = stored.get(c.id);
    return !s || s.textHash !== c.textHash || s.model !== EMBEDDING_KEY;
  });
  return {
    wanted,
    toEmbed,
    unchanged: wanted.length - toEmbed.length,
    toDelete: [...stored.entries()].filter(([id, s]) => !wantedIds.has(id) && !keepSources.has(s.source)).map(([id]) => id),
  };
}

export interface SyncResult {
  embedded: number;
  deleted: number;
  /** Input tokens reported by Vertex AI (for the cost). */
  tokens: number;
}

export async function applySync(
  db: Firestore, vertex: VertexClient, plan: SyncPlan, log: (message: string) => void = () => undefined
): Promise<SyncResult> {
  let tokens = 0;
  for (let start = 0; start < plan.toEmbed.length; start += WRITE_GROUP) {
    const group = plan.toEmbed.slice(start, start + WRITE_GROUP);
    const embeddings = await embedMany(vertex, group.map((c) => c.text), "RETRIEVAL_DOCUMENT");
    const batch = db.batch();
    group.forEach((c, i) => {
      tokens += embeddings[i].tokens;
      batch.set(db.collection(CHUNKS).doc(c.id), {
        entityType: c.entityType,
        entityId: c.entityId,
        lang: c.lang,
        source: c.source,
        ...(c.page !== undefined ? { page: c.page } : {}),
        text: c.text,
        embedding: FieldValue.vector(embeddings[i].values),
        textHash: c.textHash,
        model: EMBEDDING_KEY,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    log(`   embedded ${Math.min(start + WRITE_GROUP, plan.toEmbed.length)}/${plan.toEmbed.length}`);
  }
  for (let start = 0; start < plan.toDelete.length; start += DELETE_BATCH) {
    const batch = db.batch();
    plan.toDelete.slice(start, start + DELETE_BATCH).forEach((id) => batch.delete(db.collection(CHUNKS).doc(id)));
    await batch.commit();
  }
  return { embedded: plan.toEmbed.length, deleted: plan.toDelete.length, tokens };
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface DocStats {
  referenced: number;
  cached: number;
  transcribed: number;
  /** Not transcribed this run (dry run, or not selected): count and estimated pages. */
  pending: number;
  pendingPages: number;
  skipped: Record<SkipReason, number>;
  failed: { entity: string; storagePath: string; error: string }[];
  /** Gemini tokens of this run's transcriptions (output includes thinking). */
  geminiTokens: { input: number; output: number };
}

export interface DocOptions {
  /**
   * May this entity's document be transcribed now? (default: all). Asked only for an uncached PDF
   * about to be transcribed; cached documents are always used.
   */
  transcribe?: (type: EntityType, data: Record<string, unknown>) => boolean;
  log?: (message: string) => void;
}

/** The document chunks of some entities, plus the sources to keep (documents not read this run). */
async function collectDocChunks(
  db: Firestore, bucket: DocBucket, vertex: VertexClient | null, kd: KnowledgeData,
  entities: { type: EntityType; id: string }[], options: DocOptions = {}
): Promise<{ chunks: Chunk[]; keepSources: Set<string>; stats: DocStats }> {
  const stats: DocStats = {
    referenced: 0, cached: 0, transcribed: 0, pending: 0, pendingPages: 0,
    skipped: { "missing": 0, "not-pdf": 0, "too-large": 0 }, failed: [], geminiTokens: { input: 0, output: 0 },
  };
  const jobs = entities.flatMap(({ type, id }) => documentRefs(kd, type, id).map((doc) => ({ type, id, doc })));
  stats.referenced = jobs.length;
  const chunks: Chunk[] = [];
  const keepSources = new Set<string>();

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { type, id, doc } = jobs[next++];
      const data = kd[type].get(id) || {};
      const result = await getDocText(db, bucket, vertex, doc.storagePath, doc.lang,
        () => (options.transcribe ? options.transcribe(type, data) : true));
      switch (result.status) {
        case "cached":
        case "transcribed":
          if (result.status === "cached") stats.cached++;
          else {
            stats.transcribed++;
            stats.geminiTokens.input += result.tokens?.input || 0;
            stats.geminiTokens.output += result.tokens?.output || 0;
            options.log?.(`   transcribed ${doc.storagePath} (${result.pages.length} pages)`);
          }
          chunks.push(...buildDocChunks(kd, type, id, doc, result.pages));
          break;
        case "pending":
          stats.pending++;
          stats.pendingPages += result.pagesEstimate;
          keepSources.add(`doc:${doc.storagePath}`).add(`docfig:${doc.storagePath}`);
          break;
        case "skipped":
          stats.skipped[result.reason]++;
          break;
        case "failed":
          stats.failed.push({ entity: `${type}/${id}`, storagePath: doc.storagePath, error: result.error });
          keepSources.add(`doc:${doc.storagePath}`).add(`docfig:${doc.storagePath}`);
          options.log?.(`   ⚠ ${doc.storagePath}: ${result.error}`);
          break;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOC_CONCURRENCY, jobs.length) }, worker));
  return { chunks, keepSources, stats };
}

// ─── Entry points ─────────────────────────────────────────────────────────────

/**
 * Re-index one entity (Step 6 triggers): its chunks are rebuilt, or all removed when it is
 * deleted, inactive or ad-hoc. `kd` may be passed when the caller already loaded it.
 */
export async function indexEntity(
  db: Firestore, vertex: VertexClient, bucket: DocBucket, type: EntityType, entityId: string, kd?: KnowledgeData
): Promise<SyncResult & { docs: DocStats }> {
  const data = kd || await loadKnowledgeData(db);
  const docs = await collectDocChunks(db, bucket, vertex, data, data[type].has(entityId) ? [{ type, id: entityId }] : []);
  const wanted = [...buildChunks(data, type, entityId), ...docs.chunks];
  const plan = planSync(wanted, await storedChunks(db, { type, id: entityId }), docs.keepSources);
  return { ...await applySync(db, vertex, plan), docs: docs.stats };
}

export interface IndexSummary {
  plan: SyncPlan;
  entities: Record<EntityType, number>;
  chunksByType: Record<EntityType, number>;
  chunksByLang: Record<string, number>;
  /** Document chunks among the wanted ones. */
  docChunks: number;
  docs: DocStats;
  /** Characters to be embedded (the chunks that changed). */
  embedChars: number;
  result?: SyncResult;
}

/**
 * The full build: every indexable entity with its documents; stored chunks of entities that are
 * gone or inactive are deleted. Without a Vertex client (dry run) nothing is transcribed or
 * written: only the plan, counts and the pages still to transcribe are returned.
 */
export async function indexAll(
  db: Firestore, vertex: VertexClient | null, bucket: DocBucket, options: DocOptions = {}
): Promise<IndexSummary> {
  const log = options.log || (() => undefined);
  const kd = await loadKnowledgeData(db);
  const all = ENTITY_TYPES.flatMap((type) => [...kd[type].keys()].map((id) => ({ type, id })));
  const docs = await collectDocChunks(db, bucket, vertex, kd, all, options);
  const wanted = [...all.flatMap(({ type, id }) => buildChunks(kd, type, id)), ...docs.chunks];
  const plan = planSync(wanted, await storedChunks(db), docs.keepSources);

  const entities = {} as Record<EntityType, number>;
  const chunksByType = {} as Record<EntityType, number>;
  ENTITY_TYPES.forEach((type) => {
    entities[type] = kd[type].size;
    chunksByType[type] = 0;
  });
  const chunksByLang: Record<string, number> = {};
  for (const c of wanted) {
    chunksByType[c.entityType]++;
    chunksByLang[c.lang] = (chunksByLang[c.lang] || 0) + 1;
  }
  const summary: IndexSummary = {
    plan, entities, chunksByType, chunksByLang, docChunks: docs.chunks.length, docs: docs.stats,
    embedChars: plan.toEmbed.reduce((n, c) => n + c.text.length, 0),
  };
  if (!vertex) return summary;

  summary.result = await applySync(db, vertex, plan, log);
  const d = docs.stats;
  await db.doc(STATUS_DOC).set({
    entities,
    chunks: wanted.length,
    docChunks: docs.chunks.length,
    documents: { indexed: d.cached + d.transcribed, pending: d.pending, skipped: d.skipped, failed: d.failed.length },
    model: EMBEDDING_KEY,
    lastFullRunAt: FieldValue.serverTimestamp(),
    lastFullRun: { ...summary.result, unchanged: plan.unchanged, transcribed: d.transcribed, geminiTokens: d.geminiTokens },
  }, { merge: true });
  return summary;
}
