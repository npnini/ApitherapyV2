# Appointments Feature: Implementation Plan (Phases 1 and 2)

> **For any new agent session:** this is the master plan. Read §0 first, then find the current step in §3 (Progress tracker) and work only on that step.
> The repo copy of this file is `docs/Future/Appointments-Implementation-Plan.md`. It is the one to keep updated.

## Context
Caretakers need to schedule, track and remind patients about treatment appointments. The approved functional spec is **`docs/Future/Appointments-Scheduling-Functional-Spec-v4.md`**. It is the coverage reference: every step below lists the spec sections (§) it covers, and §15 of the spec is the acceptance checklist.

Version 3 of the spec, based on Google Calendar, is superseded. **There is no Google Calendar or other calendar-API integration.** The app is the only place appointments are managed. Every book, move and cancel sends a calendar invitation email (an ICS file) to the patient and to the caretaker.

Work is split into small steps, and each step builds on the previous verified one. The user decides when each step is implemented and deploys it by hand, first to staging and then to production.

---

## 0. Session start-up (read first, every session)

1. Read these documents:
   - `CLAUDE.md`
   - `airules.md`: the key rules are to change only what the step lists and to ask before touching other components. There is no build or deploy by the agent.
   - `Claude Style-Guide.md`: UI rules. Use card sections, the standard inputs, buttons and modal header, never rely on colour alone, and keep focus rings.
   - the spec v4
   - this plan
2. Run `git branch --show-current` and `git status`. The user may have merged or switched branches between sessions.
3. **Standing rules** (from `CLAUDE.md` and user memory):
   - No commits, pushes, branches, package installs, config or `.env` edits, file deletions or renames without explicit instruction.
   - Every script, deploy or migration run needs the user's approval each time.
   - The user deploys to staging and production **manually**. Uncommitted state before a staging deploy is intentional.
   - `scripts/deploy/finish-feature.ps1` commits, merges **and automatically deploys to production**. Never run it unless asked.
   - Branches are created by the user with `.\scripts\deploy\new-branch.ps1 -BranchName "feature/appt-stepN-..."` from the repo root.
4. **Testing policy (user decision):**
   - No unit tests.
   - **Firestore rules for all new appointments data must have automated rules tests** (§1.4). They run through `npm run test:rules`, which `deploy-staging.ps1` also runs.
   - Everything else is verified by hand on the emulators (`npm run dev:all`) and on staging.
5. File and line references below are from 2026-09-27. Verify them before editing, because they drift.
6. **At the end of a step:** update §3 (status, date, notes, anything left over) in the repo copy of this plan.

---

## 1. Key technical decisions (apply to all steps)

### 1.1 Data model

**App defaults: `cfg_app_config/main.appointmentSettings`** (new schema group)

| Field | Meaning |
|---|---|
| `workingWeek` | `{0..6: {on, start:"HH:mm", end:"HH:mm"}}`. Day 0 is Sunday. |
| `defaultMeetingMinutes` | Default 30 |
| `patientRemindersDefault` | Boolean |
| `reminderSendTime` | `"18:00"` |
| `reminderChannels` | `{email, whatsapp, sms}` |
| `appNameInInvites` | `"Apitherapy"` |
| `patientNameLevel` | `'initials' \| 'first' \| 'full'` |
| `startTreatmentLeadMinutes` | 15 |

**Caretaker: `users/{uid}.appointmentPrefs`**

| Field | Meaning |
|---|---|
| `sendInvitesToMe` | Default true |
| `inviteEmail` | Default login email |
| `workingWeek`, `defaultMeetingMinutes`, `patientNameLevel` | Caretaker's own values |
| `timezone` | Default `"Asia/Jerusalem"` |

- New users get a copy of the app defaults when they are created (`App.tsx` ~94).
- Existing users: when `appointmentPrefs` is missing, every reader falls back to the app defaults. The first Save persists them.
- One shared helper, `getEffectiveAppointmentPrefs(user, appConfig)`, is used by both client and functions. Keep a small copy in functions.

**Patient: `patients/{id}.appointmentPlan`**

| Field | Meaning |
|---|---|
| `plannedSessions` | Number |
| `weeklySlots` | `[{weekday:0-6, time:"HH:mm"}]` |
| `remindersOn` | Boolean |
| `reminderChannel` | `'email' \| 'whatsapp' \| 'sms'` |
| `preferredLanguage` | Language code |

Check how `filterPiiTransform` (`functions/src/index.ts` ~443, used by the BigQuery patients export) treats the new nested field.

**Appointments: new collection `appointments/{id}`**

| Field | Meaning |
|---|---|
| `caretakerId`, `patientId` | Owner and patient |
| `start`, `end` | Timestamps |
| `status` | `'booked'\|'attended'\|'missed'\|'cancelled'` |
| `source` | `'booked'\|'walk_in'` |
| `treatmentId?` | Linked treatment |
| `notifyPatient` | Boolean |
| `statusSetBy` | `'auto'\|'manual'` |
| `createdAt`, `updatedAt`, `cancelledAt?` | Timestamps |
| `invite` | `{sequence, lastSentStart, lastSentEnd, lastSentStatus, lastSentAt}`. Written by functions only. |

Rules:
- "Suggested" rows are **never stored**. They are calculated on the client.
- **No deletes.** Cancelling sets `status: 'cancelled'`.
- **Session number** is calculated, not stored, from **recorded treatments** (spec §8, decided 2026-09-27), so treatments from before the feature count:
  - booked or due: number of treatments recorded before it + 1
  - attended: the number of its linked treatment (its position among the patient's treatments)
- **Planned sessions ≥ treatments recorded** (validated in the Appointments tab, Step 3). A walk-in adds 1 to `plannedSessions` (§1.3).

### 1.2 Invitations (the ICS file)
- A **Firestore trigger `onAppointmentWritten`** in functions sends the invitations. The client never sends email.
  - It is idempotent: it sends only when `(start, end, status)` differs from `invite.lastSent*`. That makes retries and its own write-back harmless.
  - Created with status `booked` → `METHOD:REQUEST`.
  - Time changed → `REQUEST` with `SEQUENCE+1`.
  - Status changed to `cancelled` → `METHOD:CANCEL`.
  - Attended, missed and walk-in changes send nothing.
- One email per recipient, because titles and languages differ (spec §12):
  - The **patient** gets one if `notifyPatient` is true and the patient has an email.
  - The **caretaker** gets one if `sendInvitesToMe` is on, sent to `inviteEmail`.
- ICS text is built by hand in `functions/src/appointments/ics.ts`, with no package:
  - `UID = <appointmentId>@apitherapy`, stable across all updates
  - `ORGANIZER` = the sender address, `ATTENDEE` = the recipient
  - UTC times; escape `,` `;` `\` and newlines
  - fold lines at 75 octets; UTF-8 for Hebrew
- Email goes through Resend. Copy the client and config pattern of `sendDocumentEmail` (`functions/src/index.ts` ~343–436): the key is in `cfg_secrets/main.emailApiKey`, and the sender comes from `notificationSettings.senderEmail`. Email bodies escape all values.
- **Main technical risk:** will Gmail, Outlook and Apple treat the email as a real invitation (update and cancel in place), or only as an attachment? Step 4 starts with a spike to check this.

### 1.3 Attendance automation
- **Trigger `onTreatmentCreated`** (`treatments/{id}`). When a treatment document is first created (at session opening, however the treatment was started):
  - **Decided 2026-09-29: attendance counts at the start.** The document is created when the caretaker finishes the first page of the treatment flow (Session Opening → Next), with status `Incomplete`; later pages update the same document, and resuming reuses it. An abandoned treatment still means the patient came, and matches "sessions done = treatment count".
  - it finds the patient's `booked` appointment on that day (in the caretaker's timezone) and sets `attended`, `treatmentId` and `statusSetBy:auto`;
  - if there is none, it creates a **walk-in** appointment (`source:walk_in`, status `attended`, length = default) and **increments `patients/{id}.appointmentPlan.plannedSessions` by 1** when a plan is set (spec §2, decided 2026-09-27). A booked appointment it did not match is left untouched; the nightly job marks it Missed and the caretaker decides.
  - **Matching = same day (user decision, 2026-09-27),** in the caretaker's timezone; no time window. Reason: a patient should not get more than one treatment per day.
  - **Second treatment for the same patient on the same day (user decision, 2026-09-27):**
    - The trigger treats it as a **walk-in**: a new Attended appointment and `plannedSessions` +1. The day's booked appointment is already Attended (linked to the first treatment), so it does not match again.
    - **Start Treatment warns but does not block.** The user needs several treatments per day for testing. Show a confirmation ("This patient already had a treatment today. Start another one?") on every path that opens a treatment: Today page (Step 6), patient list, and the intake's Start New Treatment. Build it in Step 6.
  - All treatment saves are in `PatientIntake.tsx` (saveTreatment callers ~644, 753, 870, 949, 993), and the document is created at session opening (~644). A trigger covers every path without client changes.
- **Scheduled `markMissedAppointments`**, at `"15 0 * * *"` Asia/Jerusalem:
  - For each `booked` appointment whose end is before today, it checks the patient's treatments that day. If there is one, the appointment becomes `attended`; otherwise `missed` (`statusSetBy:auto`). This also acts as a safety net if the trigger failed.
  - Copy the pattern of `dailyFeedbackSweeper` (~95) and `getStartOfDayUtc` (~39).
  - **Run time is configurable (user decision, 2026-09-28).** New setting `appointmentSettings.missedCheckTime` ("Missed-appointment check time", type `time`, 15-minute steps, default `"00:15"`), added to the App settings group in Step 6. A schedule cannot be read from Firestore, so use the same pattern as the Step 12 reminders: a tick every 15 minutes (`"*/15 * * * *"` Asia/Jerusalem) that runs the check when the current time reaches `missedCheckTime`, guarded by a `missed_check_runs/{yyyy-mm-dd}` document so each day runs once. Any time is valid: the job only handles appointments of days that have ended; a later time only delays Missed. The guard collection needs rules (functions-only: deny all client access) and a rules test case.
- A manual status change by the caretaker always wins. The nightly job only touches `booked` appointments.
- **Past statuses are not edited by hand (user decision, 2026-09-29; spec §2 updated).** The only manual change to a past appointment is **Missed → Cancelled** ("Mark as cancelled": the patient cancelled in advance but it was not cancelled in time). No manual Attended (Attended always means a linked treatment, and done = treatment count), no Attended → Missed/Cancelled, no past → Booked. A treatment on a different day from its appointment stays a walk-in; a "Link to treatment" action is not planned unless the need comes up. `onTreatmentCreated` case 2 (link a manually Attended appointment) stays for data created before this change. Built as **Step 6-pre**, on this branch after 6a is committed and before 6b.

### 1.4 Security rules and indexes
- Rules go in `config/firestore/firestore.rules`, using the existing helpers `isPatientCaretaker`, `canImpersonate` and `isAuthenticated` (lines 7–36, 112–114). For `appointments`:
  - **Read:** `resource == null || resource.data.caretakerId == auth.uid || canImpersonate()`.
  - **Create:** `isPatientCaretaker(patientId)`, `caretakerId == auth.uid`, `status == 'booked'`, `source == 'booked'`.
  - **Update:** owner only; `caretakerId` and `patientId` cannot change; `invite` cannot change; `status` must be a valid value.
  - **Delete:** never.
- **Automated rules tests (user decision, 2026-09-27):** add a new file, `tests/security-rules/firestore.rules.test.js`, in the style of `storage.rules.test.js` (`node:test` + `@firebase/rules-unit-testing`). The existing glob in `npm run test:rules` picks it up, so it runs automatically inside `deploy-staging.ps1` and `finish-feature.ps1`, and a failing test blocks the rules deploy. Required cases:
  1. A caretaker can create a `booked` appointment for their own patient.
  2. A caretaker **cannot** create one for another caretaker's patient, or with a different `caretakerId`.
  3. A caretaker **cannot** create an appointment with `status` other than `booked`, or `source` other than `booked`.
  4. A caretaker can read their own appointments, and **cannot** read another caretaker's.
  5. An impersonating user (`canImpersonate`) can read, and **cannot** write.
  6. The owner can move an appointment (`start`/`end`), cancel it and set its status; an invalid status value is rejected.
  7. The owner **cannot** change `caretakerId`, `patientId` or `invite`.
  8. Nobody can delete an appointment.
  9. An unauthenticated user can do nothing.
  10. Step 2 and Step 3 regression: a user can still update their own `appointmentPrefs` but **not** `role` or `canImpersonate`; the caretaker can update `appointmentPlan` on their own patient only.
- When a later step changes these rules (for example Step 12 adds `reminder_runs`), add matching cases to the same file.
- Indexes go in `config/firestore/firestore.indexes.json`:

  | Collection | Fields | Used by |
  |---|---|---|
  | `appointments` | `caretakerId` + `start` | Calendar, Today, patient list |
  | `appointments` | `caretakerId` + `patientId` + `start` | Appointments tab (client list queries must filter `caretakerId` for the read rule) |
  | `appointments` | `status` + `end` | Nightly job |
  | `appointments` | `patientId` + `status` + `start` | Attendance trigger |

### 1.5 Client structure
- **Service:** `src/services/appointmentService.ts`. It holds `listByCaretakerRange`, `listByPatient`, `listUpcomingByCaretaker`, `book`, `bookMany` (batch), `move`, `cancel` and `setStatus`.
- **Pure helpers** in `src/utils/appointments/`:
  - `prefs.ts`: effective prefs
  - `time.ts`: working hours, past or due, formatting (date-fns is already installed)
  - `clashes.ts`: overlaps, outside working hours, nearest free time in 15-minute steps
  - `suggestions.ts`: spec §9 rules
  - `status.ts`: labels, colours, legend, session number
- **UI:** `src/components/Appointments/`, containing `TodayPage`, `CalendarPage`, `AppointmentEditor`, `StatusLegend`, `AppointmentsTab`, `BookNextSession` and `PatternChangeDialog`.
- **Calendar library:** FullCalendar (`@fullcalendar/react`, `core`, `timegrid`, `interaction`).
  - The user approved this choice on 2026-09-24. **Confirm the install at the start of Step 4.**
  - Settings: `firstDay:0`, `direction` from `useT()`, `he` locale.
  - Check that the CSP in `firebase.json` allows FullCalendar's injected styles.
- **Navigation:** there is no router. Add `'appointments_today' | 'appointments_calendar'` to the `View` union (`App.tsx:39`).
  - Keep a `calendarFocusDate` state and a `returnTo` state, so the caretaker can go from the Appointments tab to the Calendar and back, and return to Today after a treatment.
- **i18n:** write English source text in `<T>` / `useT()`. Hebrew is translated automatically (`src/components/T.tsx`). Strings built at runtime use `registerString`.
- **Timezone (phase 1):** the client displays in the browser's local time; caretakers are in Israel. Functions use `appointmentPrefs.timezone` (default Asia/Jerusalem) for day boundaries. ICS times are UTC.

### 1.6 Known limitations
- **Admin "View As":** creating or editing data while impersonating already fails under the existing rules (`patients` require `caretakerId == auth.uid`). Appointments behave the same way: read-only while impersonating. This matches spec §14, which requires only seeing.
- Each step is visible in production as soon as the user deploys it. Every step is additive and does not change existing flows, except where a step says so explicitly.

---

## 2. Steps

Each step lists: goal · spec § covered · work · files · staging verification · safe for production?

> **Production release (user decision, 2026-09-27): Steps 4, 5, 7 and 6 go to production together**, so walk-ins (+1 to planned) and automatic Attended/Missed are live from the first day appointments exist. They are built on the one branch `feature/appt-step4-calendar` (`finish-feature.ps1` merges *and* deploys to production, so no step can be merged to `main` on its own before then). Each step is still verified on staging before the next starts.
>
> **Build order (user decision, 2026-09-27): 1 → 2 → 3 → 4 → 5 → 7 → 6 → 8 → 9 → 10**, then Step 11 (a separate fix, added 2026-09-29) after Steps 1–10 are in production; Phase 2 reminders are Steps 12–14. Step numbers are kept so references stay valid; Step 7 is built before Step 6. Consequences for Step 7 when built before Step 6:
> - Step 7 creates the `calendarFocusDate` / `returnTo` state in `App.tsx` (§1.5) for "Open in calendar" / "Back to patient"; Step 6 later extends `returnTo` for the Today page.
> - Attended / Missed are not automatic yet (Step 6). Past rows are corrected by hand with Change status.
> - Step 5 does not depend on Step 7: its invitations are tested by booking, moving and cancelling on the Step 4 Calendar page. From Step 7 on, booking in the Appointments tab sends them too.

### Phase 1

#### Step 1: App settings
- **Goal:** the admin can set appointment defaults. Nothing else uses them yet.
- **Spec:** §3.
- **Work:**
  1. Add an `appointmentSettings` group to `src/config/appConfigSchema.ts`.
  2. Add new setting types to `renderSetting` in `src/components/ApplicationSettings.tsx` (~519): `workingWeek` (7 rows: on/off, start, end), `time` (15-minute steps, with a warning for 22:00–07:00) and `select`.
  3. Rely on the existing defaults and deep-merge (~47–82) so current config documents still load.
  4. Add a typed `AppointmentSettings` interface in `src/types/appointments.ts`.
- **Verify:**
  - The defaults appear, save and reload.
  - Existing settings are unchanged after a save; compare `cfg_app_config/main` before and after in the emulator.
  - The page works in Hebrew RTL.
- **Production:** safe. It adds one admin section.

#### Step 2: Caretaker profile
- **Goal:** each caretaker has their own appointment preferences.
- **Spec:** §4.
- **Work:**
  1. Add an "Appointments" card to `src/components/UserDetails.tsx` with: send invitations to me, invitation email (validated), working week, meeting length, patient name level, timezone, and the tip text.
  2. Save through the existing `handleSaveUser` (`App.tsx` ~247).
  3. Copy the app defaults into new users at creation (`App.tsx` ~94).
  4. Add `getEffectiveAppointmentPrefs`.
  5. Extend the `AppUser` type.
- **Verify:**
  - An existing user sees the app defaults; after saving, the values are stored.
  - A new user gets the defaults.
  - Onboarding validation is unchanged.
  - Editing the profile while "View As" is active behaves as it does today.
- **Production:** safe.

#### Step 3: Patient plan (Appointments tab, top part only)
- **Goal:** the caretaker can enter a patient's treatment plan and reminder preferences.
- **Spec:** §8 (plan and reminder parts; the progress figure shows 0 until Step 7) and §9 (tab position).
- **Work:**
  1. Add `'appointments'` to `TabKey` / `TAB_ORDER` in `src/components/PatientIntake/PatientIntake.tsx` (~35–56), between `problems` and `treatments`, and move `documents` to before `problems` (user decision, 2026-09-27). It is **not** in `FIRST_FIVE`.
  2. ~~Add it to the `showUpdateButton` exclusions; the tab has its own Save button.~~ Changed during implementation: the tab uses the intake's standard **Update** button (hidden only while the patient is unsaved). Every intake Update writes the whole patient document with a merge, so saving the plan through the same path keeps the intake and App's patient list in sync and cannot be overwritten by a stale copy.
  3. Show "Save the patient first" when the patient is new.
  4. The tab's top part has:
     - planned sessions
     - weekly slots (+ Add slot, remove)
     - reminders on/off
     - channel, filtered by the channels enabled in settings and by the patient's email and mobile, with hints
     - preferred language
  5. Save writes `patients/{id}.appointmentPlan` with a merge.
  6. New patients get the reminders default from settings.
- **Verify:**
  - The tab order is correct and the plan saves and reloads.
  - Other tabs, the FIRST_FIVE gate and the Update button behave as before.
  - Check the BigQuery transform with the new field.
- **Production:** safe.

#### Step 4: Appointment core and Calendar page (no emails yet)
- **Goal:** the caretaker can book, move and cancel appointments and correct past statuses on a week calendar.
- **Spec:** §2 (statuses and colours), §5 (sidebar group with the Calendar item only), §7, and principles 1 and 6.
- **Work:**
  1. ~~**Confirm the FullCalendar install with the user.**~~ **Done 2026-09-27:** installed `@fullcalendar/core`, `react`, `timegrid`, `interaction` at `~6.1.21` (pulls in `preact` and `@fullcalendar/daygrid`). **Version 6, not 7:** v7.1.0 exists only for `core`/`react` (rebuilt on `@full-ui/headless-calendar`, needs `temporal-polyfill`); `timegrid`/`interaction` have no stable v7 and 6.1.21 requires core `~6.1.21`. v6 is also what most users run (core 6.1.21 ≈ 727k vs 7.1.0 ≈ 124k downloads/week). No new audit findings from these packages. CSP already allows inline styles (`style-src 'unsafe-inline'`), so no `firebase.json` change.
  2. Add the `appointments` rules and indexes, and **create `tests/security-rules/firestore.rules.test.js` with all the required cases in §1.4**. The step is not done until `npm run test:rules` passes.
     - **Ask the user first, then also fix (found 2026-09-27 in the prod deploy log):** `canImpersonate` is read as `.data.canImpersonate` in `config/firestore/firestore.rules` (~27) and `storage.rules` (~39). On users without that field this is an evaluation error; access is still correctly denied, but the emulator logs `Property canImpersonate is undefined on object`. Change both to `.data.get('canImpersonate', false) == true`; the §1.4 impersonation test cases cover it.
  3. Build `appointmentService.ts`, the `status`, `time` and `clashes` helpers, `CalendarPage`, `AppointmentEditor` and `StatusLegend`.
  4. In `src/components/Sidebar.tsx` (~104), add an "Appointments" group under My Profile with a Calendar item. Wire it in `App.tsx` (~515–571).
  5. The calendar needs:
     - week view, prev/next/today, shaded non-working hours, overlapping appointments side by side
     - drag or single click to create; editor with a patient search
     - "Notify patient" checkbox, stored now and used in Step 5
     - overlap and outside-working-hours warnings with "Book anyway"
     - drag to move or resize, with a confirmation
     - cancel; change status of past appointments
     - cancelled appointments hidden
- **Verify:**
  - Spec §15 items 7, 8 and 10 (the manual part).
  - Rules tests pass (`npm run test:rules`).
  - The calendar works in Hebrew RTL and on a tablet width.
  - The existing patient flows are unchanged.
- **Production:** safe. It adds a new page, and no email is sent yet.

#### Step 5: Calendar invitation emails
- **Goal:** booking, moving and cancelling send correct invitations to the patient and the caretaker.
- **Spec:** §12, principles 2–5 and 7, §14 (no email, spam), and §15 items 2–6.
- **Work:**
  1. **Spike first.** From the emulator or staging, send test invitations through Resend with the ICS file. Confirm that Resend lets you set the content type `text/calendar; method=REQUEST`; check this against the resend v6 attachment options. Then book → move → cancel in **Gmail, Outlook and Apple Calendar**. Record the results here. If a client shows only an attachment, stop and discuss with the user before continuing.
  2. Build `ics.ts`, email body templates (patient and caretaker, en/he, values escaped, no medical data) and the `onAppointmentWritten` trigger (§1.2).
  3. The "Notify patient" checkbox becomes live. When the patient has no email, the box is disabled with the note from the spec.
- **Verify:**
  - Test with real mailboxes on staging.
  - Moving an appointment updates the existing entry with no duplicate; cancelling removes it.
  - The caretaker's title uses the chosen name level; the patient's title uses the caretaker's name.
  - Changes to Attended or Missed send nothing.
- **Production:** real emails go to real patients from this step on. The user decides when.

#### Step 6: Sidebar Today item, Today page and attendance automation
- **Goal:** the caretaker's daily schedule, starting treatments from it, and automatic Attended and Missed.
- **Spec:** §5 (Today item, badge, landing rule), §6, §2 rules (walk-in, Missed after the day ends), and §15 items 9–10.
- **Work:**
  1. Build `TodayPage`:
     - hours from the working hours, stretched to include appointments outside them
     - a now-line
     - the state table of §6 (upcoming, due, attended, missed or cancelled), with Start Treatment ("Start early?" before the lead time), Call (`tel:`), WhatsApp (`wa.me`), Reschedule, Cancel, Mark as cancelled (Missed only; replaces Change status, see §1.3) and Book replacement
  2. Start Treatment reuses `handleStartTreatmentFlow` (`App.tsx` ~432) with the joined patient from App's `patients` state. Add a `returnTo` state so the caretaker comes back to Today afterwards; `handleBackToDashboard` currently always goes to the dashboard.
  3. "View treatment" reuses `src/components/PatientIntake/TreatmentSummary.tsx`.
  4. Add the Today item and badge to the sidebar.
  5. Landing rule: after the initial load, a caretaker with at least one patient lands on Today. This must not override the `?patientId=` deep link or onboarding.
  6. Functions: `onTreatmentCreated` and `markMissedAppointments` (§1.3).
- **Verify:**
  - A treatment started from Today, the patient list or the intake marks that day's appointment Attended.
  - A walk-in creates an Attended appointment.
  - The next morning, an unattended appointment becomes Missed; test by running the job manually in the emulator.
  - A manual correction is kept.
  - Step 6-pre: past appointments offer no Change status anywhere (Calendar editor, Appointments list); a Missed one offers Mark as cancelled, and it then counts as Cancelled, not Missed, in the progress line.
  - A caretaker with no patients lands on Patients.
- **Production:** this changes the landing page for caretakers with patients. The user decides when.

#### Step 7: Appointments tab list and suggestions
- **Goal:** the full patient appointment list, with suggestions and bulk booking.
- **Spec:** §8 (progress and pattern-change rule), §9, and §15 items 11, 12 and 14.
- **Work:**
  1. List columns and per-status actions.
  2. `suggestions.ts`: Remaining − Booked; start from the later of today and the last booked appointment (changed in Step 6-pre: pattern slots from now, skipping days with a Booked or Attended appointment); clash marking and "Try HH:mm".
  3. Book, Book all (only rows with no clash; one batch).
  4. The progress line.
  5. "Open in calendar" goes to the Calendar on that week, and "Back to patient" returns to this tab (uses `calendarFocusDate` / `returnTo`).
  6. `PatternChangeDialog` (Move / Keep as is).
- **Decided 2026-09-27 (from Step 3):** Done = the patient's **treatment count** (`getTreatmentCount`, all treatments including Incomplete; the same count that numbers a new treatment), so treatments from before the feature count. Missed, cancelled and booked counts in the progress line come from appointments. Session numbers follow §1.1.
- **Verify:**
  - Every rule in §9 on staging data.
  - Book all never books a clashing slot.
  - Past appointments never change when the pattern changes.
- **Production:** safe.

#### Step 8: Patient list
- **Goal:** the next meeting and progress are visible on the list.
- **Spec:** §10.
- **Work:**
  1. In `App.fetchInitialData` (~102–174), make one query for the caretaker's upcoming booked appointments and one for attended counts. Map them per patient.
  2. Add two columns to `src/components/PatientsDashboard.tsx` (~105–162).
  3. Add a narrow-screen media query to `PatientsDashboard.module.css` that combines the two into one cell.
  4. Clicking the next meeting opens the Calendar on that week.
- **Verify:**
  - The values are correct, search still works, and the layout holds on a tablet and in RTL.
  - Dashboard load time is not noticeably slower.
- **Production:** safe.

#### Step 9: End of treatment, "Book next session"
- **Goal:** the next session can be booked right after a treatment.
- **Spec:** §11 and §15 item 13.
- **Work:**
  1. Add an optional `children` prop to `src/components/ConfirmationModal.tsx`. The change is additive; existing callers are unaffected.
  2. Render `BookNextSession` inside the "treatment saved" modal (`PatientIntake.tsx` ~1499–1507), covering the 5 situations in §11 (already booked, next pattern slot, no pattern → +7 days, clash → nearest free time, course complete → Extend course).
  3. Book, Skip and Extend.
- **Verify:** each of the 5 situations; `handleConfirmSaved` behaves as before.
- **Production:** safe.

#### Step 10: Special cases and final pass
- **Goal:** close the remaining spec items and run the whole checklist.
- **Spec:** §14 and all of §15.
- **Work:**
  1. ~~Patient deletion (`App.tsx` `handleDeletePatient` ~408): confirm, then cancel upcoming appointments, which sends the cancellation invitations. Note that deletion is already disabled once a patient has treatments.~~ Dropped (user decision, 2026-09-29): patients are never deleted, so there is nothing to cancel. See Step 15.
  2. Check read-only behaviour under "View As".
  3. Tidy the empty and no-email notes.
  4. Update `docs/operations/app-functional-inventory.md` (including the new intake tab order from Step 3).
  5. ~~Optional: BigQuery export of `appointments`~~ Moved to Phase 3 (user decision, 2026-09-27).
- **Verify:** every §15 item is ticked on staging, with results recorded in §3.

#### Step 11: Fix "latest treatment" ordering (separate fix branch)
- **When:** after Steps 1–10 are deployed to production (user decision, 2026-09-29), on its own fix branch.
- **Problem (found 2026-09-29 in Step 6a, pre-existing):** `getLatestTreatment` (`src/firebase/patient.ts` ~164) orders by document id descending. Treatment ids are `<patientId>_<n>`, which sort as text, so `_10` comes before `_9`: for a patient with 10 or more treatments, "latest" can be the wrong treatment.
- **Where it is used (check all before changing):** the intake's Resume / Treatment Feedback button (`latestTreatment` in `PatientIntake.tsx`), `App.fetchInitialData` (fallback for `lastTreatment` on the dashboard), and any other caller found by a search.
- **Fix direction:** order by `createdTimestamp` (or by the numeric `treatmentNumber`) instead of the id; check whether that query needs a composite index (`patientId` + `createdTimestamp`) and add it to `config/firestore/firestore.indexes.json` if so.
- **Verify:** a patient with 10+ treatments shows the right latest treatment in the intake and the dashboard.
- **Not affected:** the Step 6 "already had a treatment today" warning uses `hasTreatmentToday`, which reads all the patient's treatments.

#### Step 15: Patients are never deleted (separate fix branch)
- **When:** later, on its own fix branch (user decision, 2026-09-29). Not part of the Steps 4–7 release.
- **Decision (user, 2026-09-29):** a patient is never deleted, even with no treatments. The questionnaire, consent, documents and other data are kept. A rare removal request is handled by an admin in the Firebase console.
- **Problem found (2026-09-29):** the patient list's delete icon (`PatientsDashboard.tsx` ~150, disabled only once `medicalRecord.lastTreatment` is set) calls `App.tsx` `handleDeletePatient` (~456), which deletes only `patients/{id}`. Left behind: `patient_medical_data/{id}` and its `documents` subcollection, Storage `Patients/{id}/…` (documents, consent and instructions signatures), `questionnaire_responses`, `measured_values` from the Problems tab, and `appointments` (booked ones stay on the calendar, no cancellation). These leftovers cannot be reached or cleaned from the app afterwards, because their rules check the caretaker via `get(patients/{id})`. The "no treatments" check exists only in the UI: the `patients` rule lets the owner delete at any time.
- **Work:**
  1. Remove the delete icon, its confirmation dialog and `onDeletePatient` from `PatientsDashboard.tsx`, and `handleDeletePatient` from `App.tsx`. Removed rather than permanently greyed out, because a button that can never be used confuses caretakers.
  2. `config/firestore/firestore.rules`: `patients` → `allow delete: if false` (update stays owner-only).
  3. Rules tests: nobody can delete a patient, including the owner, an admin and an impersonator; the owner can still update.
  4. Optional, only if the user asks: a read-only diagnostics script listing leftovers from past deletions on staging and production.
- **Verify:** no delete icon on the patient list (English and Hebrew); `npm run test:rules` passes; editing, starting a treatment and the other patient list actions work as before.

### Phase 2: Patient reminders (spec §13)

#### Step 12: Reminder engine and email channel
- **Work:**
  1. The schedule can't be dynamic, so use a scheduled tick `"*/15 * * * *"` Asia/Jerusalem. It fires when the current time matches `reminderSendTime`, guarded by a `reminder_runs/{yyyy-mm-dd}` document so each day runs only once.
  2. Select tomorrow's `booked` appointments (next calendar day, caretaker timezone) for patients with `remindersOn` and an available channel.
  3. Send in the patient's language. Content: day, time, caretaker name and address; no medical data.
  4. Add an **opt-out link**: a signed-token `onRequest` endpoint sets `remindersOn=false`, which covers "A patient can ask not to receive reminders".
- **Verify:** timing, the day-boundary window, a late booking gets no reminder, opt-out works, and a second run on the same day sends nothing.

#### Step 13: WhatsApp channel
- **Needs user decisions:** provider (Meta Cloud API or Twilio), Meta template approval, and how opt-in is recorded.
- Keys go in `cfg_secrets/main` (the existing pattern).

#### Step 14: SMS channel
- **Needs user decisions:** provider (for example Twilio or a local Israeli provider). Same pattern as Step 13.

Telegram is postponed (spec §13.7). WhatsApp Confirm / Reschedule buttons are a later improvement.

### Phase 3: Appointments in data analysis (not planned yet)

**User decision, 2026-09-27:** the BigQuery export exists for the treatment-effectiveness analysis. What appointments mean for that analysis (adherence, missed sessions, planned vs. done, and so on) has not been decided. It gets its own phase after it is thought through and planned. No export work is done in Phases 1–2.

Facts to start from:
- The existing patients export (`fs-bq-export-patients` with `filterPiiTransform`, `functions/src/index.ts` ~443) removes a fixed list of PII fields and passes everything else through. So from Step 3 on, `patients.appointmentPlan` (planned sessions, weekly slots, reminder on/off, channel, language; no names or contact details) already appears in the BigQuery patients raw table's `data` JSON. Nothing breaks; nothing reads it yet.
- The `appointments` collection is not exported. Exporting it needs a new extension instance and env files (config changes).

---

## 3. Progress tracker (update at the end of every step)

| Step | Status | Branch | Staging verified | Production | Notes |
|---|---|---|---|---|---|
| 1 App settings | Done 2026-09-27 | feature/appt-step1-app-settings | Yes, 2026-09-27 (English and Hebrew) | Yes, 2026-09-27 (merged to main via finish-feature) | New group `appointmentSettings` in `appConfigSchema.ts`; new setting types `workingWeek`, `time` (15-min select, warning 22:00–07:00), `select` (with `options`) in `ApplicationSettings.tsx`; `reminderChannels` is a nested group of 3 booleans (existing mechanism). Save is blocked if a working day has end ≤ start. Types in `src/types/appointments.ts`. No rules change needed (`cfg_app_config` is admin-write, no field validation). `tsc --noEmit`: no errors in the Step 1 files. Also fixed outside the step, at the user's request: `App.tsx` passed an unused `appConfig` prop to `Sidebar` (type error). 14 older type errors remain in other files (ProblemAdmin, ProtocolSelection, ProtocolAdmin, TreatmentFeedback); not blocking, since `vite build` does not type-check. |
| 2 Caretaker profile | Done 2026-09-27 | feature/appt-step1-app-settings (branch holds Steps 1–3) | Yes, 2026-09-27 | Yes, 2026-09-27 (merged to main via finish-feature) | My Profile split into two tabs at the user's request: "Personal Details" and "Appointments" (tabs hidden during onboarding; one Save for both; a failed check switches to the tab with the error). Appointments tab in `UserDetails.tsx`: send invitations to me, invitation email (required when invitations are on, format checked), meeting length (5–480), patient name level, time zone (`Intl` list, Asia/Jerusalem first), working week, tip. Shared `WorkingWeekEditor` + `TimeSelect` in `src/components/Appointments/` (Step 1's settings page still has its own copy; can switch later). Defaults now in one place, `src/config/appointmentDefaults.ts`, used by the Step 1 schema too (same values). Helpers `getAppointmentSettings` / `getEffectiveAppointmentPrefs` in `src/utils/appointments/prefs.ts`; the functions copy is deferred to Step 5, the first step where functions need it. New users get the prefs at creation (`App.tsx` `fetchUserData`, reads the config itself). No rules change needed (users may update their own doc except `role`/`canImpersonate`). `tsc`: no errors in Step 2 files. |
| 3 Patient plan | Done 2026-09-27 | feature/appt-step1-app-settings | Yes, 2026-09-27 | Yes, 2026-09-27 (merged to main via finish-feature) | Steps 1–2 committed locally first (`f5ad86d`). Intake tab order now Personal, Questionnaire, Guidelines, Consent, **Documents, Problems, Appointments**, Treatments, Measures; `FIRST_FIVE` gate unchanged (by name). New `src/components/Appointments/AppointmentsTab.tsx` (Treatment plan card: planned sessions 1–200 or empty, progress "0 / N", weekly slots with Add/remove; Reminders card: on/off, channel radio list filtered by settings, unavailable channels disabled with hint, language). Saved with the standard Update button (see Step 3 item 2); "Save the patient first" and no Update while the patient is new. Helpers in `src/utils/appointments/plan.ts`. Progress = treatment count / planned (user request); planned may not be fewer than the treatments recorded. New patients get the effective plan (reminders default from settings) on their first save. BigQuery: checked, no change; see Phase 3. `tsc`: no errors in Step 3 files. |
| 4 Calendar page | Verified on emulators 2026-09-28 (after UX fixes: drag preview, patient picker, week arrows, dd/mm/yyyy, click = top of 30-min row, "HH:mm Name" on one line, scroll to 2 h before work start); `npm run test:rules` 82/82. **Done 2026-09-28** | feature/appt-step4-calendar | Yes, 2026-09-28 | Yes, 2026-09-30 (released with 5, 7, 6 via finish-feature) | FullCalendar 6.1.21. **Rules:** `appointments` block as §1.4, plus: `source` also immutable, field allowlist, `start`/`end` must be timestamps with end > start; `canImpersonate` read via `.get(..., false)` in firestore.rules and storage.rules (approved). **Tests:** `tests/security-rules/firestore.rules.test.js`, all §1.4 cases 1–10 plus times/allowlist/list-query cases. It uses its own `projectId` (`apitherapyv2-firestore-rules-test`): `node --test` runs the test files in parallel on one emulator and each clears Firestore, so sharing `apitherapyv2` with `storage.rules.test.js` made both flaky. Future rules test files need their own `projectId` too (only Storage tests must use `apitherapyv2`). **Indexes:** the read rule means every client list query must filter `caretakerId`, so the "Appointments tab" index is `caretakerId + patientId + start` (not `patientId + start`). **Service:** `listByCaretakerRange`, `book`, `move`, `setNotifyPatient`, `cancel`, `setStatus`; `listByPatient`, `bookMany` come with Step 7 and `listUpcomingByCaretaker` with Step 8. **UI:** `CalendarPage`, `AppointmentEditor` (patient search, date, 15-min start, length, Notify patient, overlap + outside-hours warnings with "Book anyway", cancel with confirmation, status correction once started), `StatusLegend` (colour + ✓ / struck name + "Missed" tag). Only future Booked appointments can be moved, resized or cancelled; booking in the past is refused. "View As" another caretaker: read-only. Sidebar group "Appointments" (always open) under My Profile with Calendar; `View` gains `appointments_calendar`. `tsc`: no errors in Step 4 files. |
| 5 Invitations | Done 2026-09-28 (Gmail + Outlook, en + he) | feature/appt-step4-calendar | Yes, 2026-09-28 | Yes, 2026-09-30 (released with 4, 7, 6) | Step 4 committed first (`56aa62c`). **User decisions:** test in Gmail and Outlook only; if both are fine, Apple is assumed fine (no Apple account). Staging: only the user's test patients have real emails, the rest are fake, so no recipient safeguard. **Built:** `functions/src/appointments/` — `ics.ts` (RFC 5545 by hand, UTC, escaping, 75-octet folding safe for Hebrew, `RSVP=FALSE`), `emails.ts` (patient/caretaker × booked/moved/cancelled, en/he, HTML-escaped, dd/mm/yyyy in the caretaker's timezone, no medical data), `prefs.ts` (server copy of prefs + name level), `onAppointmentWritten.ts` (idempotent via `invite`, re-reads the doc, one email per recipient, **separate UID per recipient** `<id>-patient@apitherapy` / `<id>-caretaker@apitherapy` so a shared test mailbox does not merge them, `.ics` attachment with `contentType: text/calendar; method=...` — supported by resend 6.28), exported from `index.ts`. Client: "Notify patient" off + disabled with the spec note when the patient has no email. Checks: functions `tsc`, style lint and security (SAST) lint clean on the new files; app `tsc` unchanged (14 old errors). **Spike results (2026-09-28, emulators):** Gmail: book ✔, move ✔ (same entry updated, no duplicate), cancel ✔. The booking `.ics` validated as correct at icalendar.org. Outlook: book ✔, move ✔, cancel ✔. Both clients tested in English and Hebrew. Apple assumed fine (user decision). First run found a bug: `admin.firestore.FieldValue` was undefined in the new module, so the `invite` write-back crashed after sending (moves still looked right, cancels were never sent); fixed with modular `firebase-admin/firestore` imports. Note: `dev:all` compiles functions only at start — rebuild (`cd functions; npm run build`) after changing functions code. |
| 7 Appointments tab list | Verified on emulators 2026-09-28 (incl. sub-tabs "Treatment plan" / "Appointments" added at the user's request; progress line above both; opens on Appointments when a plan exists; plan errors switch to Treatment plan; Move switches to Appointments). **Done 2026-09-29** | feature/appt-step4-calendar | Yes, 2026-09-29 | Yes, 2026-09-30 (released with 4, 5, 6) | Built before Step 6. Step 5 committed first (`75a3a68`). **Built:** `AppointmentList.tsx` (upcoming booked + suggestions in time order, then "Past and cancelled" newest first; columns #, Date, Time, Status, Actions; booked: Reschedule / Cancel / Open in calendar; started: Change status; suggested: Book / Change (inline dd/mm/yyyy date + 15-min time) / Open in calendar, clash text "Clashes with the appointment of <name>" + "Try HH:mm?", outside-hours note; "Book all (n)" books only non-clashing suggestions in one `writeBatch`, re-checked with fresh data and against each other); `suggestions.ts` (Remaining − upcoming Booked, from the later of now and the last booked, pattern order, DST-safe days; `offPatternBooked`, `slotsKey`); `clashes.ts` `nearestFreeStart` (15-min steps alternating later/earlier, prefers working hours, same day, ±6 h); `PatternChangeDialog.tsx` (after an Update that changes the saved weekly slots, if future booked appointments are off the new pattern: Move = re-place them in order on the next new-pattern slots that clash with nothing, Keep as is = nothing; past never touched); progress line "Sessions done: d / p · Missed · Cancelled · Remaining · Booked" (label: value pairs for Hebrew); service `listByPatient`, `bookMany`. **Open in calendar / Back to patient:** `App.tsx` `calendarFocusDate` + `calendarReturnPatient`; Calendar opens on that week (`initialDate`) with a "Back to patient: <name>" button that reopens the intake on the Appointments tab; the sidebar Calendar clears both; unsaved intake changes ask first (close-guard wording). **Choices to confirm:** bookings from the list use Notify patient = on when the patient has an email (no per-row box); # is shown for upcoming and suggested rows (done + position); past rows show "—" until Step 6 links treatments. "View treatment" on attended rows comes with Step 6 (needs `treatmentId`). `tsc`: no new errors. |
| 6 Today + attendance | **Done 2026-09-30** (6a, 6-pre and 6b verified on emulators and staging, all committed). **6a done 2026-09-30** (emulators and staging A–C 2026-09-29, E 2026-09-30: 3 appointments set by the Missed check; committed). **Next actions (for a new session):** (1) ~~`npm run test:rules` with emulators stopped (new cases: `missed_check_runs`, walk-in edits)~~ **passed 2026-09-29, 90/90**; (2) ~~emulator checks after restarting `npm run dev:all`: booked today → treatment page 1 → Attended + # + View treatment; no booking → walk-in + planned +1; second treatment same day → warning, walk-in, +1~~ **passed on emulators 2026-09-29**; staging: A (booked → Attended), B (walk-in +1), C (second treatment same day) **checked 2026-09-29**; D (manual Attended linking) not needed, the behaviour is removed in 6-pre; E (Missed check) **checked 2026-09-30**; (3) staging: Missed check (seed yesterday's booking in the console, set check time a quarter hour ahead; delete that day's `missed_check_runs` doc to re-run); (4) ~~commit 6a~~ done (`192650f`); (5) **Step 6-pre: done 2026-09-30** — rules tests 96/96, verified on staging, committed (see "6-pre built" in Notes) (§1.3, decided 2026-09-29): remove Change status from past appointments in `AppointmentEditor` (Calendar) and `AppointmentList`; add "Mark as cancelled" on Missed rows; service `setStatus` narrowed accordingly; optional rules tightening (owner status changes limited to Booked → Cancelled and Missed → Cancelled) with rules tests — confirm with the user when building; also in 6-pre, **suggestions rule change** (user decision, 2026-09-29; spec §9 updated): `buildSuggestions` takes pattern slots from now on and skips days on which the patient has a Booked or Attended appointment, instead of starting after the last booked one (which left gaps when a booking was made weeks ahead, and could suggest a second slot on a booked day); count stays Remaining − upcoming Booked; verify both cases (booking 3 weeks ahead → no gap; booking on a pattern day at another time → that day's pattern slot not suggested); also in 6-pre, **RTL progress fix** (found by the user on staging, 2026-09-29): in Hebrew the progress line shows "done / planned" reversed (e.g. `0 / 2` reads as planned / done), because the spaces around `/` make it a neutral that the RTL paragraph reorders; wrap the fraction in `AppointmentsTab.tsx` (~176, `{progress.done} / {progress.planned}`) in an LTR-isolated element (`<bdi dir="ltr">`), and check any other number pair added later (Today's "Session n of N" uses words, not affected); also in 6-pre, **live updates** (user decision, 2026-09-29): the appointment screens read once when they open, so changes written later by the functions (walk-in, Attended a few seconds after page 1 of a treatment, Missed) or from another browser tab appear only after reopening; switch `AppointmentsTab` (`listByPatient`) and `CalendarPage` (`listByCaretakerRange`, per visible week) to Firestore `onSnapshot` subscriptions in `appointmentService` (unsubscribe on unmount / range change; same queries, so no rules or index change), and build the 6b Today page live from the start; verify: with the Appointments tab open, start a treatment in another browser tab → the row turns Attended without reopening; (6) **6b (Today page): done 2026-09-30, verified on emulators and staging, committed; includes two changes from the first staging test (user, 2026-09-30), also verified on dev and staging:** (a) the patient's name opens the patient and is no longer struck through, the separate "Open patient" button is removed; (b) every hour from now on with room for a default-length meeting shows "+ Book HH:mm" (first free quarter hour), opening the booking editor there. **Then (user plan): commit, run `finish-feature.ps1` (merges to main and deploys Steps 4, 5, 7, 6 to production), and only after that Steps 8–10.** (see "6b built" in Notes) | feature/appt-step4-calendar | | Yes, 2026-09-30 (released with 4, 5, 7; first load showed "Could not load appointments." until a hard refresh: old app code or an index still building, no fix needed) | Built after Step 7; Step 7 committed first (`acebd0f`). **Split (user-approved 2026-09-29):** 6a = server automation, 6b = Today page (agenda layout approved: hour rows with appointment cards holding their buttons, not a time grid). **6a built:** `functions/src/appointments/onTreatmentCreated.ts` (on treatment create = end of page 1: same-day Booked → Attended + linked; else a same-day manual Attended without treatment → link only; else walk-in `walkin_<treatmentId>` + `appointmentPlan.plannedSessions` +1 in one transaction; idempotent), `markMissedAppointments.ts` (every 15 min, works once a day at/after `missedCheckTime`, claims the day with `missed_check_runs/{yyyy-mm-dd}` via create(); Booked with end ≤ today's start → Attended if a treatment that day, else Missed; only Booked touched), `zone.ts` (DST-safe local-day helpers), prefs gains `defaultMeetingMinutes` / `missedCheckTime`. New App setting "Missed-Appointment Check Time" (default 00:15); the 22:00–07:00 warning now only on settings flagged `warnQuietHours` (the reminder time). Rules: `missed_check_runs` deny-all + tests; walk-in status correction / source lock tests. Client: "This patient already had a treatment today. Start another one?" (warn, never block) on patient list Start Treatment and intake Start New Treatment, via `hasTreatmentToday` (reads all the patient's treatments: existing `getLatestTreatment` sorts ids as text, so `_10` < `_9` — pre-existing, left as is); Appointments list: # on attended rows = linked treatment's `treatmentNumber`, "Walk-in" label, "View treatment" (TreatmentSummary in a modal). **Fix found while building:** the server's +1 planned could be overwritten by the intake's stale copy on the next Update of any tab — Update of other tabs now re-reads the stored plan before saving, and opening the Appointments tab refreshes the plan (unless unsaved edits). Checks: functions tsc + style + security lint clean; app tsc unchanged. **Fix found on the first staging deploy (2026-09-29):** `markMissedAppointments` deployed to us-central1. `setGlobalOptions` ran in `index.ts` after the `appointments/*` modules had already defined their functions, so they got the default options (the two Firestore triggers still landed in me-west1 because the CLI places them in the database region, but without the 512MiB memory). Moved `setGlobalOptions` to `functions/src/globalOptions.ts`, imported first in `index.ts`. Redeploy: answer yes to deleting the us-central1 `markMissedAppointments`. Redeployed to staging 2026-09-29: all functions in me-west1. **6-pre built (2026-09-30):** `status.ts` `canMarkCancelled` (Missed, or Booked past its start — the latter added so a patient who calls at the appointment time can be marked without waiting for the nightly check) replaces `MANUAL_PAST_STATUSES`; service `setStatus` removed, "Mark as cancelled" uses `cancel`; `AppointmentEditor` shows the status read-only with a "Mark as cancelled" button + confirmation; `AppointmentList` "Change status" → "Mark as cancelled" + confirmation. `onAppointmentWritten`: CANCEL is sent only when the appointment was cancelled before its start (compares `cancelledAt`), so marking a past meeting sends nothing and leaves it in both calendars. Rules: `isAllowedStatusChange` — a client may change status only to `cancelled`, from `booked` or `missed` (user approved); tests 6b and the walk-in case rewritten, new "manual status changes" block. `buildSuggestions`: pattern slots from now, skipping days with a Booked or Attended appointment and giving at most one suggestion per day. Progress fraction in `<bdi dir="ltr">`. Live: service `watchByPatient` (replaces `listByPatient`) and `watchByCaretakerRange` (`onSnapshot`); `AppointmentsTab` and `CalendarPage` subscribe, so their explicit reloads were removed, and `onChanged` is now optional in `AppointmentList` / `AppointmentEditor`. Checks: app `tsc` unchanged (14 old errors); functions `tsc` + lint clean. **6b built (2026-09-30):** `TodayPage.tsx` + `TodayPage.module.css` (agenda: one row per hour of today's working hours, stretched to include every appointment; cards with time, name (opens the patient), status badge, "Due now" tag, "Session number: n / N" (booked = treatments + 1, attended = linked treatment's number), Walk-in; actions per state: upcoming → Start New Treatment with "Start the treatment before the appointment time?" confirmation, due → Start New Treatment highlighted, both with Call patient (`tel:`), WhatsApp (`wa.me`, local 05x → 972), Reschedule, Cancel (before start) / Mark as cancelled (after start); attended → Open patient, View treatment; missed/cancelled → Open patient, Mark as cancelled (missed), Book a replacement session (editor pre-filled with the patient's next pattern slot after today, else the next working day's start; the editor's clash check applies); now-line between cards; empty state; legend with all four statuses). Live data: `hooks/useTodayAppointments` (one `watchByCaretakerRange` subscription in App for the page and the sidebar badge, switches day at midnight) and `hooks/useNow` (clock tick only in the page and the sidebar). Sidebar: "Today" item with a badge = booked meetings of today not yet ended. `App.tsx`: view `appointments_today`; `showIntake()` records `intakeReturnView` when the intake is opened from Today, and closing it (`handleCloseIntake`, also after a saved treatment) returns there; the sidebar "Patients" still always goes to the list; Today stays under the intake overlay; landing rule once per login after the first patient load (patients > 0 → Today; not with `?patientId=` or onboarding). Editor: `canReschedule` lets a booked appointment of today be moved even after its start (patient running late; new start must be in the future); `initialPatientId` for Book replacement. `StatusLegend` takes an optional status list. Open patient opens the intake on its Appointments tab. Checks: app `tsc` unchanged (14 old errors). |
| 8 Patient list | Not started. **Next session starts here (as of 2026-09-30):** (1) the user creates `feature/appt-step8-patient-list` with `new-branch.ps1`; (2) commit this plan's 2026-09-30 production-release edit (it was left uncommitted on `main` after finish-feature) on that branch; (3) open question for the user: `scripts/deploy/deploy-prod.ps1` ~85 runs `firebase deploy --only firestore, storage` with a space after the comma, so PowerShell may pass `storage` as a separate word and skip the Storage rules — check the production deploy log and fix the line (`firestore,storage`) only if the user agrees; (4) then build Step 8 as in §2. Reminders: stop `npm run dev:all` before `deploy-staging.ps1` / `finish-feature.ps1` (their rules test needs the emulator ports); refresh open app tabs after each deploy. | | | | |
| 9 End of treatment | Not started | | | | |
| 10 Final pass | Not started | | | | |
| 11 Fix latest-treatment ordering | Not started | (own fix branch) | | | After Steps 1–10 are in production |
| 15 Patients never deleted | Not started | (own fix branch) | | | Decided 2026-09-29; remove the delete icon + deny delete in rules |
| 12 Reminders: email | Not started | | | | |
| 13 Reminders: WhatsApp | Not started | | | | Provider decision needed |
| 14 Reminders: SMS | Not started | | | | Provider decision needed |

---

## 4. Verification approach (every step)
1. **Local:** `npm run dev:all` (emulators; UI on port 5000) and `npm run dev`. Exercise the step's items in English and Hebrew.
2. **Rules:** `npm run test:rules`, with the user's approval, from Step 4 onwards.
3. **Staging:** the user runs `.\scripts\deploy\deploy-staging.ps1`. Then walk through the step's "Verify" list and the relevant spec §15 items, and record the results in §3.
4. **Production:** only when the user decides.
