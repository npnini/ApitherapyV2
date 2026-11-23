# Handoff: legal changes (registration, roles, User Terms, activity log)

Written 22/11/2026 for the next agent session. It describes what was built on the `legal-changes` branch (now merged to `main`), the decisions behind it, and what is still open.

## 1. Where things stand

| Item | State |
|---|---|
| Branch `legal-changes` | Merged to `main` by `finish-feature.ps1` (commit `0b3673a`). |
| SAST fix | Committed on `main` and pushed (`3e87d09`). |
| Staging | Deployed before the last changes. It does **not** have the activity-log IDs-only change, the changed-field details, the "(no access)" label, the 24-hour grace or the 2 AM sign-out. It does have the SAST fix's behavior (no change). |
| Production deploy | Done (confirmed by the user 22/11/2026), including the SAST fix. |
| Production version upgrade | Done (U1–U4, confirmed by the user 22/11/2026). |
| User Terms in production | Nothing published on purpose: waiting for the lawyer (see §6). |

## 2. Working rules for this user (from memory and CLAUDE.md)

- The user runs every script, build, test and deploy. Write the command, and don't run it yourself unless it's read-only, such as `npx tsc --noEmit` or the eslint SAST check.
- No commit, push, branch or PR without an explicit request.
- Commit messages go through a file (`git commit -F`), because PowerShell 5.1 breaks `-m` with quotes. Write the file **without a BOM**: `Set-Content -Encoding utf8` adds one in PS 5.1, and commit `3e87d09` got an invisible character in its subject. Use `[IO.File]::WriteAllText("$PWD\msg.txt", $text)` instead.
- Never run the emulator save scripts, and never delete `emulator-data*` folders.
- Dates are shown as dd/mm/yyyy in every language.
- Check `git branch --show-current` before editing: the user may have switched or merged mid-conversation.
- Caretakers are non-technical: keep their UI simple.
- UI strings are machine-translated to Hebrew per exact English string, so make them specific and reuse existing strings.

## 3. What was built

### 3.1 Registration, roles, plans, User Terms
Source: the functional spec "Registration, Roles, Plans and User Terms" (draft v0.3, 19/11/2026). The original plan was a Claude plan file outside the repo; this handoff replaces it.

- **Roles:** learner (Knowledge Base only), caretaker, admin, superadmin. New users are learners on the `free` plan.
- **Cloud Functions** in [functions/src/users/](../../functions/src/users/):
  - `registerUser`: creates the user record and emails the admins (sign-in email, name if the account has one, sign-up time).
  - `acceptUserTerms`, `logUserTermsDeclined`.
  - `setUserRole`: superadmin only. Nobody can change their own role. A caretaker with patients can't be demoted. At least one superadmin must remain.
  - `saveUserTermsFile`, `publishUserTerms`.
  - [access.ts](../../functions/src/users/access.ts): `requireActive` (role and terms guard), `termsValid`, `writeAudit`, `ownValue` (safe lookup of request-supplied keys, added for SAST).
- **Rules:**
  - [firestore.rules](../../config/firestore/firestore.rules): `isActiveCaretaker()` = role plus `termsOk()`; function-only user fields; `users` create blocked (registration is done by the function); `termsAcceptances` read-only; `cfg_app_config/userTerms` written only by functions.
  - [storage.rules](../../storage.rules): `App_config/user_documents/` is create-only PDF by superadmin, with no replace or delete. Patient templates moved to `App_config/patient_documents/`.
- **Client:**
  - [UserTermsAcceptance.tsx](../../src/components/UserTerms/UserTermsAcceptance.tsx): full-screen and responsive; the buttons stay visible.
  - [UserTermsSettings.tsx](../../src/components/UserTerms/UserTermsSettings.tsx): in App Settings, superadmin only.
  - Learner sidebar and view guard; User Management goes through `setUserRole`; the plan is shown in My Profile.
- **Version-upgrade script** [version-upgrade.js](../../scripts/migrations/version-upgrade.js):
  - U1: user timestamps.
  - U2: moves templates to `patient_documents/`.
  - U3: `plan = free`.
  - U4: creates an empty `userTerms`.
  - The script is dry-run unless `--apply`, and reports go to `scratch/version-upgrade/`.

### 3.2 User Terms re-acceptance: 24-hour grace + 2 AM sign-out
Decided 21/11/2026, after the user rejected both "notice only" and a live pop-up. Every user must accept each new version, but a treatment in progress must never be interrupted.

- `publishUserTerms` stores `previousVersion` (the version current until then; `''` on a first publish) and `previousValidUntil` (publish time + 24 hours).
- The Firestore rules (`termsOk`) and `termsValid` in the functions accept the previous version until `previousValidUntil`. Users with no `termsVersion` get no grace.
- [useNightlyTermsSignOut.ts](../../src/hooks/useNightlyTermsSignOut.ts):
  - When a 2 AM local time has passed, it reads `userTerms` once and signs the user out if they haven't accepted the current version.
  - It checks every 5 minutes, and on visibility, focus and online, which catches devices that slept through 2 AM.
  - A failed read is retried at the next check.
- A new sign-in always requires the current version (`hasValidTermsAcceptance` in [userTerms.ts](../../src/types/userTerms.ts)).
- Rules tests cover: inside the grace period, after it, older versions, and first publish.
- **Staging:** version 0.2 was published before this change, so it has no grace fields and behaves like a first publish. That's harmless. Test the grace by publishing a newer version (e.g. 0.3) after staging has the new functions.

### 3.3 Activity log: IDs only
Rules decided 21/11/2026:
- **Users and caretakers:** `userId` only.
- **Patients:** `patientId` only.
- **Not stored:** patient PII, clinical values, notes and treatment data.
- **Allowed in `entityName`:** knowledge-base and config names.

What changed:
- **[auditLogService.ts](../../src/services/auditLogService.ts):** `userName` is no longer written. The new `patientId` field is set on patient, treatment, document and appointment records. A safety net drops `entityName` for patient and user records.
- **Details:** problems are logged as counts; document descriptions are not stored; "extend course" no longer includes the session numbers.
- **`writeAudit`** (functions): IDs only.
- **Viewer [ActivityLog.tsx](../../src/components/ActivityLog.tsx):**
  - Resolves user and patient names at display time, cached per ID.
  - New Patient column.
  - Shows "(deleted …)" when the record doesn't exist, and "(no access) …" when the rules refuse the read. For example, a superadmin who hasn't accepted the current terms can't read patients.
- **Old records** still hold names. **No rewrite script, by the user's decision.** They expire through `cleanupAuditLog` (retention `auditLogSettings.retentionDays`, 90 days by default). Raise retention to 24 months only after they're gone.
- **Changed-field details:** [changedFields.ts](../../src/utils/changedFields.ts) lists the real changed paths, for example `auditLogSettings.retentionDays` or `description.he`. It's used by:
  - App Settings (also fixes the false `notificationSettings` caused by the write-only API key);
  - body-model lighting;
  - points, point groups, protocols, measures, problems, questionnaires.

### 3.4 Smaller fixes
- Signed consent image grows with the text ([documentUtils.ts](../../src/utils/documentUtils.ts)).
- App Check is off for callables in the emulator.
- `rootDir` was added to `functions/tsconfig.json`.
- User Terms settings layout fixed (squeezed label, overlapping text).

## 4. Decisions that differ from spec draft v0.3 (the spec should be updated)
- Admin and superadmin keep patient access and View As.
- Only the superadmin changes roles, including learner ↔ caretaker.
- Onboarding order: registration → terms → profile form → home.
- Knowledge follows `knowledgeSettings.enabled`.
- Folder names: `App_config/user_documents/` and `App_config/patient_documents/`.
- `translateText` stays open to every signed-in user (the terms screen needs it).
- Storage `Patients/` has no terms check (cross-service lookup limit).
- The admin registration email includes the sign-in email (the spec said "name and time only").
- The 24-hour grace and 2 AM sign-out (§3.2), and the activity log rules (§3.3).

## 5. Pending steps (in order)
1. ~~Production deploy~~ and ~~production version upgrade U1–U4~~: done 22/11/2026.
2. **Check production** (not yet reported): consent and guidelines load, the Learner role appears in User Management, and the Activity Log shows names.
3. **Staging redeploy** from `main`, then test there:
   - **Grace period:** with a caretaker session open, publish 0.3 and save in that session. It should succeed.
   - **2 AM sign-out:** set the clock to 01:58 and wait about 5 minutes.
   - **Activity Log:** names resolve, and the details list field names.
4. **Update the spec** with §4.

## 6. Open questions and offers (not started)
- **Lawyer:** is notice plus continued use enough when the User Terms (including the privacy policy and DPA) change, or is explicit acceptance of each version required? The current build requires acceptance (with the grace). Don't publish terms in production before the answer and the final PDFs.
- **Activity-log gap check (work plan step 10):** a gap table was written but not saved. Main gaps:
  - Sign-in, list views, effectiveness analysis, export and print are not logged.
  - No allowed/refused result field; rule refusals aren't logged (needs Cloud Audit Logs).
  - Most records are written by the browser, and the create rule has no field checks.
  - Retention is 90 days by default and editable in the app; 24 months is needed.
  - No rules test for `app_audit_log`.
  - Who reviews the log, and how often, is a decision still to make.
- **App Settings template UX:** deleting a template removes the file at once, but uploads apply only after Save. Users have hit "template not found" twice. Offered: delete on Save, or save automatically.
- **PDF on phones:** Android Chrome doesn't show a PDF in an iframe, and iOS shows only the first page. Users must use the download link. Offered: pdf.js (a new package, needs approval) or a more prominent open button.
- **Deleting caretakers without patients:** answered. Also delete the Auth account, or they come back as a learner. Check `treatments` and `appointments` by `caretakerId`. Offered a read-only diagnostic script.

## 7. Dev environment gotchas
- **Emulators:** UI 5000, Firestore 8080, Auth 9099, Storage 9199, Functions 5001, hub 4400.
- **Saving data:** `npm run save-emulator-data` works only while the hub is running.
- **A crash can leave Firestore and Pub/Sub orphaned** (ports 8080/8085). Then Storage, Auth and Functions fail with `ERR_CONNECTION_REFUSED`. Check the ports with `Get-NetTCPConnection` before restarting.
- **Stop the emulators before `npm run test:rules`** and before `deploy-staging.ps1`, whose rules test needs the same ports.
- **Testing on a phone:** use Chrome `chrome://inspect` port forwarding for 3000, 9099, 8080, 9199, 5001 (the app connects to `127.0.0.1`).
- **Type check:** `npx tsc --noEmit -p .` has many errors from before this work, so check only the files you changed.
