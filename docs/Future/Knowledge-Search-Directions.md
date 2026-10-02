# Caretaker Knowledge Search — Directions and User Experience

*Directions draft, 01/10/2026. A detailed implementation plan follows separately. The screen sketches are illustrations: protocol, problem and point names in them are invented examples, not your data.*

---

## 1. Why

The app holds a large body of apitherapy knowledge: **problems**, **protocols**, **points**, **point groups** and **measures**, with names, descriptions, long texts, rationales and codes, plus **PDF documents** attached to points, protocols and problems.

Today only admins see this knowledge as such (in the configuration screens). Caretakers meet it only inside a treatment, when they pick a problem and a protocol. They have no way to **learn, search or discover**: "what does the knowledge base say about sleep problems?", "which protocols use point LI4?", "what is there for knee pain after sport?".

**Goal:** a caretaker describes what they are looking for, in their own words and in Hebrew or English, and gets **links to the relevant problems, protocols, points and point groups**, found by an AI that has the whole knowledge base (including the PDFs) available.

---

## 2. Your selections

| Question | Your choice | What it means |
|---|---|---|
| What does a search return? | **Links first, AI-written text later** | Phase B returns ranked links to your own content. A short AI-written answer (with sources) is added in Phase C, after search quality is proven. |
| Which AI provider? | **Google Vertex AI** | Embeddings (to understand meaning) and Gemini (to read PDFs, later to write answers), inside your existing Google Cloud projects and billing. No new vendor. |
| PDFs in the first AI version? | **Yes, from the start** | PDFs are read by Gemini when indexed, which copes with Hebrew text direction and scanned pages. A short check on a few real files is the first build step. |
| Languages | **Multilingual by design** | Hebrew and English today (PDFs Hebrew-only for now, English PDFs planned); more languages later without code changes. See section 6. |

---

## 3. The three phases at a glance

| | Phase A — Browse and plain search | Phase B — Smart search (AI, links only) | Phase C — Written answer with sources |
|---|---|---|---|
| **Caretaker types** | Words ("knee", "LI4", "ברך") | A description in their own words ("pain in the knee after running") | Same as B, or a question ("what can help with sleep problems?") |
| **Gets back** | Entities whose texts contain those words | Entities whose **meaning** matches, including inside PDFs, ranked, each with the passage that matched | A short answer in their language, citing the entities it is based on, **above** the Phase B links |
| **AI involved** | None | Finds and ranks only; writes nothing | Writes a summary from the found content only |
| **Medical risk** | None (your content only) | Very low (your content only) | Some (AI wording) — mitigated by sources and a disclaimer |
| **Value on its own** | Caretakers can finally browse and learn | Finds things they could not name | Saves reading several pages |

Each phase is a separate release; each builds on the previous one.

---

## 4. Phase A — Browse and plain search

### What the caretaker sees
A new sidebar item **"Knowledge"** (for every caretaker), opening a page with:

```
┌──────────────────────────────────────────────────────────────┐
│ Knowledge                                                    │
│ [ Search problems, protocols, points…            ] (🔍)      │
│ Browse:  Problems · Protocols · Points · Point groups         │
├──────────────────────────────────────────────────────────────┤
│ Results for "knee"                                           │
│                                                              │
│ PROBLEMS (2)                                                 │
│   Knee osteoarthritis — "…chronic pain in the knee joint…"   │
│   Sports injuries — "…knee and ankle sprains…"               │
│ PROTOCOLS (1)                                                │
│   Lower-limb joints — "…for knee and hip pain…"              │
│ POINTS (3)                                                   │
│   ST35 · Dubi — "…below the knee cap…"                       │
│   …                                                          │
└──────────────────────────────────────────────────────────────┘
```

- **Search** finds the typed words in names, codes, descriptions, long texts and rationales, in Hebrew and English. Matches are grouped by type, with the matching sentence shown. 
- **Browse** lists each type alphabetically (with a filter), for learning without a specific question.

### The entity pages (read-only)
Clicking any result opens a read-only page — the heart of the feature, reused by B and C:

- **Problem page:** name, description, the protocol(s) used for it, the measures used to follow progress, documents.
- **Protocol page:** name, description, rationale, directive; its **points** (with codes, as a list and, where useful, on the body model); the problems it is used for; documents.
- **Point page:** code and name, description, long text (line by line, as in a treatment), its point group, the protocols that use it, documents.
- **Point group page:** name, description, its points.

Every related item is a link, so a caretaker can walk: *problem → protocol → point → other protocols with that point*.

### Limits of Phase A
It matches **words**, not meaning: "knee" finds "knee", but "pain when climbing stairs" finds nothing unless those exact words appear. It does not search inside PDFs (documents can be opened from the pages).

### For admins
Nothing changes; the configuration screens stay as they are. Caretakers can only read; nothing they do changes the knowledge base.

---

## 5. Phase B — Smart search with AI (links only)

### What changes for the caretaker
The same Knowledge page and search box, but the search now understands **meaning**:

```
┌──────────────────────────────────────────────────────────────┐
│ [ pain in the knee after running                  ] (🔍)     │
├──────────────────────────────────────────────────────────────┤
│ Best matches                                                 │
│                                                              │
│ ① PROTOCOL  Lower-limb joints                                │
│    "…indicated for knee pain related to physical effort…"    │
│    Found in: rationale                                       │
│ ② PROBLEM   Sports injuries                                  │
│    "…overuse injuries of the knee in runners…"               │
│    Found in: document "Sports injuries.pdf" (Hebrew document)│
│ ③ POINT     ST36 · Zusanli                                   │
│    "…strengthens the knee, fatigue of the legs…"             │
│ ④ POINT GROUP  Stomach meridian                              │
│    …                                                         │
│                                         [Show more]          │
└──────────────────────────────────────────────────────────────┘
```

- **Free text, any wording, Hebrew or English.** "Can't sleep", "insomnia", "קשיי הירדמות" all find the same content.
- **Searches inside the PDFs too.** A match from a document says so and names it; the PDF opens from the result.
- **Ranked by relevance**, with **why it matched** (the passage and where it was found) so the caretaker can judge at a glance.
- Every result opens the same read-only page from Phase A.
- **Combinations:** because relations are part of what is searched, a question can surface a protocol together with its points ("which points are used together for back pain?" → the protocol, its points).
- The plain word search from Phase A stays available (e.g. for exact codes like "LI4"), and is used automatically if the AI service is unavailable.

### What the AI does — and does not do
It only **finds and orders** your existing content. It does not write sentences, give advice or invent treatments. Everything on screen is text an admin entered or uploaded.

### For admins
- **Automatic updates:** when an admin saves a point/protocol/problem or uploads a document, that item is re-read and re-indexed within about a minute. No manual step.
- Optionally (to decide in the detailed plan): a small admin view showing index status (e.g. "312 items, 48 documents indexed, last update …") and a "re-index all" button.

### Behind the scenes (short)
Each text and each PDF passage is turned into a numeric "meaning fingerprint" (an embedding) and stored in Firestore. A question gets the same treatment, and the closest fingerprints are the results. PDFs are read once, when uploaded, by Gemini.

---

## 6. Multilingual behaviour (all phases)

- **Ask in any supported language, find content in all of them.** A Hebrew question finds English text and the reverse; Phase B does this through meaning, with no translation step.
- **Results are shown in your UI language.** If an item has no text in that language, the other language is shown with a small language label.
- **Documents:** today all PDFs are Hebrew. An English user still finds them, marked "(Hebrew document)". When English versions are uploaded (per-language document links already exist), they are indexed as English automatically and preferred for English users.
- **No duplicates:** if both the Hebrew and English versions of a protocol match, the protocol appears once.
- **Phase C answers** are written in the caretaker's UI language whatever the source language.
- **Adding a language later** (e.g. Arabic) needs no code change: new language texts and documents are indexed with their language.

---

## 7. Phase C — Written answer with sources

### What changes for the caretaker
Above the Phase B links, a short answer box:

```
┌──────────────────────────────────────────────────────────────┐
│ [ what can help with sleep problems?              ] (🔍)     │
├──────────────────────────────────────────────────────────────┤
│ ✦ Summary from the knowledge base                            │
│ For sleep problems the knowledge base describes the          │
│ "Calming" protocol [1], which uses HT7 and SP6 [2][3]. The   │
│ problem page "Insomnia" [4] recommends following progress    │
│ with the sleep-quality measure.                              │
│ [1] Protocol: Calming  [2] Point: HT7  [3] Point: SP6        │
│ [4] Problem: Insomnia                                        │
│ ⓘ Based only on the app's knowledge base. Reference          │
│   material, not a medical decision.                          │
├──────────────────────────────────────────────────────────────┤
│ Best matches  (the Phase B list, as before)                  │
└──────────────────────────────────────────────────────────────┘
```

- Every statement carries a **numbered source**; each source is a link to the entity page.
- The AI may use **only** what the search found; if nothing relevant was found it says so rather than guessing.
- Possibly a feedback button (👍 / 👎) so you can see which answers caretakers find useful.

### Why it comes last
This is the only phase where AI wording appears, so it is added once Phase B is shown to find the right content. It is also the moment to compare Gemini and Claude answer quality on your own test questions.

---

## 8. What stays the same / guardrails

- Caretakers **read only**; the knowledge base is edited only by admins, as today.
- **No patient data** goes to the AI: only the reference content and the caretaker's search text. (Caretakers should be told not to type patient names into the search.)
- **Cost:** reading all PDFs and indexing everything once costs cents; each search costs a fraction of a cent. A per-user limit on searches per minute prevents misuse.
- **Availability:** if the AI service is down, the plain search (Phase A) still works.

---

## 9. Next steps

1. You approve this direction (and decide whether Phase A should be built first or together with B).
2. Short checks:
   - **Region — done 02/10/2026 (staging project, Cloud Shell test calls):** the Vertex AI API is enabled in staging. `gemini-embedding-001` works on the **me-west1** (Tel Aviv) regional endpoint, so embeddings stay in the region. `gemini-2.5-flash` is **not** offered on the me-west1 endpoint (404) but works on the **global** endpoint; Gemini (PDF reading, later Phase C answers) is therefore called through the global endpoint. Production (`apitherapy-c94a6`): Vertex AI API enabled and the embedding test passed (02/10/2026). Newer Gemini versions tested on the global endpoint: the newest that works, **`gemini-3.8-flash`**, is chosen for the build.
   - **Hebrew PDFs — done 02/10/2026 (Google AI Studio, 3 point documents: CV24, BL40, BL18):** good enough; PDFs stay in the first AI version. Hebrew text, codes and numbers are exact and complete; tables and two-column pages come out in the right order. **Issue:** lines that mix Hebrew with Latin or Chinese characters sometimes come out in visual instead of reading order (a period moved to the line start, brackets and colon reversed, e.g. `.CV24, LI4, ST7 - …`). Little effect on meaning-based search; some shown passages will look untidy. **In the build:** ask Gemini for logical reading order and to join lines broken by the layout; compare a newer Flash version on the same files; spot-check 2–3 more documents before the full index. **Re-tested with `gemini-3.8-flash` (02/10/2026): the mixed lines now come out in reading order, and it read one word correctly that 2.5 Flash had misread.** It also transcribes text inside illustrations, which will be indexed as a separate, lower-weight passage.
3. A detailed implementation plan in `docs/Future/` (data model, functions, rules, screens, steps, verification, progress tracker), as for the appointments feature. New packages, Google Cloud settings and index changes are listed there for your approval. **Written 02/10/2026: `docs/Future/Knowledge-Search-Implementation-Plan.md`** (Phases A and B on one branch, one release; Phase C decided later).

## Verification (per phase)
- **A:** words in Hebrew and English find the expected problems, protocols and points; every page opens with its documents and related links; a caretaker cannot edit.
- **B:** a list of about 20 real caretaker questions (Hebrew and English) with the entities you expect; check how many expected entities appear in the top 5; edit a point or upload a PDF and see the change in results within minutes.
- **C:** answers cite only found entities and stay in the UI language; the admin spot-checks the same 20 questions.
