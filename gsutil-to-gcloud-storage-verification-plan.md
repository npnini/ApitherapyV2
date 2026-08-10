# gsutil to gcloud storage verification plan

## Purpose

This document provides a phased, testable plan for completing and verifying the project's transition from `gsutil` to `gcloud storage` before Google removes `gsutil` from the default Google Cloud CLI installation in March 2027.

Authoritative reference: [Transition from gsutil to gcloud storage](https://docs.cloud.google.com/storage/docs/gsutil-transition-to-gcloud)

## Executive finding

The project appears to have already migrated its active Cloud Storage commands to `gcloud storage`.

The repository scan found:

- Active `gcloud storage` commands in deployment and migration scripts.
- No active `gsutil` command in deployment, backup, or migration code.
- Two `gsutil` mentions only in comments and messages inside `PastMDocs/3D_Migration/set-cors.js`.
- Several `gs://...` strings, which are Cloud Storage resource addresses and not uses of `gsutil`.

This should therefore be handled as a verification and cleanup project, not as a large command-conversion project.

Google's documented behavioral differences still need to be tested. These include output formatting, recursive copy behavior, `rsync` comparisons and parallelism, wildcard handling, symbolic links, and error handling.

## Current repository inventory

| Area | Current command | Status |
|---|---|---|
| Production CORS | `gcloud storage buckets update` | Migrated; verification required |
| Staging CORS | `gcloud storage buckets update` | Migrated; verification required |
| Migration download/upload | `gcloud storage cp -r` | Migrated; verification required |
| Storage synchronization | `gcloud storage rsync -r` | Migrated; high-priority verification required |
| Object metadata | `gcloud storage objects update` | Migrated; wildcard verification required |
| Bucket IAM | `gcloud storage buckets add-iam-policy-binding` | Migrated; verification required |
| Archived CORS helper | Mentions `gsutil` in text only | Cleanup candidate |

## Step 1 — Establish and preserve the migration inventory

**Priority:** P0  
**Dependency:** None  
**Risk:** None; read-only

### Actions

- [ ] Record every current `gcloud storage` command and every remaining `gsutil` reference.
- [ ] Classify each occurrence as an active command, documentation/comment, `gs://` URI, or application SDK usage.
- [ ] Search CI/CD definitions, Dockerfiles, external deployment configuration, scheduled jobs, and administrator runbooks.
- [ ] Confirm whether production jobs are maintained directly in Google Cloud rather than in source control.

### Test

Run a repeatable repository scan:

```powershell
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' '\bgsutil\b' .
```

Manually inspect every result because a textual mention does not necessarily represent an executable dependency.

### Pass criteria

- [ ] No executable `gsutil` command remains.
- [ ] External jobs not represented in the repository have been checked and documented.

## Step 2 — Verify CLI and authentication baseline

**Priority:** P0  
**Dependency:** Step 1  
**Risk:** None when limited to version and authentication inspection

### Actions

- [ ] Confirm every deployment environment has a supported Google Cloud CLI containing `gcloud storage`.
- [ ] Check developer machines and future CI runners or containers separately.
- [ ] Confirm authentication uses `gcloud`, not a `.boto` configuration previously used by `gsutil`.
- [ ] Confirm the active account and project aliases before storage tests.
- [ ] Document the minimum supported Google Cloud CLI version.

### Test

```powershell
gcloud version
gcloud storage --help
gcloud auth list
gcloud config list
gcloud storage ls gs://apitherapyv2-staging-storage
```

### Pass criteria

- [ ] `gcloud storage` is available without separately installing `gsutil`.
- [ ] The intended account and project are active.
- [ ] The test identity can list the staging bucket.
- [ ] No workflow depends on `.boto` authentication.

## Step 3 — Validate low-risk CORS operations

**Priority:** P1  
**Dependency:** Step 2  
**Files:** `deploy-staging.ps1`, `deploy-prod.ps1`

### Actions

- [ ] Inspect the current staging CORS policy.
- [ ] Apply `cors-staging.json` through `gcloud storage`.
- [ ] Read the policy back and compare it structurally with the desired JSON.
- [ ] Repeat in production only after staging succeeds.
- [ ] Ensure deployment scripts fail when the CORS command returns a nonzero exit code.

### Test

Before and after applying staging CORS:

```powershell
gcloud storage buckets describe gs://apitherapyv2-staging-storage --format=json
```

Functional browser test:

- [ ] Access a harmless staging object from the permitted staging web origin.
- [ ] Confirm the browser produces no CORS error.
- [ ] Confirm an unapproved origin does not unexpectedly gain access.

### Pass criteria

- [ ] Retrieved bucket CORS matches `cors-staging.json`.
- [ ] The staging application can access expected Storage resources.
- [ ] Production remains unchanged until staging passes.
- [ ] A deliberately invalid test command causes the script to report failure.

## Step 4 — Validate IAM-management commands independently

**Priority:** P1  
**Dependency:** Step 2  
**File:** `scripts/setup-migration-permissions.ps1`

### Actions

- [ ] Inspect existing bucket IAM policies before applying changes.
- [ ] Verify derived project numbers, service-account addresses, and bucket names.
- [ ] Confirm least-privilege roles:
  - Production Firestore service account: object viewer.
  - Staging Firestore service account: object admin on the temporary export bucket.
- [ ] Test on staging first.
- [ ] Check each IAM command independently; do not rely only on the final command's exit status.

### Test

```powershell
gcloud storage buckets get-iam-policy gs://apitherapyv2-israel-temp
```

After an approved staging application:

- [ ] Confirm the expected service account is present.
- [ ] Confirm the expected role is present.
- [ ] Confirm no unrelated binding was removed or broadened.
- [ ] Run the setup a second time to verify idempotency.

### Pass criteria

- [ ] Repetition does not create incorrect effective permissions.
- [ ] Only the intended principal and role are added.
- [ ] Failure of the first IAM command cannot be hidden by a successful later command.

## Step 5 — Validate `cp` using disposable data

**Priority:** P1  
**Dependency:** Steps 2 and 4  
**File:** `scripts/migrate-stage-to-prod.ps1`

Google notes that `gcloud storage cp` can continue processing other resources after encountering an invalid one and creates missing local destination directories where `gsutil cp` would fail. Error and partial-success assumptions must be tested.

### Actions

- [ ] Create a disposable staging prefix containing an ordinary file, nested directory, filename with spaces, Hebrew filename, and empty file.
- [ ] Download it to a disposable local directory.
- [ ] Upload it to a disposable staging destination.
- [ ] Keep production and real Firestore exports outside this test.
- [ ] Decide how partial copies should be cleaned up or reported.

### Test

Compare source and destination:

- [ ] Object count.
- [ ] Relative object names.
- [ ] Byte sizes.
- [ ] CRC32C or MD5 hashes where available.
- [ ] Unicode filenames.
- [ ] Command exit code.

Run an isolated negative test with one nonexistent source and observe whether other files are copied.

### Pass criteria

- [ ] All expected objects arrive with matching hashes.
- [ ] Nested paths and Unicode filenames are preserved.
- [ ] Partial-success behavior is understood and documented.
- [ ] A nonzero exit code stops the parent workflow.

## Step 6 — Validate `rsync` without deletion

**Priority:** P1; highest behavioral-risk operation  
**Dependency:** Step 5  
**File:** `scripts/migrate-stage-to-prod.ps1`

Google documents that `gcloud storage rsync` is parallel by default, has different timestamp/checksum behavior, and ignores symbolic links by default. Exclusion patterns and output handling also require verification.

### Actions

- [ ] Test staging-to-local or between two disposable staging prefixes only.
- [ ] Begin with `--dry-run`.
- [ ] Verify `(exports|firebase-export-.*|migration_backup)\/.*`.
- [ ] Verify `backups/.*`.
- [ ] Test added, changed, unchanged, excluded, and nested objects.
- [ ] Do not add delete-unmatched-destination behavior without separate approval and testing.
- [ ] Check whether local symbolic links can occur; otherwise document them as unsupported.

### Test

1. The first dry run should propose exactly the expected copies.
2. After synchronization, a second dry run should propose no changes.
3. Modify one file without changing its size and confirm the change is detected.
4. Confirm excluded objects are absent from the destination.

### Pass criteria

- [ ] Dry-run actions exactly match expectations.
- [ ] The second run is idempotent.
- [ ] Both exclusion patterns work.
- [ ] No backup or export paths cross the intended boundary.
- [ ] Changed content with an unchanged size is detected.
- [ ] Parallel execution does not cause unacceptable resource or rate-limit problems.

## Step 7 — Validate wildcard-based metadata updates

**Priority:** P1  
**Dependency:** Step 5  
**File:** `scripts/migrate-stage-to-prod.ps1`

The current command targets `"$PROD_BUCKET/**/*.txt"`. This is broad and requires an isolated wildcard test.

### Actions

- [ ] Reproduce the directory structure under a disposable staging prefix.
- [ ] Include root-level `.txt`, nested `.txt`, non-`.txt`, spaced, and Hebrew filenames.
- [ ] Determine exactly which levels `**/*.txt` matches.
- [ ] Consider listing intended targets before updating them.
- [ ] Ensure the metadata command's exit code is checked.

### Test

Inspect metadata before and after:

```powershell
gcloud storage objects describe gs://TEST_BUCKET/test-prefix/example.txt
```

Confirm:

- [ ] Every intended `.txt` object receives `text/plain; charset=utf-8`.
- [ ] Non-text objects are unchanged.
- [ ] Root-level files behave as intended.
- [ ] Existing unrelated custom metadata and cache controls remain intact.

### Pass criteria

- [ ] The selected object set is exact.
- [ ] Only `Content-Type` changes.
- [ ] Repeating the command is harmless.
- [ ] No-match and partial-failure conditions are detected and reported.

## Step 8 — Exercise the complete migration in staging-only mode

**Priority:** P2  
**Dependency:** Steps 3–7  
**Risk:** Moderate but isolated from production

### Actions

- [ ] Use a small test Firestore database/export and disposable Storage prefixes.
- [ ] Execute and inspect each phase separately:
  1. Firestore export.
  2. Export download.
  3. Storage download.
  4. Upload to a staging destination.
  5. Storage synchronization.
  6. Firestore import into a disposable database or project, if available.
  7. Metadata update.
- [ ] Capture counts, hashes, identifiers, elapsed time, and exit codes after each phase.
- [ ] Stop between phases for inspection.

### Test

- [ ] Compare document counts before export and after import.
- [ ] Compare object inventories and hashes before and after transfer.
- [ ] Interrupt after download and confirm safe restart or resumption.
- [ ] Inject a harmless invalid destination and verify later phases do not run.

### Pass criteria

- [ ] Data counts and hashes reconcile.
- [ ] No excluded path is transferred.
- [ ] Failure stops the workflow at the correct phase.
- [ ] A rerun does not corrupt or duplicate data.
- [ ] Logs identify precisely which phase failed.

## Step 9 — Production canary and controlled rollout

**Priority:** P2  
**Dependency:** Successful staging rehearsal  
**Risk:** Production mutation; requires explicit approval and verified backup

### Actions

- [ ] Freeze the tested CLI version and script revision.
- [ ] Confirm current backups and recovery procedures.
- [ ] Apply CORS first because it is independently reversible.
- [ ] Begin transfers with a unique canary prefix, not the production bucket root.
- [ ] Validate the canary before running the full operation.
- [ ] Retain the old procedure temporarily as rollback documentation, not as a dependency on bundled `gsutil`.

### Test

After each production phase:

- [ ] Retrieve and compare CORS.
- [ ] Inspect canary object metadata and hashes.
- [ ] Compare object and document counts.
- [ ] Test application document upload and download.
- [ ] Test existing image and file rendering.
- [ ] Test Hebrew text rendering.
- [ ] Confirm backup creation and visibility.

### Pass criteria

- [ ] Canary passes before broad synchronization.
- [ ] Production counts reconcile.
- [ ] Core Storage workflows work through the application.
- [ ] Monitoring shows no new authorization, CORS, or object-not-found errors.

## Step 10 — Remove stale references and prevent regression

**Priority:** P3  
**Dependency:** Production verification

### Actions

- [ ] Update or annotate archived `set-cors.js` messages so they no longer recommend `gsutil`.
- [ ] Update operational documentation to require `gcloud storage`.
- [ ] Add a CI check rejecting executable `gsutil` usage.
- [ ] Allow historical prose only through an explicit exception, if it must remain.
- [ ] Ensure future Docker and CI images provide `gcloud storage` without installing standalone `gsutil`.

### Test

- [ ] Run the repository scan and confirm only approved historical references remain.
- [ ] Run CI in an environment where `gsutil` is absent.
- [ ] Execute staging deployment and the staging migration rehearsal in that environment.
- [ ] Deliberately introduce `gsutil cp` in a test branch and confirm CI rejects it.

### Pass criteria

- [ ] All supported workflows succeed without a `gsutil` executable.
- [ ] The regression check catches executable `gsutil` usage.
- [ ] Documentation consistently describes `gcloud storage`.

## Execution order and approval gates

1. Inventory repository and external automation.
2. Verify CLI version and authentication.
3. Test staging CORS.
4. Test staging IAM.
5. Test disposable `cp`.
6. Test disposable `rsync`.
7. Test wildcard metadata updates.
8. Run an end-to-end staging rehearsal.
9. Perform a production canary and rollout.
10. Clean historical references and add regression protection.

Each step should be reviewed and accepted before beginning its dependent step. Any test that changes staging, IAM, Cloud Storage objects, Firestore data, or production requires explicit approval immediately before execution.

## Final migration completion criteria

The transition is complete when:

- [ ] No supported workflow invokes `gsutil`.
- [ ] Every deployment environment supplies `gcloud storage`.
- [ ] Authentication works without `.boto` or standalone `gsutil` configuration.
- [ ] CORS, IAM, copy, synchronization, wildcard metadata, and failure behavior pass staging tests.
- [ ] An end-to-end staging rehearsal succeeds.
- [ ] The production canary and smoke tests succeed.
- [ ] CI prevents executable `gsutil` usage from returning.

