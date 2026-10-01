# App Functional Inventory (Ground Truth)

Authoritative checklist of screens, server-call surfaces, Firestore collections, and Storage paths, for comparison against ZAP proxy scan coverage.

## 1. Screens / Major UI Sections

App is **state-driven** (no URL routing). Top-level state is `currentView` (a `View` union type) in `src/App.tsx:45`, switched via `renderContent()` (`src/App.tsx:593`). One exception: `window.location.pathname` is checked directly for the public `/feedback/:sessionId` deep link (at the top of `renderContent()`). A `?patientId=` query parameter opens that patient's intake after login.

**Landing rule (appointments, spec §5):** after the first patient load of a login, a caretaker with at least one patient lands on **Today**; with none, on the Patients list. Never overrides `?patientId=` or onboarding.

### Entry / Auth
- **Login** — `src/components/Login.tsx` — shown when `!appUser` (unauthenticated).
- **Initializing / Loading Patient Data** — inline loading states in `App.tsx`, not separate components.
- **Onboarding (`onboarding_test` view)** — first-login profile completion, renders `UserDetails` with `isOnboarding={true}` — `src/components/UserDetails.tsx`.
- **Public Feedback link (`/feedback/:sessionId`)** — unauthenticated standalone route, bypasses all auth/dashboard logic — `src/components/PatientIntake/FeedbackStandaloneView.tsx`.

### Dashboard / Patient flow
- **Patients Dashboard** (`currentView: 'dashboard'`, also the fallback for the modal views below) — `src/components/PatientsDashboard.tsx`. Columns: Patient, Contact, Problems, Last Treatment, **Next meeting** (next booked appointment; today's opens the Today page), **Sessions done** (treatments / planned sessions); on screens ≤ 1024 px the last two share one cell. Row actions: edit, treatment history, Start New Treatment (warns when the patient already had a treatment today). **There is no delete action: patients are never deleted** (rules deny `patients` deletes for everyone).
- **Patient Intake** (`currentView: 'patient_intake'`) — modal-style flow — `src/components/PatientIntake/PatientIntake.tsx`. Internally has its own `viewState` machine:
  - **Tabs view** (`viewState: 'tabs'`) with tabs in this order (`TAB_ORDER`, `PatientIntake.tsx:53-63`; "Start New Treatment" needs Personal, Questionnaire, Instructions, Consent and Problems saved):
    - Personal — `src/components/PatientIntake/PersonalDetails.tsx`
    - Questionnaire — `src/components/PatientIntake/QuestionnaireStep.tsx`
    - Instructions (Guidelines) — `src/components/PatientIntake/InstructionsTab.tsx`
    - Consent — `src/components/PatientIntake/ConsentTab.tsx`
    - Documents — `src/components/PatientIntake/DocumentsTab.tsx`
    - Problems — `src/components/PatientIntake/ProblemsTab.tsx`
    - **Appointments** — `src/components/Appointments/AppointmentsTab.tsx`: sub-tabs "Treatment plan" (planned sessions, weekly slots, reminders on/off, channel, preferred language; saved with the intake's Update button into `patients/{id}.appointmentPlan`) and "Appointments" (`AppointmentList.tsx`: booked, suggested, past and cancelled rows; Book, Book all, Reschedule, Cancel, Mark as cancelled, View treatment, Open in calendar); progress line above both; `PatternChangeDialog.tsx` after a weekly-pattern change.
    - Treatments (history) — uses `TreatmentHistory`
    - Measures (history) — `src/components/PatientIntake/MeasuresHistoryTab.tsx`
  - **"Treatment saved" confirmation** — includes **Book next session** (`src/components/Appointments/BookNextSession.tsx`): next booked session with Change; "course complete" with Extend course (writes `appointmentPlan.plannedSessions`); or a proposed time with Book / Change / Skip.
  - **Session Opening** (`viewState: 'sessionOpening'`) — `src/components/PatientIntake/SessionOpening.tsx`
  - **Problem/Protocol Selection** (`viewState: 'problemSelection'`) — `src/components/ProtocolSelection.tsx`
  - **Free point selection** (`viewState: 'freeSelection'`) — `src/components/FreeProtocolPointSelection.tsx`
  - **Treatment Execution** (`viewState: 'treatmentExecution'`) — `src/components/TreatmentExecution.tsx` (uses `BodyScene.tsx`, `PointPlacementScene.tsx`, `StingPointMarker.tsx`, `VitalsInputGroup.tsx`, `PointsModelViewer.tsx`)
  - **Post-Sting screen** (`viewState: 'postSting'`) — `src/components/PostStingScreen.tsx`
  - **Treatment Feedback** (`viewState: 'treatmentFeedback'`) — `src/components/PatientIntake/TreatmentFeedback.tsx`
  - **Treatment Summary** — `src/components/PatientIntake/TreatmentSummary.tsx`
  - **Signature capture** — `src/components/PatientIntake/SignaturePad.tsx` (used within Consent/Instructions tabs)
- **Treatment History modal** (`currentView: 'treatment_history'`, dashboard-modal view) — `src/components/TreatmentHistory.tsx`.
- **Protocol Selection (standalone view state)** (`currentView: 'protocol_selection'`, dashboard-modal view) — `src/components/ProtocolSelection.tsx`.

### Appointments (sidebar group "Appointments", under My Profile)
Spec: `docs/Future/Appointments-Scheduling-Functional-Spec-v4.md`; plan: `docs/Future/Appointments-Implementation-Plan.md`. All appointment lists are live (Firestore `onSnapshot`, `src/services/appointmentService.ts`). Under "View As" another caretaker every appointment screen is read-only.
- **Today** (`currentView: 'appointments_today'`) — `src/components/Appointments/TodayPage.tsx`. Sidebar badge = booked meetings of today not yet ended. Agenda by hour (working hours, stretched to include every appointment), now-line, "+ Book HH:mm" in free hours; cards with Start New Treatment, Call, WhatsApp, Reschedule, Cancel / Mark as cancelled, View treatment, Book a replacement session; a cancelled meeting is hidden once replaced. The patient name opens the intake on its Appointments tab; closing it returns to Today.
- **Calendar** (`currentView: 'appointments_calendar'`) — `src/components/Appointments/CalendarPage.tsx` (FullCalendar week view): create by click or drag, move/resize by drag, `AppointmentEditor.tsx` (patient search, date, time, length, Notify patient, overlap and outside-hours warnings with "Book anyway", cancel, Mark as cancelled), `StatusLegend.tsx`; "Back to patient" when opened from the Appointments tab.
- Every book, move and cancel sends a calendar invitation email (ICS) from the `onAppointmentWritten` function, never from the client.

### User / Profile
- **My Profile modal** (`currentView: 'user_details'`) — `src/components/UserDetails.tsx` (in `Modal`). Tabs "Personal Details" and "Appointments" (send invitations to me, invitation email, working week, meeting length, patient name level, time zone; stored in `users/{uid}.appointmentPrefs`).
- **Application Settings modal** (`isSettingsModalOpen`, not a `currentView`) — `src/components/ApplicationSettings.tsx` (in `Modal`). Includes the "Appointments & Reminders" group (`cfg_app_config/main.appointmentSettings`).

### Admin screens (each its own `currentView`)
- **Protocols Admin** (`admin_protocols`) — `src/components/ProtocolAdmin.tsx`
- **Points Admin** (`admin_points`) — `src/components/PointsAdmin.tsx`
- **Point Groups Admin** (`admin_point_groups`) — `src/components/PointGroupAdmin/PointGroupAdmin.tsx`
- **Body Model Tuner** (`admin_body_model`) — `src/components/BodyModelTuner.tsx`
- **Point Side Analysis** (`point_side_analysis`) — `src/components/PointSideAnalysis.tsx`
- **Measures Admin** (`admin_measures`) — `src/components/MeasureAdmin/MeasureAdmin.tsx`
- **Problems Admin** (`admin_problems`) — `src/components/ProblemAdmin/ProblemAdmin.tsx` (+ `ProblemList.tsx`, `ProblemForm.tsx`, `ProblemDetails.tsx`)
- **Questionnaire Admin** (`admin_questionnaires`) — `src/components/QuestionnaireAdmin/QuestionnaireAdmin.tsx` (+ `QuestionnaireList.tsx`, `QuestionnaireForm.tsx`)
- **User Management** (`admin_users`) — `src/components/UserManagement.tsx`
- **Activity Log** (`activity_log`) — `src/components/ActivityLog.tsx`

### Data Analysis
- **Treatment Effectiveness / Data Analysis modal** (`currentView: 'data_analysis'`) — `src/components/DataAnalysis/TreatmentEffectiveness.tsx` (in `Modal`, calls `getTreatmentEffectiveness` Cloud Function).

### Shared / cross-cutting components (not standalone screens, but reachable UI surfaces worth testing)
- `src/components/Sidebar.tsx` — nav, plus "view as caretaker" impersonation dropdown (fetches `users` collection client-side).
- `src/components/common/Modal.tsx`, `src/components/shared/Modal.tsx` — modal shells.
- `src/components/ConfirmationModal.tsx` — generic confirm dialog.
- `src/components/shared/DocumentManagement.tsx`, `src/components/shared/StorageComponents.tsx` — file upload/list UI used by admin screens.
- `src/components/shared/ModelComponents.tsx`, `src/components/shared/ShuttleSelector.tsx` — 3D body-model UI helpers.
- `src/components/T.tsx` — translation provider/component (reads `cfg_translations`).
- `src/components/VitalsInputGroup.tsx` — vitals entry sub-form used in Treatment Execution.

---

## 2. Cloud Functions (`functions/src/index.ts`)

| Function | Frontend trigger |
|---|---|
| `sendDocumentEmail` | `onCall`. Called from the frontend when a caretaker sends a signed patient document (consent/instructions PDF) via email — invoked from the document-send action in the Patient Intake Consent/Instructions/Documents flow. |
| `filterPiiTransform` | `onRequest`, **not called from the frontend at all** — it's a transform-hook webhook consumed only by the Firestore→BigQuery Cloud Extension, to strip PII fields before rows land in BigQuery. |
| `getTreatmentEffectiveness` | `onCall`. Called from `src/components/DataAnalysis/TreatmentEffectiveness.tsx` when a user opens/filters the Data Analysis / Treatment Effectiveness screen; runs a role-scoped BigQuery query. |
| `sendMissingProblemEmail` | `onCall`. Called from the Patient Intake Problems tab flow when a caretaker reports a problem/protocol missing from the system (notifies admin). |
| `translateText` | `onCall`. Proxy for Google Translate, called from admin config screens (Protocols/Points/Problems/Measures/Questionnaires Admin, and `T.tsx`) whenever content needs on-the-fly translation, keeping the Translate API key off the client. |

Other functions in the file not part of the requested 5, found during review (not frontend-invoked, background/scheduled/trigger-based): `dailyFeedbackSweeper` (scheduled, emails patients for feedback), `onFeedbackSessionComplete` (Firestore trigger on `feedback_sessions` update), `runDailyUnifiedBackup` (scheduled backup), `cleanupAuditLog` (scheduled `app_audit_log` retention cleanup).

Appointments functions (`functions/src/appointments/`, re-exported from `index.ts`; none frontend-invoked):
- `onAppointmentWritten` — Firestore trigger on `appointments/{id}`: sends the calendar invitation emails (ICS, via Resend) to the patient and the caretaker on book, move and cancel; idempotent via the functions-owned `invite` field.
- `onTreatmentCreated` — Firestore trigger on `treatments/{id}` create: marks that day's booked appointment Attended and links the treatment, or creates a walk-in (Attended) appointment and adds 1 to planned sessions.
- `markMissedAppointments` — scheduled every 15 minutes, runs once a day at `appointmentSettings.missedCheckTime` (guard: `missed_check_runs/{yyyy-mm-dd}`): booked appointments of past days become Attended (treatment that day) or Missed.

---

## 3. Firestore Collection Paths (top-level, deduped)

From grepping `collection(db, '...')` and `doc(db, '...')` across `src/`:

- `patients`
- `patient_medical_data`
- `questionnaire_responses`
- `measured_values`
- `treatments`
- `users`
- `cfg_app_config`
- `cfg_protocols`
- `cfg_problems`
- `cfg_measures`
- `cfg_questionnaires`
- `cfg_acupuncture_points`
- `cfg_point_groups`
- `cfg_secrets`
- `cfg_translations`
- `app_audit_log`
- `feedback_sessions`
- `appointments` — client: owner-only create (status and source `booked` only) and update (move, notify patient, cancel; status may only change to `cancelled`); impersonator read-only; never deleted; `invite` written by functions only
- `missed_check_runs` — functions only (rules deny all client access)

(Note: `feedback_sessions` is read/written client-side only from the public `FeedbackStandaloneView.tsx`, not from the authenticated app shell — worth flagging as an unauthenticated-write surface for the security review.)

---

## 4. Storage Paths (top-level folder prefixes)

From `src/services/storageService.ts` (`uploadFile`/`deleteFile`, the sole `ref(storage, ...)` wrapper) and its call sites:

- `Patients/{patientId}` — patient documents, consent/instructions signature images (`ConsentTab.tsx`, `InstructionsTab.tsx`, `DocumentsTab.tsx`, `SessionOpening.tsx`)
- `Points/{folderName}` — acupuncture point documents/images (`PointsAdmin.tsx`)
- `Protocols/{folderName}` — protocol documents (`ProtocolAdmin.tsx`)
- `Measures/{measureId|'new'}` — measure attachments (`MeasureAdmin.tsx`)
- `Problems/{folderName}` — problem documents (`ProblemAdmin.tsx`)
- `App_config/` — application-settings uploaded assets (`ApplicationSettings.tsx`)

`deleteFile` accepts either a storage path or a full download URL, so deletion isn't strictly scoped to these prefixes at the API-call level — worth noting as a potential IDOR/path-traversal test point (arbitrary `pathOrUrl` passed to `deleteObject`).
