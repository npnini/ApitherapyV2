# Treatment Workflow Overhaul — Progress Tracker

> **Instructions for agents**: Read `docs/handover.md` first for full context.
> Mark items `[x]` when complete. Mark `[/]` when in progress. Add notes under items if needed.

---

## Phase 1: Data Model & Types
- [x] Update `src/types/treatmentSession.ts` — add `status`, change `protocolId` → `protocolIds`, add `problemIds`
- [x] Update `src/types/patient.ts` — add `PatientProblem` interface, change `MedicalData` to `problems[]`

## Phase 2: New Component — Post-Sting Screen (Screen 5)
- [x] Create `src/components/PostStingScreen.tsx`
- [x] Create `src/components/PostStingScreen.module.css`

## Phase 3: Problems Tab Refactoring
- [x] Refactor `src/components/PatientIntake/ProblemsProtocolsTab.tsx` — multi-problem with Active/Inactive
- [x] Rename tab label to "Problems" in PatientIntake.tsx

## Phase 4: Session Opening (Screen 1)
- [x] Add problem management section (chips, toggle, add problem dropdown)
- [x] Add "Problem Missing?" email popup / action
- [x] Split measures into General vs Problem-Specific
- [x] General measures shown from treatment > 1 only
- [x] Add "Exit" button with onExit prop

## Phase 5: Problem Selection (Screen 2)
- [x] Rewrite `src/components/ProtocolSelection.tsx` — table of active problems with protocol buttons
- [x] Add "Free Selection" button
- [x] Add "Exit" button

## Phase 6: Treatment Execution (Screens 3 & 4)
- [x] Remove post-sting vitals and final notes from `TreatmentExecution.tsx`
- [x] Add "Next Step" → Screen 5 navigation
- [x] Add "Another Protocol" → Screen 2 navigation (buffer points)
- [x] Enhance Free Selection: all points, sensitivity filter
- [x] Add click-to-zoom and "Reset View" button (replaces rectangle select for better UX)

## Phase 7: Flow Orchestration (PatientIntake.tsx)
- [x] Add `'postSting'` to ViewState
- [x] Add stepper bar (UX-A)
- [x] Add "Draft saved" indicator (UX-D)
- [x] Add state accumulation (stungPointIds, protocolIds, currentTreatmentId)
- [x] Update `handleSessionOpeningComplete` — save Incomplete, route by sensitivity
- [x] Add `handleProtocolSelect`, `handleFreeSelect`, `handleAnotherProtocol`
- [x] Add `handleNextToPostSting`, `handleFinishTreatment`
- [x] Add `handleExitIncomplete` with confirmation modal (UX-F)
- [x] Render PostStingScreen in content area
- [x] Add slide animation (UX-G)

## Phase 8: Treatment History
- [x] Add Incomplete status badge in `TreatmentHistory.tsx`
- [x] Add edit/resume icon on all rows
- [x] Support multi-problem/protocol display in tabular and list views
- [x] Implement edit flow for any treatment status (Resume click)
- [x] Status preservation logic (Incomplete vs Completed)

## Phase 9: Cloud Function
- [x] Add `sendMissingProblemEmail` in `functions/src/index.ts`
- [x] Update feedback session creation to derive measures from treatment.problemIds

## Phase 10: Feedback Components
- [x] Update `TreatmentFeedback.tsx` — derive measures from treated problems
- [x] Verify `FeedbackStandaloneView.tsx` works with updated feedback sessions

## Phase 11: Final Verification
- [ ] Full treatment flow walkthrough (Session Opening → Post-Sting → Complete)
- [ ] Sensitivity routing test
- [ ] Mid-process save and resume
- [x] Free Selection with zoom functionality (click-to-zoom/reset)
- [ ] Treatment History edit/resume
- [ ] Missing problem email
- [ ] Feedback with multi-problem measures
