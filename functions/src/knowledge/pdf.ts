/**
 * Document text for the knowledge index (docs/Future/Knowledge-Search-Implementation-Plan.md
 * §1.3, Step 5): the PDF bytes are read from the app's Storage bucket with the Admin SDK and sent
 * inline to Gemini (so Vertex needs no bucket permission), which transcribes them page by page.
 * The result is cached in kb_doc_text/{hash of the path}: a document is read by Gemini once.
 * A new upload always gets a new Storage path, so a changed document is a new cache entry.
 */

import { FieldValue, Firestore } from "firebase-admin/firestore";
import { DocPage, hashText } from "./chunks.js";
import { generate, GEMINI_MODEL, VertexClient } from "./vertex.js";

export const DOC_TEXT = "kb_doc_text";

/** Inline request data is limited (about 20 MB with the base64 overhead); larger files are skipped. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** The part of a Storage bucket used here (firebase-admin getStorage().bucket(name)). */
export interface DocBucket {
  file(path: string): {
    exists(): Promise<[boolean]>;
    getMetadata(): Promise<[{ size?: string | number }, ...unknown[]]>;
    download(): Promise<[Buffer]>;
  };
}

export type SkipReason = "missing" | "not-pdf" | "too-large";

export type DocTextResult =
  | { status: "cached" | "transcribed"; pages: DocPage[]; tokens?: { input: number; output: number } }
  /** Dry run (no Vertex client) or not selected this run: page count estimated from the file. */
  | { status: "pending"; pagesEstimate: number }
  | { status: "skipped"; reason: SkipReason }
  | { status: "failed"; error: string };

const PROMPT = `Transcribe this PDF completely and exactly, page by page. It is a clinical reference document about apitherapy and acupuncture points, in Hebrew, English or both, and may contain Latin and Chinese characters.

Rules:
- Keep the original language. Do not translate, summarise, correct or add anything.
- Copy point codes (e.g. "BL 40", "CV24"), numbers, units and terms exactly.
- Write each paragraph in logical reading order, not visual order, also for lines that mix right-to-left and left-to-right text (punctuation, brackets and colons where they belong in the sentence).
- Join lines that were broken only by the page layout into whole sentences. Keep real paragraph breaks as line breaks.
- Two-column pages: the whole first column, then the second, in the page's reading direction.
- Tables: one row per line, cells separated by " | ".
- Text that is part of a drawing, diagram or picture (labels, point names or lists drawn on a figure) goes into "illustrationText" of that page, not into "text". Leave it empty when there is none.
- Leave out page numbers and headers or footers that repeat on every page.

Return JSON: {"pages": [{"page": 1, "text": "...", "illustrationText": "..."}]} with one entry per page, in order.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    pages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { page: { type: "INTEGER" }, text: { type: "STRING" }, illustrationText: { type: "STRING" } },
        required: ["page", "text"],
      },
    },
  },
  required: ["pages"],
};

/** Rough page count from the PDF's page objects (for the dry-run estimate only). */
export function estimatePages(pdf: Buffer): number {
  const count = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  return count > 0 ? count : Math.max(1, Math.round(pdf.length / 100_000));
}

/** By the file's first bytes: some uploads carry a wrong content type (e.g. x-www-form-urlencoded). */
const isPdf = (bytes: Buffer): boolean => bytes.subarray(0, 5).toString("latin1") === "%PDF-";

/** Gemini transcription of one PDF. */
export async function transcribePdf(vertex: VertexClient, pdf: Buffer): Promise<{ pages: DocPage[]; tokens: { input: number; output: number } }> {
  const response = await generate(vertex, {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } }, { text: PROMPT }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 65535,
      // Transcription needs no reasoning; thinking tokens are billed as output.
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  });
  const candidate = response?.candidates?.[0];
  const usage = response?.usageMetadata || {};
  const tokens = {
    input: Number(usage.promptTokenCount) || 0,
    output: (Number(usage.candidatesTokenCount) || 0) + (Number(usage.thoughtsTokenCount) || 0),
  };
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini stopped with ${candidate.finishReason}`);
  }
  const text = (candidate?.content?.parts || []).filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text).join("");
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON");
  }
  const pages: DocPage[] = (Array.isArray(parsed?.pages) ? parsed.pages : [])
    .map((p: any, i: number) => ({
      page: Number.isInteger(p?.page) && p.page > 0 ? p.page : i + 1,
      text: typeof p?.text === "string" ? p.text : "",
      illustrationText: typeof p?.illustrationText === "string" ? p.illustrationText : "",
    }));
  if (pages.length === 0) throw new Error("Gemini returned no pages");
  return { pages, tokens };
}

/**
 * A document's pages: from the cache, else (with a Vertex client and `transcribe` allowed)
 * transcribed and cached. Without them only a page estimate is returned. Failures are returned,
 * not thrown, so one bad file does not stop a full build; they are not cached (retried next run).
 */
export async function getDocText(
  db: Firestore, bucket: DocBucket, vertex: VertexClient | null, storagePath: string, lang: string,
  mayTranscribe: () => boolean = () => true
): Promise<DocTextResult> {
  const cacheRef = db.collection(DOC_TEXT).doc(hashText(storagePath));
  const cached = await cacheRef.get();
  if (cached.exists && Array.isArray(cached.data()?.pages)) return { status: "cached", pages: cached.data()?.pages };

  try {
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) return { status: "skipped", reason: "missing" };
    const [meta] = await file.getMetadata();
    if (Number(meta.size) > MAX_PDF_BYTES) return { status: "skipped", reason: "too-large" };
    const [bytes] = await file.download();
    if (!isPdf(bytes)) return { status: "skipped", reason: "not-pdf" };
    // Asked only now, so a limit on new transcriptions does not count cached documents.
    if (!vertex || !mayTranscribe()) return { status: "pending", pagesEstimate: estimatePages(bytes) };

    const { pages, tokens } = await transcribePdf(vertex, bytes);
    await cacheRef.set({ storagePath, lang, pages, model: GEMINI_MODEL, tokens, extractedAt: FieldValue.serverTimestamp() });
    return { status: "transcribed", pages, tokens };
  } catch (err) {
    return { status: "failed", error: (err as Error).message || String(err) };
  }
}
