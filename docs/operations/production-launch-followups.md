# Production launch follow-ups

Open items extracted from `docs/archive/prepare-prod-env.md` when that checklist was archived as completed (2026-08). That doc's title referenced project ID `apitherapy-prod`; the actual production alias is `apitherapy-c94a6` (see `docs/operations/environments.md`) — treat the archived doc's project-ID text as historical/inaccurate, not authoritative.

## Third-party services
- [ ] Add and verify the production domain for Resend (email) via DNS: SPF, DKIM records.
- [ ] Update Resend webhook URLs to point to production Cloud Functions (optional).

## Launch verification
- [ ] Smoke test: verify login and core clinical workflows on the live domain.
- [ ] Switch App Check to "Enforce" mode (currently "Monitor").

## CI/CD automation (post-launch, not yet started)
- [ ] Add `FIREBASE_TOKEN_PROD`, `VITE_*` vars, and `RESEND_API_KEY_PROD` as GitHub Secrets.
- [ ] Create a GitHub Actions workflow file (e.g. `.github/workflows/deploy-prod.yml`), triggered on push to `main`.
- [ ] Require PR reviews and passing CI checks on the `main` branch (branch protection).

Note: as of this cleanup, deployment is still fully manual (`scripts/deploy/deploy-staging.ps1` / `scripts/deploy/deploy-prod.ps1`, no confirmation prompts) and there is no CI/CD — see Phase 6 (Governance) in `Project_Cleanup_and_Documentation_Plan.md` for the broader decision on whether/when to add CI.
