# Environments

ApitherapyV2 runs in **3 operating contexts** backed by **2 Firebase cloud projects** (local development has no cloud project of its own — it runs entirely against emulators).

| Context | Firebase project | Alias(es) in `.firebaserc` | How it's reached |
|---|---|---|---|
| Local development | *(none — emulators only)* | n/a | `npm run dev` (Vite only) or `npm run dev:all` (Vite + Firebase Emulator Suite via `scripts/dev/start-dev.js`) |
| Staging | `apitherapyv2` | `default`, `staging` | `scripts/deploy/deploy-staging.ps1` |
| Production | `apitherapy-c94a6` | `prod` | `scripts/deploy/deploy-prod.ps1` |

There is no separate "dev cloud" project. An earlier draft plan (`docs/archive/env_separation_implementation_plan.md`... — actually deleted outright, see cleanup plan Phase 1) proposed a 3-project model (`apitherapy-dev` / `-stage` / `-prod`); that was never built and is not the intended direction. The 2-project model above is the confirmed, intentional setup.

## Local development (emulators)

`firebase.json` emulator ports:

| Service | Port |
|---|---|
| Auth | 9099 |
| Functions | 5001 |
| Firestore | 8080 |
| Hosting | 5000 |
| Storage | 9199 |
| Pub/Sub | 8085 |
| Emulator UI | 5000 (enabled) |

`npm run emulators` starts the suite importing from `./emulator-data` (the canonical local snapshot). `npm run dev:all` (`scripts/dev/start-dev.js`) is the normal way to start local development — it force-kills any process already bound to the emulator ports and builds `functions` first. `npm run emulators:autosave` (`scripts/dev/auto-save-emulator.js`) periodically snapshots emulator state back to `emulator-data`.

## Staging

Project `apitherapyv2`, reached via `scripts/deploy/deploy-staging.ps1`. See `docs/operations/deploy-staging.md`.

## Production

Project `apitherapy-c94a6`, reached via `scripts/deploy/deploy-prod.ps1`. See `docs/operations/deploy-production.md`. Live clinical operation — treat with the highest care.

## Cross-environment rules

- Never copy Staging data into Production (see `docs/archive/prepare-prod-env.md` — this was done once during initial launch as a one-time migration and must not be repeated).
- `.env.local`, `.env.staging`, `.env.production` select frontend config per environment; do not hand-edit these without understanding which Vite `--mode` consumes them.
- Both deploy scripts run **unattended** — no confirmation prompt. Review the diff/state you're about to deploy before running either script.
