# Phase 3 — Patient Intake Handover

> **For the new agent:** Read the following documents **in order** before doing anything:
> 1. `airules.md` — project constraints (never modify `translation.json`, never build/deploy, always ask permission before modifying a component, etc.)
> 2. `STYLING_GUIDE.md` — CSS/UX conventions (button colors, input styles, modal headers, label rules, green dot, etc.)
> 3. This document — the step-by-step execution plan.

---

## Goal

Refactor `PatientIntake.tsx` from a 2-step wizard into a stable **7-tab modal wizard** for managing all aspects of a patient record. Reuse existing components where possible. Add mock-up tabs for sections not yet implemented.

The full technical plan is in the conversation artifact `implementation_plan.md`.

---

## Key Architecture Decisions

- **Modal frame is always stable.** Header ("Patient Details — [patient name]") and tab bar are always visible.
- **Tab bar row:** 7 tab buttons (left) + "Start New Treatment" button (right, visually separated).
- **Content area** switches between: active tab content | `ProtocolSelection` | `TreatmentExecution`.
- **Bottom bar** (Update + Next Step/Done): hidden when content area shows `ProtocolSelection` or `TreatmentExecution`.
- **View state:** `'tabs' | 'protocolSelection' | 'treatmentExecution'` — managed in `PatientIntake.tsx`.

## UX Rules Summary

| ID | Rule |
|---|---|
| UX-1 | "Start New Treatment" disabled unless `patient.id` exists AND tabs 1–5 all saved |
| UX-2 | X button: dirty-state guard via `ConfirmationModal` if unsaved changes exist |
| UX-3 | Treatments History tab: show friendly empty state if no records (verify existing impl.) |
| UX-4 | Update button hidden on Treatments History tab (read-only tab) |
| UX-5 | Green dot on top-right corner of tab buttons 1–5 when that tab's data is saved |
| UX-6 | Tab click during treatment: `ConfirmationModal` "Are you sure you want to terminate the treatment without saving?" |
| UX-7 | Patient name appears live in modal header as user types Full Name |
| UX-8 | Bottom bar hidden during `protocolSelection` and `treatmentExecution` views |

---

## Execution Steps

Each step below is **self-contained** and can be developed, built, and merged independently.
Mark completed steps with `[x]`.

---

### Step 1 — Branch Setup
- [ X] Create branch: `git checkout -b feature/Phase3-PatientIntake`

---

### Step 2 — Shell Refactor: `PatientIntake.tsx`
**Branch:** `feature/Phase3-PatientIntake`

This is the core shell. Do this first — everything else plugs into it.

- [ ] Replace `currentStep: number` with `activeTab: TabKey`
  ```ts
  type TabKey = 'personal' | 'questionnaire' | 'consent' | 'instructions' | 'problems' | 'treatments' | 'measures';
  ```
- [ ] Add `viewState: 'tabs' | 'protocolSelection' | 'treatmentExecution'`
- [ ] Add `savedTabs: Set<TabKey>` to track which tabs have been saved
- [ ] Add `isDirty: boolean` state to track unsaved changes on the current tab
- [ ] Build the tab bar row (7 tabs + "Start New Treatment" on right)
- [ ] Add green dot overlay on tab buttons where `savedTabs.has(tab)` (UX-5)
- [ ] Rename `onBack` prop to `onClose`
- [ ] Wire `renderTab()` switch — initially all tabs return `<div>Placeholder</div>` except Personal Details and Questionnaire (which are already wired)
- [ ] Bottom bar: `Update` + `Next Step` → `Done` on last tab; hidden when `viewState !== 'tabs'` (UX-8)
- [ ] Tab click guard: if `viewState !== 'tabs'`, show `ConfirmationModal` (UX-6)
- [ ] X button: dirty-state guard via `ConfirmationModal` (UX-2)
- [ ] "Start New Treatment" gate: disabled unless `patient.id && allFirstFiveSaved` (UX-1)
- [ ] `Build and verify (ask user permission first)`

---

### Step 3 — Wire Existing Tabs: PersonalDetails & QuestionnaireStep
**Branch:** `feature/Phase3-PatientIntake`

These components already exist — just re-wire them into `renderTab()`. After this step the modal is fully functional for the existing Add New Patient and Edit Patient scenarios.

- [ ] Wire `case 'personal'` → `<PersonalDetails>` (same props as before)
- [ ] Wire `case 'questionnaire'` → `<QuestionnaireStep>` (same props as before)
- [ ] On `Update` click for `personal` and `questionnaire`: call `onUpdate()`, then add tab key to `savedTabs`
- [ ] Verify patient name appears live in header as user types (UX-7)
- [ ] `Build and verify`

**✅ Human test gate:** Verify the full Add New Patient flow and Edit Patient flow work end-to-end. When confirmed — commit, push, and merge `feature/Phase3-PatientIntake` → `main`.

---

### Step 4 — Treatments History Tab: `TreatmentHistory.tsx`
**Branch:** `feature/Phase3-TreatmentHistoryTab`  *(branch from `main` after Step 3 merge)*

- [x] Wire `case 'treatments'` → `<TreatmentHistory patient={patient} onBack={() => {}} />`
  - `onBack` is unused in tab context — pass no-op
- [x] Hide `Update` button when `activeTab === 'treatments'` (UX-4)
- [x] Verify empty state exists for patients with no treatments (UX-3); add friendly message if missing
- [x] In `src/components/PatientDashboard.tsx`: remove the standalone TreatmentHistory icon/button from the patient row — treatment history is now accessed via the modal tab
- [x] `Build and verify`

**✅ Human test gate:** Verify Treatments History tab renders correctly, standalone icon is gone. When confirmed — commit, push, and merge `feature/Phase3-TreatmentHistoryTab` → `main`.

---

### Step 5 — "Start New Treatment" In-Modal Flow
**Branch:** `feature/Phase3-StartNewTreatment`  *(branch from `main` after Step 4 merge)*

- [ ] On "Start New Treatment" click: set `viewState = 'protocolSelection'`
- [ ] Render `<ProtocolSelection patient={patient} onBack={() => setViewState('tabs')} onProtocolSelect={(protocol, patientReport, preStingVitals) => { /* store, then setViewState('treatmentExecution') */ }} />`
- [ ] Store selected `protocol`, `patientReport`, `preStingVitals` in local state
- [ ] Render `<TreatmentExecution>` when `viewState === 'treatmentExecution'`
  - On `onBack`: `setViewState('protocolSelection')`
  - On `onFinish`: `setViewState('tabs')`
- [ ] `Build and verify`

**✅ Human test gate:** Verify the full Start New Treatment flow (ProtocolSelection → TreatmentExecution → back to tabs, tab-click guard). When confirmed — commit, push, and merge `feature/Phase3-StartNewTreatment` → `main`.

---

### Step 6 — Mock-up Tabs (Consent, Instructions, Problems & Protocols, Measures History)
**Branch:** `feature/Phase3-MockupTabs`  *(branch from `main` after Step 5 merge)*

Create 4 simple placeholder tab components. Each is a styled card with a title and "Coming Soon" message, matching the app design system (`var(--color-primary)`, etc.).

- [ ] `src/components/PatientIntake/ConsentTab.tsx`
- [ ] `src/components/PatientIntake/InstructionsTab.tsx`
- [ ] `src/components/PatientIntake/ProblemsProtocolsTab.tsx`
- [ ] `src/components/PatientIntake/MeasuresHistoryTab.tsx`
- [ ] Wire all 4 into `renderTab()` in `PatientIntake.tsx`
- [ ] `Update` on mock-up tabs: active button, no-op handler
- [ ] `Build and verify`

**✅ Human test gate:** Verify all 4 placeholder tabs render, Update is active, no errors. When confirmed — commit, push, and merge `feature/Phase3-MockupTabs` → `main`.

---

### Step 7 — Final End-to-End Verification
**Branch:** none — all features are already merged into `main`

All individual features have been tested and merged in Steps 3–6. This step is a final holistic check of the complete flow together on `main`.

- [ ] Manual test: Add New Patient — all 7 tabs, live name in header, X guard, "Done" on last tab
- [ ] Manual test: Edit existing patient — data pre-filled, green dots on saved tabs, "Start New Treatment" gated until tabs 1–5 saved
- [ ] Manual test: Full treatment flow within modal — ProtocolSelection → TreatmentExecution → back to tabs; tab-click guard fires
- [ ] Manual test: Treatments History tab — Update button hidden; empty state for new patients
- [ ] Manual test: All mock-up tabs show placeholder, Update button active
- [ ] `Build passes clean` — confirm no regressions

---

## Component Map

| Component | Path | Role | Action |
|---|---|---|---|
| `PatientIntake.tsx` | `src/components/PatientIntake/PatientIntake.tsx` | Modal shell + tab manager | **Major refactor** |
| `PersonalDetails.tsx` | `src/components/PatientIntake/PersonalDetails.tsx` | Tab 1 content | Drop-in reuse |
| `QuestionnaireStep.tsx` | `src/components/PatientIntake/QuestionnaireStep.tsx` | Tab 2 content | Drop-in reuse |
| `ConsentTab.tsx` | `src/components/PatientIntake/ConsentTab.tsx` | Tab 3 content | **NEW** (mock-up) |
| `InstructionsTab.tsx` | `src/components/PatientIntake/InstructionsTab.tsx` | Tab 4 content | **NEW** (mock-up) |
| `ProblemsProtocolsTab.tsx` | `src/components/PatientIntake/ProblemsProtocolsTab.tsx` | Tab 5 content | **NEW** (mock-up) |
| `TreatmentHistory.tsx` | `src/components/TreatmentHistory.tsx` | Tab 6 content | Reuse, minor adapt |
| `MeasuresHistoryTab.tsx` | `src/components/PatientIntake/MeasuresHistoryTab.tsx` | Tab 7 content | **NEW** (mock-up) |
| `ProtocolSelection.tsx` | `src/components/ProtocolSelection.tsx` | In-modal treatment start | Reuse, no changes |
| `TreatmentExecution.tsx` | `src/components/TreatmentExecution.tsx` | In-modal treatment execute | Reuse, no changes |
| `ConfirmationModal` | (existing) | Guard dialogs | Reuse, no changes |

---

## Rules Reminder
- **Never initiate build/deploy** — ask for permission first.
- **Never modify a component without asking permission.**
- Always update this handover document when a step is completed.
