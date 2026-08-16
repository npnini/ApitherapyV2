# Testing

## Current state (as of 2026-08-16)

There is **no automated test runner configured**. `package.json` has no `test` script and no `vitest`/`jest`/`@playwright/test` dependency. `functions/package.json` has `firebase-functions-test` installed as a devDependency, but it isn't wired to any script or test file — nothing currently invokes it.

The only checks that exist today:

- **Static/build**: `npm install` / `npm run build` (frontend, via Vite+TypeScript), and `npm run build` inside `functions/` (functions, via TypeScript + `tsc`, plus `npm run lint` there too).
- **Manual smoke test**: running `npm run dev:all` against the emulators and clicking through the flow you changed. No seeded/scripted checklist exists yet.

## Target state (not yet implemented)

`AutomatedTestingPlan.md` (repo root — kept there intentionally as the reference document for this future initiative, not archived) proposes Playwright as the E2E framework, with a catalogue of ~15 test cases across clinical workflow, patient management, 3D model interaction, admin configuration, and global/safety features. Its own "Next Steps" still start with installing `@playwright/test` — that hasn't happened yet.

This is tracked as a separate initiative from the repository cleanup (see Phase 5 of `Project_Cleanup_and_Documentation_Plan.md`) — not blocking, but real work whenever it's picked up.

## Release acceptance (informal today)

There is no versioned staging/production smoke checklist yet. `docs/operations/production-launch-followups.md` tracks formalizing a production smoke test as an open item.
