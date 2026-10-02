# Caretaker Knowledge Search: Implementation Plan

> **For any new agent session:** this is the master plan. Read §0 first, then find the current step in §3 (Progress tracker) and work only on that step.

## Context
Caretakers cannot learn from, search or discover the configuration knowledge (problems, protocols, points, point groups, measures, and the PDFs attached to them); only admins see it, in the configuration screens. The approved direction is **`docs/Future/Knowledge-Search-Directions.md`** (Hebrew: `Knowledge-Search-Directions-he.md`, sent to colleagues for review 02/10/2026). It is the functional reference: phases A, B, C, the screen sketches, the multilingual rules and the guardrails. This plan turns it into steps.

**Scope of this plan:** Phase A (read-only entity pages, browse, plain search) and Phase B (AI meaning-based search over Firestore text **and PDFs**, links only), originally planned on one branch as one release (user decision, 2026-10-02); **changed 02/10/2026 (user): Phase A (Steps 2-3) is released on its own** from `feature/knowledge-search`, and **Phase B (Steps 4-9) continues on a new branch** created by the user, released after Step 9. Phase C (AI-written answer with sources) is "nice to have", decided later on real usage and cost data (§2, Step 10).

**Spike and setup results (02/10/2026; details in §1.3 and the Step 1 row of §3):**
- Vertex AI is enabled in **both** projects (staging `apitherapyv2`, production `apitherapy-c94a6`). `gemini-embedding-001` works on the **me-west1** regional endpoint. Gemini models are **not** offered on me-west1 but work on the **global** endpoint; the newest working one is **`gemini-3.8-flash`**.
- `gemini-3.8-flash` transcribes real Hebrew point PDFs accurately (text, codes, tables, two-column pages, mixed Hebrew/Latin lines in reading order) and also reads text inside illustrations. (2.5 Flash put mixed lines in visual order and misread a word.)

**Review status:** the directions documents were sent to colleagues on 02/10/2026; responses are expected the week of 05/10/2026 and the user does not expect changes. If comments do change something, update **both** directions documents (English and Hebrew) and this plan before continuing.

---

## 0. Session start-up (read first, every session)

1. Read: `CLAUDE.md`, `airules.md` (change only what the step lists; ask before touching other components; no build or deploy by the agent), `Claude Style-Guide.md` (cards, standard inputs and buttons, modal header, never colour alone, focus rings), the directions document, this plan.
2. Run `git branch --show-current` and `git status`. The user may have merged or switched branches between sessions.
3. **Standing rules** (from `CLAUDE.md` and user memory): no commits, pushes, branches, package installs, config or `.env` edits, file deletions or renames without explicit instruction; every script, deploy or migration run needs the user's approval each time; the user deploys manually (`deploy-staging.ps1`, then `finish-feature.ps1`, which **merges and deploys to production**: never run it unless asked); uncommitted state before a staging deploy is intentional; commit messages via `git commit -F <file>` (PowerShell 5.1).
4. **Testing policy** (same as the appointments feature): no unit tests; **Firestore rules for every new collection get automated rules tests** in `tests/security-rules/firestore.rules.test.js` (`npm run test:rules`, emulators stopped); everything else by hand on the emulators (`npm run dev:all`) and staging, plus the Phase B quality test set (Step 9).
5. File and line references are from 2026-10-02; verify before editing.
6. **At the end of a step:** update §3 (status, date, notes, anything left over).
7. **Working with this user** (from user memory and the appointments feature):
   - One step at a time; show results and wait for the user's acknowledgement before the next step. Explain which existing components a step touches (e.g. `App.tsx`, `Sidebar.tsx`, `ApplicationSettings.tsx`) before editing them (`airules.md`: ask before touching other components).
   - Dates in the UI are always **dd/mm/yyyy**, in every language (use `src/utils/appointments/time.ts` `formatDate`).
   - UI strings: English source text that is specific enough for the automatic Hebrew translation; reuse existing strings where the meaning is the same.
   - Caretakers are non-technical: keep their screens simple.
   - The user may merge or switch branches mid-session: check `git status` before further edits.
   - Emulator data: before stopping `npm run dev:all`, the user may run `npm run save-emulator-data`; never run it yourself. A recovery copy lives in `emulator-data-manual/` (an emulator-data loss happened on 30/09/2026 when a save's copy step failed).

---

## 1. Key technical decisions

### 1.1 What is indexed
| Entity | Collection | Text fields (multilingual `{he, en, …}` unless noted) | Relations written into its text | Documents |
|---|---|---|---|---|
| Point | `cfg_acupuncture_points` | `code` (plain), `label`, `description`, `longText` | its point group (name); "used in protocols: …" is **not** stored here (see below) | `documentUrl` |
| Protocol | `cfg_protocols` | `name`, `description`, `rationale`, `directive` | its points (code + name) and measures | `documentUrl` |
| Problem | `cfg_problems` | `name`, `description` | its protocol(s) (`protocolId` / `protocolIds`) and measures | `documentUrl` |
| Point group | `cfg_point_groups` | `code`, `name`, `description` (plain strings) | — | — |
| Measure | `cfg_measures` | `name`, `description` | — | `documentUrl` |

- Only `status: 'active'` entities are indexed and shown (inactive ones are admin-only).
- Relations are written into the **owning** entity's text (a protocol lists its points; a problem lists its protocols), so a protocol edit re-indexes only that protocol. The reverse links ("protocols that use this point") are computed on the client for the entity pages, not indexed.
- `documentUrl` is a `{lang: storagePath}` map (legacy: a single string = Hebrew/default). Paths are Storage paths like `Points/<folder>/<timestamp>_<file>.pdf` (`src/services/storageService.ts` `uploadFile`); a new upload always gets a new path, so **an entity's `documentUrl` changes whenever its document changes** → Firestore triggers alone keep documents current (no Storage trigger needed).

### 1.2 Data model (new, functions-only collections)
| Collection | Content | Notes |
|---|---|---|
| `kb_chunks/{chunkId}` | `entityType`, `entityId`, `lang`, `source` (`field:<name>` \| `relations` \| `doc:<storagePath>`), `page?`, `text`, `embedding` (Firestore vector, 768 dims), `textHash`, `model`, `updatedAt` | One passage each. Chunk id is deterministic: `<type>_<entityId>_<lang>_<source>_<n>` (sanitised), so re-indexing overwrites. |
| `kb_doc_text/{pathHash}` | `storagePath`, `lang`, `pages[]` (extracted text per page), `model`, `extractedAt` | Cache of Gemini's PDF transcription, so a re-index never reads the same PDF twice. |
| `kb_status/main` | counts per type, documents indexed, last full and last incremental run, last error | Shown to admins (Step 6). |
| `kb_search_usage/{uid}` | per-minute counter for rate limiting | Written only by `searchKnowledge`. |

All four: **no client access** (rules `allow read, write: if false`), like `missed_check_runs`. Clients get results only through the callable.

### 1.3 AI services (Vertex AI, REST)
- **No new npm package:** call the Vertex REST API with `fetch` (Node 22) and an access token from `firebase-admin`'s application-default credential (`admin.credential.applicationDefault().getAccessToken()`), exactly as the Cloud Shell tests did. Works in Cloud Functions (default service account) and in the emulator (`GOOGLE_APPLICATION_CREDENTIALS=service-account.json`, set by `scripts/dev/start-dev.js`).
- **Embeddings:** `gemini-embedding-001` on **me-west1** (`https://me-west1-aiplatform.googleapis.com/v1/projects/<project>/locations/me-west1/publishers/google/models/gemini-embedding-001:predict`), `outputDimensionality: 768` (Firestore vectors allow ≤ 2048), task type `RETRIEVAL_DOCUMENT` for chunks and `RETRIEVAL_QUERY` for questions. One multilingual vector space: Hebrew questions find English text and vice versa.
- **Gemini (PDF transcription; later Phase C):** **global** endpoint, model name in one constant: **`gemini-3.8-flash`** (newest Flash that answers on global, tested 02/10/2026; also working: `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`). **Compared 02/10/2026 on the spike PDFs (CV24, BL40, BL18): 3.8 Flash is clearly better than 2.5 Flash** — mixed Hebrew/Latin/Chinese lines come out in reading order (punctuation, brackets, "BL 40", "Biceps femoris ל-Semitendinosus" correct); one small glitch left (`Gan Shu (肝俞) :(Pinyin)`); one word differed between the models in BL40 — the PDF says "ניקוז דלקת ונוזלים": 3.8 Flash was right, 2.5 Flash misread it as "ניקוי". **New:** 3.8 Flash also transcribes text inside illustrations (meridian point lists, anatomy labels). Decision for the build: ask for illustration text in a separate tagged field and index it as its own lower-weight passage (helps anatomy terms such as "sciatic nerve" → BL40; must not let a CV2…CV24 diagram list rank CV24's document for every CV question). Check 3.8 Flash's price per page before the full build. PDF sent **inline** (base64 bytes read with the Admin SDK from the Firebase Storage bucket), so Vertex needs no bucket permission. Prompt: the transcription prompt from the spike, **plus** "write each paragraph in logical reading order (not visual order); join lines broken by the page layout"; output JSON `{pages: [{page, text, illustrationText}]}` (text inside drawings kept apart, see the model comparison above).
- All model names, regions and the dimension live in `functions/src/knowledge/vertex.ts`; a model retirement is a one-line change plus a full re-index.

### 1.4 Chunking and search
- Firestore fields: one chunk per field per language (long `longText` split at paragraph breaks into ~1,500-character chunks); a short **title line** (type + code + name) is prefixed to every chunk so passages are self-describing.
- PDFs: per page, split at paragraphs into ~1,500-character chunks, title line prefixed.
- `searchKnowledge`: embed the question → Firestore `findNearest` (COSINE, top 40) on `kb_chunks.embedding` → group by entity (best distance wins; Hebrew and English chunks of one entity merge) → top 15 entities, each with its best passage, source, language and page → client renders.
- **Vector index** in `config/firestore/firestore.indexes.json` (vector field `embedding`, 768, flat). **Emulator:** verify at the start of Step 4 that the Firestore emulator supports `findNearest`; if it does not, `searchKnowledge` falls back in dev only to an in-memory cosine scan over all chunks (a few thousand × 768 numbers: fine), same results.

### 1.5 Access, cost and safety
- `searchKnowledge`: `onCall({ enforceAppCheck: true })` like the other callables (`functions/src/index.ts`, e.g. `sendDocumentEmail`), signed-in users only; **rate limit** 20 searches per minute per user (`kb_search_usage`); question length ≤ 500 characters; the question text is **not stored** (no patient data risk), only counts in `kb_status`.
- The knowledge base is global (not per caretaker), so "View As" needs nothing special.
- Feature switch: new App Settings group `knowledgeSettings` (`src/config/appConfigSchema.ts`): `enabled` (hides the sidebar item and the callable answers "disabled"), `searchesPerMinute`. Lets the admin turn it off without a deploy.
- Running cost (directions §8, estimates): Phase A ≈ USD 0–1/month; Phase B ≈ USD 1–2/month at 10,000 searches, plus ≈ USD 1–2 per full index build per environment.

### 1.6 Client structure
- **Service:** `src/services/knowledgeService.ts`: load all active config entities once per session (cached; `cfg_*` are readable by any signed-in user, `config/firestore/firestore.rules` ~58–81), build the relation maps (point → protocols, protocol → problems, group → points), plain word search, `searchKnowledge` callable wrapper with fallback to plain search on error.
- **UI:** `src/components/Knowledge/`: `KnowledgePage` (search box, browse tabs, results), `EntityView` (one component, a section per type: `ProblemView`, `ProtocolView`, `PointView`, `PointGroupView`, `MeasureView`), `ResultList`, `DocumentLinks` (reuses `StorageLink` from `src/components/shared/StorageComponents.tsx`).
- **Navigation:** no router; add `'knowledge'` to the `View` union (`src/App.tsx` ~45) plus a small in-page history stack (entity → entity → back). Sidebar: a **"Knowledge"** item for every user (`src/components/Sidebar.tsx`), placed under Patients.
- **Texts in the UI language** with fallback to the other language and a small language tag (`getFieldContent`, `src/utils/storageUtils.ts`); long text rendered line by line as in `TreatmentExecution.tsx` (~812).
- **i18n:** English source text in `<T>` / `useT()`; Hebrew is translated automatically; specific, reusable strings (user memory).

---

## 2. Steps

Each step: goal · work · files · verification. Phase A (Steps 2-3): branch `feature/knowledge-search`, released on its own. Phase B (Steps 4-9): a new branch created by the user, one release after Step 9.

#### Step 1: Setup checks (mostly user actions, no app code)
- **Work:**
  1. **Vertex AI API per project:** staging `apitherapyv2` is already enabled (spike, 02/10/2026). **Dev uses the staging project:** `.firebaserc` default = `apitherapyv2`, and the emulated functions run with `service-account.json` (`firebase-adminsdk-fbsvc@apitherapyv2.iam.gserviceaccount.com`, set by `scripts/dev/start-dev.js`), and Vertex AI has no emulator, so dev calls the **real** Vertex AI of the staging project (billed to staging; only knowledge-base text and test questions are sent). Production `apitherapy-c94a6`: enable the API if needed and repeat the embedding test from Cloud Shell on me-west1.
  2. **Vertex AI User role** (`roles/aiplatform.user`, Cloud Console → IAM) for the identities that call Vertex. The spike calls ran as the user's own account (owner), so these are not yet proven:
     - staging: the functions' runtime service account (Compute Engine default, `<project-number>-compute@developer.gserviceaccount.com`, unless functions set another) **and** `firebase-adminsdk-fbsvc@apitherapyv2.iam.gserviceaccount.com` (used by dev and by `--project=staging` scripts);
     - production: the functions' runtime service account and the account in `service-account-prod.json` (used by `--project=prod` scripts).
     Check each by a test call during Step 4; a `403 PERMISSION_DENIED` means the role is missing.
     **Checked 02/10/2026 (IAM screens, both projects alike):** the functions' runtime account (`…-compute@developer.gserviceaccount.com`) has **Editor**, which includes Vertex AI → nothing to add. `firebase-adminsdk-fbsvc@…` has no Vertex role → **staging: add Vertex AI User** (needed by dev and staging scripts); **production: not added on purpose** — the production index is built with the admin "Re-index all" button (Step 6), which runs in the deployed functions under the compute account, so the production key file never needs Vertex access.
  3. Gemini model: try the exact Model IDs of the newest Flash versions on the **global** endpoint; record the newest that answers. **Done: `gemini-3.8-flash`.**
  4. Firestore emulator: check whether `findNearest` works locally (a 10-line throwaway test in the scratchpad); record the result (decides the dev fallback in §1.4). **Moved to the start of Step 4.**
  5. User: write the **quality test set**: ~20 real caretaker questions (Hebrew and English, including ones whose answer is only in a PDF) with the entities you expect. Stored as `docs/Future/knowledge-search-test-questions.md`.
  6. Optional: a Google Cloud **budget alert** (e.g. USD 10/month) on both projects. **Done: one alert budget covers both projects.**
- **Verify:** results recorded in §3.

#### Step 2: Read-only entity pages
- **Goal:** every problem, protocol, point, point group and measure has a read-only page with its texts, documents and related links (directions §4).
- **Work:** `knowledgeService` entity loading and relation maps; `EntityView` with the five sections; `DocumentLinks`; navigation `'knowledge'` view with history; Sidebar item; the `knowledgeSettings.enabled` switch (App Settings).
- **Verify:** pages in Hebrew and English (RTL), fallback language tag, long text line by line, documents open, relation links walk problem → protocol → point → other protocols; a caretaker cannot edit anything; switch off hides the item.

#### Step 3: Knowledge page: browse and plain search (Phase A complete)
- **Work:** search box and browse tabs (alphabetical, filter); plain word search over all indexed text fields in all languages (case-insensitive, Hebrew and English), results grouped by type with the matching sentence.
- **Verify:** words and codes in both languages find the expected entities; empty and no-result states; tablet width.

#### Step 4: Index core (Firestore text)
- **Work:** `functions/src/knowledge/`: `vertex.ts` (token, embed, generate), `chunks.ts` (pure chunk builders per entity, §1.1/§1.4), `indexer.ts` (index one entity: build chunks, skip unchanged `textHash`, embed changed, write, delete stale chunks); `kb_*` rules (deny all) + rules tests; vector index entry in `firestore.indexes.json`; a migration script `scripts/migrations/build-knowledge-index.js --project=dev|staging|prod [--apply]` for the full build (dry run prints counts and estimated cost).
- **Approvals needed:** `firestore.rules`, `firestore.indexes.json`.
- **Verify:** full build on dev: chunk counts per type and language look right; re-running changes nothing (hashes); `npm run test:rules` passes.

#### Step 5: PDFs
- **Work:** `pdf.ts`: read the PDF bytes from Storage, Gemini transcription (§1.3), cache in `kb_doc_text`, chunk per page; legacy string `documentUrl` treated as the default language; files that are not PDF are skipped and counted.
- **Verify:** on dev, 3–5 documents including CV24/BL40/BL18 from the spike and one two-column, one table, one scanned (if any): pages complete, Hebrew in reading order, codes exact; second run reads no PDF again (cache).

#### Step 6: Keep the index current
- **Work:** Firestore triggers `onDocumentWritten` for the five `cfg_*` collections → `indexer` for that entity (delete its chunks when deleted or set inactive); `kb_status` updates; admin-only callable `reindexKnowledge` and a small status card in App Settings → Knowledge ("312 items, 48 documents, last update …", **Re-index all**).
- **Verify:** edit a point's text → its chunks change within a minute; upload a new document for a protocol → indexed; set a problem inactive → gone from results; the trigger does not loop (it writes only `kb_*`).

#### Step 7: Search function
- **Work:** `searchKnowledge` callable (§1.4, §1.5): App Check, auth, rate limit, length limit, embed query, `findNearest` (dev fallback per Step 1), grouping, response `{results: [{entityType, entityId, score, passage, source, lang, page?}], mode: 'ai'}`.
- **Verify:** from the emulator UI or a test script: Hebrew and English questions return sensible entities; 21st search in a minute is refused; disabled switch is respected.

#### Step 8: Smart results UI (Phase B complete)
- **Work:** `KnowledgePage` uses `searchKnowledge` for free-text questions (plain search for exact codes like `LI4`, and automatically when the AI call fails, with a small note); ranked list per directions §5 sketch: type, name in the UI language, passage, "Found in: <field / document name, page>", "(Hebrew document)" tag; opening a document result opens the PDF.
- **Verify:** directions §5 behaviour in Hebrew and English; fallback works when the function is stopped; passages from mixed Hebrew/Latin lines readable enough.

#### Step 9: Quality tuning, documentation, release
- **Work:** run the Step 1 test set on staging; measure "expected entity in the top 5" (target: most questions); adjust chunk size, title lines, top-K and grouping; record results in §3. Update `docs/operations/app-functional-inventory.md` (new view, callable, triggers, collections) and `docs/operations/script-catalog.md`.
- **Release:** the user deploys to staging, runs the full index build there (script `--project=staging --apply`, or the "Re-index all" button), verifies, then production: enable Vertex AI first (Step 1), `finish-feature.ps1`, then build the production index with the admin **"Re-index all"** button (not the script: the production key file has no Vertex role, Step 1 item 2).

#### Step 10 (later, decision): Phase C — AI-written answer with sources
- **When:** only if decided after some weeks of Phase B use (search counts and how often caretakers re-phrase, from `kb_status`), and on cost (directions §8, ≈ USD 0.002 per answer with Flash).
- **Shape:** a "Summarize" button above the results (answer only on request); Gemini on the global endpoint; uses only the retrieved passages; numbered citations linking to entity pages; in the UI language; disclaimer; daily per-user limit; optional 👍/👎.

---

## 3. Progress tracker (update at the end of every step)

| Step | Status | Branch | Staging verified | Production | Notes |
|---|---|---|---|---|---|
| 0 Spike (region, Hebrew PDFs) | **Done 2026-10-02** | — | — | — | See Context and directions §9. |
| 1 Setup checks | **Done 02/10/2026; 2 items carried forward:** (b) the ~20 test questions — the user collects them from caretakers (expected the week of 05/10/2026), needed by Step 9 (a first look after Step 7); (c) emulator `findNearest` check — done by the agent at the start of Step 4. Done: production Vertex AI API enabled and the embedding test passed (user, 02/10/2026). Budget: one all-services alert budget now covers **both** projects (same payer; ₪10/month; raise to ~₪30–50 if Vertex use triggers it). Spend-cap enforcement (Preview) deliberately off. Item 3: newest Gemini on the global endpoint is `gemini-3.8-flash` (staging, Cloud Shell), and it transcribes the spike PDFs clearly better than 2.5 Flash (see §1.3). Item 2: runtime accounts OK (Editor); staging adminsdk account: Vertex AI User **added and verified 02/10/2026** (Cloud Shell, `get-iam-policy`; first real call with it in Step 4); production adminsdk deliberately left without. | — | — | — | |
| 2 Entity pages | **Done 02/10/2026, verified by the user on dev.** Follow-up from the test: sidebar single items (My Profile, Patients, Knowledge) now start-aligned in RTL as in LTR (`Sidebar.module.css` `.navButton`). New: `src/services/knowledgeService.ts` (active entities of the 5 types loaded once, 10-minute cache; relation maps incl. reverse links; `pickText` = text in the UI language else English/other with its language; `documentEntries`, legacy string = App Settings default language), `src/components/Knowledge/` (`KnowledgePage` = type tabs with alphabetical lists + entity page + in-page Back history; `EntityView` = one component, a section per type incl. measures (scale and improvement direction); `DocumentLinks` = one link per document language, UI language first, "(Hebrew document)" tag; `Knowledge.module.css`). Changed: `App.tsx` (`'knowledge'` view, sidebar click resets the page's history via `key`), `Sidebar.tsx` (Knowledge item under Patients), `appConfigSchema.ts` (`knowledgeSettings.enabled` default on, `searchesPerMinute` 20, used from Step 7). User decisions 02/10/2026: the **ad-hoc** protocol (and `isAdhoc`) is not shown (the sensitivity protocol is); **no point image** on the point page (the PDF has a better one). Inactive entities and links to them are left out. Note: the settings switch takes effect after a page reload (App reads `cfg_app_config` once per login). `tsc --noEmit`: the 14 old errors only. The tabbed list is the Step 3 starting point (search box and filter added there). *Earlier handover (done, kept for reference):* branch `feature/knowledge-search` exists (created by the user; first commit `266dda8` = the directions documents, this plan and the points/protocols translation script). (1) Follow §0. (2) Read the directions §4 (Phase A pages) and §6 (multilingual), and §1.1 and §1.6 here. (3) Look at the existing code first: the `cfg_*` types (`src/types/apipuncture.ts`, `protocol.ts`, `problem.ts`, `pointGroup.ts`, `measure.ts`; note problems carry both `protocolId` and `protocolIds`, protocols carry `points` as an array of point ids, points carry `Point_Grouping` = a point-group document id), how the admin screens read them (`PointsAdmin.tsx`, `ProtocolAdmin.tsx`, `ProblemAdmin/`, `PointGroupAdmin/`, `MeasureAdmin/`), how multilingual values are shown (`getFieldContent` in `src/utils/storageUtils.ts`, used by `TreatmentExecution.tsx`; there may be other document-URL helpers in the same file), `StorageLink` (`src/components/shared/StorageComponents.tsx`), the `View` union and view switching in `App.tsx`, `Sidebar.tsx`, and the App Settings groups (`src/config/appConfigSchema.ts`, `ApplicationSettings.tsx`). (4) Propose the Step 2 file list and UI briefly to the user before coding (it touches `App.tsx`, `Sidebar.tsx`, the settings schema). (5) Build, `tsc --noEmit` (14 old errors exist in ProblemAdmin, ProtocolAdmin, ProtocolSelection, TreatmentFeedback; add no new ones), then the user verifies on the emulators. Untracked and intentionally not committed: `docs/Future/Knowledge-Search-Directions*.pdf` (the user's exports). | feature/knowledge-search | | | |
| 3 Browse and plain search | **Done 02/10/2026, verified by the user on dev (RTL and LTR). Phase A complete; released on its own (user decision 02/10/2026): staging verification, then `finish-feature.ps1` (production) by the user — record the dates here.** **UX (user feedback + agent proposal, 02/10/2026):** one search box above the type tabs; the tabs always stay; without a search each tab lists all its items alphabetically; with a search each tab lists only its matches (best first, matched sentence with the words marked, language tag when in another language) and the tab shows their number (tabs with 0 greyed, still clickable); a hint under the box while searching ("Showing matches in each type…"), gone when the box is cleared (✕ or Esc). The separate list filter box (and its ✕ / keep-across-tabs behaviour proposed by the user) was **dropped**: with the search box filtering every tab it would duplicate it; the phrase now naturally stays when switching tabs. **Matching:** `knowledgeService.plainSearch`: every query word must **start a word** in the entity's texts (any field of §1.1, any language; "tin" no longer finds "hurting"); Hebrew words may carry 1-2 attached prefix letters (ו ה ב כ ל מ ש: "מפרק" finds "במפרק"); case-insensitive; Hebrew vowel marks ignored; final letters = regular ones ("ברך" finds "ברכיים"). Ranking: exact code incl. "li 4" = 100, code prefix 70, phrase in name 50, all words in name 40, else 10; search entries built once per loaded knowledge base; `wordMatcher` shared with the highlighting (`ResultList.Highlight`). Later the same day (user requests): hints (under the box, and "no matches of this type" in a tab) shown as an amber tip box with a light-bulb icon (not red/green/blue); while searching, when the current tab has no matches the first tab (tab order) with matches is selected automatically (only when the results change, so a greyed tab can still be clicked). Logic checked on sample data in the scratchpad. `tsc --noEmit`: the 14 old errors only. **Note for Step 8:** the AI results (ranked across types, directions §5) need a place in this tab layout, e.g. a first "Best matches" tab; decide then. | feature/knowledge-search | | | |
| 4 Index core | **Not started. Next session starts here (as of 02/10/2026):** Phase A is released from `feature/knowledge-search` (see the Step 3 row for staging/production dates). (1) Follow §0; the user creates the **new Phase B branch** first (`new-branch.ps1`) — check `git branch --show-current`. (2) Read §1.1-§1.5 and Step 4 in §2. (3) First task: the deferred Step 1 item 4 — a throwaway check in the scratchpad whether the Firestore emulator supports `findNearest` (decides the dev fallback in §1.4). (4) Propose the Step 4 file list to the user before coding; `firestore.rules` and `firestore.indexes.json` changes need the user's approval; first real Vertex call with the staging adminsdk account (Step 1 item 2). Client side to reuse in Step 8: `src/services/knowledgeService.ts` (`plainSearch`, `wordMatcher`, `loadKnowledgeBase`), `src/components/Knowledge/` (`KnowledgePage` = search box + type tabs with match counts, `ResultList`, `EntityView`, `DocumentLinks`); see the Step 3 note on where AI results go. | | | | |
| 5 PDFs | Not started | | | | |
| 6 Keep index current | Not started | | | | |
| 7 Search function | Not started | | | | |
| 8 Smart results UI | Not started | | | | |
| 9 Tuning, docs, release | Not started | | | | |
| 10 Phase C (decision later) | Not planned | | | | Nice to have; decide on usage and cost. |

---

## 4. Verification approach (every step)
1. **Local:** `npm run dev:all` (emulators; UI on port 5000) and `npm run dev`; exercise the step in English and Hebrew. Functions code changes need `cd functions; npm run build` (or restart `dev:all`).
2. **Rules:** `npm run test:rules` (emulators stopped), from Step 4 on.
3. **Staging:** the user runs `.\scripts\deploy\deploy-staging.ps1`, then walks the step's verification; record results in §3.
4. **Quality (Phase B):** the Step 1 test set, run in Step 9 (and earlier for a quick look after Step 7).
5. **Production:** only when the user decides, after Step 9.
