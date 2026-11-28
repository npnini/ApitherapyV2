# UI Redesign: Making the App More Attractive

> **For any new agent session:** read §0 first, then find the current step in §3 (Progress tracker) and work only on that step.

## Context
The app screens look dull to the user (27/11/2026). Evidence, from 8 of the 45 screenshots in `OneDrive\Pictures\Screenshots\Apitherapy` (all Hebrew/RTL, 1-7/11/2026) and the code:
- The sidebar title is plain text with no logo. The cream sidebar is the only brand colour.
- One heavy blue (`#2563eb`) is used for everything: full-width solid modal header bars, buttons, tabs, links. The yellow Log out button is the loudest element on every screen.
- The patients list is sparse; today's appointments is a ruler of hourly "book" chips with underlined link actions.
- In the treatment screens two rows of tiny tabs (9 patient tabs, then 5 steps, about 11px) stack on each other.
- Forms are flat grids of identical boxes. Settings lists are dense tables with a red trash icon on nearly every row. The effectiveness table uses saturated pill badges.
- `src/globals.css` (primary `#1e40af`) and `src/index.css` (primary `#2563eb`) define different tokens. About 130 hard-coded hex colours in 23 CSS modules bypass the tokens. `--font-size-2xl` is used but not defined in `index.css`.
- `body` uses `'Inter', sans-serif`, so Hebrew may not use the Assistant font that `globals.css` loads for it (to confirm in the browser).
- Some screenshots show dates as mm/dd/yyyy. These may predate the dd/mm/yyyy fix (check).

## Decisions so far
- **Preview:** https://claude.ai/artifact/YYJRt9HV4KF4wMkdCNU35z (today's look and directions A Honey & Teal, B Calm Sage, C Refined Blue, D Navy & Tints; sample Hebrew data). Source: the agent's scratchpad, not in the repo. Sent to colleagues for opinions on 27/11/2026.
- **Direction not chosen yet.** The user liked from D: the tinted background behind the values in each patient row, and the filter pills.
- **Rule: only real data.** Never design with data the app does not have (the agent once invented problem categories; rejected). Tinted category chips only where the data has a real category or status. "Active" problem status was judged to add no value.
- **Filter pills on the patients list** (All, Has next meeting, No next meeting, Series finished) are wanted. "Series finished" means sessions done equal sessions planned (decided 27/11/2026).

## Constraints
- Hebrew/RTL first: check every change in RTL; use logical properties.
- Caretakers are non-technical: prettier must not mean busier.
- Red, orange and green stay reserved for error, warning and success. Contrast stays at WCAG AA.
- All UI strings: reuse existing strings where possible (Hebrew is machine-translated per exact English string).
- Dates dd/mm/yyyy via `time.ts` helpers and `DateField`.
- Palette changes mean updating `Claude Style-Guide.md` (ask first). No new packages.
- Each tier is a separate branch/release. The agent never commits, merges or deploys; the user runs the scripts.

---

## 0. Session start-up
1. Read `CLAUDE.md`, `airules.md`, `Claude Style-Guide.md`, this plan.
2. Check `git status` and the branch before editing (the user may run `finish-feature.ps1` mid-conversation).
3. Confirm the chosen direction in §3 before changing colours.

## 1. Tier 1: Brand and tokens (about 1 day, lowest risk)
Change values in one place and nearly every screen updates.
1. Merge `src/globals.css` and `src/index.css` into one set of tokens; define the missing ones (e.g. `--font-size-2xl`).
2. Apply the chosen palette as tokens: action colour, heading colour (navy in D), page background, card radius and shadow.
3. Quiet the Log out button (no full-width yellow).
4. Modal header: white with icon and a bottom border, replacing the full-width solid blue bar (affects every modal).
5. Fonts: confirm Assistant is used for Hebrew, add heading weights, raise the smallest text sizes.
6. Replace hard-coded hex colours with tokens where they match an existing token (mechanical, reviewable in a diff).
7. Update `Claude Style-Guide.md` to the new tokens (with the user's OK).

## 2. Tier 2: Screen polish (about 2-3 days)
1. **Logo and sidebar:** hexagon mark; active item with a tint and a bar on the start side.
2. **Page headers** like the Knowledge page (icon, title, one-line subtitle) on Patients, Today, Settings, Analysis.
3. **Patients list:** tinted tile behind next meeting, last treatment and sessions; session progress bar; filter pills; a friendly empty state.
4. **Today's appointments:** appointment as a card with real buttons (not underlined links); hourly "book" chips only on demand.
5. **Treatment stepper:** larger step labels, a clear current step, check marks on completed steps; visually separate the two tab rows so only one reads as the current process.
6. **Forms:** group fields into titled cards with icons; use `DateField` for dates.
7. **Tables and badges:** soft tinted badges instead of saturated ones; grey edit/delete icons with red only on hover.
8. **Empty and loading states:** skeletons and a message with a call to action.

## 2b. Tier 3: Imagery and delight (optional)
- Honeycomb pattern or illustration on the login page and empty states.
- A home page with summary tiles (today's appointments, treatments this week), only from data that exists.
- Dark mode, if wanted (the Tier 1 tokens make it feasible).

## 3. Progress tracker

| Step | What | Status |
|---|---|---|
| 0 | Style preview (directions A-D) | Done 27/11/2026; sent to colleagues for opinions |
| 0b | Choose the direction (and which parts of others) | Done 28/11/2026: **D · Navy & Tints** |
| 1 | Tier 1: Brand and tokens | Done 28/11/2026 on branch `UI-redesign` (not committed); approved by the user; `Claude Style-Guide.md` updated. See Tier 1 notes below. |
| 2a | Tier 2, first round: sidebar, treatment stepper, patients list, today's appointments | Done and tested by the user 28/11/2026 (same branch; user decision: Tier 1 + 2 in one release). See Tier 2 notes below. |
| 2b | Tier 2, second round: page headers, `DateField`, tables and badges, loading states | Done and tested by the user 28/11/2026; `Claude Style-Guide.md` updated (selected colour, pages vs windows, row icons, badges, LoadingState, DateField). Titled form cards: not wanted. **Tier 2 is finished.** Next: the user deploys the branch (staging, then finish-feature). |
| 3 | Tier 3: Imagery and delight | Not needed (user decision 28/11/2026) |

### Tier 1 notes (28/11/2026)
- **Tokens:** `src/index.css` is the single token source. It always won before, because it loads after `globals.css`, so the `globals.css` duplicates (primary `#1e40af` etc.) were dead code and are removed. `globals.css` keeps the font import and global rules.
- **Palette D:** action colour teal `#0b7a6e` (darker than the preview's `#0e8a7d` so white text meets AA 4.5:1); navy `#1e2a5a` for headings, selected tabs/steps/toggles and table headers; honey `#f2b705` only for the avatar and the "view as" box.
- **Roles:** `--color-selected*`, `--color-heading` and `--modal-header-*` tokens, so a later palette change touches only `index.css`.
- **Modal headers:** white with a navy title and bottom border, in the shared `common/Modal` and the patient intake, appointment, questionnaire, measure, point, problem and protocol forms, plus the activity log and user management headers.
- **Sidebar:** white background, light navy hover, quiet outlined Log out, navy count badge and title.
- **Fonts:** body font is now `'Inter', 'Assistant'`; before it was `'Inter', sans-serif`, so Hebrew used a system font and Assistant was never used.
- **Missing tokens defined:** e.g. `--radius-full`, `--font-size-2xl`, `--transition-*`, `--shadow-md`, `--border-radius-sm/lg`. Elements that used them get the intended look now, for example pill shapes.
- **Hard-coded colours:** old-blue `rgba(37, 99, 235, …)` tints now use `--color-primary-rgb`; hex values equal to a token were replaced. Kept on purpose: 3D scene and point-marker colours, measure colours, the activity log's category badge tints, red "flag" tints, the print report.
- **`index.html`:** removed the Tailwind `bg-gray-50 text-gray-900` classes on `<body>`. They overrode the token page background.
- **Text sizes:** left for Tier 2. The tab and step text is 13-14px; it only looked tiny in the scaled-down screenshots.

### Tier 2 first-round notes (28/11/2026)
- **Sidebar** (`Sidebar.tsx`, `App.tsx`): hexagon brand mark and "ApitherapyCare" in mixed case. The current screen's item gets a navy tint, a start-side bar and `aria-current="page"`. App passes `activeView` ('patients' for the list and the intake over it; Today when the intake was opened from Today). A folded group (Data Analysis, Configuration, SuperAdmin) opens when its page is the current one. The "View As" box is grey instead of honey.
- **Treatment stepper** (`PatientIntake.tsx`): steps before the current one show a check mark (`stepDone`) and a navy connector line; larger labels and number circles; `aria-current="step"`. During the flow the patient tab row is a quiet white row with no filled tab, so only the stepper shows "where you are".
- **Patients list** (`PatientsDashboard.tsx`):
  - Page title with an icon and a subtitle, and a tinted table header.
  - Larger navy initials.
  - On wide screens the last treatment, next meeting and sessions values sit on soft navy tiles, with a progress bar under "done / planned".
  - Filter pills: All, With next meeting, No next meeting (series not finished), Treatment series finished (done ≥ planned), each with a count that follows the search.
  - The last-treatment date now uses `formatDate` (dd/mm/yyyy). It used the browser's locale.
  - An empty filter result no longer says "Get started by adding a new patient record".
- **Today** (`TodayPage.tsx`):
  - Title icon.
  - Card actions are real buttons with icons. Start treatment is filled teal. Cancel is grey and turns red only on hover.
  - The hourly "+ Book" chips are hidden behind a "Show free times for booking" toggle; on a day with nothing booked they show by default.
- **New UI strings** (to translate): "With next meeting", "No next meeting", "Treatment series finished", "Filter patients", "Your patients, their next meeting and their last treatment at a glance.", "Show free times for booking", "Hide free times". ("All" may already exist.)

### Decisions after testing 2b (28/11/2026)
- **Selected colour:** bright blue `#2f6bd8` (`--color-selected`; first tried `#3a57a7`, too dark) instead of navy, for active tabs, steps, toggles and filter pills and for the treatment-history table header. The navy stays for headings and the sidebar's current item.
- **Pages vs windows:**
  - Pages (patient list, Today, admin lists, knowledge, user management, activity log) keep a plain title with the icon tile.
  - Windows (edit forms, patient details, My Profile, settings, analysis) get a coloured header bar in the selected colour, with a white title, close button and icon. All of it is set by the `--modal-header-*` tokens.
  - Small confirmation dialogs (delete warnings) keep their own warning look.
- **Row icons:** edit turns teal on hover. Grey-to-navy was too faint on a small icon.
- **Titled form cards:** not wanted (user, 28/11/2026).

### Tier 2 second-round notes (28/11/2026)
- **Page titles:**
  - New shared `common/PageTitle` shows an icon tile with the title. The admin pages (protocols, points, point groups, measures, problems, questionnaires, point side check, body model lighting, user management, activity log) use it, with the same icon as their sidebar item.
  - `common/Modal` has a new optional `icon`, used for My Profile, Treatment Effectiveness and Application Settings.
  - No subtitles on admin pages, so there are no new texts to translate.
- **Dates:** the patient birth date (`PersonalDetails`) and the effectiveness period now use `DateField`, which is always dd/mm/yyyy. The stored value stays "yyyy-mm-dd", converted by the new `fromIsoDate` / `toIsoDate` in `utils/appointments/time.ts`.
- **Badges:** the effectiveness results were saturated fills with white text, set inline. They are now soft tints with dark text: green improvement, red degradation, grey no effect.
- **Row icons:** in the admin lists the edit and delete icons are grey. Edit tints navy on hover; delete turns red only on hover.
- **Loading:**
  - New shared `common/LoadingState` shows soft placeholder rows with a shimmer and the existing loading text, with `role="status"`. The shimmer stops under reduced motion.
  - It is used for the first patient-data load, Today and Calendar while "View As" loads, Knowledge, treatment history, measures history, user management, the activity log and the problems list.
  - The admin tables keep their in-table spinner.

## 4. Verification (every tier)
1. `npm run dev`; review each main screen in Hebrew and English at desktop, tablet and phone width: login, patients list, patient intake tabs, the five treatment steps, appointments, knowledge, admin lists.
2. Compare before and after screenshots of the same screens with the same data.
3. Contrast check (AA) for text, buttons and badges.
4. `npx tsc --noEmit` shows no new errors. Tiers 1-2 are mostly CSS.
5. Staging deploy and the user's review before production.
