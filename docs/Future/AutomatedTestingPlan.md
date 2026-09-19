# Automated Testing Plan

This document outlines the strategy for automating UX processes and clinical workflows in the ApitherapyV2 project.

## 1. Tool Selection: Playwright

We have selected **Playwright** as the primary E2E (End-to-End) testing framework. 

### Why Playwright?
- **Codegen (Recording)**: Allows recording user actions in the browser to generate test scripts automatically.
- **Auto-waiting**: Built-in logic to wait for elements and network requests (ideal for Firebase/React).
- **Multi-browser**: Supports Chromium (Chrome/Edge), Firefox, and WebKit (Safari).
- **Trace Viewer**: Provides a full recording of failed tests, including DOM snapshots and console logs.

## 2. Comprehensive Test Suite (Pre-Production Verification)

To ensure 100% verification before a production release, the following test cases must be automated. These cover the critical clinical safety and data integrity paths.

### A. Core Clinical Workflow (The 5-Screen Process)
1.  **TC-CW-01: Full New Patient Journey**
    - Complete Personal Details -> Questionnaire -> Instructions -> Consent.
    - Start Session Opening -> Problem Selection (Standard Protocol).
    - Execute Treatment (Select 3 points) -> Post-Sting Feedback -> Finish.
    - *Verify: Treatment status is 'completed' and all points recorded.*
2.  **TC-CW-02: Free Selection Journey**
    - Skip to Free Selection from Protocol Selection screen.
    - Use Shuttle Selector to pick points.
    - *Verify: Session registered with 'Targeted pain treatment' problem and Free Protocol ID.*
3.  **TC-CW-03: Proximity Tap Verification**
    - In Treatment Execution (Free Selection mode), tap the 3D model.
    - *Verify: Proximity list appears and points can be selected and stung.*
4.  **TC-CW-04: Sensitivity Test Flow**
    - Initiate a session marked as "Sensitivity Test".
    - *Verify: Only sensitivity-specific points are available and follow-up flags are set.*
5.  **TC-CW-05: Session Resumption**
    - Start a treatment, sting one point, then exit (Save as Draft).
    - Re-open patient -> Resume treatment.
    - *Verify: Previously stung points are marked and state is restored.*

### B. Patient Management & History
6.  **TC-PM-01: Patient Search & Filter**
    - Search by Name, ID, and Phone. Filter by treatment status.
7.  **TC-PM-02: History Tab Integrity**
    - View a completed patient's history.
    - *Verify: Sticky columns (Date/Action) work in both LTR and RTL layouts.*
    - *Verify: Hovering over truncated notes shows full text.*
8.  **TC-PM-03: Multi-Problem Association**
    - Select multiple active problems during Session Opening.
    - *Verify: All selected problem IDs are saved in the final treatment document.*

### C. 3D Model & Interaction
9.  **TC-3D-01: Viewport Controls**
    - Verify rotation, zoom, and panning.
    - *Verify: Model container is scrollable on small/medium screens.*
10. **TC-3D-02: Point Visualization**
    - Verify color coding (Grey = Not stung, Orange = Selected, Green = Stung).

### D. Admin & Configuration
11. **TC-AD-01: Protocol Configuration**
    - Edit a protocol's point list in Admin.
    - *Verify: Changes immediately reflect in the Patient Intake flow.*
12. **TC-AD-02: App Config Persistence**
    - Change global settings (e.g., `freeProtocolIdentifier`).
    - *Verify: The "Free Selection" button uses the new ID immediately.*

### E. Global Features & Safety
13. **TC-GL-01: Language/RTL Support**
    - Toggle between Hebrew (RTL) and English (LTR).
    - *Verify: UI layout flips correctly and text is translated.*
14. **TC-GL-02: Authentication & Authorization**
    - Verify login flow and role-based access (Caretaker vs. Admin).
15. **TC-GL-03: Data Loss Prevention**
    - Attempt to close a dirty form without saving.
    - *Verify: Confirmation guard modal appears.*

## 3. Automation Workflow

### A. Recording a Test (No Coding Required)
To record a new test scenario:
1. Ensure the development server is running: `npm run dev`
2. Run the recorder: `npx playwright codegen localhost:5173`
3. Perform the actions in the browser.
4. Copy the generated code into a new file in the `/tests` directory.

### B. Running Tests
- **Headless (Fast)**: `npx playwright test`
- **UI Mode (Debugging)**: `npx playwright test --ui`

## 4. Environment & Data
- Tests should ideally run against a **Firebase Emulator** to avoid polluting production or staging data.
- Initial state should be controlled via test-specific seed data.

## 5. Next Steps
1. Install dependencies: `npm install -D @playwright/test`
2. Initialize configuration: `npx playwright install`
3. Create the first recorded scenario for "Patient Intake".
