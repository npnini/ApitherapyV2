# Treatment Workflow Overhaul — Agent Handover Document

> **Status**: Plan approved by user on 2026-04-14. No code written yet. Ready for implementation.

---

## 1. Project Context

**App**: ApitherapyV2 — A medical treatment management app for bee-sting therapy (apitherapy).  
**Stack**: React + TypeScript, Vite, Firebase (Firestore, Storage, Cloud Functions), CSS Modules.  
**Workspace**: `C:\Users\User\Dev\Projects\ApitherapyV2`  
**Environment**: Development only (no production yet).

### Critical Rules (from `airules.md`)
- Read [airules.md](file:///C:/Users/User/Dev/Projects/ApitherapyV2/airules.md) before coding — contains mandatory coding conventions.
- Read [Claude Style-Guide.md](file:///C:/Users/User/Dev/Projects/ApitherapyV2/Claude%20Style-Guide.md) — all UI must use the CSS variable design system (no hardcoded colors, no Tailwind).
- App uses Google Translate API for i18n — wrap strings in `<T>` component. No manual translation files needed.
- RTL/LTR support is required (Hebrew is primary language).

### Key Config Collections in Firestore
- `cfg_problems` — defines available problems (has `measureIds`, `protocolId`/`protocolIds`)
- `cfg_protocols` — defines protocols (has `pointIds` array)
- `cfg_measures` — defines measures (has `min`, `max`, `name`, `description`)
- `cfg_acupuncture_points` — defines sting points (has `code`, `label`, `sensitivity`, coordinates)
- `cfg_app_config` — single doc with app settings including `sendgridApiKey`, `sendgridSenderEmail`, `frontendDomain`, `initialSensitivityTestTreatments`

---

## 2. What Is Being Built

Transform the treatment workflow from a single-problem/single-protocol model into a **5-screen multi-problem flow** with mid-process saving:

```
Screen 1: Session Opening (patient report, problems, vitals, photo, measures)
    ↓
    ├─ if treatmentCount <= sensitivityThreshold → Screen 3 (with sensitivity protocol)
    └─ else → Screen 2
    ↓
Screen 2: Problem Selection (pick active problem's protocol, or Free Selection)
    ↓
Screen 3: Treatment Execution — Protocol-based (select sting points)
   OR
Screen 4: Treatment Execution — Free Selection (all points, zoom modal)
    ↓
    ├─ "Another Protocol" → back to Screen 2 (buffer stung points)
    └─ "Next Step" → Screen 5
    ↓
Screen 5: Post-Sting Screen (treated points summary, post vitals, final vitals, notes, finish)
```

### Approved UX Enhancements
- **UX-A**: Horizontal stepper bar at top showing current screen
- **UX-B**: Color-coded problem chips (green=Active, grey=Inactive) with toggle
- **UX-C**: Missing problem email popup with textarea
- **UX-D**: "Draft saved" indicator with timestamp in stepper
- **UX-E**: Post-sting shows points list + protocols list separately (not grouped)
- **UX-F**: Confirmation modal on Exit ("saved as Incomplete")
- **UX-G**: Slide animation between screens (implement, let user review)

---

## 3. Data Model Changes

### 3.1 [treatmentSession.ts](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/types/treatmentSession.ts)

**Current state** (lines 1-49): Has `protocolId: string`, `stungPointIds: string[]`, `preTreatmentVitals`, `postTreatmentVitals`, `finalNotes`, `patientReport`, etc.

**Required changes**:
```typescript
// ADD these fields to TreatmentSession interface:
status: 'Incomplete' | 'Completed';
protocolIds: string[];    // REPLACES single protocolId
problemIds: string[];     // REPLACES single problemId (if it existed)

// KEEP existing: stungPointIds as flat array (accumulated across all protocols)
// KEEP existing: preTreatmentVitals, postTreatmentVitals, finalNotes, patientReport
```

### 3.2 [patient.ts](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/types/patient.ts)

**Current state** (lines 1-61): `MedicalData` has `problemId: string`, `protocolId: string`, `measureIds: string[]`.

**Required changes**:
```typescript
// ADD new interface:
export interface PatientProblem {
  problemId: string;
  problemStatus: 'Active' | 'Inactive';
}

// In MedicalData interface:
// REMOVE: problemId: string
// REMOVE: protocolId: string
// ADD: problems: PatientProblem[]
// KEEP: measureIds (backward compat)
```

### 3.3 No migration needed
User will clear all `treatments`, `measured_values`, `feedback_sessions` collections manually.

---

## 4. File-by-File Implementation Instructions

### 4.1 Screen 1: Session Opening

**File**: [SessionOpening.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/PatientIntake/SessionOpening.tsx) (357 lines)  
**CSS**: [SessionOpening.module.css](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/PatientIntake/SessionOpening.module.css)

**Current behavior**: Shows patient report textarea, pre-treatment vitals (`VitalsInputGroup`), pre-treatment photo upload with caption overlay, and tracking measures from patient's `measureIds`. Calls `onComplete(data)` with `SessionOpeningData`.

**What to change**:

1. **Add Problem Management section** (between Patient Report and Measures):
   - Receive `patient.medicalRecord.problems` (the new `PatientProblem[]` array)
   - Render each problem as a chip/badge: fetch problem name from `cfg_problems` by ID
   - Green chip = Active, grey chip = Inactive. Clicking toggles status
   - "Add Problem" button: fetch all `cfg_problems`, show dropdown of problems not yet added, clicking adds as Active
   - "Problem Missing?" link: opens a modal/popup with textarea. On send, calls the `sendMissingProblemEmail` Cloud Function (see §4.8)

2. **Split measures into two groups**:
   - **General Measures**: Need a new field `generalMeasures: string[]` (array of measure IDs) in `cfg_app_config`. Fetch from there. Only render this section when `treatmentCount > 1` (i.e., from treatment #2 onward)
   - **Problem-Specific Measures**: Collect `measureIds` from all **Active** problems. Render always (from treatment #1)
   - Current measure-fetching logic (lines 72-111) fetches from a single problem — replace with the multi-problem approach

3. **Keep photo upload** as-is (not mandatory). Current implementation on lines 130-182 and 258-303 is fine.

4. **Update `SessionOpeningData` interface** (line 14-22): add `problems: PatientProblem[]` to pass updated problem statuses downstream.

5. **Navigation**:
   - "Next Step" behavior stays the same (calls `onComplete`), but the parent (`PatientIntake`) will now save as `Incomplete` before routing
   - Add "Exit" button: calls a new `onExit` prop. Parent saves as `Incomplete` and returns to dashboard

### 4.2 Screen 2: Problem Selection

**File**: [ProtocolSelection.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/ProtocolSelection.tsx) (179 lines)  
**CSS**: [ProtocolSelection.module.css](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/ProtocolSelection.module.css)

**Current behavior**: Two-step flow — first selects a problem, then selects a protocol from that problem. Uses `cfg_problems` and `cfg_protocols`.

**What to change — full rewrite of the component body**:

1. Receive `problems: PatientProblem[]` (only Active ones) as prop from `PatientIntake`
2. Fetch problem details from `cfg_problems` for each active problem ID
3. For each problem, fetch its protocol(s) from `cfg_protocols` using `problem.protocolId` or `problem.protocolIds`
4. Render a table/card layout:
   ```
   ┌─────────────────┬────────────────────────┐
   │ Problem Name    │ [Protocol A] [Proto B] │  ← clickable buttons
   │ Problem Name 2  │ [Protocol C]           │
   └─────────────────┴────────────────────────┘
   ```
5. Clicking a protocol button calls `onProtocolSelect(protocolId, problemId)`
6. Below the table: "Free Selection" button → calls `onFreeSelect()`
7. "Exit" button → calls `onExit()` (no DB save from this screen)

**Props interface** should be:
```typescript
interface ProtocolSelectionProps {
  problems: PatientProblem[];  // only Active problems
  onProtocolSelect: (protocolId: string, problemId: string) => void;
  onFreeSelect: () => void;
  onExit: () => void;
}
```

### 4.3 Screen 3: Treatment Execution (Protocol-Based)

**File**: [TreatmentExecution.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/TreatmentExecution.tsx) (566 lines)

**Current behavior**: Receives a protocol, shows its points in a list and on a 3D body model. User clicks points to mark as "stung". Has post-treatment vitals and final notes sections built in. Has "End Treatment" button.

**What to change**:

1. **Remove post-treatment vitals section** (the `VitalsInputGroup` for post-treatment) — this moves to Screen 5
2. **Remove final notes textarea** — moves to Screen 5
3. **Remove "End Treatment" logic** that saves the treatment
4. **Replace navigation buttons**:
   - "Next Step" → calls `onNextToPostSting(stungPointIds)` — passes accumulated stung point IDs to parent
   - "Another Protocol" → calls `onAnotherProtocol(stungPointIds)` — passes stung points, parent navigates to Screen 2
5. Keep all existing: 3D model interaction, point list, point selection, sensitivity colors, point content modals

### 4.4 Screen 4: Free Selection

**Same file**: [TreatmentExecution.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/TreatmentExecution.tsx)  
**Also modify**: [BodyScene.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/BodyScene.tsx)

**Current behavior**: Already has a `customPoints` prop path where it receives pre-selected points. The [FreeProtocolPointSelection.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/FreeProtocolPointSelection.tsx) (114 lines) wraps the 3D model for free selection.

**What to change — Free Selection mode needs major enhancement**:

1. Show **all points** from `cfg_acupuncture_points` (not just a protocol's points)
2. Add **sensitivity filter**: dropdown/toggle to filter points by sensitivity level
3. **Zoom Modal**: User selects a rectangular region on the 3D body model:
   - BodyScene needs a "rectangle select" interaction mode
   - After selecting a region, open a modal showing only that region's points at higher zoom
   - User can select points in the zoomed modal
   - **Must allow reverting** from zoom back to full model and re-selecting a different area
   - Points selected in zoom modal are added to the main stung points list
4. Navigation: only "Next Step" → Screen 5 (no "Another Protocol" in free mode)

### 4.5 Screen 5: Post-Sting Screen (NEW COMPONENT)

**Create**: `src/components/PostStingScreen.tsx`  
**Create**: `src/components/PostStingScreen.module.css`

**Props**:
```typescript
interface PostStingScreenProps {
  stungPointIds: string[];       // accumulated from all protocols + free selection
  protocolIds: string[];         // protocols used in this session
  onFinish: (data: PostStingData) => void;
  onBack: () => void;
}

interface PostStingData {
  postTreatmentVitals: Partial<VitalSigns>;
  finalVitals: Partial<VitalSigns>;
  finalNotes: string;
}
```

**What to render**:

1. **Treated Points List**: Fetch point details from `cfg_acupuncture_points` by `stungPointIds`. Show as list with code + name
2. **Protocols Used**: Fetch protocol names from `cfg_protocols` by `protocolIds`. Show as separate list
3. **Post-Treatment Vitals**: Reuse `VitalsInputGroup` component (BP + pulse after stinging)
4. **Final Vitals**: Another `VitalsInputGroup` instance (conclusion vitals)
5. **Treatment Notes**: `<textarea>` for free-text notes
6. **"Finish Treatment"** button: calls `onFinish(data)`. Parent saves everything with `status: 'Completed'`
7. **"Back"** button: returns to treatment execution

**Style**: Follow `Claude Style-Guide.md` — use CSS variables from the design system.

### 4.6 Flow Orchestration

**File**: [PatientIntake.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/PatientIntake/PatientIntake.tsx) (929 lines)

This is the **main orchestrator**. Currently manages `ViewState` type and renders different screens based on state.

**Current ViewState** (find near top of file):
```typescript
type ViewState = 'tabs' | 'sessionOpening' | 'protocolSelection' | 'treatmentExecution' | 'freeProtocolPointSelection' | 'treatmentFeedback';
```

**What to change**:

1. **Add `'postSting'` to ViewState**

2. **Add stepper bar** (UX-A): Create a sub-component or inline JSX that shows:
   ```
   [Session Opening] → [Problem Selection] → [Treatment] → [Post-Sting]
   ```
   Highlighted based on current `viewState`. Include "Draft saved" indicator (UX-D) showing timestamp of last save.

3. **Add state accumulation**:
   ```typescript
   const [accumulatedStungPointIds, setAccumulatedStungPointIds] = useState<string[]>([]);
   const [accumulatedProtocolIds, setAccumulatedProtocolIds] = useState<string[]>([]);
   const [currentTreatmentId, setCurrentTreatmentId] = useState<string | null>(null);
   ```

4. **Update `handleSessionOpeningComplete`** (currently around line 400-450):
   - Save treatment to Firestore with `status: 'Incomplete'`, store the document ID in `currentTreatmentId`
   - Check: if `treatmentCount <= cfg_app_config.initialSensitivityTestTreatments` → set viewState to `'treatmentExecution'` with the sensitivity protocol
   - Else → set viewState to `'protocolSelection'`

5. **Add handler `handleProtocolSelect(protocolId, problemId)`**:
   - Add `problemId` to `accumulatedProtocolIds` if not already there (actually add `protocolId`)
   - Set viewState to `'treatmentExecution'` with the selected protocol

6. **Add handler `handleFreeSelect()`**:
   - Set viewState to `'freeProtocolPointSelection'`

7. **Add handler `handleAnotherProtocol(stungPointIds)`**:
   - Append `stungPointIds` to `accumulatedStungPointIds`
   - Set viewState to `'protocolSelection'`

8. **Add handler `handleNextToPostSting(stungPointIds)`**:
   - Append `stungPointIds` to `accumulatedStungPointIds`
   - Set viewState to `'postSting'`

9. **Add handler `handleFinishTreatment(postStingData)`**:
   - Update the Firestore document (`currentTreatmentId`) with:
     - `status: 'Completed'`
     - `postTreatmentVitals`, `finalVitals`, `finalNotes` from `postStingData`
     - `stungPointIds: accumulatedStungPointIds`
     - `protocolIds: accumulatedProtocolIds`
   - Reset all accumulation state
   - Set viewState to `'tabs'`

10. **Add handler `handleExitIncomplete()`**:
    - Show confirmation modal (UX-F): "Treatment will be saved as Incomplete. You can resume later."
    - If confirmed: update Firestore document with current accumulated data + `status: 'Incomplete'`
    - Reset state, set viewState to `'tabs'`

11. **Render `PostStingScreen`** in the content switching area (the `renderTabContent` or equivalent):
    ```tsx
    case 'postSting':
      return <PostStingScreen
        stungPointIds={accumulatedStungPointIds}
        protocolIds={accumulatedProtocolIds}
        onFinish={handleFinishTreatment}
        onBack={() => setViewState('treatmentExecution')}
      />;
    ```

12. **Slide animation** (UX-G): Wrap the screen content area in a CSS transition container. Use `transform: translateX()` with a transition on viewState change.

### 4.7 Problems Tab

**File**: [ProblemsProtocolsTab.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/PatientIntake/ProblemsProtocolsTab.tsx) (176 lines)

**Current behavior**: Uses `ShuttleSelector` to pick a single problem and single protocol. Stores `problemId` and `protocolId` in `patient_medical_data`.

**What to change**:

1. Replace single-select with **multi-select list** of problems from `cfg_problems`
2. For each selected problem, show Active/Inactive toggle
3. Remove protocol selection entirely (protocol comes from the problem definition)
4. Save as `problems: PatientProblem[]` in `patient_medical_data`
5. Rename tab label from "Problems / Protocols" to "Problems" — find where tab labels are defined in `PatientIntake.tsx`

### 4.8 Cloud Function: Missing Problem Email

**File**: [functions/src/index.ts](file:///C:/Users/User/Dev/Projects/ApitherapyV2/functions/src/index.ts)

**Add a new callable function**:
```typescript
export const sendMissingProblemEmail = onCall(async (request) => {
  const { message, senderName } = request.data;
  
  // Read config
  const configSnap = await admin.firestore().doc('cfg_app_config/config').get();
  const config = configSnap.data();
  const apiKey = config?.sendgridApiKey;
  const senderEmail = config?.sendgridSenderEmail;
  
  // Send simple email via SendGrid REST API
  // Subject: "Missing Problem"
  // Body: message (plain text from user)
  // From/To: senderEmail
  // Use @sendgrid/mail or direct fetch to SendGrid API
});
```

**On the frontend** (in `SessionOpening.tsx`): Call this function using `httpsCallable(functions, 'sendMissingProblemEmail')`.

### 4.9 Treatment History

**File**: [TreatmentHistory.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/TreatmentHistory.tsx)

**What to change**:

1. Add visual indicator for `Incomplete` status — e.g., orange/yellow badge
2. Add edit/resume icon button on **every** treatment row (not just Incomplete)
3. Clicking edit: call a new prop `onEditTreatment(treatment)` that the parent (`PatientIntake`) handles by loading data into state and entering the flow at Screen 1
4. When editing a `Completed` treatment: status stays `Completed` throughout
5. When finishing an `Incomplete` treatment: status becomes `Completed`

### 4.10 Feedback Components

#### [TreatmentFeedback.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/PatientIntake/TreatmentFeedback.tsx) (285 lines)

**Current behavior** (line 65-68): Fetches measures from `patient.medicalRecord?.measureIds`.

**What to change**:
- Instead of `patient.medicalRecord?.measureIds`, derive measures from `treatment.problemIds`:
  1. For each problem ID in `treatment.problemIds`, fetch the problem from `cfg_problems`
  2. Collect all `measureIds` from those problems (union, deduplicated)
  3. Fetch those measures from `cfg_measures`
- Also update the "hydrated rounds" section (line 79-82): currently uses `treatment.protocolId` singular → change to iterate `treatment.protocolIds` array

#### [FeedbackStandaloneView.tsx](file:///C:/Users/User/Dev/Projects/ApitherapyV2/src/components/PatientIntake/FeedbackStandaloneView.tsx) (267 lines)

**Current behavior**: Reads `measures` array directly from `feedback_sessions` document (line 21, 198).

**What to change**: The component itself may not need changes — but the **Cloud Function that creates `feedback_sessions` documents** must be updated to populate the `measures` field from `treatment.problemIds → problems → measureIds` instead of from patient-level data.

**Find the Cloud Function** in `functions/src/index.ts` that creates `feedback_sessions` and update its measure population logic.

---

## 5. Component Dependency Graph

```
PatientIntake.tsx (orchestrator)
├── SessionOpening.tsx ──────── Screen 1
│   ├── VitalsInputGroup.tsx
│   └── (new: Problem chips, Add Problem dropdown, Missing Problem popup)
├── ProtocolSelection.tsx ───── Screen 2 (rewritten)
├── TreatmentExecution.tsx ──── Screens 3 & 4
│   ├── BodyScene.tsx (add zoom rectangle select)
│   ├── StingPointMarker.tsx (no changes)
│   └── FreeProtocolPointSelection.tsx (enhanced for free mode)
├── PostStingScreen.tsx ──────── Screen 5 (NEW)
│   └── VitalsInputGroup.tsx
├── TreatmentFeedback.tsx ───── (update measure source)
├── ProblemsProtocolsTab.tsx ── (multi-problem)
└── TreatmentHistory.tsx ────── (status badges, edit button)
```

---

## 6. Implementation Order (Recommended)

1. **Types first**: Update `treatmentSession.ts` and `patient.ts`
2. **PostStingScreen**: Create new component (no dependencies on other changes)
3. **ProblemsProtocolsTab**: Refactor to multi-problem (affects data shape)
4. **SessionOpening**: Add problem management + split measures
5. **ProtocolSelection**: Rewrite for new problem-based flow
6. **TreatmentExecution**: Remove vitals/notes, update navigation buttons
7. **PatientIntake**: Wire everything together — new ViewState, handlers, stepper
8. **Free Selection + Zoom**: BodyScene rectangle select, zoom modal
9. **TreatmentHistory**: Add status badges, edit/resume
10. **Cloud Function**: `sendMissingProblemEmail` + update feedback session creation
11. **Feedback components**: Update measure derivation
12. **UX Polish**: Stepper bar, draft indicator, slide animations, confirmation modal

---

## 7. Key Files Reference

| File | Path | Role |
|------|------|------|
| PatientIntake.tsx | `src/components/PatientIntake/PatientIntake.tsx` | Main orchestrator (929 lines) |
| SessionOpening.tsx | `src/components/PatientIntake/SessionOpening.tsx` | Screen 1 (357 lines) |
| ProtocolSelection.tsx | `src/components/ProtocolSelection.tsx` | Screen 2 (179 lines) |
| TreatmentExecution.tsx | `src/components/TreatmentExecution.tsx` | Screens 3-4 (566 lines) |
| FreeProtocolPointSelection.tsx | `src/components/FreeProtocolPointSelection.tsx` | Free selection wrapper (114 lines) |
| BodyScene.tsx | `src/components/BodyScene.tsx` | 3D body model |
| VitalsInputGroup.tsx | `src/components/VitalsInputGroup.tsx` | Reusable vitals input (156 lines) |
| PostStingScreen.tsx | `src/components/PostStingScreen.tsx` | **NEW** — Screen 5 |
| ProblemsProtocolsTab.tsx | `src/components/PatientIntake/ProblemsProtocolsTab.tsx` | Problems tab (176 lines) |
| TreatmentHistory.tsx | `src/components/TreatmentHistory.tsx` | Treatment history list |
| TreatmentFeedback.tsx | `src/components/PatientIntake/TreatmentFeedback.tsx` | Caretaker feedback (285 lines) |
| FeedbackStandaloneView.tsx | `src/components/PatientIntake/FeedbackStandaloneView.tsx` | Patient standalone feedback (267 lines) |
| treatmentSession.ts | `src/types/treatmentSession.ts` | Treatment type (49 lines) |
| patient.ts | `src/types/patient.ts` | Patient types (61 lines) |
| problem.ts | `src/types/problem.ts` | Problem type (15 lines) |
| protocol.ts | `src/types/protocol.ts` | Protocol type (17 lines) |
| measure.ts | `src/types/measure.ts` | Measure type (15 lines) |
| index.ts | `functions/src/index.ts` | Cloud Functions |
| airules.md | Root | Coding conventions — **READ FIRST** |
| Claude Style-Guide.md | Root | UI/CSS design system — **READ FIRST** |
