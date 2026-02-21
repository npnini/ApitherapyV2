# Session Handover: Phase 2 — Live Translation Migration

## 🚨 MANDATORY STARTUP INSTRUCTIONS

Before writing a single line of code, read these files **in this order**:

1. `airules.md` — Project rules, constraints, and handover duties. Non-negotiable.
2. `STYLING_GUIDE.md` — CSS and coding conventions. All new UI must follow these.
3. `handover.md` — This document. Read it fully.
4. `i18n-to-live-translation-migration.md` — The Phase 2 technical blueprint. This is the source of truth for how to perform the migration.

---

## Current Status

**Phase 1 is complete.** All clinical entity admin components now let the admin user enter multilingual strings (per supported language) directly in the UI. These are stored in Firestore as language maps `{ en: "...", he: "..." }`.

**Phase 2 has not started yet.**

The branch `main` is up to date. The dev server runs with `npm run dev` in `c:\Users\User\Dev\Projects\ApitherapyV2`.

---

## What Phase 1 Did (Do Not Redo)

The following components were migrated to multilingual map-based fields for their **data content** (clinical strings entered by the admin). These already work correctly and must NOT be changed:

| Component | Fields migrated |
|---|---|
| `MeasureAdmin.tsx` | `name`, `description`, `categories` |
| `PointsAdmin.tsx` | `label`, `description` |
| `ProtocolAdmin.tsx` | `name`, `description`, `rationale` |
| `ProblemAdmin/ProblemForm.tsx` | `name`, `description` |
| `QuestionnaireAdmin/QuestionnaireForm.tsx` | Question text translations (per language in `translations` array) |

These components still use `react-i18next` (`t()`) for **UI chrome strings** (button labels, field labels, error messages). That is intentional — Phase 2 will migrate those.

---

## What Phase 2 Must Do

Replace `react-i18next` (`t()` calls, `useTranslation()`) with the new `<T>` / `useT()` pattern across all components. The new system:

- Uses a `TranslationProvider` wrapping the app root
- Translates strings on-the-fly via Google Translate API (first use only)
- Caches translations permanently in Firestore under `translations/{language}`
- Requires NO translation JSON files and NO translation keys

Full technical spec is in `i18n-to-live-translation-migration.md`. Read it before starting.

---

## Components to Migrate (31 total TSX files)

This is the complete inventory of files containing `t()` calls that must be migrated:

### Admin / Settings
- `src/components/ApplicationSettings.tsx`
- `src/components/MeasureAdmin/MeasureAdmin.tsx`
- `src/components/PointsAdmin.tsx`
- `src/components/ProtocolAdmin.tsx`
- `src/components/ProblemAdmin/ProblemAdmin.tsx`
- `src/components/ProblemAdmin/ProblemForm.tsx`
- `src/components/ProblemAdmin/ProblemList.tsx`
- `src/components/ProblemAdmin/ProblemDetails.tsx`
- `src/components/QuestionnaireAdmin/QuestionnaireAdmin.tsx`
- `src/components/QuestionnaireAdmin/QuestionnaireForm.tsx`
- `src/components/QuestionnaireAdmin/QuestionnaireList.tsx`

### Core UI
- `src/components/Sidebar.tsx`
- `src/components/Login.tsx`
- `src/components/PatientsDashboard.tsx`
- `src/components/UserDetails.tsx`
- `src/App.tsx` (also needs `TranslationProvider` wrapper)

### Patient-Facing
- `src/components/PatientIntake/PatientIntake.tsx`
- `src/components/PatientIntake/PersonalDetails.tsx`
- `src/components/PatientIntake/QuestionnaireStep.tsx`
- `src/components/PatientIntake/SignaturePad.tsx`

### Treatment
- `src/components/TreatmentExecution.tsx`
- `src/components/TreatmentHistory.tsx`
- `src/components/VitalsInputGroup.tsx`
- `src/components/BodyScene.tsx`
- `src/components/StingPointMarker.tsx`
- `src/components/ProtocolSelection.tsx`

### Shared / Common
- `src/components/shared/DocumentManagement.tsx`
- `src/components/shared/ShuttleSelector.tsx`
- `src/components/common/Modal.tsx`
- `src/components/common/Tooltip.tsx`
- `src/components/ConfirmationModal.tsx`

**Verify each file for `t()` calls before migrating.** Some shared/small components may have zero `t()` calls and can be skipped.

---

## Developer Workflow (Per Component)

The developer prefers to work **one component at a time** with the following Git workflow:

1. `git checkout -b feature/phase2-<ComponentName>`
2. Perform the migration (see `i18n-to-live-translation-migration.md` Phase 2 section)
3. `npm run dev` — visually verify the component
4. `npm run build` — confirm no TypeScript errors
5. `git commit -m "Phase 2: migrate <ComponentName> to T/useT pattern"`
6. `git checkout main && git merge feature/phase2-<ComponentName>`
7. `git push`

**Do not batch multiple components into one branch.** One branch per component.

---

## Critical Rules — Read Before Writing Code

### ✅ What SHOULD be wrapped in `<T>` / `useT()`
- Button labels, form field labels, headings, table headers
- Error messages, success messages, status text
- Placeholder text, tooltip text, navigation items
- Any string that is part of the generic UI chrome

### ❌ What MUST NOT be wrapped in `<T>` / `useT()`
- **Questionnaire question text** — already stored per-language in Firestore; it is already in the correct language
- **Clinical entity names** (problem names, protocol names, measure names, point labels) — same, already multilingual in Firestore
- **Patient data** (names, notes, free-text entries) — never translated, displayed as entered
- **Language codes** used for logic (like `currentLang`, `activeLang`) — these are not UI strings

### ⚠️ Language Detection Change
All components currently use `i18n.language` for reading the current language (e.g., for `currentLang`/`activeLang` to show/edit the correct language field). After migration, replace:
```tsx
// Before
const { t, i18n } = useTranslation();
const currentLang = i18n.language;

// After
const { language: currentLang } = useTranslationContext();
```

### ⚠️ Interpolated Strings
Strings with variable substitution (e.g., `t('deletePointConfirmation', { code: point.code })`) cannot be migrated automatically. Compose the full English sentence as a template literal:
```tsx
// Before
{t('deletePointConfirmation', { code: deletingPoint.code })}

// After
<T>{`Are you sure you want to delete point ${deletingPoint.code}?`}</T>
```

### ⚠️ Infrastructure First
Before migrating ANY component, Phase 2 infrastructure setup must be done:
1. Google Translate API key obtained by the developer `[HUMAN]`
2. `.env` file created with `VITE_GOOGLE_TRANSLATE_KEY=...` `[HUMAN]`
3. `src/components/T.tsx` created (full source is in the migration guide) `[AGENT]`
4. `App.tsx` wrapped with `<TranslationProvider>` `[AGENT]`
5. Firestore rules updated for `translations` collection `[AGENT]`
6. **One pilot component migrated and verified** before migrating all others `[BOTH]`

---

## Key Architecture Facts

- **Firebase init file:** `src/firebase.ts` — use this path in T.tsx import
- **App root:** `src/App.tsx` — wrap outermost return with `<TranslationProvider>`
- **Translation cache location in Firestore:** `translations/{language}` (e.g., `translations/he`)
- **Caretaker preferred language:** stored in the user's Firestore profile as `preferredLanguage`
- **appConfig** (supported languages, default language) is fetched from Firestore `app_config/main` and available via `useAppConfig()` hook
- **Language codes** follow BCP-47 (e.g., `en`, `he`, `ar`)
- **RTL support:** Hebrew (`he`) uses RTL layout. The app has RTL CSS handling already in place. Do not break it during migration.

---

## What NOT to Do

- Do **not** delete `translation.json` files yet — they remain until Phase 3 cleanup
- Do **not** run `npm run build` unnecessarily (only for verification before commit)
- Do **not** add new keys to `translation.json` — Phase 2 does not use it
- Do **not** migrate multiple components in one branch
- Do **not** touch `SUPPORTED_LANGS` ordering logic (already standardized in Phase 1: user's language first, then others sorted alphabetically)

---

## Recommended Migration Order

Start simple, end complex:

1. `common/Modal.tsx`, `common/Tooltip.tsx`, `ConfirmationModal.tsx` — minimal `t()` usage
2. `shared/DocumentManagement.tsx`, `shared/ShuttleSelector.tsx`
3. `Sidebar.tsx`, `Login.tsx`
4. `UserDetails.tsx`, `PatientsDashboard.tsx`
5. `ApplicationSettings.tsx`
6. `ProblemAdmin/ProblemList.tsx`, `ProblemAdmin/ProblemDetails.tsx`
7. `QuestionnaireAdmin/QuestionnaireList.tsx`, `QuestionnaireAdmin/QuestionnaireAdmin.tsx`
8. `ProblemAdmin/ProblemAdmin.tsx`, `ProblemAdmin/ProblemForm.tsx`
9. `QuestionnaireAdmin/QuestionnaireForm.tsx`
10. `MeasureAdmin/MeasureAdmin.tsx`, `PointsAdmin.tsx`, `ProtocolAdmin.tsx`
11. `PatientIntake/*` (4 files — patient-facing, test carefully)
12. `TreatmentExecution.tsx`, `TreatmentHistory.tsx`, `VitalsInputGroup.tsx`
13. `BodyScene.tsx`, `StingPointMarker.tsx`, `ProtocolSelection.tsx`
14. `App.tsx` last (also where `TranslationProvider` goes)

---

## Phase 3 (After All Components Migrated)

1. Verify no remaining `react-i18next` imports: `grep -r "react-i18next" src/`
2. `npm uninstall react-i18next i18next`
3. Delete `public/locales/` directory
4. Delete i18n initialization file (check `src/i18n.ts` or similar)
5. `npm run build` — must succeed cleanly
6. Human deploys to staging and performs full smoke test
7. Human deploys to production: `firebase deploy --only hosting`
