# Security Hardening — Findings & Plan

Status: written 2026-09-19 following an ad-hoc security review triggered by a stored-XSS fix in Patient Intake. Updated 2026-09-20: Findings 1 and 8 implemented (not yet deployed — see their entries below); everything else still not acted on.

## 0. Already fixed this session

A stored-XSS vulnerability was found and fixed in the Consent and Instructions tabs of Patient Intake: `injectData()` in `src/components/PatientIntake/ConsentTab.tsx` and `src/components/PatientIntake/InstructionsTab.tsx` spliced unescaped `patientData.fullName` / `identityNumber` / caretaker name into an HTML string rendered via `dangerouslySetInnerHTML`. A malicious value in a patient's name or ID field would execute as script in the browser of whoever opened that patient's consent/instructions tab.

Fix: added `src/utils/htmlUtils.ts` (`escapeHtml`) and applied it to all three interpolated values in both files' `injectData()` functions before they're spliced into the HTML string. Done on branch `fix-xss-vulnerabilities` — **not yet merged/deployed**; still needs staging verification and a `finish-feature.ps1` run.

## How this review was scoped

The existing automated security pipeline (`scripts/deploy/security-check.ps1` + `scripts/deploy/sast-check.ps1`, both gated into `scripts/deploy/finish-feature.ps1`) only covers: secret scanning (gitleaks, whole repo), dependency CVEs (`npm audit`, root + `functions/`), and static code-pattern analysis of `functions/src` only (ESLint + `eslint-plugin-security`). It does not cover the frontend's own source code, and it does not cover the Firestore/Storage security rules or the Cloud Functions' authorization logic at all. This review manually audited those uncovered areas once, to establish a baseline.

## Findings, in priority order

### 1. CRITICAL — Storage rules allow cross-caretaker access to patient files — IMPLEMENTED (not yet deployed)

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

Regression tests for all six blocks were written first, against the pre-fix rules (see Finding 8) — the `Patients/` cross-caretaker case and each folder's non-admin-write case failed as expected before the fix, and pass after it. **Not yet deployed** — needs a staging verification pass, then `finish-feature.ps1`, per standing no-deploy-without-explicit-instruction rule.

### 2. HIGH — `filterPiiTransform` has no app-level auth check

`functions/src/index.ts:443` — `filterPiiTransform` is an `onRequest` function (not `onCall`), with no `request.auth` check of any kind. It's intended to be invoked only by the Firestore→BigQuery `fs-bq-export-patients` extension as a transform webhook (confirmed wired only to the `patients` export via `extensions/fs-bq-export-patients.env`), not by end users directly.

Gen2 `onRequest` functions are Cloud Run-backed and can default to publicly invokable. Whether this function is actually restricted to the extension's service account, or is silently reachable by anyone who finds its URL, has not been verified — it depends entirely on the deployed Cloud Run IAM policy, which app code has no visibility into.

**Proposed action:** one-time check on both projects:
```
gcloud run services get-iam-policy filterPiiTransform --region=<region> --project=apitherapyv2
gcloud run services get-iam-policy filterPiiTransform --region=<region> --project=apitherapy-c94a6
```
If `allUsers`/`allAuthenticatedUsers` holds `roles/run.invoker`, restrict it to the extension's service account only. Document the verified state in a comment above the function.

### 3. MEDIUM — `feedback_sessions` read/update has no expiry check

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

The gap: an `expiresAt` timestamp field is always set on session creation (`functions/src/index.ts:243`) and `dailyFeedbackSweeper` deletes expired sessions once daily at 5 AM Asia/Jerusalem — but the Firestore rule never checks `expiresAt`, so a session remains readable/writable for however long it takes until the next daily sweep, not just its intended validity window.

**Proposed fix:** `allow get: if resource.data.expiresAt > request.time;` — no null-guard needed since the field is always set on create. Low-risk, cheap to add alongside the rules-testing work either fix requires anyway.

### 4. MEDIUM — App Check enforcement is inconsistent/unverified per API

`docs/operations/production-launch-followups.md:11` already tracks: *"Switch App Check to 'Enforce' mode (currently 'Monitor')"* as an open item — this predates this review. Several `onCall` functions (`getTreatmentEffectiveness`, `translateText`) set `enforceAppCheck: true` in code (`functions/src/index.ts:492`, `:814`), which takes effect independent of the Firebase Console's per-API Monitor/Enforce toggle — but that console-level setting is configured separately per product (Firestore, Storage, Functions each have their own toggle), and which of those are still Monitor-only for direct SDK access (bypassing the Cloud Functions layer entirely) has not been verified for either project.

**Proposed action:** one-time research task — check Firebase Console → App Check → APIs for both `apitherapyv2` and `apitherapy-c94a6`, record Monitor/Enforce state per product, then decide whether/when to flip to Enforce. Recommend keeping ownership of the actual flip with the existing tracked item in `production-launch-followups.md` rather than duplicating it here.

### 5. LOW — `translateText` has no target-language allowlist

`functions/src/index.ts:814-828` checks `request.auth` and App Check, but places no allowlist on the `target` (or `source`) parameter. Any authenticated user can invoke Google Translate with arbitrary text/target languages, billed to the project. `sendDocumentEmail` (`functions/src/index.ts:~400`) already validates its `language` parameter against `configData.languageSettings?.supportedLanguages` with an inline comment explaining why — the same pattern should be applied to `translateText`'s `target`. Cost/abuse-control issue, not a data-access vulnerability.

### 6. LOW — Unescaped HTML interpolation in an internal admin email

`functions/src/index.ts:763-797` (`sendMissingProblemEmail`) interpolates `problemName`, `caretakerName`, `caretakerData.email`, `patientName`, and other values unescaped into an HTML email body. Same bug class as Finding 0 (the already-fixed frontend XSS), but lower severity since this email is only ever viewed by an admin, not rendered in an attacker-influenced browser session. Proposed fix: a small backend equivalent of `src/utils/htmlUtils.ts` (e.g. `functions/src/utils/htmlUtils.ts`, since `functions/` and `src/` don't share a module boundary), applied to each interpolated value.

### 7. LOW — `app_audit_log` create rule has no field validation

`config/firestore/firestore.rules:156-160`:
```
match /app_audit_log/{docId} {
  allow read: if isSuperAdmin();
  allow create: if isAuthenticated();
  allow update, delete: if false;
}
```
Any authenticated user can write arbitrary audit-log documents (log-forging/spam risk). Update/delete are correctly always denied (immutable log), and read is superadmin-only — only `create` lacks field constraints. Proposed fix: add a `request.resource.data.keys().hasOnly([...])` constraint matching whatever fields the actual audit-logging call site writes.

### 8. GAP — No automated testing exists for Firestore or Storage rules — PARTIALLY IMPLEMENTED

**Storage rules now covered; Firestore rules still untested.** `@firebase/rules-unit-testing` (v5) added as a root devDependency; `tests/security-rules/storage.rules.test.js` written, covering exactly what Finding 1's fix changes: the `Patients/` ownership guard (unauthenticated deny, wrong-caretaker deny, owner allow, admin-who-isn't-the-owner deny, superadmin allow) and, for each of the five reference-data folders, non-admin-write-denied / admin-write-allowed. `firestore.rules.test.js` was **not** created in this pass — Finding 1 didn't touch `firestore.rules`, so per the "test only what's being changed" scoping decision, Firestore rule tests remain a gap for whenever Findings 3 or 7 (which do touch `firestore.rules`) are picked up.

Root `package.json` gained the `@firebase/rules-unit-testing` devDependency (`^3.0.4` — v5 requires `firebase@^12`, this project is pinned to `firebase@^10.7.1`; upgrading that is out of scope here) and a `"test:rules"` script (`firebase emulators:exec --only firestore,storage,auth "node --test tests/security-rules/*.test.js"` — a bare directory path was tried first but hit a Node 22 module-resolution quirk on this setup; the glob form works and is Node-expanded, not shell-expanded, so it's portable) for manual/ad-hoc runs.

**Now wired into the deploy pipeline automatically** — see the new `scripts/deploy/rules-test-check.ps1` (same `Invoke-Step` style as `security-check.ps1`/`sast-check.ps1`), called from:
- `scripts/deploy/deploy-staging.ps1`, before the "Deploy Firestore rules/indexes" / "Deploy Storage rules" steps — gates them (soft-skip pattern, matching how functions/hosting deploys are already gated on their build-success flags).
- `scripts/deploy/finish-feature.ps1`, as new Stage 3/6 (after merge-to-main, before the SAST stages and the final prod deploy) — hard-stops the pipeline on failure, same as `security-check.ps1`. This exists specifically as defense in depth for the case where `deploy-staging.ps1` was bypassed.
- Deliberately **not** wired into `deploy-prod.ps1` directly — production is only protected transitively via `finish-feature.ps1`'s gate before it calls `deploy-prod.ps1`.

Runs unconditionally on every invocation of both scripts (no trigger-gating like SAST's day/vuln-delta/change-volume conditions) — it's fast (local emulator only) and directly correctness-critical.

A second tier — live verification against the *actual deployed* rules in the real staging project post-deploy (not just the emulator) — was discussed and deliberately **not built**: it needs different infrastructure entirely (`@firebase/rules-unit-testing` is emulator-only; live verification would need dedicated test accounts in staging Auth, token-minting via the Admin SDK, and fixture cleanup against real staging data). Left as a possible future addition, not part of this pass.

### 9. GAP — Frontend has no automated SAST coverage

`src/` has no ESLint configuration at all — not a security-specific gap, there is no baseline lint config of any kind for the frontend, unlike `functions/` which has both a normal `.eslintrc.js` and a dedicated `.eslintrc.security.js` used by `scripts/deploy/sast-check.ps1`. This was already discussed at length in conversation; summarized here for completeness:

**Proposed fix:** extend `scripts/deploy/sast-check.ps1` to also scan `src/`, using free tooling — either [Semgrep Community Edition](https://semgrep.dev/products/community-edition/) alone (`npx semgrep --config=p/react --config=p/javascript --config=p/security-audit --error src`, ~2,800 free community rules covering XSS/secrets/ReDoS/prototype-pollution/etc.), or Semgrep plus `eslint-plugin-no-unsanitized` (Mozilla) + `eslint-plugin-react-security` (Snyk Labs) for a lint-based check consistent with how `functions/` is scanned today. `scripts/deploy/sast-trigger-check.ps1`'s change-volume condition already diffs `src/` and `functions/` together, so extending `sast-check.ps1` to cover both directories fits the existing trigger machinery (`.security-state.json`'s schema is already generic, not functions-specific) without needing a parallel pipeline.

CodeQL was researched and explicitly **not** recommended for now: it's free only for public repositories; this repo is private and would require the paid GitHub Advanced Security add-on (~$30–49 per active committer/month). Noted here as a future paid option, not part of this plan.

### 10. GAP — `deploy-staging.ps1` has no security gating at all — PARTIALLY RESOLVED

Unlike `finish-feature.ps1` (which runs `security-check.ps1` before any git action, and SAST before the prod deploy), `scripts/deploy/deploy-staging.ps1` was a pure build+deploy script — no secret scan, no dependency audit, no SAST, no rules tests.

**Resolved for rules specifically:** `deploy-staging.ps1` now runs `rules-test-check.ps1` before its Firestore/Storage rule-deploy steps (see Finding 8). Secret scanning, dependency audit, and SAST remain exclusive to `finish-feature.ps1`, deliberately — full gating on every staging push would slow the inner dev loop `deploy-staging.ps1` exists to serve.

## Sequencing recommendation, if/when this work is picked up

1. ~~Build the rules-unit-testing harness (Finding 8)~~ — done, storage-only.
2. ~~Fix `storage.rules` (Finding 1)~~ — done, implemented against the new tests. **Still needs staging verification and a `finish-feature.ps1` run before it's actually live anywhere.**
3. Everything else (Findings 2, 3, 4, 5, 6, 7, 9) can proceed in any order / in parallel, none block each other. Note: picking up Finding 3 or 7 should also add `firestore.rules.test.js` (the Firestore half of Finding 8's original scope, not built in this pass).

## Explicitly deferred / left to the user to decide

- Whether to bundle the `feedback_sessions.expiresAt` fix (Finding 3) with the storage.rules work or defer it.
- Whether to fold the App Check enforcement flip (Finding 4) into this effort or leave it fully owned by the existing tracked item in `production-launch-followups.md`.
- Semgrep alone vs. Semgrep + ESLint plugins for frontend SAST (Finding 9).
- Whether to build the live post-deploy verification tier discussed under Finding 8 (real requests against the actual deployed staging rules, not just the emulator) — deliberately not built in this pass; needs dedicated test accounts and cleanup logic.
- Introducing GitHub Actions/CI infrastructure — this repo has none today, and it's already tracked as separate future work in `production-launch-followups.md`; this plan does not propose adding it.
