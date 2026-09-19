# Security Hardening — Findings & Plan

Status: **findings recorded, not yet implemented.** Written 2026-09-19 following an ad-hoc security review triggered by a stored-XSS fix in Patient Intake. Nothing in this document has been acted on except item 0 below.

## 0. Already fixed this session

A stored-XSS vulnerability was found and fixed in the Consent and Instructions tabs of Patient Intake: `injectData()` in `src/components/PatientIntake/ConsentTab.tsx` and `src/components/PatientIntake/InstructionsTab.tsx` spliced unescaped `patientData.fullName` / `identityNumber` / caretaker name into an HTML string rendered via `dangerouslySetInnerHTML`. A malicious value in a patient's name or ID field would execute as script in the browser of whoever opened that patient's consent/instructions tab.

Fix: added `src/utils/htmlUtils.ts` (`escapeHtml`) and applied it to all three interpolated values in both files' `injectData()` functions before they're spliced into the HTML string. Done on branch `fix-xss-vulnerabilities` — **not yet merged/deployed**; still needs staging verification and a `finish-feature.ps1` run.

## How this review was scoped

The existing automated security pipeline (`scripts/deploy/security-check.ps1` + `scripts/deploy/sast-check.ps1`, both gated into `scripts/deploy/finish-feature.ps1`) only covers: secret scanning (gitleaks, whole repo), dependency CVEs (`npm audit`, root + `functions/`), and static code-pattern analysis of `functions/src` only (ESLint + `eslint-plugin-security`). It does not cover the frontend's own source code, and it does not cover the Firestore/Storage security rules or the Cloud Functions' authorization logic at all. This review manually audited those uncovered areas once, to establish a baseline.

## Findings, in priority order

### 1. CRITICAL — Storage rules allow cross-caretaker access to patient files

`storage.rules` (repo root, single file shared by both the staging project `apitherapyv2` and production project `apitherapy-c94a6` — confirmed via `firebase.json`/`.firebaserc`, no per-environment split exists):

```
match /Patients/{allPaths=**} {
    allow read, write: if request.auth != null;
}
```

Any authenticated user — any caretaker account at all, regardless of which patients they actually own — can read or overwrite **any patient's** uploaded documents, images, and signed consent forms. This has no relation to the ownership model Firestore itself enforces.

By contrast, `config/firestore/firestore.rules` is properly restrictive: it defines `isPatientCaretaker(patientId)` and `canReadPatientData(patientId)` helper functions that check `caretakerId == request.auth.uid` (with an `canImpersonate()` escape hatch for admins), and applies them consistently across `patients`, `patient_medical_data`, `patient_medical_data/{id}/documents`, `questionnaire_responses`, `treatments`, and `measured_values`.

The frontend builds Storage paths as `Patients/{patientId}/{timestamp}_{filename}` — `patientId` is the same Firestore document ID that Firestore's rules protect, but Storage's rules never check it. Any authenticated user who obtains another caretaker's `patientId` (an auto-generated but not-secret Firestore ID, visible in the app's own URLs/network calls) can read or overwrite that patient's files directly via the Storage SDK, completely bypassing the Firestore-level ownership check. This is a genuine IDOR affecting real patient documents (consent forms, treatment images).

Non-`Patients/` paths (`Points/`, `Protocols/`, `Measures/`, `Problems/`, `App_config/`) being open to any authenticated user is fine — it mirrors Firestore's intentionally-open `cfg_*` collections for shared reference data. Only the `Patients/{allPaths=**}` block needs tightening.

**Proposed fix:** replace the blanket rule with a path-capturing rule that mirrors `isPatientCaretaker`/`canReadPatientData` via Storage Rules' cross-service `firestore.get()`, e.g.:

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

This must transcribe the existing Firestore helper semantics exactly, not invent new rules. Should not be deployed without a regression test in place first (see Finding 8) — write the test against the local emulator, confirm cross-service `firestore.get()` behaves as expected there, then deploy to staging and manually verify cross-caretaker access now fails, before merging to main / deploying to prod.

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

### 8. GAP — No automated testing exists for Firestore or Storage rules

No `@firebase/rules-unit-testing` dependency anywhere in the repo, no rules test files. Every rules change today (including the Finding 1 fix above) ships with zero regression coverage — a future edit could silently reopen the exact IDOR being fixed here, and nothing would catch it.

**Proposed fix:** add `@firebase/rules-unit-testing` as a root devDependency; new `tests/security-rules/` directory with `firestore.rules.test.js` and `storage.rules.test.js`, run via the emulator suite already declared in `firebase.json` (`firestore`/`storage`/`auth`, with `singleProjectMode: true` already set, which cross-service rules like the Finding 1 fix require). No new JS test framework is needed — Node's built-in `node --test` is sufficient and avoids pulling in Jest/Vitest just for this. Suggested command: `firebase emulators:exec --only firestore,storage,auth "node --test tests/security-rules"`, wired as a new root `package.json` script (`"test:rules"`).

Minimum test cases to seed: caretaker A cannot read/write caretaker B's `patients`/`patient_medical_data`/Storage docs; the owning caretaker can; an admin/superadmin can; an unauthenticated caller cannot; `feedback_sessions` unauthenticated `get` still succeeds pre-expiry and fails post-expiry once Finding 3 is fixed.

This should be built **before** the Finding 1 storage.rules fix, so that fix ships with a test, not after.

### 9. GAP — Frontend has no automated SAST coverage

`src/` has no ESLint configuration at all — not a security-specific gap, there is no baseline lint config of any kind for the frontend, unlike `functions/` which has both a normal `.eslintrc.js` and a dedicated `.eslintrc.security.js` used by `scripts/deploy/sast-check.ps1`. This was already discussed at length in conversation; summarized here for completeness:

**Proposed fix:** extend `scripts/deploy/sast-check.ps1` to also scan `src/`, using free tooling — either [Semgrep Community Edition](https://semgrep.dev/products/community-edition/) alone (`npx semgrep --config=p/react --config=p/javascript --config=p/security-audit --error src`, ~2,800 free community rules covering XSS/secrets/ReDoS/prototype-pollution/etc.), or Semgrep plus `eslint-plugin-no-unsanitized` (Mozilla) + `eslint-plugin-react-security` (Snyk Labs) for a lint-based check consistent with how `functions/` is scanned today. `scripts/deploy/sast-trigger-check.ps1`'s change-volume condition already diffs `src/` and `functions/` together, so extending `sast-check.ps1` to cover both directories fits the existing trigger machinery (`.security-state.json`'s schema is already generic, not functions-specific) without needing a parallel pipeline.

CodeQL was researched and explicitly **not** recommended for now: it's free only for public repositories; this repo is private and would require the paid GitHub Advanced Security add-on (~$30–49 per active committer/month). Noted here as a future paid option, not part of this plan.

### 10. GAP — `deploy-staging.ps1` has no security gating at all

Unlike `finish-feature.ps1` (which runs `security-check.ps1` before any git action, and SAST before the prod deploy), `scripts/deploy/deploy-staging.ps1` is a pure build+deploy script — no secret scan, no dependency audit, no SAST, no rules tests — despite deploying the same `storage.rules`/`firestore.rules` files that protect production-equivalent data structures (staging is synced from a production-like source).

**Proposed action (open question, no strong recommendation forced):** at minimum, add the new rules-regression test (Finding 8) to `deploy-staging.ps1` immediately before its "Deploy Firestore rules" / "Deploy Storage rules" steps — it's fast (emulator-based) and would catch a rules regression before it reaches even the staging project. Full gating (secrets/npm audit/SAST) would slow the inner dev loop `deploy-staging.ps1` exists to serve, and is not recommended.

## Sequencing recommendation, if/when this work is picked up

1. Build the rules-unit-testing harness (Finding 8) — before touching any rules file.
2. Fix `storage.rules` (Finding 1) with the new tests passing locally against the emulator, then verify in staging, then merge/deploy via `finish-feature.ps1`.
3. Everything else (Findings 2, 3, 4, 5, 6, 7, 9, 10) can proceed in any order / in parallel, none block each other.

## Explicitly deferred / left to the user to decide

- Whether to bundle the `feedback_sessions.expiresAt` fix (Finding 3) with the storage.rules work or defer it.
- Whether to fold the App Check enforcement flip (Finding 4) into this effort or leave it fully owned by the existing tracked item in `production-launch-followups.md`.
- Semgrep alone vs. Semgrep + ESLint plugins for frontend SAST (Finding 9).
- Whether `deploy-staging.ps1` should gain the lightweight rules-test gate (Finding 10).
- Introducing GitHub Actions/CI infrastructure — this repo has none today, and it's already tracked as separate future work in `production-launch-followups.md`; this plan does not propose adding it.
