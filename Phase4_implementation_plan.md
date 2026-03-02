# Treatment Flow Refactor — Implementation Plan

## Background & Goal

The existing treatment flow is a single-protocol-per-session flow: `ProtocolSelection` (which bundles patient report + pre-sting vitals + protocol pick) → `TreatmentExecution` (one protocol, save).

The new flow supports **multiple protocols per session**, enforces an **initial sensitivity-test phase**, captures **tracking measures at session open**, and properly separates the pre-session data entry from protocol selection.

---

## 1. Proposed Changes — Overview

### A. `ViewState` Machine in `PatientIntake.tsx`

Replace the two-state view (`protocolSelection | treatmentExecution`) with a proper 4-state machine:

| State | Renders |
|---|---|
| `tabs` | Tab panel (unchanged) |
| `sessionOpening` | **[NEW]** `SessionOpening` component — measures + pre-sting vitals |
| `protocolSelection` | **[REFACTORED]** `ProtocolSelection` — problem list → protocol list only |
| `treatmentExecution` | **[REFACTORED]** `TreatmentExecution` — multi-protocol accumulation |

---

## 2. UX Flow (Implemented States)

```
[Start New Treatment]
        ↓
SessionOpening
  • Record patient report / case story (text)  ← FIRST
  • Record patient tracking measures:
      - If treatment_plan.measureIds is populated → show only those measures
      - If measureIds is empty → show all cfg_measures for user to select from
  • Record pre-session blood pressure + heart rate (VitalSigns)
  • [Logic] count existing treatments for patient
        ↓
  If count < app_config.treatmentSettings.initialSensitivityTestTreatments:
    → TreatmentExecution with sensitivityProtocol locked (banner shown)
    → After this round, "Another Protocol" is available → ProtocolSelection
  Else:
    → ProtocolSelection
        ↓
ProtocolSelection
  • Show patient's problemIds (from medical_record.treatment_plan.problemIds)
  • On problem select: show that problem's protocolIds as selectable protocol cards
  • On protocol select → TreatmentExecution
        ↓
TreatmentExecution (one or more rounds)
  • Shows protocol points, 3D model, sting recording
  • Document icon on points with documentUrl[userLang] → opens new tab
  • [Optional] post-round BP + HR entry
  • "Another Protocol" → returns to ProtocolSelection (full problem list), accumulates rounds
        ↓
End of Treatment
  • Stinger-removal vitals (finalVitals) — optional
  • Final notes text area
  • [Save Treatment] — saves entire accumulated session
```

---

## 3. Database Structure

### `treatments` Collection (Root-Level)

Document ID: **`{patientId}_{Date.now()}`** (composite key — already in use for `saveTreatment`, same pattern as `measured_values`)

```typescript
// src/types/treatmentSession.ts  — NEW shape (replaces existing TreatmentSession)

interface ProtocolRound {
  protocolId:       string;
  problemId:        string;         // which problem this protocol was selected for
  stungPointCodes:  string[];       // codes of points stung in this round
  postRoundVitals?: Partial<VitalSigns>; // optional BP+HR after this round's stings
}

interface TreatmentSession {
  id?:               string;         // Firestore document ID (set client-side after write)
  patientId:         string;         // FK → patients/{patientId}
  caretakerId:       string;         // FK → users/{uid}

  // --- Pre-session ---
  patientReport:     string;         // case story / patient feedback
  preSessionVitals:  Partial<VitalSigns>;  // BP + HR at start of session
  measureReadingId?: string;         // FK → measured_values/{docId} (written at session open)

  // --- Protocol rounds ---
  rounds:            ProtocolRound[];  // one entry per protocol executed

  // --- Post-session ---
  finalVitals?:      Partial<VitalSigns>;  // stinger-removal BP + HR (15 min post)
  finalNotes?:       string;

  // --- Post-treatment patient response (future — structure reserved) ---
  patientFeedback?:  string;          // patient-entered text after treatment day
  patientFeedbackMeasureReadingId?: string; // FK → measured_values/{docId} written by patient

  // --- Metadata ---
  isSensitivityTest: boolean;        // true if this session used the sensitivity protocol
  createdTimestamp:  any;            // serverTimestamp
  updatedTimestamp:  any;            // serverTimestamp
}
```

> **Key design decisions:**
> - Root-level collection `treatments` already exists and uses `{patientId}_{timestamp}` composite key — no change needed.
> - `rounds[]` replaces `stungPointCodes: string[]` + `protocolId: string` to support multi-protocol sessions.
> - `measureReadingId` links to the `measured_values` entry created at session open (same pattern as the post-treatment case for patient feedback).
> - `patientFeedback` and `patientFeedbackMeasureReadingId` are reserved fields for the future post-treatment process.
> - The old `Treatment` interface in `patient.ts` and `TreatmentSession` in `treatmentSession.ts` will be **replaced** by this single interface.

---

## 4. Files to Create / Modify

---

### Component Layer

#### [NEW] `SessionOpening.tsx` + `SessionOpening.module.css`
**Location:** `src/components/PatientIntake/SessionOpening.tsx`

- Props: `patient`, `appConfig`, `existingTreatmentCount`, `onComplete(data: SessionOpeningData)`
- Renders:
  1. **Patient Report** — textarea (case story, first field)
  2. **Tracking Measures section:**
     - If `treatment_plan.measureIds` is non-empty → fetch and show only those measures
     - If empty → fetch all from `cfg_measures` and show all (user can enter any)
     - Reuse category/scale input pattern from `MeasuresHistoryTab`
  3. **Pre-Session Vitals** — `VitalsInputGroup` for BP + HR
- On submit: calls `onComplete` with `{ measureReadings, patientReport, preSessionVitals }`
- The `onComplete` callback in `PatientIntake` will:
  - Write a `measured_values` entry (always, if any values entered)
  - Store `patientReport` + `preSessionVitals` in local state
  - Check `existingTreatmentCount` < `appConfig.treatmentSettings.initialSensitivityTestTreatments` → sensitivity path; else ProtocolSelection

#### [REFACTOR] `ProtocolSelection.tsx`

**Remove:** patient report textarea, pre-sting vitals inputs, AI suggestions ("Find Suggested Protocols") button, full protocol list toggle
**Add:** 
- Problem list (from `patient.medicalRecord.treatment_plan.problemIds`) fetched from `cfg_problems` collection, shown as a selectable card list
- On problem select: show that problem's protocols (`problem.protocolIds`) fetched from `cfg_protocols` as selectable cards
- "Back" within the component goes from protocol list back to problem list
- Prop change: `onProtocolSelect(protocol: Protocol, problemId: string)` — no longer passes `patientReport` or `preStingVitals`

#### [REFACTOR] `TreatmentExecution.tsx`

- Remove: "Save Treatment" triggers full Firestore write (no longer its job)
- Add: **Sensitivity test banner** — if `isSensitivityTest=true` prop, show an informational banner indicating the protocol is locked for sensitivity testing
- Add: "**Another Protocol**" button — always visible; calls `onRoundComplete(round)` to accumulate the round, then navigates back to `ProtocolSelection` (full problem list)
- Add: "**End Treatment**" button — calls `onEndTreatment(finalVitals, finalNotes)`; the parent saves the full session
- Add: document icon on protocol points that have `documentUrl[userLang]` — opens URL in new tab
- Post-round optional BP+HR entry (`VitalsInputGroup` labelled "Post-Stinging Measures — Optional")
- `saveStatus` prop removed from this component (saving is now the parent's job)

#### [REFACTOR] `PatientIntake.tsx`

- `ViewState` adds `'sessionOpening'`
- New state: `rounds: ProtocolRound[]`, `sessionOpeningData: SessionOpeningData | null`, `selectedProblemId: string | null`, `isSensitivitySession: boolean`
- `handleStartNewTreatment`: transition to `'sessionOpening'` (was `'protocolSelection'`)
- `handleSessionOpeningComplete`: stores data; fetches treatment count; if `count < initialSensitivityTestTreatments` → set `isSensitivitySession=true`, load sensitivity protocol from config, transition to `'treatmentExecution'`; else → transition to `'protocolSelection'`
- `handleProtocolSelect`: sets `selectedProtocol + problemId`, transitions to `'treatmentExecution'`
- `handleRoundComplete`: appends to `rounds[]`, clears `isSensitivitySession` flag (can now pick freely), transitions to `'protocolSelection'`
- `handleEndTreatment(finalVitals, finalNotes)`: assembles `TreatmentSession` from `rounds[]` + session opening data, calls `saveTreatment()`, then transitions to `'tabs'` / treatments tab
- Existing abort-treatment guard modal applies when "Start New Treatment" is clicked mid-session

---

### Data Layer

#### [MODIFY] `src/types/treatmentSession.ts`

Replace existing `TreatmentSession` interface with new shape (see Section 3 above). Add `ProtocolRound` interface.

#### [MODIFY] `src/types/patient.ts`

Remove the old `Treatment` interface (it is superseded by `TreatmentSession`). The `treatment_plan.measureIds` reference remains in `MedicalData`.

#### [MODIFY] `src/firebase/patient.ts`

Modify `saveTreatment` to accept the new `TreatmentSession` shape (instead of old `Partial<Treatment>`). The composite key pattern `{patientId}_{Date.now()}` is unchanged.

Add: `getTreatmentCount(patientId: string): Promise<number>` — queries `treatments` collection by `__name__` range (same pattern as `measured_values`), returns count. Used by `SessionOpening` / `PatientIntake` to decide sensitivity-test path.

#### [MODIFY] `src/components/TreatmentHistory.tsx`

Update the treatment document mapping to handle the new `rounds[]` array field. Display should show first protocol name or "Multi-protocol session" as appropriate.

---

### Config / Schema

#### No schema changes required.
`initialSensitivityTestTreatments` and `sensitivityProtocolIdentifier` already exist in `appConfigSchema.ts > treatmentSettings`. The sensitivity protocol logic now actually uses these values (currently these exist but are not wired to any logic).

---

## 5. Translation Strings Required (do NOT modify translation files — I will list them)

New strings to be added to `public/locales` by the user:

```
"Session Opening"
"Tracking Measures"
"Patient Report"
"Pre-Session Blood Pressure & Heart Rate"
"Next: Select Protocol"
"Select a Problem"
"Select a Problem to view available protocols"
"Select a Protocol"
"Another Protocol"
"End Treatment"
"Stinger Removal Measures (Optional)"
"This session uses the sensitivity test protocol."
"Post-Stinging Measures (Optional)"
```

---

## 6. Proposed Implementation Phases

| Phase | Scope | Key files |
|---|---|---|
| **1** | Types & data layer | `treatmentSession.ts`, `patient.ts`, `firebase/patient.ts` |
| **2** | `SessionOpening` component | New file |
| **3** | Refactor `ProtocolSelection` | Problem → Protocol two-step |
| **4** | Refactor `TreatmentExecution` | Round-based, document icons, "Another Protocol" |
| **5** | Wire into `PatientIntake` | ViewState machine, accumulation logic, final save |
| **6** | Update `TreatmentHistory` | Adapt display to new rounds[] structure |

---

> [!NOTE]
> **Post-Treatment Process (future):** The `patientFeedback` and `patientFeedbackMeasureReadingId` fields are added to the `TreatmentSession` document schema as reserved nullable fields. No implementation component is planned for now.

---

## 7. Verification Plan

### Manual Verification (after each phase)

1. **Phase 1** — Verify TypeScript compiles with no errors after type changes.
2. **Phase 2 (SessionOpening)** — Click "Start New Treatment". Verify patient report appears first, then measures section (all from cfg_measures if measureIds empty), then vitals. Click "Next" → data held in state.
3. **Phase 3 (ProtocolSelection refactor)** — Problem list loads for patient's `problemIds`. Select a problem → only that problem's protocols shown. Back → returns to problem list.
4. **Phase 4 (TreatmentExecution)** — Mark sting points. Click "Another Protocol" → `ProtocolRound` accumulated; user returns to full problem list. Sensitivity banner visible when applicable.
5. **Phase 5 (Save)** — Complete 2-round session. Save → single Firestore `treatments` document with `rounds: [{...},{...}]`, correct `preSessionVitals`, `finalVitals`, `isSensitivityTest` flag.
6. **Phase 6** — `TreatmentHistory` tab with multi-round session renders without crashing.

### Sensitivity Test Logic Check
- Set `initialSensitivityTestTreatments = 3` in app config.
- New patient (0 treatments): Session Opening → `TreatmentExecution` with sensitivity protocol locked and banner shown. After round → "Another Protocol" available → normal `ProtocolSelection`.
- After 3 saved treatment sessions: Session Opening → normal `ProtocolSelection` appears directly.

### No automated tests exist in this codebase. All verification is manual.
