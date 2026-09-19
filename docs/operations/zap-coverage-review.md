# OWASP ZAP: Coverage Review Before Active Scanning

Discovery coverage first, active attacking later. ZAP's active scan can only attack requests it actually saw during passive/spider crawling — it has no knowledge of app functionality it never observed. This runbook covers discovery and coverage measurement only. Active scanning (and its data/email/cost risks against staging's production-synced patient data) is a separate, later step, not covered here.

Target environment: staging (`apitherapyv2`), never production. Confirm the exact staging URL before starting — default Firebase Hosting pattern is `https://apitherapyv2.web.app`, but a custom domain may be configured; check the Firebase console or a `deploy-staging.ps1` run if unsure.

## Section 1 — Install ZAP and run it for maximum coverage

1. **Install**: download the Windows installer from `https://www.zaproxy.org/download/` and run it. Current installers are self-contained (no separate Java install needed). Launch ZAP from the Start Menu or desktop icon afterward.
2. **Passive scanning needs no separate step.** It runs automatically and continuously on any traffic that flows through ZAP's proxy — nothing to start or configure.
3. **Manual pass (do this first — it's what actually gets coverage on a login-gated SPA)**:
   - Click **Manual Explore** in the ZAP toolbar, enter the staging URL, and launch. This opens a ZAP-proxied browser with no manual proxy configuration needed.
   - Log in with a staging caretaker account and deliberately click through **every** screen, tab, and modal at least once:
     - All Patient Intake tabs: Session Opening, Consent, Instructions, Documents.
     - Treatment Execution.
     - Every Admin screen: Points, Protocols, Measures, Problems, ProtocolAdmin, ApplicationSettings.
     - Data Analysis / Treatment Effectiveness.
     - Modal-gated actions: signature pad expand, "Send to Patient" buttons, document viewers.
   - This step matters because ZAP's automated crawler can't reliably reach flows that only appear once specific data already exists (e.g. a "re-sign" button that only shows after a consent is already on file).
4. **Automated crawl (do this second, to fill gaps)**:
   - Tools menu → **AJAX Spider** (current ZAP versions may label this **Client Spider** instead — same purpose, use whichever is present in your installed version).
   - Target URL should already be pre-filled from step 3. Pick a browser (Chrome or Firefox), set a reasonable crawl depth/duration, click Start Scan.
   - Run this in the *same* browser session right after your manual login (step 3), so session cookies carry over — simpler than configuring a separate ZAP Authentication/Session context for a one-off review.
5. **Where results live**: after both passes, check ZAP's **Sites tree** (left panel — discovered URL hierarchy) and **History tab** (every individual request made). This is the raw material for Section 3 below.

## Section 2 — Ask Claude to generate the ground-truth app inventory

This is the "expected" list to diff ZAP's findings against — everything the app can actually do, independent of what any scan happened to find.

**Trigger phrase** (ask this in a Claude Code session with this repo open):
> "Generate the full inventory of the app's screens, actions, and server calls, per Section 2 of docs/operations/zap-coverage-review.md."

**What Claude will produce**: a markdown checklist (save as `docs/operations/app-functional-inventory.md`) listing:
- Every route/major screen under `src/App.tsx` and `src/components/`.
- Every distinct server-call surface: the Cloud Functions in `functions/src/index.ts` (`sendDocumentEmail`, `filterPiiTransform`, `getTreatmentEffectiveness`, `sendMissingProblemEmail`, `translateText`), plus the direct Firestore/Storage collection paths the frontend touches (found by grepping for `collection(`, `doc(`, and Storage `ref(` calls).

**Known limitation to expect**: Firestore/Storage SDK calls run over a shared gRPC/WebChannel connection, not distinct REST URLs — ZAP's Sites tree will likely show them as one or a few generic Firestore/Storage endpoints, not one row per collection. The Section 3 diff will be a clean 1:1 URL match for page routes and Cloud Functions, but not for individual Firestore/Storage operations.

This inventory is a living document — regenerate/update it when screens or Cloud Functions are added, not just once.

## Section 3 — Hand ZAP's results to Claude for the coverage review

1. Once both discovery passes in Section 1 are done, export from ZAP:
   - Right-click the root node in the Sites tree → **Export URLs** (plain list), or
   - Report menu → **Generate Report**, choosing a JSON export.
   - Either is easier for Claude to parse than an HTML report — prefer plain URL list or JSON.
2. Save the exported file into the project's scratchpad directory, or note its path.
3. **Trigger phrase**:
   > "Compare this ZAP export against the app inventory and tell me the coverage gap."
4. **What Claude will do**: read both files, produce a matched-vs-missing checklist, and give an approximate coverage percentage.
5. **Expect iteration**: a first pass is unlikely to hit full coverage. Manually browse whatever the gap review flags as missing, re-run the AJAX/Client Spider if useful, re-export, and re-diff. Two or three rounds is normal before coverage is high enough to trust an active scan's results.
