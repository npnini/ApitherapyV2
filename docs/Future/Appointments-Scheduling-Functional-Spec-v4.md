# Appointments: Scheduling, Management and Reminders
## Functional specification, version 4 (UX level)

**Status:** Approved 2026-09-26. This is the reference for checking implementation coverage: every section and every item in the section 15 checklist must be traceable to the implementation. It supersedes version 3 (Appointments-Scheduling-Functional-Spec-v3.md).

**Purpose of this version:** Version 4 replaces version 3. The app **no longer connects to Google Calendar** or to any other calendar service. The app keeps its own appointment calendar. Every booking, change and cancellation is sent as a **calendar invitation email** to both the **patient** and the **caretaker**, so it appears in whatever calendar each of them uses (Google, Outlook, Apple and others). This document describes what the user sees and does, not how it is built.

**Why this changed:** A Google Calendar connection would carry significant risk: Google's approval process, a permission step caretakers may not understand or trust, and syncing problems. Many caretakers would benefit little from it. Email invitations work with every calendar, need no permissions, and still let caretakers see their appointments next to their other meetings.

---

## 1. Basic principles

1. **The app is the only place where appointments are managed.** Every appointment (who, when, session number, status) is kept in the app.
2. Every booking, change and cancellation is sent as a **calendar invitation email**:
   - to the **patient**, if the patient has an email address and the caretaker left "Notify patient" on;
   - to the **caretaker**, if "Send invitations to me" is on in their profile (on by default).
3. The invitation adds the appointment to the recipient's own calendar. A change **updates the existing entry** and a cancellation **removes it**. It never creates a duplicate.
4. **Changes are made only in the app.** Changes made directly in a personal calendar (moving or deleting the entry there) are not seen by the app and do not affect the appointment.
5. **Avoiding clashes with the caretaker's other commitments is the caretaker's responsibility.** The app does not see the caretaker's personal calendar. Because every appointment also arrives in the caretaker's own calendar, a caretaker who uses a calendar sees the clash there.
6. The app **does** warn about clashes **between its own appointments** (two patients at the same time), and about bookings outside working hours.
7. **Full patient names are shown only inside the app.** In the caretaker's invitation, the patient appears at the level of detail the caretaker chose (initials, first name or full name).
8. **Reminders to the caretaker** come from their own calendar's notifications, once the invitation is in it. The app does not send caretaker reminders.
9. **Reminders to patients** are the app's responsibility. They are sent by email, WhatsApp or SMS, whichever channel the patient chose. A patient can ask not to receive reminders.
10. All screens support Hebrew (right to left) and English. The week starts on **Sunday**.

---

## 2. Appointment statuses

Every appointment has exactly one status. The same names and colours are used on every screen.

| Status | Meaning | How it is set |
|---|---|---|
| **Suggested** | A proposed date and time, calculated from the patient's weekly pattern. **Not booked yet, and no invitation has been sent.** | Calculated automatically. Shown only in the patient's Appointments tab. |
| **Booked** | A confirmed appointment. Invitations were sent where applicable. | The caretaker books it. |
| **Attended** | The patient came and a treatment was recorded. | Set automatically when any treatment is recorded for the patient that day, however it was started. Never set by hand (decided 2026-09-29). |
| **Missed** | The patient did not come and did not cancel. | Set automatically at the end of the day if no treatment was recorded. |
| **Cancelled** | Cancelled in advance by the patient or the caretaker. **Does not count as missed.** | The caretaker cancels it, or marks a Missed appointment as cancelled afterwards. |

**Rules**
- A meeting is marked "Missed" automatically **only after the day has ended**, never while the caretaker could still record the treatment.
- **Past statuses are not edited by hand (decided 2026-09-29),** with one exception: a **Missed** appointment, or a Booked one whose start time has passed, can be **marked as cancelled** when the patient did cancel in advance but it was not cancelled in the app in time, so it does not count as missed. No cancellation invitation is sent for it, because the meeting time has already passed. Attended always means a recorded treatment, so it is never set by hand, and a past appointment is never set back to Booked. A treatment recorded on a different day from its appointment (for example, entered a day late) counts as a walk-in, and the appointment stays Missed.
- **Walk-in treatment:** if a treatment is recorded for a patient with no matching booked appointment, the app adds an "Attended" appointment at the time of the treatment, and **adds 1 to the patient's planned sessions** (if a plan is set), so the walk-in does not use up a planned session. A booked appointment that the treatment did not match **stays as it is** (Booked, then Missed after its day ends) until the caretaker decides what to do with it. No invitation is sent for the walk-in. A treatment **matches** a booked appointment when it is recorded on the **same day**, at any time; a patient should not get more than one treatment per day. If a second treatment is started for the same patient on the same day, the app **warns** ("This patient already had a treatment today. Start another one?") but allows it; the second treatment counts as a walk-in (+1 to planned). (Decided 2026-09-27.)

**Colours (shown in a legend on the Today and Calendar pages)**
- Booked (upcoming): bold colour.
- Attended: light colour.
- Missed: muted colour, with the patient name struck through and a "Missed" tag.
- Cancelled: not shown in the calendar. Shown in the patient's list only.

---

## 3. App settings: "Appointments & Reminders" section (admin)

These values are **defaults**. Changing them affects only caretakers and patients created afterwards. Existing profiles keep their values.

| Setting | Options | Default |
|---|---|---|
| Working week | For each weekday: working yes/no, start time, end time | Sun–Thu 09:00–17:00; Fri and Sat off |
| Default meeting length | Minutes | 30 |
| Patient reminders on by default | On / off. Used when a new patient is created. | On |
| Reminder sending time | Time of day, in 15-minute steps. A warning appears for times between 22:00 and 07:00. | 18:00 |
| Reminder channels available | On/off for each: **WhatsApp, SMS, Email** (Telegram, see §13) | Email on |
| App name in invitations | Text | "Apitherapy" |
| Patient name in caretaker invitations | Initials / First name / Full name | First name |
| "Start Treatment" available from | Minutes before the meeting starts | 15 |

---

## 4. Caretaker profile: "Appointments" section

| Setting | Notes |
|---|---|
| **Send invitations to me** | On/off. Default **on**. When on, every booking, change and cancellation is also sent to the caretaker's calendar. |
| **Invitation email address** | Defaults to the caretaker's login email. It can be changed, for example if the caretaker keeps their calendar under a different address. |
| Working week | For each weekday: working yes/no, start and end time. Copied from app settings when the caretaker is created. |
| Default meeting length | Minutes. Copied from app settings. |
| Patient name in my invitations | Initials / First name / Full name. Copied from app settings. |
| Time zone | Default Israel. Can be changed. |

**Tip shown under these settings:** "Appointments you book will appear in your own calendar (Google, Outlook, Apple…). The app does not see your other meetings, so please check your calendar for clashes."

---

## 5. Sidebar

- Under "My Profile" there is a group called **Appointments**, which is always open, with two items:
  - **Today**, showing a small badge with the number of meetings still to come today
  - **Calendar**
- After login:
  - a caretaker with **no patients yet** lands on the **Patients** list;
  - every other caretaker lands on **Today**.

---

## 6. Today page

A single-day view of the caretaker's **app appointments**.

**Layout**
- One row for each hour, from the start to the end of the caretaker's working hours for today.
- **If an appointment falls outside working hours, the view stretches to include it.** An appointment is never hidden.
- A line marks the current time.

**Appointment boxes**
- Show the patient's **full name**, the time, the status colour and the session number (for example "Session 4 of 10").

**Actions on an appointment**

"X minutes" below is the **"Start Treatment" available from** value in app settings (default 15).

| Appointment state | Available actions |
|---|---|
| **Upcoming**: starts more than X minutes from now | Start Treatment (asks "Start early?"), Call, WhatsApp, Reschedule, Cancel |
| **Due now**: from X minutes before the start until the end of the day, while no treatment has been recorded | **Start Treatment** (highlighted), Call, WhatsApp, Reschedule, Cancel |
| **Attended**: a treatment was recorded for this appointment | **Open patient** (opens the patient's intake) and **View treatment** (opens the summary of the treatment given in this appointment) |
| **Missed** or **Cancelled** | **Open patient** (opens the patient's intake); **Mark as cancelled** (Missed only: the patient cancelled in advance, see §2); **Book replacement** (opens the booking editor for this patient with the next free slot pre-filled, to make up for the lost session) |

- **Start Treatment** opens the treatment flow for that patient. When the treatment is saved, the appointment becomes "Attended".
- **Call** and **WhatsApp** use the patient's mobile number. They are hidden if there is no number.
- Clicking a past appointment always opens the patient. Past appointments are never "dead".

---

## 7. Calendar page

A full-width week view of the caretaker's **app appointments**.

**Display**
- Opens on the current week. Previous and next arrows, plus a **Today** button.
- Hours outside the caretaker's working hours are lightly shaded. Appointments there are still shown.
- Appointments are shown in their status colour, with the patient's full name.
- Appointments that overlap are shown **side by side** in the same time slot.
- A legend explains the colours.
- **"Past" means that the appointment's end time has passed.** The same rule applies on every page.

**Creating an appointment**
- **Drag** across a time range, or **click once** on an empty slot to create an appointment of the default length.
- An editor panel opens with:
  - Patient (search by name)
  - Date, start time and end time (pre-filled)
  - **Notify patient** checkbox, on by default. It is unavailable if the patient has no email, with the note "No email: patient will not be notified".
  - **Book** and **Cancel** buttons
- Warnings, each with **Book anyway** and **Change time** buttons:
  - **Overlaps another app appointment:** "This time overlaps with <patient>'s appointment".
  - **Outside working hours:** "This time is outside your working hours".

**Changing an upcoming appointment**
- Click the appointment to open the editor. The caretaker can change the date or time, **cancel** the appointment (status Cancelled), or open the patient.
- The caretaker can **drag** the appointment to another time, or drag its edge to change its length. A confirmation appears: "Move <patient> to <new time>? Updated invitations will be sent."
- The same warnings apply.

**Past appointments**
- Clicking a past appointment shows its status and a link to the patient. A Missed appointment also offers **Mark as cancelled** (§2).

---

## 8. Patient profile: meeting preferences and progress

These are shown **at the top of the patient's Appointments tab** (see §9).

**Treatment plan**
- **Planned sessions**
  - The caretaker sets this number **in the Appointments tab**. The tab comes after the Problems tab because the patient's problems are what the caretaker bases the number of sessions on.
  - The caretaker can change it at any time ("Extend course").
- **Weekly pattern:** a list of weekly slots, for example "Sunday 10:00" and "Wednesday 16:30".
  - An **"+ Add slot"** button adds a slot (weekday and time). Each slot has a remove button.
  - The number of meetings per week is simply the number of slots.
  - Changing the pattern affects **only future sessions**:
    - Suggested rows are recalculated at once.
    - Already booked appointments stay as they are, and past appointments never change. The app then asks: "You have N booked appointments on the old pattern. Move them to the new pattern?" The caretaker answers **Move** (each moved appointment is checked for clashes, and updated invitations are sent) or **Keep as is**.

**Progress (calculated automatically, never typed)**
- Shown as: **"6 of 10 sessions done · 1 missed · 1 cancelled · 3 remaining · 2 booked"**
- Done = treatments recorded for the patient, **including treatments recorded before the appointments feature existed** (patients already in treatment have treatments but no appointments). From then on every recorded treatment is also an Attended appointment (booked or walk-in), so the two counts agree. (Decided 2026-09-27.)
- Remaining = Planned − Done.
- **Planned can never be fewer than Done.** The app rejects a smaller number.

**Reminders**
- **Send reminders:** on/off. The default comes from app settings.
- **Channel:** only channels that are enabled in app settings *and* possible for this patient can be selected. For example, WhatsApp and SMS need a mobile number, and Email needs an email address. Unavailable options show a hint, such as "Add a mobile number to use WhatsApp".
- **Preferred language** for invitations and reminders: Hebrew or English. It defaults to the caretaker's language.

---

## 9. Patient intake: "Appointments" tab

**Position:** after the "Problems" tab and before the "Treatment History" tab (see §8). The "Documents" tab moves to before "Problems". Tab order: Personal Details, Questionnaire, Guidelines, Consent, Documents, Problems, Appointments, Treatments History, Measures History. (Decided 2026-09-27.) It can be opened at any stage of intake.

**Top of the tab:** the treatment plan, the progress and the reminder settings (see §8).

**Appointment list** (upcoming first, then past)

| Column | Content |
|---|---|
| # | Session number |
| Date | Date and weekday |
| Time | Start–end |
| Status | Suggested / Booked / Attended / Missed / Cancelled |
| Actions | Depend on the status (below) |

**Suggested rows**
- The app creates enough suggestions to cover **Remaining − Booked** sessions.
- Suggestions follow the weekly pattern. They take the pattern slots **from now on**, skipping any day on which the patient already has a Booked or Attended appointment (one session per day). So a booking made outside the pattern, for example from the Calendar, takes the place of one suggestion without pushing the others later or leaving a gap. (Changed 2026-09-29; previously suggestions started after the last booked appointment.)
- On each suggested row the caretaker can change the date or time and press **Book**.
- If a suggestion **clashes with another app appointment**, the row shows "Clashes with <patient>'s appointment" and offers the **nearest free time**, for example "Try 17:00?".
- **Open in calendar** opens the Calendar page on the week of that session. **Back to patient** returns the caretaker to this tab.
- **Book all** books every suggestion that has no clash. Clashing rows are left for the caretaker to resolve one by one.
- Suggestions update automatically when an appointment is missed or cancelled, or when the plan changes.

**Booked rows:** Reschedule, Cancel.

**Past rows:** View treatment (Attended rows); Mark as cancelled (Missed rows, §2).

**If the patient has no email**, a note is shown: "Appointments will be booked, but the patient will not receive calendar invitations."

---

## 10. Patient list

- A new column, **Next meeting**, shows the date and time (for example "Wed 16:30"), or "—" if none is booked.
- A new column, **Progress**, shows sessions done out of planned (for example "6/10").
- On narrow screens, both are shown together in one cell.
- Clicking the next-meeting cell opens the Calendar page on that week.

---

## 11. End of treatment: "Book next session"

The confirmation that appears after a treatment is saved includes a **"Book next session"** section. What it shows depends on the situation:

| Situation | What is shown |
|---|---|
| The next session is **already booked** | "Next session: Thursday 16:30 ✓" with a **Change** option. No new suggestion is made. |
| **Sessions remain** and none is booked | The next slot from the weekly pattern after today, pre-filled. The caretaker can change the date and time. Buttons: **Book** and **Skip**. |
| The patient has **no weekly pattern** | The same weekday and time next week, pre-filled. Buttons: **Book** and **Skip**. |
| The suggested time **clashes with another app appointment** | A clash note and the nearest free time. |
| The **course is complete** (for example 10 of 10) | "Treatment course complete 🎉", with an **Extend course** option. |

---

## 12. Calendar invitations

| Recipient | Title | Details |
|---|---|---|
| **Caretaker** | "<App name> – <patient name at the chosen level>", for example "Apitherapy – Dana" | No medical information. A link to open the patient in the app. |
| **Patient** | "Apitherapy treatment with <caretaker name>" | Address, caretaker phone number, and a note on how to cancel or reschedule (by contacting the caretaker). |

- Each invitation is written in its recipient's language: the patient's preferred language, or the caretaker's app language.
- **When invitations are sent:** on booking, on any change of date or time, and on cancellation. Status changes (Attended or Missed) and walk-in appointments send nothing.
- **Changes in a personal calendar:** if the caretaker or the patient moves or deletes the entry in their own calendar, only their own copy changes. The appointment in the app stays as it was. The invitation text says: "To change this appointment, please contact <caretaker> / use the app."
- **Accept or Decline replies** from calendars are not processed by the app.

---

## 13. Reminders to patients (phase 2)

1. Reminders are sent **once a day, at the time set in app settings**.
2. Each run sends a reminder for **every patient appointment on the next calendar day**. Example: at 18:00 on Monday, reminders go out for all of Tuesday's appointments.
3. A reminder goes to a patient only if reminders are on for that patient and the patient's channel is available. It is sent in the patient's preferred language.
4. Reminder content: day, time, caretaker name and address. **No medical information.**
5. An appointment booked **after** the reminders for that day were sent gets no reminder. The booking invitation is enough.
6. Channel order of delivery:
   - **Email**: the patient already receives invitations by email, so this comes first
   - **WhatsApp**
   - **SMS**
7. **Telegram is postponed.** To receive Telegram messages, each patient must first open the app's Telegram bot, which adds a sign-up step at intake.
8. **Later improvement:** WhatsApp reminders with **Confirm** and **Need to reschedule** buttons. The patient's answer appears on the Today page.

---

## 14. Special cases and known limits

| Case | Behaviour |
|---|---|
| The caretaker has a private meeting at the same time as an app appointment | The app does not know about it. The caretaker sees the clash in their own calendar, where the invitation appears, and reschedules in the app. |
| The caretaker turned off "Send invitations to me" | Appointments exist only in the app. The Today and Calendar pages are the caretaker's schedule. |
| An invitation email lands in spam or is not delivered | The appointment is still valid in the app. The Today page is always the reliable schedule. |
| Someone moves or deletes the entry in their personal calendar | The app is not affected (see §12). |
| An admin views the app as a caretaker | The admin sees the caretaker's app appointments. Invitations still go to the caretaker and the patient as usual. |
| The patient has no email | Booking works. No patient invitation is sent, and this is stated clearly. |
| The patient has no mobile number | WhatsApp and SMS are unavailable for this patient. Call and WhatsApp buttons are hidden. |
| A patient is deleted | Their upcoming appointments are cancelled, and cancellation invitations are sent to the patient (if notifications are on) and to the caretaker. The caretaker confirms this first. |

---

## 15. Acceptance checklist (for review by colleagues)

- [ ] The same five statuses and colours appear on Today, Calendar, the Appointments tab and the patient list.
- [ ] Booking sends an invitation to the patient (when "Notify patient" is on) and to the caretaker (when "Send invitations to me" is on), and the appointment appears in both calendars.
- [ ] Moving an appointment updates the existing entry in both calendars and never creates a duplicate.
- [ ] Cancelling an appointment removes it from both calendars.
- [ ] The caretaker's invitation shows the patient's name at the caretaker's chosen level, and full names appear only inside the app.
- [ ] Neither invitation contains medical information.
- [ ] Booking two patients at the same time shows an overlap warning, and "Book anyway" works.
- [ ] Booking outside working hours shows a warning.
- [ ] A treatment started from anywhere (Today, patient list or intake) marks that day's appointment as Attended.
- [ ] An appointment is never marked Missed before the day has ended, and the caretaker can mark a Missed appointment as cancelled (no other status is changed by hand).
- [ ] Suggested rows are clearly different from Booked rows, and no invitation is sent for a Suggested row.
- [ ] "Book all" never books a time that clashes with another app appointment.
- [ ] End of treatment never suggests a new session when the next one is already booked.
- [ ] Changing the weekly pattern never changes past appointments, and it moves booked appointments only after the caretaker confirms.
- [ ] Every screen works in Hebrew (right to left) and on a tablet.
