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
- **Session number** is calculated, not stored:
  - booked or due: number of attended appointments before it + 1
  - attended: its position among attended appointments

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
  - it finds the patient's `booked` appointment on that day (in the caretaker's timezone) and sets `attended`, `treatmentId` and `statusSetBy:auto`;
  - if there is none, it creates a **walk-in** appointment (`source:walk_in`, status `attended`, length = default).
  - All treatment saves are in `PatientIntake.tsx` (saveTreatment callers ~644, 753, 870, 949, 993), and the document is created at session opening (~644). A trigger covers every path without client changes.
- **Scheduled `markMissedAppointments`**, at `"15 0 * * *"` Asia/Jerusalem:
  - For each `booked` appointment whose end is before today, it checks the patient's treatments that day. If there is one, the appointment becomes `attended`; otherwise `missed` (`statusSetBy:auto`). This also acts as a safety net if the trigger failed.
  - Copy the pattern of `dailyFeedbackSweeper` (~95) and `getStartOfDayUtc` (~39).
- A manual status change by the caretaker always wins. The nightly job only touches `booked` appointments.

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
- When a later step changes these rules (for example Step 11 adds `reminder_runs`), add matching cases to the same file.
- Indexes go in `config/firestore/firestore.indexes.json`:

  | Collection | Fields | Used by |
  |---|---|---|
  | `appointments` | `caretakerId` + `start` | Calendar, Today, patient list |
  | `appointments` | `patientId` + `start` | Appointments tab |
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
  1. Add `'appointments'` to `TabKey` / `TAB_ORDER` in `src/components/PatientIntake/PatientIntake.tsx` (~35–56), between `documents` and `treatments`. It is **not** in `FIRST_FIVE`.
  2. Add it to the `showUpdateButton` exclusions (~1190). The tab has its own Save button.
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
  1. **Confirm the FullCalendar install with the user.**
  2. Add the `appointments` rules and indexes, and **create `tests/security-rules/firestore.rules.test.js` with all the required cases in §1.4**. The step is not done until `npm run test:rules` passes.
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
     - the state table of §6 (upcoming, due, attended, missed or cancelled), with Start Treatment ("Start early?" before the lead time), Call (`tel:`), WhatsApp (`wa.me`), Reschedule, Cancel, Change status and Book replacement
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
  - A caretaker with no patients lands on Patients.
- **Production:** this changes the landing page for caretakers with patients. The user decides when.

#### Step 7: Appointments tab list and suggestions
- **Goal:** the full patient appointment list, with suggestions and bulk booking.
- **Spec:** §8 (progress and pattern-change rule), §9, and §15 items 11, 12 and 14.
- **Work:**
  1. List columns and per-status actions.
  2. `suggestions.ts`: Remaining − Booked; start from the later of today and the last booked appointment; clash marking and "Try HH:mm".
  3. Book, Book all (only rows with no clash; one batch).
  4. The progress line.
  5. "Open in calendar" goes to the Calendar on that week, and "Back to patient" returns to this tab (uses `calendarFocusDate` / `returnTo`).
  6. `PatternChangeDialog` (Move / Keep as is).
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
  1. Patient deletion (`App.tsx` `handleDeletePatient` ~408): confirm, then cancel upcoming appointments, which sends the cancellation invitations. Note that deletion is already disabled once a patient has treatments.
  2. Check read-only behaviour under "View As".
  3. Tidy the empty and no-email notes.
  4. Update `docs/operations/app-functional-inventory.md`.
  5. **Optional, ask the user:** a BigQuery export of `appointments` for adherence analytics. This needs a new extension instance and env files, which are config changes.
- **Verify:** every §15 item is ticked on staging, with results recorded in §3.

### Phase 2: Patient reminders (spec §13)

#### Step 11: Reminder engine and email channel
- **Work:**
  1. The schedule can't be dynamic, so use a scheduled tick `"*/15 * * * *"` Asia/Jerusalem. It fires when the current time matches `reminderSendTime`, guarded by a `reminder_runs/{yyyy-mm-dd}` document so each day runs only once.
  2. Select tomorrow's `booked` appointments (next calendar day, caretaker timezone) for patients with `remindersOn` and an available channel.
  3. Send in the patient's language. Content: day, time, caretaker name and address; no medical data.
  4. Add an **opt-out link**: a signed-token `onRequest` endpoint sets `remindersOn=false`, which covers "A patient can ask not to receive reminders".
- **Verify:** timing, the day-boundary window, a late booking gets no reminder, opt-out works, and a second run on the same day sends nothing.

#### Step 12: WhatsApp channel
- **Needs user decisions:** provider (Meta Cloud API or Twilio), Meta template approval, and how opt-in is recorded.
- Keys go in `cfg_secrets/main` (the existing pattern).

#### Step 13: SMS channel
- **Needs user decisions:** provider (for example Twilio or a local Israeli provider). Same pattern as Step 12.

Telegram is postponed (spec §13.7). WhatsApp Confirm / Reschedule buttons are a later improvement.

---

## 3. Progress tracker (update at the end of every step)

| Step | Status | Branch | Staging verified | Production | Notes |
|---|---|---|---|---|---|
| 1 App settings | Not started | | | | |
| 2 Caretaker profile | Not started | | | | |
| 3 Patient plan | Not started | | | | |
| 4 Calendar page | Not started | | | | Confirm FullCalendar install |
| 5 Invitations | Not started | | | | Spike results go here |
| 6 Today + attendance | Not started | | | | |
| 7 Appointments tab list | Not started | | | | |
| 8 Patient list | Not started | | | | |
| 9 End of treatment | Not started | | | | |
| 10 Final pass | Not started | | | | |
| 11 Reminders: email | Not started | | | | |
| 12 Reminders: WhatsApp | Not started | | | | Provider decision needed |
| 13 Reminders: SMS | Not started | | | | Provider decision needed |

---

## 4. Verification approach (every step)
1. **Local:** `npm run dev:all` (emulators; UI on port 5000) and `npm run dev`. Exercise the step's items in English and Hebrew.
2. **Rules:** `npm run test:rules`, with the user's approval, from Step 4 onwards.
3. **Staging:** the user runs `.\scripts\deploy\deploy-staging.ps1`. Then walk through the step's "Verify" list and the relevant spec §15 items, and record the results in §3.
4. **Production:** only when the user decides.
