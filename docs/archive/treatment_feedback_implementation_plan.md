# Treatment Feedback Form — Implementation Plan

## Background & Goal
Add a feature allowing caretakers (and eventually patients) to record feedback a day after a treatment session. This helps track treatment efficacy through specific measures (KPIs) and qualitative patient reports.

## Proposed Changes

### [Component Layer]

#### [NEW] `TreatmentFeedback.tsx` + `TreatmentFeedback.module.css`
**Location:** `src/components/PatientIntake/TreatmentFeedback.tsx`
- **Purpose:** The main UI for the feedback form.
- **Layout:** Two-pane display:
    - **Left Pane (Treatment Summary):** Shows details of the latest treatment (date/time, patient report, rounds with protocol names and points, final notes).
    - **Right Pane (Feedback Form):**
        - Extendable textarea for general feedback.
        - List of measures from `patient.medicalRecord.treatment_plan.measureIds`.
        - Dynamic inputs based on measure type (category or scale).
- **Logic:**
    - "Save" button becomes active only when all measures are filled.
    - Saves a new document to `measured_values` collection.
    - Updates the `treatment` document to link the new `measured_values` ID to `feedbackMeasureReadingId`.

#### [MODIFY] `PatientIntake.tsx`
- **Logic:** 
    - Add a new "Treatment Feedback" button next to "Start New Treatment".
    - Button enabled state: `latestTreatment && !latestTreatment.feedbackMeasureReadingId`.
    - Add a new `ViewState` for `'feedback'`.
    - Pass the `latestTreatment` to the `TreatmentFeedback` component.

### [Data Layer]

#### [MODIFY] `src/firebase/patient.ts`
- **Function:** `saveTreatmentFeedback` (or similar)
    - Create a document in `measured_values`.
    - Update the `treatments` document (ID: `{patientId}_{timestamp}`) with the new `feedbackMeasureReadingId`.

### [Styling]
- Follow `STYLING_GUIDE.md` for inputs, buttons, and headers.
- Ensure RTL support for Hebrew.

## Verification Plan

### Manual Verification
1. **Button Visibility:**
    - Open `PatientIntake` for a patient with a treatment but no feedback. "Treatment Feedback" button should be active.
    - Open for a patient with feedback already recorded. Button should be inactive.
2. **Form Layout:**
    - Click the button. Verify two-pane layout.
    - Left pane must accurately reflect the latest treatment data.
3. **Save Logic:**
    - Fill out the form. Verify "Save" button activates.
    - Click "Save". Verify:
        - Success message appears.
        - `measured_values` collection has a new entry.
        - `treatments` collection document is updated with `feedbackMeasureReadingId`.
4. **RTL Support:**
    - Switch language to Hebrew. Verify layout and alignments are correct.

### Future Considerations
- **Standalone Mode:** The component should be designed to support a "standalone" mode (no sidebar, clear background) for the planned patient-facing email link.
