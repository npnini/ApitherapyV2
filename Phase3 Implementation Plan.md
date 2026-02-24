# Phase 3 — Patient Intake: Multi-Tab Modal Wizard

Refactor the existing 2-step `PatientIntake.tsx` into the multi-tab modal wizard shown in the design mockup. Reuse existing components where possible. Create placeholder tabs for sections not yet implemented.

**Decisions confirmed by user:**
- "Start New Treatment" renders `ProtocolSelection` → `TreatmentExecution` **inside the modal content area** (tab bar stays visible; tab clicks trigger a confirmation guard).
- Last tab (Measures History): Replace "Next Step" with a **"Done"** button that closes the modal.
- Update button on mock-up tabs: **Active but does nothing** (no disabled state).

---

## Observations from Existing Code

| Component | Current Role | Integration Effort |
|---|---|---|
| `PatientIntake.tsx` | 2-step wizard shell (Personal Details → Questionnaire) | **Major refactor** — becomes the 7-tab shell |
| `PersonalDetails.tsx` | Tab content, accepts `patientData + onDataChange + showErrors` | ✅ Drop-in, no changes |
| `QuestionnaireStep.tsx` | Tab content, accepts `patientData + onDataChange` | ✅ Drop-in, no changes |
| `TreatmentHistory.tsx` | Standalone component, accepts `patient + onBack` | ⚠️ Needs minor adaptation — `onBack` unused in tab context, pass no-op |
| `ProtocolSelection.tsx` | Accepts `patient + onBack + onProtocolSelect` — the treatment entry point | ✅ Renders in modal content area when "Start New Treatment" is clicked |
| `TreatmentExecution.tsx` | Accepts `patient + protocol + patientReport + preStingVitals + ...` — launched after protocol selection | ✅ Launched from `ProtocolSelection.onProtocolSelect` callback |

---

## UX Rules (All Confirmed)

| ID | Rule |
|---|---|
| UX-1 | **"Start New Treatment" gated:** Button is disabled unless the first 5 tabs (Personal Details, Questionnaire, Consent, Instructions, Problems & Protocols) all have saved data (`patient.id` exists AND all 5 tab flags are `true`). Tooltip on hover: *"Complete and save the first 5 tabs to start a treatment."* |
| UX-2 | **Dirty-state X guard:** If any tab has unsaved changes when X is clicked, show `ConfirmationModal`: *"You have unsaved changes. Are you sure you want to close?"* |
| UX-3 | **Empty state on Treatments History:** If no treatments exist, show a friendly message. Likely already implemented — verify; add if missing. |
| UX-4 | **Update button hidden on Treatments History tab:** That tab is read-only. Hide the Update button (not just disable). |
| UX-5 | **Green completion dot:** A small bright-green filled circle (dot) on the top-right corner of each tab button that has been saved. Applies to tabs 1–5 only (the saveable ones). |
| UX-6 | **Tab bar always visible.** Clicking a tab during `protocolSelection` or `treatmentExecution` triggers `ConfirmationModal`: *"Are you sure you want to terminate the treatment without saving?"* |
| UX-7 | **Patient name live in header:** Reads from `patientData.fullName`, updates as user types. |
| UX-8 | **Bottom bar hidden** during `protocolSelection` and `treatmentExecution` views. |

---

## Proposed Tab Order & Status

| # | Tab Label | Component | Status |
|---|---|---|---|
| 1 | Personal details | `PersonalDetails` (existing) | ✅ Reuse |
| 2 | Questionnaire | `QuestionnaireStep` (existing) | ✅ Reuse |
| 3 | Consent | — | 🔲 Mock-up |
| 4 | Instructions | — | 🔲 Mock-up |
| 5 | Problems & Protocols | — | 🔲 Mock-up |
| 6 | Treatments History | `TreatmentHistory` (existing) | ✅ Reuse (minor adapt) |
| 7 | Measures History | — | 🔲 Mock-up |

---

## Proposed Changes

### Shell Refactor

#### [MODIFY] PatientIntake.tsx — `src/components/PatientIntake/PatientIntake.tsx`

- Replace `currentStep: number` with `activeTab: TabKey` where `type TabKey = 'personal' | 'questionnaire' | 'consent' | 'instructions' | 'problems' | 'treatments' | 'measures'`
- Add `viewState: 'tabs' | 'protocolSelection' | 'treatmentExecution'` — controls content area; **tab bar always rendered**
- Tab bar: 7 tab buttons + "Start New Treatment" button on right side (UX-1 gate)
- Each tab button: green dot overlay if tab is saved (UX-5) — track via `savedTabs: Set<TabKey>`
- Content area renders: active tab | `<ProtocolSelection>` | `<TreatmentExecution>` based on `viewState`
- Tab click guard: if `viewState !== 'tabs'`, show `ConfirmationModal` before switching (UX-6)
- Bottom bar: **Update** + **Next Step** / **Done** on last tab — hidden when `viewState !== 'tabs'` (UX-8)
- **Update** button hidden on `treatments` tab (UX-4)
- X button: dirty-state guard via `ConfirmationModal` if unsaved changes (UX-2)
- Props: replace `onBack` with `onClose`

### New Mock-up Tab Components

#### [NEW] `src/components/PatientIntake/ConsentTab.tsx`
#### [NEW] `src/components/PatientIntake/InstructionsTab.tsx`
#### [NEW] `src/components/PatientIntake/ProblemsProtocolsTab.tsx`
#### [NEW] `src/components/PatientIntake/MeasuresHistoryTab.tsx`

Each mock-up tab is a simple placeholder card with a title and "Coming Soon" label, styled to match the app's design system. No logic needed.

### TreatmentHistory Adaptation

#### [MODIFY] TreatmentHistory.tsx — `src/components/TreatmentHistory.tsx`

- Current prop `onBack` is unused in the tab context — pass a no-op `() => {}`.
- No structural changes needed; the component renders its own content.

---

## Verification Plan

### Build Verification
```
npm run build
```
No TypeScript errors, no broken imports.

### Manual Verification Steps

1. **Open PatientDashboard** — confirm "Add New Patient" button is visible.
2. **Add New Patient:**
   - Click "Add New Patient" → Modal opens on "Personal Details" tab (tab 1 highlighted).
   - Fields are empty. Type a full name → name appears live in modal header.
   - Click each tab → correct tab content renders, tab button is highlighted.
   - Click "Next Step" → moves to next tab.
   - Click "Update" on Personal Details → data saves, status feedback shown.
   - Reach last tab → "Done" button replaces "Next Step".
   - Click X with unsaved changes → confirmation modal shown.
   - Click X confirmed → modal closes, PatientDashboard visible.
3. **Edit Existing Patient:**
   - Click Edit icon on a patient row → Modal opens on "Personal Details" tab with data pre-filled.
   - Patient name shown in header immediately.
   - Green dots visible on tabs that have saved data.
   - "Start New Treatment" button enabled only after tabs 1–5 are all saved.
4. **Start New Treatment flow:**
   - Click "Start New Treatment" → `ProtocolSelection` renders in content area, tab bar still visible.
   - Click another tab → confirmation modal shown.
   - Select a protocol → `TreatmentExecution` renders in content area.
   - Complete/cancel → returns to tabs view.
5. **Treatments History tab:**
   - Navigate to tab → existing records visible; Update button hidden.
   - For patient with no treatments: friendly empty state shown.
6. **Mock-up tabs (Consent, Instructions, Problems & Protocols, Measures History):**
   - Each shows a placeholder card — Update active, no errors.
