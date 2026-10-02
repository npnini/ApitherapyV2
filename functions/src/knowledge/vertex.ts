/**
 * Vertex AI over REST (docs/Future/Knowledge-Search-Implementation-Plan.md §1.3).
 *
 * No SDK package: plain fetch with an OAuth access token from a firebase-admin credential
 * (applicationDefault() in Cloud Functions and the emulator, cert(serviceAccount) in scripts).
 * All model names, regions and the dimension live here: a model retirement is a one-line change
 * here plus a full re-index (the stored `model` key changes, so every chunk counts as changed).
 */

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_REGION = "me-west1";
/** Firestore vectors allow at most 2048 dimensions. */
export const EMBEDDING_DIMENSIONS = 768;
/** Stored on every chunk; a chunk embedded with another model or dimension is re-embedded. */
export const EMBEDDING_KEY = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;

/** Gemini models are not offered on me-west1; the global endpoint has them (tested 02/10/2026). */
export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_REGION = "global";

/** Vertex list price for gemini-embedding-001 input, USD per million tokens (check before relying on it). */
export const EMBEDDING_USD_PER_MILLION_TOKENS = 0.15;
/**
 * gemini-3.8-flash, USD per million tokens (thinking counts as output). Introductory price until
 * 31/12/2026; from 01/01/2027 1.5 input / 7.5 output (checked 02/10/2026).
 */
export const GEMINI_USD_PER_MILLION_INPUT = 0.75;
export const GEMINI_USD_PER_MILLION_OUTPUT = 3.75;

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface VertexClient {
  /** The Google Cloud project whose Vertex AI is called (and billed). */
  projectId: string;
  getToken: () => Promise<string>;
}

/** What firebase-admin credentials offer (applicationDefault(), cert(...)). */
interface AccessTokenSource {
  getAccessToken(): Promise<{ access_token: string; expires_in: number }>;
}

/** A client that reuses its access token until a minute before it expires. */
export function vertexClient(projectId: string, credential: AccessTokenSource): VertexClient {
  let cached: { token: string; expiresAt: number } | null = null;
  return {
    projectId,
    getToken: async () => {
      if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
      const t = await credential.getAccessToken();
      cached = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
      return cached.token;
    },
  };
}

const RETRY_STATUSES = [429, 500, 502, 503, 504];
const MAX_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST to Vertex; retries quota (429) and server errors with backoff (2, 4, 8, 16, 32 s). */
async function callVertex(client: VertexClient, url: string, body: unknown): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${await client.getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();
    const detail = (await response.text()).slice(0, 500);
    if (RETRY_STATUSES.includes(response.status) && attempt < MAX_ATTEMPTS) {
      await sleep(2000 * 2 ** (attempt - 1));
      continue;
    }
    if (response.status === 403) {
      throw new Error(`Vertex AI 403 PERMISSION_DENIED for project ${client.projectId}: the calling account needs the ` +
        `Vertex AI User role (plan §2 Step 1 item 2) or the API is not enabled. ${detail}`);
    }
    throw new Error(`Vertex AI error ${response.status}: ${detail}`);
  }
}

export interface Embedding {
  values: number[];
  tokens: number;
}

/** One text → one vector (gemini-embedding-001 accepts a single text per request). */
export async function embed(client: VertexClient, text: string, task: EmbeddingTask): Promise<Embedding> {
  const url = `https://${EMBEDDING_REGION}-aiplatform.googleapis.com/v1/projects/${client.projectId}` +
    `/locations/${EMBEDDING_REGION}/publishers/google/models/${EMBEDDING_MODEL}:predict`;
  const data = await callVertex(client, url, {
    instances: [{ content: text, task_type: task }],
    parameters: { outputDimensionality: EMBEDDING_DIMENSIONS, autoTruncate: true },
  });
  const result = data?.predictions?.[0]?.embeddings;
  if (!Array.isArray(result?.values) || result.values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Vertex AI returned no ${EMBEDDING_DIMENSIONS}-dimension embedding.`);
  }
  return { values: result.values, tokens: Number(result.statistics?.token_count) || 0 };
}

/** Many texts, at most `concurrency` requests at a time; results in input order. */
export async function embedMany(
  client: VertexClient, texts: string[], task: EmbeddingTask, concurrency = 5
): Promise<Embedding[]> {
  const results = new Array<Embedding>(texts.length);
  let next = 0;
  const worker = async () => {
    while (next < texts.length) {
      const i = next++;
      results[i] = await embed(client, texts[i], task);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return results;
}

/**
 * Gemini generateContent on the global endpoint (PDF transcription from Step 5; Phase C later).
 * `body` is the REST request (contents, generationConfig, …); returns the raw response.
 */
export async function generate(client: VertexClient, body: unknown): Promise<any> {
  const url = `https://aiplatform.googleapis.com/v1/projects/${client.projectId}` +
    `/locations/${GEMINI_REGION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
  return callVertex(client, url, body);
}
