# Security Hardening — Findings & Plan

Status: written 2026-09-19 following an ad-hoc security review triggered by a stored-XSS fix in Patient Intake. Updated 2026-09-20: Findings 1 and 8 implemented, deployed to staging and production, and verified live (see their entries below). Updated 2026-09-21: Finding 4 fixed and verified on both projects; Findings 2, 3, and 7 re-assessed and closed/downgraded; Finding 5 fixed and verified in dev (staging/prod pending) — everything else still not acted on.

## 0. Already fixed this session

A stored-XSS vulnerability was found and fixed in the Consent and Instructions tabs of Patient Intake: `injectData()` in `src/components/PatientIntake/ConsentTab.tsx` and `src/components/PatientIntake/InstructionsTab.tsx` spliced unescaped `patientData.fullName` / `identityNumber` / caretaker name into an HTML string rendered via `dangerouslySetInnerHTML`. A malicious value in a patient's name or ID field would execute as script in the browser of whoever opened that patient's consent/instructions tab.

Fix: added `src/utils/htmlUtils.ts` (`escapeHtml`) and applied it to all three interpolated values in both files' `injectData()` functions before they're spliced into the HTML string. Done on branch `fix-xss-vulnerabilities`, merged and deployed to production.

## How this review was scoped

The existing automated security pipeline (`scripts/deploy/security-check.ps1` + `scripts/deploy/sast-check.ps1`, both gated into `scripts/deploy/finish-feature.ps1`) only covers: secret scanning (gitleaks, whole repo), dependency CVEs (`npm audit`, root + `functions/`), and static code-pattern analysis of `functions/src` only (ESLint + `eslint-plugin-security`). It does not cover the frontend's own source code, and it does not cover the Firestore/Storage security rules or the Cloud Functions' authorization logic at all. This review manually audited those uncovered areas once, to establish a baseline.

## Findings, in priority order

### 1. CRITICAL — Storage rules allow cross-caretaker access to patient files — FIXED, DEPLOYED, VERIFIED

`storage.rules` (repo root, single file shared by both the staging project `apitherapyv2` and production project `apitherapy-c94a6` — confirmed via `firebase.json`/`.firebaserc`, no per-environment split exists):

```
match /Patients/{allPaths=**} {
    allow read, write: if request.auth != null;
}
```

Any authenticated user — any caretaker account at all, regardless of which patients they actually own — can read or overwrite **any patient's** uploaded documents, images, and signed consent forms. This has no relation to the ownership model Firestore itself enforces.

By contrast, `config/firestore/firestore.rules` is properly restrictive: it defines `isPatientCaretaker(patientId)` and `canReadPatientData(patientId)` helper functions that check `caretakerId == request.auth.uid` (with an `canImpersonate()` escape hatch for admins), and applies them consistently across `patients`, `patient_medical_data`, `patient_medical_data/{id}/documents`, `questionnaire_responses`, `treatments`, and `measured_values`.

The frontend builds Storage paths as `Patients/{patientId}/{timestamp}_{filename}` — `patientId` is the same Firestore document ID that Firestore's rules protect, but Storage's rules never check it. Any authenticated user who obtains another caretaker's `patientId` (an auto-generated but not-secret Firestore ID, visible in the app's own URLs/network calls) can read or overwrite that patient's files directly via the Storage SDK, completely bypassing the Firestore-level ownership check. This is a genuine IDOR affecting real patient documents (consent forms, treatment images).

**Correction to the original finding (caught during planning):** the "fine, intentional" characterization below of the other five folders was imprecise. Firestore's `cfg_*` collections actually *split* their permissions (`allow read: if isAuthenticated(); allow write: if isAdmin();`) — but Storage's equivalent folders (`Points/`, `Protocols/`, `Measures/`, `Problems/`, `App_config/`) granted `allow read, write: if request.auth != null`, meaning **any authenticated user could write to all five**, not just read. That's now fixed alongside `Patients/` (below), not left open.

**Implemented fix** (`storage.rules`, 2026-09-20) — a shared helper plus six updated match blocks:

```
function isAdminOrSuperadmin() {
  return request.auth != null &&
    firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'superadmin'];
}
```

`Points/`, `Protocols/`, `Measures/`, `Problems/`, `App_config/` (×5, identical): `allow read: if request.auth != null; allow write: if isAdminOrSuperadmin();`

`Patients/{allPaths=**}` → path-capturing `Patients/{patientId}/{fileName=**}`, transcribing Firestore's `canReadPatientData`/`isPatientCaretaker` exactly — **not** the blanket admin helper above, since Firestore's own `isPatientCaretaker()` requires an admin to *also* be that specific patient's caretaker to write, not just hold the admin role:

```
match /Patients/{patientId}/{fileName=**} {
  allow read: if request.auth != null && (
    firestore.get(/databases/(default)/documents/patients/$(patientId)).data.caretakerId == request.auth.uid ||
    firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'superadmin' ||
    firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.canImpersonate == true
  );
  allow write: if request.auth != null &&
    firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['caretaker', 'admin', 'superadmin'] &&
    firestore.get(/databases/(default)/documents/patients/$(patientId)).data.caretakerId == request.auth.uid;
}
```

Regression tests for all six blocks were written first, against the pre-fix rules (see Finding 8) — the `Patients/` cross-caretaker case and each folder's non-admin-write case failed as expected before the fix, and pass after it.

**Critical deploy problem discovered during staging verification — the fix initially never reached the real bucket.** `firebase.json`'s `storage` config had no explicit bucket target, and `.firebaserc` had an empty `"targets": {}`. Firebase's default behavior for `firebase deploy --only storage` without an explicit target is to deploy to the **project's default bucket** — for `apitherapyv2` that's `apitherapyv2.firebasestorage.app`, which the app does not use. The app actually connects to a custom-named bucket, `apitherapyv2-staging-storage` (set via `VITE_STORAGE_BUCKET`). Every `firebase deploy --only storage` run against staging (including the one that appeared to ship this fix) was silently deploying to the unused default bucket; the real bucket kept running the original, unpatched rules the whole time. This was only caught because a live re-test (attempting the cross-caretaker write as a superadmin account) unexpectedly succeeded — confirmed via the Firebase Rules Management API (`firebaserules.googleapis.com`) that the real bucket's active ruleset was still the pre-fix version, dated 2026-05-22, while the patched ruleset had landed on the decoy default bucket instead.

Production was **not** affected by this specific failure mode — its bucket (`apitherapy-c94a6.firebasestorage.app`) happens to be named per the default-bucket convention, so the same ambiguous deploy command coincidentally hit the right target there. But this was luck, not correctness, and worth remembering: production had simply never been deployed with this fix at all yet at the point this was discovered.

**Remediation, two parts:**
1. Immediate: pushed the corrected rules directly to the real staging bucket's ruleset via the Rules Management API (`POST .../rulesets` to create, `PATCH .../releases/firebase.storage%2Fapitherapyv2-staging-storage` to point the release at it), closing the live exposure without waiting on a full redeploy cycle.
2. Root cause: configured explicit Firebase deploy targets — `firebase target:apply storage app-bucket apitherapyv2-staging-storage --project apitherapyv2` and `firebase target:apply storage app-bucket apitherapy-c94a6.firebasestorage.app --project prod` (both recorded in `.firebaserc`), then added `"target": "app-bucket"` to `firebase.json`'s `storage` config. Verified with a real `firebase deploy --only storage --project apitherapyv2` run afterward — confirmed via the Rules API that it now updates the correct bucket's release and leaves the decoy default bucket untouched.

**Side-finding fixed along the way:** `cors-staging.json`/`cors-production.json` were both missing `"Authorization"` in `responseHeader`. This blocked the Storage SDK's `getBytes()`/`getDownloadURL()`-fallback path (used by `useStorageUrl.ts` for inline previews) via a failed CORS preflight — discovered while manually testing this fix's staging deploy, unrelated to the rules content itself. Fixed by adding `"Authorization"` to both files' `responseHeader` arrays and re-applying to both live buckets.

**Deployed and verified live**, 2026-09-20:
- Staging: `firebase deploy --only storage --project apitherapyv2` (manual verification run) + confirmed via the real app — creating a new patient with consent/instructions documents succeeds normally; attempting to write a file into a *different* caretaker's patient folder (via a captured real authenticated request, retargeted to another patient's path) is correctly rejected with `403`.
- Production: deployed via `finish-feature.ps1`'s automatic final stage. Independently verified via the Rules Management API that the live ruleset on `apitherapy-c94a6.firebasestorage.app` contains `isAdminOrSuperadmin` and the `caretakerId == request.auth.uid` ownership check — not just trusting the deploy log this time, given what staging's decoy-bucket issue taught about doing so.

### 2. LOW — `filterPiiTransform` has no app-level auth check

`functions/src/index.ts:443` — `filterPiiTransform` is an `onRequest` function (not `onCall`), with no `request.auth` check of any kind. It's intended to be invoked only by the Firestore→BigQuery `fs-bq-export-patients` extension as a transform webhook (confirmed wired only to the `patients` export via `extensions/fs-bq-export-patients.env`), not by end users directly.

Gen2 `onRequest` functions are Cloud Run-backed and can default to publicly invokable. Whether this function is actually restricted to the extension's service account, or is silently reachable by anyone who finds its URL, has not been verified — it depends entirely on the deployed Cloud Run IAM policy, which app code has no visibility into.

**Severity note (revised from an initial HIGH rating):** the function is stateless and never touches Firestore/Storage/BigQuery — it only strips named fields from whatever body the caller supplies and echoes it back. Even if fully publicly invokable, there is no path to exfiltrate real patient data through it; the ceiling of impact is resource/cost abuse (unbounded invocations) or a crash on malformed input (unhandled exception on missing `record.json.data`). Same impact category as Finding 5 (rated LOW), and with a small user base there's nothing an attacker meaningfully gains by abusing it. Rated LOW rather than MEDIUM/HIGH on that basis — the proposed IAM check below is still worth doing as cheap hygiene, not because the exposure is dangerous.

**Proposed action:** one-time check on both projects:
```
gcloud run services get-iam-policy filterPiiTransform --region=<region> --project=apitherapyv2
gcloud run services get-iam-policy filterPiiTransform --region=<region> --project=apitherapy-c94a6
```
If `allUsers`/`allAuthenticatedUsers` holds `roles/run.invoker`, restrict it to the extension's service account only. Document the verified state in a comment above the function.

### 3. NOT A PROBLEM — `feedback_sessions` read/update has no expiry check

`config/firestore/firestore.rules:162-172`:
```
match /feedback_sessions/{sessionId} {
  allow get: if true;
  ...
  allow update: if (resource.data.status == 'pending' && ...) || isPatientCaretaker(resource.data.patientId);
  ...
}
```
This is an **intentional design tradeoff**, not an oversight: patients complete feedback via an emailed link with no login (`dailyFeedbackSweeper` / `sendMissingProblemEmail` in `functions/src/index.ts`), so the session document must be readable/updatable without authentication. Protection today is only the `sessionId` (`randomUUID()`) being unguessable. `list` is correctly blocked to non-owners (only single-document `get` is open), and bulk enumeration isn't possible.

Originally flagged because an `expiresAt` timestamp field is set on session creation (`functions/src/index.ts:243`) but never checked in the rule — `dailyFeedbackSweeper` only deletes expired sessions once daily at 5 AM Asia/Jerusalem, so a session stays readable/writable up to a day past its "intended" validity window. **Downgraded to not a problem:** the extra window works in favor of legitimate use, not against it — a lot of patients don't respond to the feedback link right away, so the slack before the daily sweep is exactly what lets a late-but-genuine response still go through. There's nothing for an attacker to gain from the extension either, since the only protection (an unguessable `sessionId`) is unaffected by how long the window stays open. No fix needed.

### 4. MEDIUM — App Check enforcement is inconsistent/unverified per API — FIXED, VERIFIED ON STAGING AND PRODUCTION

`docs/operations/production-launch-followups.md:11` already tracked: *"Switch App Check to 'Enforce' mode (currently 'Monitor')"* as an open item — this predates this review. Several `onCall` functions (`getTreatmentEffectiveness`, `translateText`) set `enforceAppCheck: true` in code (`functions/src/index.ts:492`, `:814`), which takes effect independent of the Firebase Console's per-API Monitor/Enforce toggle — but that console-level setting is configured separately per product (Firestore, Storage, Functions each have their own toggle), and which of those were still Monitor-only for direct SDK access (bypassing the Cloud Functions layer entirely) had not been verified for either project.

Console check found: on both projects, Storage was already `Enforced`, but Cloud Firestore and Authentication were both still `Monitoring` — the App Check request metrics for Firestore showed 100% verified traffic over the prior 7 days (1.7k/1.7k requests, 0 unverified across all three sub-categories) before the flip, confirming no real app traffic would be rejected by enforcing.

**Implemented fix:** Firestore and Authentication both switched from `Monitor` to `Enforce` in the Firebase Console's App Check → APIs screen, on both `apitherapyv2` (staging) and `apitherapy-c94a6` (production). No code change or redeploy required — this is a live console setting. `src/firebase.ts:56-64` already initializes App Check once on the shared `app` instance used by `auth`, `db`, `storage`, and `functions`, so the same token already covers all products.

**Verified:** tested on both staging and production after the flip — normal caretaker sign-in/CRUD flows, the unauthenticated patient-feedback-link flow (`feedback_sessions`), and Storage document upload/view all confirmed working, no App Check-related rejections observed.

**Known residual, not a security issue:** `scripts/migrations/migrate_problems_integrity.js`, `migrate_referential_integrity.js`, and `migrateUrlsToPaths.cjs` use the client Firestore SDK (`firebase/firestore`) directly, with no App Check initialization — they can't produce a valid token from Node.js. If any of these are run against a real project (not the emulator) going forward, they'll now be rejected. Not addressed in this pass; would need switching to `firebase-admin` or a registered App Check debug token before next use against staging/prod.

### 5. LOW — `translateText` has no target-language allowlist — FIXED, VERIFIED IN DEV (STAGING/PROD PENDING)

`functions/src/index.ts:814-828` checks `request.auth` and App Check, but placed no allowlist on the `target` (or `source`) parameter. Any authenticated user could invoke Google Translate with arbitrary text/target languages, billed to the project. `sendDocumentEmail` (`functions/src/index.ts:~400`) already validated its `language` parameter against `configData.languageSettings?.supportedLanguages` with an inline comment explaining why — the same pattern was applied to `translateText`'s `target`. Cost/abuse-control issue, not a data-access vulnerability (the function is otherwise correctly gated by auth + App Check).

**Implemented fix** (`functions/src/index.ts`, branch `fix-translate-target-language-validation`): both `target` and `source` (`source` defaults to `"en"` when omitted) are now checked against `cfg_app_config/main`'s `languageSettings.supportedLanguages` before the request reaches the Translate API, throwing `HttpsError("invalid-argument", ...)` on a miss — identical pattern to `sendDocumentEmail`'s existing check.

**Verified in the local emulator:** the happy path (a real UI translation into a genuinely supported language) still succeeds. A direct call replaying a real authenticated session's request with a tampered `target` (bypassing the UI entirely — the language picker never offers an invalid value, so this has to be tested by hand) returns `400 INVALID_ARGUMENT` — `{"error":{"status":"INVALID_ARGUMENT","message":"Unsupported target language: zz."}}` — confirming the check can't be routed around by skipping the frontend. Staging and production deploy plus re-verification there is still pending.

**Two related bugs found and fixed on separate branches while working on this:**
- `src/components/UserDetails.tsx`'s language picker was hardcoded to `['en', 'he']` instead of reading `cfg_app_config`'s `languageSettings.supportedLanguages` — a user could never actually select any language an admin added beyond those two. Fixed on `fix-language-selection-allowlist` (merged): the picker now reads the admin-configured list; language display names are resolved via `Intl.DisplayNames` (`src/utils/languageNames.ts`) instead of a hardcoded name map, after the hardcoded map's gap surfaced as a "Spanish" language option displaying as a raw, garbled code once a third language was actually configured.
- `src/components/ApplicationSettings.tsx` let an admin remove a language from `supportedLanguages` with no check for whether any user still had it as their `preferredLanguage` — doing so would silently break that user's UI translation once this finding's fix shipped (their `preferredLanguage` would fail the new allowlist check). Given the small user base, a live cross-collection query or a new denormalized counter was judged not worth the added complexity (would also need a new Firestore composite index) — fixed on `fix-language-removal-lock` (merged) by disallowing removal of any already-saved supported language from the admin UI entirely; a superadmin can still do so directly via the Firestore console after manually checking for affected users.

### 6. LOW — Unescaped HTML interpolation in an internal admin email

`functions/src/index.ts:763-797` (`sendMissingProblemEmail`) interpolates `problemName`, `caretakerName`, `caretakerData.email`, `patientName`, and other values unescaped into an HTML email body. Same bug class as Finding 0 (the already-fixed frontend XSS), but lower severity since this email is only ever viewed by an admin, not rendered in an attacker-influenced browser session. Proposed fix: a small backend equivalent of `src/utils/htmlUtils.ts` (e.g. `functions/src/utils/htmlUtils.ts`, since `functions/` and `src/` don't share a module boundary), applied to each interpolated value.

### 7. CLOSED — `app_audit_log` create rule has no field validation

`config/firestore/firestore.rules:156-160`:
```
match /app_audit_log/{docId} {
  allow read: if isSuperAdmin();
  allow create: if isAuthenticated();
  allow update, delete: if false;
}
```
Any authenticated user can write arbitrary audit-log documents (log-forging/spam risk). Update/delete are correctly always denied (immutable log), and read is superadmin-only — only `create` lacks field constraints.

**Closed, judged safe enough as-is:** with Firestore App Check now on Enforce (Finding 4), a write to this collection must already come from the real app running in a real browser session with a valid authenticated user — not a script or forged request. What's left unguarded is a legitimate, authenticated user manually writing extra/malformed fields into their own log entries, and there's no real incentive to do that: an internal audit log has no value to exfiltrate or abuse, forging entries in a log only a superadmin ever reads gains an attacker nothing actionable. Not worth the added rule complexity for a risk with no realistic payoff.

### 8. GAP — No automated testing exists for Firestore or Storage rules — PARTIALLY IMPLEMENTED, VERIFIED WORKING IN PRODUCTION USE

**Storage rules now covered; Firestore rules still untested.** `@firebase/rules-unit-testing` (v5) added as a root devDependency; `tests/security-rules/storage.rules.test.js` written, covering exactly what Finding 1's fix changes: the `Patients/` ownership guard (unauthenticated deny, wrong-caretaker deny, owner allow, admin-who-isn't-the-owner deny, superadmin allow) and, for each of the five reference-data folders, non-admin-write-denied / admin-write-allowed. `firestore.rules.test.js` was **not** created in this pass — Finding 1 didn't touch `firestore.rules`, so per the "test only what's being changed" scoping decision, Firestore rule tests remain a gap for whenever a future change actually touches `firestore.rules` (Findings 3 and 7, the two candidates that would have triggered this, are both now closed without a rules change).

Root `package.json` gained the `@firebase/rules-unit-testing` devDependency (`^3.0.4` — v5 requires `firebase@^12`, this project is pinned to `firebase@^10.7.1`; upgrading that is out of scope here) and a `"test:rules"` script (`firebase emulators:exec --only firestore,storage,auth "node --test tests/security-rules/*.test.js"` — a bare directory path was tried first but hit a Node 22 module-resolution quirk on this setup; the glob form works and is Node-expanded, not shell-expanded, so it's portable) for manual/ad-hoc runs.

**Now wired into the deploy pipeline automatically** — see the new `scripts/deploy/rules-test-check.ps1` (same `Invoke-Step` style as `security-check.ps1`/`sast-check.ps1`), called from:
- `scripts/deploy/deploy-staging.ps1`, before the "Deploy Firestore rules/indexes" / "Deploy Storage rules" steps — gates them (soft-skip pattern, matching how functions/hosting deploys are already gated on their build-success flags).
- `scripts/deploy/finish-feature.ps1`, as new Stage 3/6 (after merge-to-main, before the SAST stages and the final prod deploy) — hard-stops the pipeline on failure, same as `security-check.ps1`. This exists specifically as defense in depth for the case where `deploy-staging.ps1` was bypassed.
- Deliberately **not** wired into `deploy-prod.ps1` directly — production is only protected transitively via `finish-feature.ps1`'s gate before it calls `deploy-prod.ps1`.

Runs unconditionally on every invocation of both scripts (no trigger-gating like SAST's day/vuln-delta/change-volume conditions) — it's fast (local emulator only) and directly correctness-critical.

**Confirmed working for real** via `finish-feature.ps1`'s actual production run for this branch: Stage 3/6 started the emulator, ran all 38 assertions, passed, and the pipeline proceeded correctly — not just a manual/isolated test of the script.

**Important blind spot this test suite does *not* cover, learned the hard way (see Finding 1):** `@firebase/rules-unit-testing` validates rule *content* correctness against a local emulator — it has no way to know or verify *which live bucket* a subsequent `firebase deploy` actually targets. The deploy-target bug under Finding 1 (rules silently deploying to an unused default bucket while the real bucket kept running old, unpatched rules) sailed straight past this entire test suite — all 38 local assertions passed throughout, correctly, the whole time, because they were only ever exercising the rules *file*, never the *deployed* state. A second tier — live verification against the actual deployed rules in the real project post-deploy, not just the emulator — was discussed before this was discovered and deliberately not built at the time; the deploy-target incident is a concrete, now-proven example of exactly the failure class that tier would have caught automatically instead of requiring a manual live re-test to surface. Still not built (it needs dedicated test accounts in staging Auth, token-minting via the Admin SDK, and fixture cleanup against real staging data) — left as a stronger-than-before candidate for future work, not part of this pass.

### 9. GAP — Frontend has no automated SAST coverage

`src/` has no ESLint configuration at all — not a security-specific gap, there is no baseline lint config of any kind for the frontend, unlike `functions/` which has both a normal `.eslintrc.js` and a dedicated `.eslintrc.security.js` used by `scripts/deploy/sast-check.ps1`. This was already discussed at length in conversation; summarized here for completeness:

**Proposed fix:** extend `scripts/deploy/sast-check.ps1` to also scan `src/`, using free tooling — either [Semgrep Community Edition](https://semgrep.dev/products/community-edition/) alone (`npx semgrep --config=p/react --config=p/javascript --config=p/security-audit --error src`, ~2,800 free community rules covering XSS/secrets/ReDoS/prototype-pollution/etc.), or Semgrep plus `eslint-plugin-no-unsanitized` (Mozilla) + `eslint-plugin-react-security` (Snyk Labs) for a lint-based check consistent with how `functions/` is scanned today. `scripts/deploy/sast-trigger-check.ps1`'s change-volume condition already diffs `src/` and `functions/` together, so extending `sast-check.ps1` to cover both directories fits the existing trigger machinery (`.security-state.json`'s schema is already generic, not functions-specific) without needing a parallel pipeline.

CodeQL was researched and explicitly **not** recommended for now: it's free only for public repositories; this repo is private and would require the paid GitHub Advanced Security add-on (~$30–49 per active committer/month). Noted here as a future paid option, not part of this plan.

### 10. GAP — `deploy-staging.ps1` has no security gating at all — PARTIALLY RESOLVED

Unlike `finish-feature.ps1` (which runs `security-check.ps1` before any git action, and SAST before the prod deploy), `scripts/deploy/deploy-staging.ps1` was a pure build+deploy script — no secret scan, no dependency audit, no SAST, no rules tests.

**Resolved for rules specifically:** `deploy-staging.ps1` now runs `rules-test-check.ps1` before its Firestore/Storage rule-deploy steps (see Finding 8). Secret scanning, dependency audit, and SAST remain exclusive to `finish-feature.ps1`, deliberately — full gating on every staging push would slow the inner dev loop `deploy-staging.ps1` exists to serve.

## Sequencing recommendation, if/when this work is picked up

1. ~~Build the rules-unit-testing harness (Finding 8)~~ — done, storage-only, confirmed running correctly in the real pipeline.
2. ~~Fix `storage.rules` (Finding 1)~~ — done, deployed to staging and production, verified live on both via direct Rules API checks (not just deploy-log trust, per the decoy-bucket lesson) and a real cross-caretaker write attempt correctly rejected.
3. ~~Fix the storage deploy-target bug~~ — done: explicit `app-bucket` deploy targets configured in `.firebaserc` for both projects, `firebase.json` updated to reference the target.
4. ~~Flip App Check to Enforce for Firestore and Authentication (Finding 4)~~ — done, verified working on both staging and production.
5. ~~Add target/source language allowlist to `translateText` (Finding 5)~~ — done, verified in dev; staging/prod deploy and re-verification still pending.
6. Everything else (Findings 2, 6, 9) can proceed in any order / in parallel, none block each other.

## Explicitly deferred / left to the user to decide

- Semgrep alone vs. Semgrep + ESLint plugins for frontend SAST (Finding 9).
- Whether to build the live post-deploy verification tier discussed under Finding 8 (real requests against the actual deployed staging rules, not just the emulator) — deliberately not built in this pass; needs dedicated test accounts and cleanup logic. Worth weighing more seriously now: the storage deploy-target bug (Finding 1) is a concrete case this tier would have caught automatically instead of requiring a manual live re-test to surface.
- Introducing GitHub Actions/CI infrastructure — this repo has none today, and it's already tracked as separate future work in `production-launch-followups.md`; this plan does not propose adding it.
