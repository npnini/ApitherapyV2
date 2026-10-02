// Builds the knowledge search index (kb_chunks) from the active configuration entities:
// problems, protocols, points, point groups and measures, and their PDF documents
// (docs/Future/Knowledge-Search-Implementation-Plan.md §1.1-§1.4, Steps 4-5).
//
// Uses the compiled indexer of the functions (functions/lib/knowledge/), so the chunks are
// exactly the ones the Cloud Functions will build. Build it first:  cd functions; npm run build
//
//   Dry run (default): reads cfg_*, kb_chunks, kb_doc_text and the documents in Storage; prints
//   chunk counts per type and language, how many are unchanged / to embed / to delete, the
//   documents still to transcribe (estimated pages) and the estimated Vertex AI cost.
//   No writes, no Vertex calls.
//   --apply: transcribes uncached PDFs (Gemini, cached in kb_doc_text: each PDF is read once),
//   embeds the new and changed chunks (gemini-embedding-001), writes them, deletes chunks no
//   longer wanted, updates kb_status/main. Re-running changes nothing.
//   --codes=CV24,BL40: transcribe only the documents of points / point groups with these codes
//   (others wait for a later run; already transcribed documents are always used).
//   --max-docs=N: transcribe at most N new documents in this run.
//   --show=CV24: print the cached transcription of that code's documents and exit (read-only).
//
// Usage (repo root):
//   node scripts/migrations/build-knowledge-index.js --project=dev|staging|prod [--apply] [--codes=...] [--max-docs=N]
//   node scripts/migrations/build-knowledge-index.js --project=dev|staging|prod --show=CV24
//
// dev = the Firestore and Storage emulators (npm run dev:all running) + the real Vertex AI of the
// staging project, through service-account.json (Vertex has no emulator). staging =
// service-account.json. prod: dry run only. The production key file deliberately has no Vertex AI
// role; the production index is built with the admin "Re-index all" button (plan Step 1 item 2, Step 6).
// The documents' bucket is SOURCE_MEDIA_BUCKET from functions/.env.<projectId> (as the functions use).
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// firebase-admin from functions/node_modules: the same copy the compiled indexer uses
// (its FieldValue.vector must belong to the same SDK as the Firestore instance).
const requireFromFunctions = createRequire(path.resolve(process.cwd(), 'functions/package.json'));
const admin = requireFromFunctions('firebase-admin');
let indexer;
let vertex;
try {
  indexer = requireFromFunctions('./lib/knowledge/indexer.js');
  vertex = requireFromFunctions('./lib/knowledge/vertex.js');
} catch {
  console.error('❌ functions/lib/knowledge/ not found. Build the functions first: cd functions; npm run build');
  process.exit(1);
}

const args = process.argv.slice(2);
const argValue = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const project = argValue('project');
const isApply = args.includes('--apply');
const codes = argValue('codes') ? argValue('codes').split(',').map(c => c.trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean) : null;
const maxDocs = argValue('max-docs') ? Number(argValue('max-docs')) : null;
const showCode = argValue('show')?.trim().toUpperCase().replace(/\s+/g, '');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (project === 'prod' && isApply) {
  console.error('❌ --apply is not available for prod: the production key file has no Vertex AI role.');
  console.error('   Build the production index with the admin "Re-index all" button (App Settings → Knowledge).');
  process.exit(1);
}
if (maxDocs !== null && !(Number.isInteger(maxDocs) && maxDocs >= 0)) {
  console.error('❌ --max-docs must be a whole number (0 or more).');
  process.exit(1);
}

const keyFile = project === 'prod' ? 'service-account-prod.json' : 'service-account.json';
const serviceAccountPath = path.resolve(process.cwd(), keyFile);
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Error: ${keyFile} not found at ${serviceAccountPath}`);
  process.exit(1);
}
const projectId = project === 'prod' ? 'apitherapy-c94a6' : 'apitherapyv2';
const envFile = path.resolve(process.cwd(), `functions/.env.${projectId}`);
const bucketName = fs.existsSync(envFile)
  ? fs.readFileSync(envFile, 'utf8').match(/^SOURCE_MEDIA_BUCKET\s*=\s*"?([^"\r\n]+)"?/m)?.[1]
  : undefined;
if (!bucketName) {
  console.error(`❌ SOURCE_MEDIA_BUCKET not found in ${envFile}.`);
  process.exit(1);
}

const credential = admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')));
if (project === 'dev') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
}
const app = admin.initializeApp({ credential, projectId });
const db = app.firestore();
const bucket = app.storage().bucket(bucketName);

const embedUsd = (tokens) => tokens / 1e6 * vertex.EMBEDDING_USD_PER_MILLION_TOKENS;
const geminiUsd = (input, output) => input / 1e6 * vertex.GEMINI_USD_PER_MILLION_INPUT + output / 1e6 * vertex.GEMINI_USD_PER_MILLION_OUTPUT;
const compactCode = (code) => String(code || '').toUpperCase().replace(/[\s.\-_·]/g, '');

// --show: the cached transcription of a point's / point group's documents.
async function show() {
  const kd = await indexer.loadKnowledgeData(db);
  const chunks = requireFromFunctions('./lib/knowledge/chunks.js');
  let found = 0;
  for (const type of ['point', 'pointGroup']) {
    for (const [id, data] of kd[type]) {
      if (compactCode(data.code) !== showCode) continue;
      for (const doc of chunks.documentRefs(kd, type, id)) {
        found++;
        const snap = await db.collection('kb_doc_text').doc(chunks.hashText(doc.storagePath)).get();
        console.log(`\n══ ${type} ${data.code} · ${doc.lang} · ${doc.storagePath}`);
        if (!snap.exists) { console.log('   (not transcribed yet)'); continue; }
        const d = snap.data();
        console.log(`   model ${d.model}, ${d.pages.length} pages, tokens in ${d.tokens?.input} / out ${d.tokens?.output}`);
        for (const p of d.pages) {
          console.log(`\n── page ${p.page} ──\n${p.text}`);
          if (p.illustrationText) console.log(`\n── page ${p.page}: text in drawings ──\n${p.illustrationText}`);
        }
      }
    }
  }
  if (!found) console.log(`No document found for code ${showCode} (active points and point groups).`);
}

async function main() {
  console.log(`🔍 Environment target: ${project.toUpperCase()} · documents bucket ${bucketName}`);
  if (showCode) return show();
  console.log(`🧹 Execution mode: ${isApply ? 'LIVE WRITE (--apply)' : 'DRY RUN (no writes, no Vertex AI calls)'}`);
  if (codes) console.log(`📄 Transcribing only documents of: ${codes.join(', ')}`);
  if (maxDocs !== null) console.log(`📄 Transcribing at most ${maxDocs} new documents`);

  let allowedSoFar = 0;
  const transcribe = (type, data) => {
    if (codes && !codes.includes(compactCode(data.code))) return false;
    if (maxDocs !== null && allowedSoFar >= maxDocs) return false;
    allowedSoFar++;
    return true;
  };
  const client = isApply ? vertex.vertexClient(projectId, credential) : null;
  const s = await indexer.indexAll(db, client, bucket, { transcribe, log: (m) => console.log(m) });

  console.log('\nEntities (active) and chunks per type:');
  for (const type of Object.keys(s.entities)) {
    console.log(`  ${type.padEnd(11)} ${String(s.entities[type]).padStart(4)} entities  ${String(s.chunksByType[type]).padStart(5)} chunks`);
  }
  console.log(`Chunks per language: ${Object.entries(s.chunksByLang).map(([l, n]) => `${l} ${n}`).join(', ')}`);
  console.log(`Total: ${s.plan.wanted.length} chunks (${s.docChunks} from documents). Unchanged: ${s.plan.unchanged}. To embed: ${s.plan.toEmbed.length} (${s.embedChars} characters). To delete: ${s.plan.toDelete.length}.`);

  const d = s.docs;
  console.log(`\nDocuments referenced: ${d.referenced}. Already transcribed (cache): ${d.cached}. Transcribed now: ${d.transcribed}. ` +
    `Waiting: ${d.pending} (≈${d.pendingPages} pages). Skipped: ${d.skipped['not-pdf']} not PDF, ${d.skipped.missing} missing in Storage, ${d.skipped['too-large']} too large.`);
  for (const f of d.failed) console.log(`  ⚠ failed: ${f.entity} ${f.storagePath}: ${f.error}`);

  if (!s.result) {
    // Rough: Hebrew takes more tokens per character than English; characters ÷ 3 as a middle.
    // A PDF page ≈ 258 input tokens; its transcription ≈ 1,000 output tokens (dense Hebrew page).
    const estTokens = Math.ceil(s.embedChars / 3);
    console.log(`Estimated embedding cost (chunks above, without the waiting documents' chunks): about USD ${embedUsd(estTokens).toFixed(4)}.`);
    console.log(`Estimated transcription cost of the waiting documents: about USD ${geminiUsd(d.pendingPages * 258, d.pendingPages * 1000).toFixed(2)} ` +
      `(${vertex.GEMINI_MODEL} at USD ${vertex.GEMINI_USD_PER_MILLION_INPUT} / ${vertex.GEMINI_USD_PER_MILLION_OUTPUT} per million tokens in / out; check current pricing).`);
    if (s.plan.toEmbed.length > 0) console.log('\nSample chunk to embed:\n' + s.plan.toEmbed[0].text.slice(0, 400));
    const extra = [codes ? `--codes=${codes.join(',')}` : '', maxDocs !== null ? `--max-docs=${maxDocs}` : ''].filter(Boolean).join(' ');
    console.log(`\nTo write: node scripts/migrations/build-knowledge-index.js --project=${project} --apply${extra ? ' ' + extra : ''}`);
    return;
  }
  console.log(`\n✅ Embedded and written: ${s.result.embedded}. Deleted: ${s.result.deleted}. Embedding tokens: ${s.result.tokens} (about USD ${embedUsd(s.result.tokens).toFixed(4)}).`);
  if (d.transcribed > 0) {
    console.log(`   Transcription: ${d.transcribed} documents, tokens in ${d.geminiTokens.input} / out ${d.geminiTokens.output} (about USD ${geminiUsd(d.geminiTokens.input, d.geminiTokens.output).toFixed(3)}).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Failed:', err.message || err);
    process.exit(1);
  });
