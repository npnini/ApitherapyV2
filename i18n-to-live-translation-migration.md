# Migration Guide: From i18n Translation Files to On-the-Fly Translation

## Document Purpose

This document is a step-by-step migration guide for converting a React/TypeScript web application from
the `react-i18next` translation file pattern to an on-the-fly translation architecture using the Google
Translate API with Firestore caching. It is written for collaborative execution between a **human
developer** and an **AI coding agent**.

Each step is labelled clearly as either `[HUMAN]` or `[AGENT]` or `[BOTH]`. Steps marked `[HUMAN]`
require a decision, credential, or physical action that only the human can perform. Steps marked
`[AGENT]` are fully executable by the AI coding agent. Steps marked `[BOTH]` require the human to
provide input and the agent to execute.

---

## Background and Architecture

### What This Migration Does

The existing app uses `react-i18next`. Every user-facing string in every component is referenced by a
key (e.g. `t('savePoint')`), and the actual text lives in JSON files per language
(e.g. `en.json`, `he.json`). Adding support for a new language means manually translating every key
into a new JSON file. This is the problem being eliminated.

The new architecture:
- All components are written in English only, with no translation keys.
- A `<T>` component and `useT()` hook wrap every user-facing string.
- When a caretaker's preferred language is not English, strings are translated on the fly via the
  Google Translate API.
- Translations are cached in Firestore so the API is called at most once per string per language,
  ever, regardless of how many users the app has.
- No translation JSON files are needed or maintained.

### What Is NOT Translated

The following content is **deliberately excluded** from this translation system:

| Content Type                                      | Reason                                       | How It Is Handled                                              |
|---------------------------------------------------|----------------------------------------------|----------------------------------------------------------------|
| Medical questionnaire questions                   | Clinical precision requires human authorship | Already stored per-language in Firestore, authored in admin UI |
| Problem names, protocol names, sting point labels | Clinical terminology, human-authored         | Extend the questionnaire admin pattern to cover these entities |
| Patient data (names, notes, measurements)         | This is data, not UI                         | Never translated — displayed as entered                        |
| Caretaker-entered free text                       | Same as above                                | Never translated                                               |

Only **generic UI chrome** is translated by this system: labels, buttons, headings, error messages,
table headers, form field labels, navigation items.

### Technology Stack

- **Frontend:** React + TypeScript, Vite
- **Backend:** Firebase (Firestore database, Firebase Storage, Firebase Hosting)
- **Translation API:** Google Cloud Translation API v2
- **Caching:** Firestore collection `translations/{language}` as a key-value map
- **Migration script:** `migrate-i18n.js` (Node.js, no dependencies beyond built-ins)

---

## Project File Structure After Migration

```
public/
|-- locales/
|   └──en
|   |     └──translation.json         ← SOURCE OF TRUTH during migration, deleted afte
|   └──he
|        └──translation.json          ← SOURCE OF TRUTH during migration, deleted afte
src/
├── components/
│   └── T.tsx                        ← NEW: The translation component and hook
├── context/
│   └── TranslationContext.tsx        ← NEW: (already inside T.tsx, extract if preferred)
├── pages/
│   ├── PointsAdmin.tsx               ← MIGRATED: no more t() calls
│   ├── PatientsAdmin.tsx             ← MIGRATED
│   └── ... (all 20 pages)
├── scripts/
│   └── migrate-i18n.js              ← MIGRATION TOOL: kept in project for reference
└── App.tsx                          ← MODIFIED: wrap with TranslationProvider
```

---

## Pre-Migration Checklist

Before starting, the human should confirm the following are true:

- [ ] The project builds successfully with `npm run build` or `vite build`
- [ ] The `en.json` file (or equivalent English locale file) is complete and up to date
- [ ] A Google Cloud project exists or can be created
- [ ] Firebase project is accessible
- [ ] The GitHub repo is checked out locally and working
- [ ] `migrate-i18n.js` has been added to `src/scripts/` in the project

---

## Phase 1 — Infrastructure Setup

### Step 1.1 — Get a Google Translate API Key `[HUMAN]`

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Select or create a project
3. Navigate to **APIs & Services → Library**
4. Search for **Cloud Translation API** and enable it
5. Navigate to **APIs & Services → Credentials**
6. Click **Create Credentials → API Key**
7. Copy the key
8. Optionally restrict the key to the Translation API and your app's domain for security

### Step 1.2 — Add the API Key to the Project Environment `[HUMAN]`

Add the following line to your `.env` file (create it at the project root if it does not exist):

```
VITE_GOOGLE_TRANSLATE_KEY=your_api_key_here
```

Confirm `.env` is listed in `.gitignore`. It must never be committed to the repository.

### Step 1.3 — Create the Firestore Translations Collection `[AGENT]`

The agent should verify that the Firestore rules allow reads and writes to the `translations`
collection for authenticated users. Check `firestore.rules` and add the following rule if not present:

```
match /translations/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

If the Firestore rules file is not accessible, instruct the human to add this rule manually in the
Firebase Console under **Firestore Database → Rules**.

### Step 1.4 — Install the T Component `[AGENT]`

Create the file `src/components/T.tsx` with the following complete content.

The file implements:
- `TranslationProvider` — wrap the app root with this
- `<T>` component — for JSX string contexts
- `useT()` hook — for JavaScript string contexts (prop values, error messages, etc.)
- `translateBatch()` — internal function handling Firestore cache lookup and Google Translate API calls

```tsx
/**
 * T.tsx — Drop-in translation component and hook
 *
 * Place this file at: src/components/T.tsx
 *
 * Usage in JSX:
 *   <T>Welcome to the app</T>
 *
 * Usage in JS string context (props, error messages, etc.):
 *   placeholder={useT('Enter patient name')}
 *   setError(useT('Failed to save'))
 *
 * Translations are cached in Firestore under:
 *   translations/{language}  →  { "English string": "Translated string", ... }
 *
 * On first visit to a page in a new language, all strings for that page
 * are collected and sent in a single batched API call, then stored in
 * Firestore so every subsequent user worldwide gets the cached version.
 */

import React, { useState, useEffect, useContext, createContext, useCallback, useRef } from 'react';
import { db } from '../firebase'; // ← VERIFY: adjust this path to match your project's firebase init file
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranslationContextValue {
    language: string;
    setLanguage: (lang: string) => void;
    registerString: (text: string) => void;
    getTranslation: (text: string) => string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TranslationContext = createContext<TranslationContextValue>({
    language: 'en',
    setLanguage: () => {},
    registerString: () => {},
    getTranslation: (text) => text,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<string>(() => {
        return localStorage.getItem('appLanguage') || 'en';
    });

    // Cache: language → { englishText: translatedText }
    const cacheRef = useRef<Record<string, Record<string, string>>>({});

    // Pending strings waiting to be translated this render cycle
    const pendingRef = useRef<Set<string>>(new Set());

    // Trigger re-render after translations arrive
    const [, forceUpdate] = useState(0);

    const setLanguage = useCallback((lang: string) => {
        localStorage.setItem('appLanguage', lang);
        setLanguageState(lang);
    }, []);

    // Called by every <T> and useT() on render to register their string
    const registerString = useCallback((text: string) => {
        if (language === 'en') return;
        if (cacheRef.current[language]?.[text]) return; // already cached
        pendingRef.current.add(text);
    }, [language]);

    // Returns the translated string if available, otherwise the original English
    const getTranslation = useCallback((text: string): string => {
        if (language === 'en') return text;
        return cacheRef.current[language]?.[text] ?? text;
    }, [language]);

    // After each render cycle, flush pending strings to the translation API
    useEffect(() => {
        if (language === 'en') return;
        const pending = Array.from(pendingRef.current);
        if (pending.length === 0) return;
        pendingRef.current = new Set();

        translateBatch(pending, language, cacheRef.current).then(() => {
            forceUpdate(n => n + 1);
        });
    });

    return (
        <TranslationContext.Provider value={{ language, setLanguage, registerString, getTranslation }}>
            {children}
        </TranslationContext.Provider>
    );
};

export const useTranslationContext = () => useContext(TranslationContext);

// ─── <T> component ────────────────────────────────────────────────────────────

export const T: React.FC<{ children: string }> = ({ children }) => {
    const { registerString, getTranslation } = useContext(TranslationContext);
    registerString(children);
    return <>{getTranslation(children)}</>;
};

// ─── useT() hook — for string contexts (props, error messages, etc.) ──────────

export const useT = (text: string): string => {
    const { registerString, getTranslation } = useContext(TranslationContext);
    registerString(text);
    return getTranslation(text);
};

// ─── Batch translation logic ──────────────────────────────────────────────────
//
// Strategy:
//   1. Check Firestore cache first (shared across all users)
//   2. For strings not in Firestore, call Google Translate API
//   3. Store results back to Firestore so future users get them for free

const TRANSLATION_API_KEY = import.meta.env.VITE_GOOGLE_TRANSLATE_KEY;
// ↑ VERIFY: this must match the variable name you added to .env in Step 1.2

async function translateBatch(
    strings: string[],
    targetLang: string,
    cache: Record<string, Record<string, string>>
): Promise<void> {
    if (!cache[targetLang]) cache[targetLang] = {};

    const firestoreDocId = `ui_${targetLang}`;
    const firestoreRef = doc(db, 'translations', firestoreDocId);

    // ── Step 1: Fetch from Firestore ─────────────────────────────────────────
    let firestoreCache: Record<string, string> = {};
    try {
        const snap = await getDoc(firestoreRef);
        if (snap.exists()) {
            firestoreCache = snap.data() as Record<string, string>;
            Object.assign(cache[targetLang], firestoreCache);
        }
    } catch (e) {
        console.warn('[T] Firestore cache read failed, falling back to API:', e);
    }

    // ── Step 2: Find strings still missing after Firestore lookup ────────────
    const toTranslate = strings.filter(s => !cache[targetLang][s]);
    if (toTranslate.length === 0) return;

    // ── Step 3: Call Google Translate API in one batched request ─────────────
    if (!TRANSLATION_API_KEY) {
        console.warn('[T] No VITE_GOOGLE_TRANSLATE_KEY set. Strings will display in English.');
        return;
    }

    try {
        const response = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${TRANSLATION_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q: toTranslate,
                    target: targetLang,
                    source: 'en',
                    format: 'text',
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Translation API responded with ${response.status}`);
        }

        const data = await response.json();
        const newTranslations: Record<string, string> = {};

        data.data.translations.forEach((item: { translatedText: string }, index: number) => {
            const original = toTranslate[index];
            const translated = item.translatedText;
            cache[targetLang][original] = translated;
            newTranslations[original] = translated;
        });

        // ── Step 4: Persist new translations back to Firestore ───────────────
        try {
            await setDoc(firestoreRef, { ...firestoreCache, ...newTranslations }, { merge: true });
        } catch (e) {
            console.warn('[T] Firestore cache write failed (translations still work this session):', e);
        }

    } catch (e) {
        console.error('[T] Translation API call failed:', e);
    }
}
```

After creating the file, the agent must verify two things:
1. The import path on the line `import { db } from '../firebase'` matches the actual path to the
   Firebase initialization file in this project. Search the codebase for the file that calls
   `initializeApp(firebaseConfig)` and use its path relative to `src/components/`.
2. The environment variable name `VITE_GOOGLE_TRANSLATE_KEY` matches exactly what was added to
   `.env` in Step 1.2.

### Step 1.5 — Wrap the App Root with TranslationProvider `[AGENT]`

Open `src/App.tsx` (or the root component file, whichever mounts the router).

Find the outermost return statement and wrap its content with `<TranslationProvider>`:

```tsx
// Before
import { BrowserRouter } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>...</Routes>
    </BrowserRouter>
  );
}

// After
import { BrowserRouter } from 'react-router-dom';
import { TranslationProvider } from './components/T';

function App() {
  return (
    <TranslationProvider>
      <BrowserRouter>
        <Routes>...</Routes>
      </BrowserRouter>
    </TranslationProvider>
  );
}
```

### Step 1.6 — Add Language Selector to Caretaker Profile `[AGENT]`

The caretaker's preferred language is stored in their Firestore profile document. The language
selector component should:

1. Read the caretaker's `preferredLanguage` field from their Firestore user document on login
2. Call `setLanguage(preferredLanguage)` from `useTranslationContext()` to initialize the language
3. When the caretaker changes their language in profile settings, update both Firestore and call
   `setLanguage()` immediately

The supported language codes should match Google Translate's BCP-47 language codes
(e.g. `en`, `he`, `ar`, `fr`, `es`, `de`, `ru`).

**Important:** The existing i18n language selector must be replaced or updated to call
`setLanguage()` from `TranslationContext` instead of `i18n.changeLanguage()`.

### Step 1.7 — Verify Infrastructure on One Page `[BOTH]`

Before migrating all 20 pages, the agent should pick **one simple page** (the human should
nominate a short, low-risk page), migrate it manually following the patterns described in Phase 2,
and test that:

- The page renders correctly in English
- Switching language causes strings to translate
- Translated strings appear in Firestore under `translations/{lang}`
- On a second language switch back and forth, the Firestore cache is used (no new API calls)

The human must confirm this test passes before proceeding to Phase 2 at scale.

---

## Phase 2 — Page-by-Page Migration

### Overview of the Migration Script

The script `migrate-i18n.js` automates the bulk of each page's conversion. Run it from the project
root:

```bash
node src/scripts/migrate-i18n.js src/pages/PageName.tsx src/locales/en.json
```

It produces `src/pages/PageName.migrated.tsx`. The agent reviews the output, applies any manual
fixes flagged by the script, then replaces the original file.

### What the Script Handles Automatically

| Pattern           | Input                                            | Output                                            |
|-------------------|--------------------------------------------------|---------------------------------------------------|
| JSX string        | `{t('savePoint')}`                               | `<T>Save Point</T>`                               |
| JSX prop value    | `placeholder={t('enterName')}`                   | `placeholder={useT('Enter name')}`                |
| JS string context | `setError(t('failedToSave'))`                    | `setError(useT('Failed to save'))`                |
| Fallback string   | `t('x_axis', 'X-axis')`                          | `<T>X-axis</T>` (uses fallback directly)          |
| Import removal    | `import { useTranslation } from 'react-i18next'` | Removed                                           |
| Hook removal      | `const { t } = useTranslation()`                 | Removed                                           |
| Import addition   | —                                                | `import { T, useT } from '../components/T'` added |


### What Requires Manual Fix After the Script

The script flags these cases with a `TODO` comment in the output file. The agent must resolve each one.

**Case 1 — Interpolated strings** (most common manual fix)

```tsx
// Script output (flagged):
{/* TODO: interpolation — migrate manually */ t('deletePointConfirmation', { code: deletingPoint.code })}

// Agent should replace with:
<T>{`Are you sure you want to delete point ${deletingPoint.code}?`}</T>
```

The rule is: compose the full English sentence with the variable substituted in, then wrap
the entire template literal in `<T>`. The translation API receives a complete grammatical sentence,
which produces better translations than sending a template with placeholders.

**Case 2 — Missing keys** (key in component but not in en.json)

The script prints a list of missing keys and leaves `TODO` comments in the output. The agent should:
1. Search the other locale JSON files (e.g. `he.json`) to find if the key exists there under a
   different namespace file
2. If the English value can be determined, substitute it directly
3. If genuinely missing, flag for human to provide the correct English text

**Case 3 — `currentLang` usage** (language detection, not translation)

Some pages use `i18n.language` to read the current language for non-translation purposes
(e.g. `PointsAdmin` uses it to select which language's document URL to display).
The script leaves a comment:

```tsx
// NOTE: currentLang still uses i18n.language — keep if you use i18n for lang detection,
// or replace with your TranslationContext
```

The agent should replace `i18n.language` with the `language` value from `useTranslationContext()`:

```tsx
// Before
const { t, i18n } = useTranslation();
const currentLang = i18n.language;

// After
const { language: currentLang } = useTranslationContext();
```

**Case 4 — `t()` calls outside JSX components** (rare)

If the page file contains `t()` calls in utility functions defined outside a React component (where
hooks cannot be called), the agent must refactor so the translated string is passed in as a prop or
parameter from a component that does have access to the context.

### Step-by-Step Process for Each Page `[AGENT]`

For each of the 20 pages, execute the following sequence:

```
1. Run the migration script on the page file
2. Read the script's console output summary
3. Open the .migrated.tsx file
4. Search for all TODO comments — resolve each one using the rules above
5. Search for any remaining t( occurrences — the script should have caught all of them,
   but verify none were missed
6. Search for any remaining useTranslation imports — remove if found
7. Verify the import path for T.tsx is correct relative to this page's directory depth
8. Run TypeScript compiler check: npx tsc --noEmit
9. Fix any TypeScript errors
10. Replace the original file: mv PageName.migrated.tsx PageName.tsx
11. Run the app and visually verify the page renders correctly in English
12. Switch language and verify strings translate
```

### Page Migration Order

Recommended order — simple pages first to build confidence, complex pages last:

1. Simple static pages (About, Help, Dashboard with no forms)
2. List/table pages with no editing (read-only views)
3. Admin pages with forms (PointsAdmin, ProtocolsAdmin, etc.)
4. Patient intake and questionnaire display pages (these interact with the manually-authored
   questionnaire system — verify that questionnaire question text is NOT wrapped in `<T>`)
5. Treatment recording pages (most complex, most dynamic data)

### Special Instruction: Questionnaire Pages `[AGENT]`

When migrating any page that **displays** questionnaire questions to the caretaker or patient:

- The question text itself comes from Firestore as a translated string stored per language —
  it must **not** be wrapped in `<T>`. It is already in the correct language.
- Only the surrounding UI chrome (button labels, section headings, navigation) should be wrapped in `<T>`.
- The agent should verify this distinction for every string on questionnaire-related pages before
  completing the migration.

---

## Phase 3 — Cleanup

### Step 3.1 — Remove react-i18next `[AGENT]`

Once all pages have been migrated and tested:

1. Verify no files in `src/` contain any remaining import of `react-i18next`:
   ```bash
   grep -r "react-i18next" src/
   ```
   If any files are found, complete their migration before proceeding.

2. Remove the package:
   ```bash
   npm uninstall react-i18next i18next
   ```

3. Run `npm run build` and confirm the build succeeds with no errors.

### Step 3.2 — Remove Translation JSON Files `[HUMAN]`

The human should confirm the migration is complete and tested before this step.

Once confirmed, the agent deletes the locale files:
```bash
rm -rf src/locales/
# or wherever the translation JSON files live
```

Also remove any i18n initialization file (commonly `src/i18n.ts` or `src/i18n/index.ts`):
```bash
grep -r "i18next" src/ --include="*.ts" --include="*.tsx" -l
```
Delete any files that exist solely to initialize i18next and are no longer imported anywhere.

### Step 3.3 — Final Build and Smoke Test `[BOTH]`

The agent runs:
```bash
npm run build
```

The human:
1. Deploys to Firebase Hosting staging environment (not production)
2. Logs in as a test caretaker
3. Sets language to a non-English language
4. Navigates through all 20 pages and verifies:
   - All UI strings are translated
   - No raw translation keys appear (e.g. nothing showing as `savePoint` or `acupuncturePoints`)
   - Patient data and questionnaire question text are in their original entered language (not machine-translated)
   - No console errors relating to translation

### Step 3.4 — Deploy to Production `[HUMAN]`

```bash
firebase deploy --only hosting
```

---

## Ongoing Maintenance

### Adding a New Page

When a new page is created after the migration is complete:

- The developer writes the page entirely in English
- Every user-facing string is wrapped in `<T>` or passed through `useT()`
- No translation keys, no JSON files, no registration steps
- The string is automatically translated on first render for any non-English language and cached

### Adding a New Language

1. Add the new language code to the caretaker profile language selector options
2. No other code changes are needed
3. The first caretaker to use the app in the new language triggers translation of all visited pages,
   which are then cached in Firestore for all subsequent users

### Updating Existing UI Text

When a UI string is changed in a component:
- The old string's cached translation in Firestore becomes orphaned (harmless, just unused)
- The new string will be translated on first render and cached automatically
- No manual intervention required

### Monitoring Translation Costs `[HUMAN]`

Set up a Google Cloud budget alert:
1. Go to **Billing → Budgets & Alerts** in Google Cloud Console
2. Create a budget for the Translation API with an alert at $10/month
3. Given the app's scale (tens of caretakers, static UI text), actual costs should remain within
   the free tier of 500,000 characters/month indefinitely

---

## Troubleshooting

### Strings Appearing in English Despite Language Being Set

Check in order:
1. Is `TranslationProvider` wrapping the component tree in `App.tsx`?
2. Is the `VITE_GOOGLE_TRANSLATE_KEY` environment variable set and picked up by Vite?
   (Run `console.log(import.meta.env.VITE_GOOGLE_TRANSLATE_KEY)` temporarily)
3. Is the Firestore `translations` collection readable/writable by authenticated users?
   (Check `firestore.rules`)
4. Are there errors in the browser console from the Translation API or Firestore?

### Translation Shows Briefly in English Then Switches (Flash)

This is expected behaviour on first render before the API responds. The `<T>` component
intentionally shows the English text immediately while the translation is in-flight.
On subsequent renders (after Firestore caching), the translated text appears instantly.
If this is visually disruptive, consider pre-warming the cache on language selection by
translating all known strings for the target language before the user navigates.

### `useT()` Called Outside a React Component

The `useT()` hook follows React's rules of hooks — it can only be called inside a function
component or custom hook. If the agent encounters a `t()` call in a utility function or
callback defined outside a component:

```tsx
// Problem: outside component scope
const getErrorMessage = (key: string) => t(key);  // won't work with useT()

// Solution: pass the translated string in from the component
const getErrorMessage = (message: string) => message;

// In the component:
setError(useT('Failed to save'));
```

### TypeScript Errors After Migration

The `<T>` component accepts only `string` children, not `string | undefined`. If TypeScript
complains about potentially undefined children, the agent should add a fallback:

```tsx
// Instead of:
<T>{someValue}</T>

// Use:
<T>{someValue || ''}</T>
```

---

## Reference: Key Files in This Migration Package

| File                                    | Purpose                                                                               |
|-----------------------------------------|---------------------------------------------------------------------------------------|
| `migrate-i18n.js`                       | Node.js script — converts one TSX page at a time from i18n to T/useT pattern          |
| `src/components/T.tsx`                  | The translation component created in Step 1.4 — full source embedded in this document |
| `i18n-to-live-translation-migration.md` | This document — self-contained, no external file dependencies                         |

---

## Summary of Cost Model

The translation cost is bounded by the number of unique UI strings multiplied by the number of
supported languages — **not** by the number of users or page views. With Firestore caching in place,
each unique English string is translated at most once per target language and stored permanently.

For this apitherapy app with approximately 20 pages of static UI chrome and an estimated 30,000–50,000
total characters of translatable text, supporting 5 languages costs approximately 150,000–250,000
characters of translation API usage — well within Google Translate's free tier of 500,000
characters/month — and this cost is incurred only once, not per month.
