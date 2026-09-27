# App Functional Inventory (Ground Truth)

Authoritative checklist of screens, server-call surfaces, Firestore collections, and Storage paths, for comparison against ZAP proxy scan coverage.

## 1. Screens / Major UI Sections

App is **state-driven** (no URL routing). Top-level state is `currentView` (a `View` union type) in `src/App.tsx:39`, switched via `renderContent()` (`src/App.tsx:496`). One exception: `window.location.pathname` is checked directly for the public `/feedback/:sessionId` deep link (`src/App.tsx:497-503`).

### Entry / Auth
- **Login** — `src/components/Login.tsx` — shown when `!appUser` (unauthenticated).
- **Initializing / Loading Patient Data** — inline loading states in `App.tsx`, not separate components.
- **Onboarding (`onboarding_test` view)** — first-login profile completion, renders `UserDetails` with `isOnboarding={true}` — `src/components/UserDetails.tsx`.
- **Public Feedback link (`/feedback/:sessionId`)** — unauthenticated standalone route, bypasses all auth/dashboard logic — `src/components/PatientIntake/FeedbackStandaloneView.tsx`.

### Dashboard / Patient flow
- **Patients Dashboard** (`currentView: 'dashboard'`, also the fallback for the modal views below) — `src/components/PatientsDashboard.tsx`.
- **Patient Intake** (`currentView: 'patient_intake'`) — modal-style flow — `src/components/PatientIntake/PatientIntake.tsx`. Internally has its own `viewState` machine:
  - **Tabs view** (`viewState: 'tabs'`) with tabs (`TabKey`, `PatientIntake.tsx:36-54`):
    - Personal — `src/components/PatientIntake/PersonalDetails.tsx`
    - Questionnaire — `src/components/PatientIntake/QuestionnaireStep.tsx`
    - Instructions — `src/components/PatientIntake/InstructionsTab.tsx`
    - Consent — `src/components/PatientIntake/ConsentTab.tsx`
    - Problems — `src/components/PatientIntake/ProblemsTab.tsx`
    - Documents — `src/components/PatientIntake/DocumentsTab.tsx`
    - Treatments (history) — `src/components/PatientIntake/MeasuresHistoryTab.tsx` / uses `TreatmentHistory`
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

### User / Profile
- **My Profile modal** (`currentView: 'user_details'`) — `src/components/UserDetails.tsx` (in `Modal`).
- **Application Settings modal** (`isSettingsModalOpen`, not a `currentView`) — `src/components/ApplicationSettings.tsx` (in `Modal`).

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
