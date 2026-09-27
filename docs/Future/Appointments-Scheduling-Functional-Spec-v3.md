# Appointments: Scheduling, Management and Reminders
## Functional specification, version 3 (UX level)

> **SUPERSEDED by [version 4](Appointments-Scheduling-Functional-Spec-v4.md) (2026-09-26).** The Google Calendar integration was dropped in favour of email calendar invitations. Kept for history only; do not use this version for coverage checks.

**Status:** Approved 2026-09-26, then superseded the same day by version 4.

**History:** round 1 (vision) → round 2 (functional specs) → version 3 (this document, approved).

**Purpose of this version:** Version 3 builds on the round 2 specification. It adds clear appointment statuses, rules for the edge cases, and simpler screens. It describes what the user sees and does, not how it is built.

---

## 1. Basic principles

1. **The app is the authority for patient appointments.** Every appointment (who, when, session number, status) is kept in the app's own records. The app copies each appointment to the caretaker's **Google Calendar** at the moment it is booked, moved or cancelled.
2. **Google Calendar serves two purposes:**
   - it shows the caretaker their patient appointments next to everything else in their day;
   - it tells the app when the caretaker is busy with **private meetings**, so they are never double-booked.
3. The app **never changes or deletes** a meeting that it did not create. Private meetings are shown as greyed "busy" time.
4. If the caretaker moves or deletes an app appointment **directly in Google Calendar**, the app notices the next time it loads. It shows "This appointment was changed in Google Calendar" and asks the caretaker to confirm the change, which also notifies the patient, or to undo it.
5. **Full patient names are shown only inside the app.** In Google Calendar, the patient appears by the level of detail the caretaker chose (initials, first name or full name).
6. Every change to a patient's appointment (book, move, cancel) can be sent to the patient as a **calendar invitation email**. The invitation updates the patient's own calendar. Changing an appointment updates the existing entry in the patient's calendar and never creates a duplicate.
7. **Reminders to the caretaker** come from Google Calendar's own notifications. The app does not send them and has no setting for them.
8. **Reminders to patients** are the app's responsibility. They are sent by email, WhatsApp or SMS, whichever channel the patient chose. A patient can ask not to receive reminders.
9. All screens support Hebrew (right to left) and English. The week starts on **Sunday**.


---

## 2. Appointment statuses

Every appointment has exactly one status. The same names and colours are used on every screen.

| Status | Meaning | How it is set |
|---|---|---|
| **Suggested** | A proposed date and time, calculated from the patient's weekly pattern. **Not in the calendar yet, and the patient has not been notified.** | Calculated automatically. Shown only in the patient's Appointments tab. |
| **Booked** | In the caretaker's calendar. The patient was invited, if notifications are on. | The caretaker books it. |
| **Attended** | The patient came and a treatment was recorded. | Set automatically when any treatment is recorded for the patient that day, however it was started. The caretaker can also set it by hand. |
| **Missed** | The patient did not come and did not cancel. | Set automatically at the end of the day if no treatment was recorded. The caretaker can also set it by hand. |
| **Cancelled** | Cancelled in advance by the patient or the caretaker. **Does not count as missed.** | The caretaker cancels it. |

**Rules**
- A meeting is marked "Missed" automatically **only after the day has ended**, never while the caretaker could still record the treatment.
- The caretaker can **change any past status by hand**, for example Missed → Attended if the treatment was recorded late.
- **Walk-in treatment:** if a treatment is recorded for a patient with no appointment that day, the app adds an "Attended" appointment at the time of the treatment. The patient's progress therefore stays correct.

**Colours (shown in a legend on the Today and Calendar pages)**
- Not a patient meeting: grey, cannot be selected.
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
| App name in calendar meetings | Text | "Apitherapy" |
| Patient name in caretaker calendar | Initials / First name / Full name | First name |
| "Start Treatment" available from | Minutes before the meeting starts | 15 |

---

## 4. Caretaker profile: "Appointments" section

| Setting | Notes |
|---|---|
| **Google Calendar connection** | Shows "Connected as …" or "Not connected", with **Connect** and **Disconnect** buttons. Connecting is a one-time Google permission step. |
| Working week | For each weekday: working yes/no, start and end time. Copied from app settings when the caretaker is created. |
| Default meeting length | Minutes. Copied from app settings. |
| Patient name in my calendar | Initials / First name / Full name. Copied from app settings. |
| Time zone | Filled in automatically from Google Calendar. Can be changed. |

**Before the calendar is connected:** every place where booking is possible shows a short explanation and a **Connect Google Calendar** button instead of the booking controls. These places are:
- the Today page
- the Calendar page
- the Appointments tab in the patient intake (the plan and progress are still shown)
- the "Book next session" section at the end of treatment

After connecting, the caretaker returns to the same place.


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

A single-day view, similar to Google Calendar's day view.

**Layout**
- One row for each hour, from the start to the end of the caretaker's working hours for today.
- **If a meeting falls outside working hours, the view stretches to include it.** A meeting is never hidden.
- A line marks the current time.
- The page shows every meeting in the caretaker's Google Calendar for today.

**Meeting boxes**
- Private (non-patient) meetings: grey, showing the meeting title only, and cannot be selected.
- Patient meetings: show the patient's **full name**, the time, the status colour and the session number (for example "Session 4 of 10").

**Actions on a patient meeting**

"X minutes" below is the **"Start Treatment" available from** value in app settings (default 15).

| Meeting state | Available actions |
|---|---|
| **Upcoming**: starts more than X minutes from now | Start Treatment (asks "Start early?"), Call, WhatsApp, Reschedule, Cancel |
| **Due now**: from X minutes before the start until the end of the day, while no treatment has been recorded | **Start Treatment** (highlighted), Call, WhatsApp, Reschedule, Cancel |
| **Attended**: a treatment was recorded for this meeting | **Open patient** (opens the patient's intake) and **View treatment** (opens the summary of the treatment given in this meeting) |
| **Missed** or **Cancelled** | **Open patient** (opens the patient's intake); **Change status** (corrects the status, for example from Missed to Attended when the patient did come but the treatment was recorded late); **Book replacement** (opens the booking editor for this patient with the next free slot pre-filled, to make up for the lost session) |

- **Start Treatment** opens the treatment flow for that patient. When the treatment is saved, the meeting becomes "Attended".
- **Call** and **WhatsApp** use the patient's mobile number. They are hidden if there is no number.
- Clicking a past meeting always opens the patient. Past meetings are never "dead".

---

## 7. Calendar page

A full-width week view, similar to Google Calendar's week view.

**Display**
- Opens on the current week. Previous and next arrows, plus a **Today** button.
- Hours outside the caretaker's working hours are lightly shaded. Meetings there are still shown.
- All meetings from the caretaker's Google Calendar appear:
  - private meetings in grey, which cannot be selected
  - patient meetings in their status colour, with the patient's full name
- Meetings that overlap are shown **side by side** in the same time slot.
- A legend explains the colours.
- **"Past" means that the meeting's end time has passed.** The same rule applies on every page.

**Creating a meeting**
- **Drag** across a time range, or **click once** on an empty slot to create a meeting of the default length.
- An editor panel opens with:
  - Patient (search by name)
  - Date, start time and end time (pre-filled)
  - **Notify patient** checkbox, on by default. It is unavailable if the patient has no email, with the note "No email: patient will not be notified".
  - **Book** and **Cancel** buttons
- **If the new time overlaps another meeting**, a warning appears: "This time overlaps with <meeting>". The buttons are **Book anyway** and **Change time**.

**Changing an upcoming meeting**
- Click the meeting to open the editor. The caretaker can change the date or time, **cancel** the meeting (status Cancelled), or open the patient.
- The caretaker can **drag** the meeting to another time, or drag its edge to change its length. A confirmation appears: "Move <patient> to <new time>? The patient will be notified."
- The overlap warning applies here too.

**Past meetings**
- Clicking a past patient meeting shows its status, which the caretaker can change (Attended / Missed / Cancelled), and a link to the patient.

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
    - Already booked meetings stay as they are, and past meetings never change. The app then asks: "You have N booked meetings on the old pattern. Move them to the new pattern?" The caretaker answers **Move** (each moved meeting is checked for clashes and the patient is notified) or **Keep as is**.

**Progress (calculated automatically, never typed)**
- Shown as: **"6 of 10 sessions done · 1 missed · 1 cancelled · 3 remaining · 2 booked"**
- Done = Attended appointments, including walk-ins.
- Remaining = Planned − Done.

**Reminders**
- **Send reminders:** on/off. The default comes from app settings.
- **Channel:** only channels that are enabled in app settings *and* possible for this patient can be selected. For example, WhatsApp and SMS need a mobile number, and Email needs an email address. Unavailable options show a hint, such as "Add a mobile number to use WhatsApp".
- **Preferred language** for invitations and reminders: Hebrew or English. It defaults to the caretaker's language.

---

## 9. Patient intake: "Appointments" tab

**Position:** after the "Documents" tab and before the "Treatment History" tab. It can be opened at any stage of intake.

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
- Suggestions follow the weekly pattern. They start from the first free pattern slot after **today** or after the **last booked meeting**, whichever is later.
- On each suggested row the caretaker can change the date or time and press **Book**.
- If a suggestion **clashes** with an existing meeting, the row shows "Clashes with <meeting>" and offers the **nearest free time**, for example "Try 17:00?".
- **Open in calendar** opens the Calendar page on the week of that session. **Back to patient** returns the caretaker to this tab.
- **Book all** books every suggestion that has no clash. Clashing rows are left for the caretaker to resolve one by one.
- Suggestions update automatically when a meeting is missed or cancelled, or when the plan changes.

**Booked rows:** Reschedule, Cancel.

**Past rows:** Change status, and View treatment (for Attended rows).

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
| The suggested time **clashes** | A clash note and the nearest free time. |
| The **course is complete** (for example 10 of 10) | "Treatment course complete 🎉", with an **Extend course** option. |

---

## 12. Titles in calendars

| Where | Title | Details |
|---|---|---|
| **Caretaker's Google Calendar** | "<App name> – <patient name at the chosen level>", for example "Apitherapy – Dana" | No medical information. A link to open the patient in the app. |
| **Patient's calendar** (invitation email) | "Apitherapy treatment with <caretaker name>" | Address, caretaker phone number, and a note on how to cancel or reschedule. |

The patient's invitation is written in the **patient's preferred language**.

---

## 13. Reminders to patients (phase 2)

1. Reminders are sent **once a day, at the time set in app settings**.
2. Each run sends a reminder for **every patient meeting on the next calendar day**. Example: at 18:00 on Monday, reminders go out for all of Tuesday's meetings.
3. A reminder goes to a patient only if reminders are on for that patient and the patient's channel is available. It is sent in the patient's preferred language.
4. Reminder content: day, time, caretaker name and address. **No medical information.**
5. A meeting booked **after** the reminders for that day were sent gets no reminder. The booking invitation is enough.
6. Channel order of delivery:
   - **Email**: the patient already receives invitations by email, so this comes first
   - **WhatsApp**
   - **SMS**
7. **Telegram is postponed.** To receive Telegram messages, each patient must first open the app's Telegram bot, which adds a sign-up step at intake.
8. **Later improvement:** WhatsApp reminders with **Confirm** and **Need to reschedule** buttons. The patient's answer appears on the Today page.

---

## 14. Special cases

| Case | Behaviour |
|---|---|
| The caretaker has not connected Google Calendar | Today and Calendar show a "Connect Google Calendar" prompt. The Appointments tab shows the plan and progress, but booking is unavailable. |
| An admin views the app as a caretaker | Calendar pages show "Calendar is available to the caretaker only". |
| An app appointment was moved or deleted directly in Google Calendar | The next time the app loads, the appointment is flagged "Changed in Google Calendar". The caretaker chooses **Accept change**, which updates the appointment and notifies the patient, or **Undo**, which puts it back in Google Calendar. Until the caretaker decides, the appointment keeps its original time in the app. |
| The patient has no email | Booking works. No invitation is sent, and this is stated clearly. |
| The patient has no mobile number | WhatsApp and SMS are unavailable for this patient. Call and WhatsApp buttons are hidden. |
| A patient is deleted | Their upcoming meetings are cancelled in the calendar, and the patient is notified if notifications are on. The caretaker confirms this first. |

---

## 15. Acceptance checklist (for review by colleagues)

- [ ] The same five statuses and colours appear on Today, Calendar, the Appointments tab and the patient list.
- [ ] No private (non-patient) meeting can be opened, moved or deleted from the app.
- [ ] A treatment started from anywhere (Today, patient list or intake) marks that day's meeting as Attended.
- [ ] A meeting is never marked Missed before the day has ended, and the caretaker can correct any status.
- [ ] Moving or cancelling a meeting updates the patient's calendar entry and does not create a duplicate.
- [ ] Suggested rows are clearly different from Booked rows, and no email is sent for a Suggested row.
- [ ] "Book all" never books a time that clashes with another meeting.
- [ ] End of treatment never suggests a new session when the next one is already booked.
- [ ] The patient's name in Google Calendar follows the caretaker's setting, and full names appear only inside the app.
- [ ] An appointment moved in Google Calendar is flagged in the app and changes only after the caretaker accepts it.
- [ ] Changing the weekly pattern never changes past meetings, and it moves booked meetings only after the caretaker confirms.
- [ ] Every screen works in Hebrew (right to left) and on a tablet.
