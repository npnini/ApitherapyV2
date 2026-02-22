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

**Phase 2 infrastructure is partially done.** Status:
- `src/components/T.tsx` ✅ **EXISTS** (moved from `src/T.tsx` to correct location). Import paths: `'./T'` or `'../T'` from `src/components/<subfolder>/`
- `App.tsx` ✅ **DONE** — wrapped with `<TranslationProvider>` (renamed inner component to `AppInner`, `setLanguage` called alongside `i18n.changeLanguage` in `handleSaveUser`)
- The `translations` Firestore collection rule ✅ **DONE** — deployed in Firestore
- The Google Translate API key ✅ **DONE** — in `.env.local` as `VITE_GOOGLE_TRANSLATE_KEY`

The first component (**Sidebar.tsx**) has been successfully migrated and verified. It served as the pilot component.

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

## Components to Migrate

This is the complete inventory of TSX files that must be migrated. **Verify each file for `t()` calls before migrating** — some shared/small components may have zero `t()` calls and can be skipped.

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
1. Google Translate API key obtained by the developer ✅ **DONE** — key is in `.env.local` as `VITE_GOOGLE_TRANSLATE_KEY`
2. `.env.local` file (NOT `.env`) used for secrets in this project ✅ **DONE**
3. `src/components/T.tsx` created ✅ **DONE** — file moved to correct location. Import as `'./T'` from `src/components/`, or `'../T'` from `src/components/<subfolder>/`
4. `App.tsx` wrapped with `<TranslationProvider>` (Step 1.5) ✅ **DONE** — `AppInner` pattern used; `setLanguage` wired to `handleSaveUser`
5. Firestore rules updated for `translations` collection ✅ **DONE** — deployed
6. **One pilot component migrated and verified** before migrating all others ✅ **DONE** (`Sidebar.tsx`)

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

## Known Type Bugs (Fix During Migration)

### `protocolName` type mismatch — fix in **Step 7 (`ProtocolAdmin.tsx`)**

**Location:** `src/App.tsx`, `handleProtocolSelection` function  
**Lint error:** `Type '{ [key: string]: string }' is not assignable to type 'string'` at the line:
```ts
protocolName: protocol.name,  // protocol.name is now MultilingualString, not string
```

**Root cause:** Phase 1 migrated `Protocol.name` to a multilingual map `{ en: '...', he: '...' }`.
The `TreatmentSession` type still has `protocolName: string`. So assigning `protocol.name` (a map) to `protocolName` (a string) is a type error.

**Fix — two parts, done together in the `ProtocolAdmin` branch:**

1. In `src/types/treatmentSession.ts` (or wherever `TreatmentSession` is defined), change:
   ```ts
   // Before
   protocolName: string;
   // After
   protocolName: string | Record<string, string>;
   ```
   Or alternatively keep it as `string` and resolve the display name at the call site.

2. In `src/App.tsx`, `handleProtocolSelection`, extract the display name for the current language:
   ```ts
   // Before
   protocolName: protocol.name,
   
   // After — resolve to a string using current language (or fallback to 'en')
   protocolName: typeof protocol.name === 'object'
       ? (protocol.name[i18n.language] || protocol.name['en'] || '')
       : protocol.name,
   ```

**Why ProtocolAdmin step:** `Protocol` is managed by `ProtocolAdmin`. That is the natural place to review and finalise how `protocol.name` is stored and consumed. The fix in `App.tsx` and `treatmentSession.ts` is a direct consequence of that component's Phase 1 migration.

---

## Recommended Migration Order

Each step is a menu-accessible component (or group) that can be independently activated and tested.
Sub-components with zero `t()` calls (`common/Modal.tsx`, `common/Tooltip.tsx`, `shared/Modal.tsx`)
require **no migration** and are excluded from the list.
Sub-components with `t()` calls are absorbed into the first parent branch that uses them.

### ✅ No migration needed (zero `t()` calls, no `useTranslation` import)
- `common/Modal.tsx` — receives all strings as props
- `common/Tooltip.tsx` — receives all strings as props
- `shared/Modal.tsx` — receives `confirmText`/`cancelText` as props, used in `ProblemList`

### Migration steps (one branch per step)

1. **`Sidebar.tsx`** ✅ **DONE** (Pilot completed, sync bug fixed in `App.tsx`)

2. **`Login.tsx`** — ✅ **DONE** directly accessible page

3. **`MeasureAdmin/MeasureAdmin.tsx`** — ✅ **DONE** (Completed Feb 22, 2026)
   - Migrated `shared/DocumentManagement.tsx` and `ConfirmationModal.tsx` as part of this branch.
   - **Critical Fixes Applied**:
     - **Async Batching**: `T.tsx` updated to use a 50ms timeout for registering strings, ensuring dynamic views (like modals/list headers) are translated even when registered during render.
     - **Hebrew Vowel Removal**: `stripHebrewNiqqud` implemented in `T.tsx` to automatically clean Hebrew translations before caching.
     - **Hook Violations (Directive)**: **CRITICAL**: Never use `useT` inside callbacks or conditional logic. Use the **"String Registry" pattern** (initialize a `useMemo` array of strings and register them in a `useEffect`) at the top level of the component to avoid crashes.

4. **`PointsAdmin.tsx`** — ✅ **DONE** (Completed Feb 22, 2026)
5. **`ApplicationSettings.tsx`** — ✅ **DONE** (Completed Feb 22, 2026)
   - Migrated `shared/ShuttleSelector.tsx` (also used in ProblemForm).
   - Fixed `Modal.module.css` to use `inset-inline-end` for RTL close button support.

6. **`ProblemAdmin/ProblemList.tsx`**, **`ProblemAdmin/ProblemDetails.tsx`**, **`ProblemAdmin/ProblemForm.tsx`**, **`ProblemAdmin/ProblemAdmin.tsx`** — ✅ **DONE** (Completed Feb 22, 2026)

7. **`ProtocolAdmin.tsx`** — ✅ **DONE** (Completed Feb 22, 2026)
   - Migrated `ProtocolSelection.tsx` (from Step 11) in this branch as well.
   - Fixed `App.tsx` and `treatmentSession.ts` to support multilingual protocol names.
   
8. **`QuestionnaireAdmin/QuestionnaireList.tsx`**, **`QuestionnaireAdmin/QuestionnaireForm.tsx`**, **`QuestionnaireAdmin/QuestionnaireAdmin.tsx`**

9. **`UserDetails.tsx`**, **`PatientsDashboard.tsx`** — `PatientsDashboard` uses `common/Tooltip` (already done)

10. **`PatientIntake/PersonalDetails.tsx`**, **`PatientIntake/SignaturePad.tsx`**, **`PatientIntake/QuestionnaireStep.tsx`**, **`PatientIntake/PatientIntake.tsx`** — patient-facing, test carefully; questionnaire question text must NOT be wrapped in `<T>`

11. **`VitalsInputGroup.tsx`**, **`BodyScene.tsx`**, **`StingPointMarker.tsx`**, ~~`ProtocolSelection.tsx`~~ (done in step 7) — migrate these before TreatmentExecution as they are sub-components of it

12. **`TreatmentExecution.tsx`** — all sub-components migrated in step 11

13. **`TreatmentHistory.tsx`**

14. **`App.tsx`** — last; also where `<TranslationProvider>` wrapper is added (Step 1.5 of migration guide)

---

## Phase 3 (After All Components Migrated)

1. Verify no remaining `react-i18next` imports: `grep -r "react-i18next" src/`
2. `npm uninstall react-i18next i18next`
3. Delete `public/locales/` directory
4. Delete i18n initialization file (check `src/i18n.ts` or similar)
5. `npm run build` — must succeed cleanly
6. Human deploys to staging and performs full smoke test
7. Human deploys to production: `firebase deploy --only hosting`

---

## Technical Notes from Sidebar Migration

### Initial Load Synchronization Bug (Fixed)
An issue was found where the app would display in English on initial load even if the user's preferred language was Hebrew (though the layout was correctly RTL).
**Fix implemented:**
- In `App.tsx`, a `useEffect` was added to `AppInner` that monitors `appUser.preferredLanguage` and forces `i18n.changeLanguage` and `TranslationContext.setLanguage` to match immediately.
- In `T.tsx`, the `useEffect` that flushes the translation queue was updated to ensure it runs even when no *new* strings are registered, allowing it to pick up the initial language switch.

### JSON Key Migration Side-Effect
As components are migrated, their keys are moved to the `__migrated__` section of the JSON files. 
**Important:** If a key is moved to `__migrated__` but another component still uses the old `t('key')` call, `react-i18next` will display the raw key (e.g., `my_profile`). This is expected and will be resolved as each component is migrated. For example, the header in the User Profile form currently shows `my_profile` because `UserDetails.tsx` is not yet migrated.

