Treatment Process Proposal \- Version C2

### **Patient Intake and Configuration**

* **New Patient Onboarding:** C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake

Includes personal details, medical questionnaire, treatment instructions, and treatment consent screens. 

These elements do not change.

* **Problems Selection:** 

C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\ProtocolSelection.tsx

This has to change. The therapist selects a list of problems for the patient and defines each as **Active** or **Inactive**. A protocol is defined for each problem. There will not be a selection of a protocol. Modify the tab name to be Problems without protocols.

* **Data Storage:** Problem data is stored in the patient\_medical\_data collection as an array of objects containing problemId and problemStatus.

### ---

**Treatment Session Workflow**

**General Principles:**

* **Mid-Process Saving:** The system allows saving data during the process to enable resuming from the exact stopping point.

* **Status Tracking:** Screens include "Next Step," "Update," or "Finish Treatment" buttons that trigger database updates.

* **Completion Status:** Treatments updated during the process are marked as **Incomplete**. Only the "Finish Treatment" button on the final screen marks the status as **Completed**.

Screen 1: New Treatment Opening

C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake\\SessionOpening.tsx

* **Customer Story:** The therapist enters the patient's narrative.

* **Problem Management:**  
  * Displays the list of defined problems and their status.

  * The therapist can change statuses or add new problems from problems collection and set their status.

  * **Feedback Loop:** If a problem is missing, the therapist can email the administrator via a popup. The caretaker shall be able to enter text describing what is missing. The email shall be sent to the email address contained in cfg\_app\_config.sendgridSenderEmail.

* **Tracking Measures:**  
  * **General Measures:** shall be entered from the second treatment onwards. The measures ids are set in cfg\_app\_config.generalMeasures. Display the measure names and enable entering a value. Validate the value against the limits defined for the measure.

  * **Problem-Specific Measures:** this has to be displayed from the first treatment. Display the measures that are defined for the active problems defined for the patient, and let the user set a value for each measure. Value has to be validated or allowed according to the limits defined for the measure.

  * **Vital Signs:** this has to be displayed from the first treatment. Let the user enter values for blood pressure and pulse.  
  * C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\VitalsInputGroup.tsx

* **Navigation:** "Next Step" or "Exit" buttons update the database with all data entered in the screen and **Incomplete** status.

  * **Logic:** If the treatment number is \<= cfg\_app\_config.initialSensitivityTestTreatments), navigate to **Screen 3** with a cfg\_app\_config.sensitivityProtocol. Otherwise, navigate to **Screen 2**.

Screen 2: Problem Selection

Based on C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake\\ProblemsProtocolsTab.tsx

* Displays rows of active problems and their associated protocols. The protocol text shall be displayed as a clickable button for selecting the protocol to navigate to screen 3\.

* Below the rows of the problems, there shall be the buttons "Free Selection" and “Exit”. “Free Selection” button navigating to **Screen 4** for free selection of points.

* **Exit:** Exiting here returns to the Patient Dashboard without updating the database.

Screen 3: Treatment Execution (Protocol-Based)

C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\TreatmentExecution.tsx

C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\BodyScene.tsx

C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\StingPointMarker.tsx

* Displays list of points defined in the selected protocol. The model is displayed with point locations. The user can select point sensitivity to filter the shown points on the list and on the model.

* **Interaction:** The therapist selects treated points via the protocol points list or by clicking on the point on the 3D model. Clicked points are added to the stung point list.

* **Visuals:** Hovering over points displays colors based on sensitivity levels (Red, Orange, Green).

* **Navigation:** "Next Step" button leads to **Screen 5** (post sting screen), while "Another protocol" button returns to **Screen 2**.

Screen 4: Free Selection

This can be a variation of the same treatment execution screen 3, by creating a controlled varying behavior, depending on the described below. A lot of the implementation is identical to the described above for screen 3\.

* Displays the 3D model (doll) with all points from collection cfg\_acupuncture\_points having status=active.

* **Controls:** Supports rotation, freezing, zoom, and pan, and filtering points by sensitivity.

* **Zoom Modal:** Selecting with the mouse a body segment and clicking a button to open a "blow up" modal showing only points in that specific area.

* **Interaction:** Points can be clicked on the point list, on the model or on the displayed zoom to mark them as treated. Clicked points are added to the stung point list.

* **Navigation:** "Next Step" leads to **Screen 5** (post sting screen).

Screen 5: Post sting screen

* Displays the list of treated points.

* **Post-Treatment Vitals:** Input for blood pressure and pulse after stinging and at the final conclusion. C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\VitalsInputGroup.tsx

* **Notes:** Text field for treatment course descriptions or future instructions.

* **Completion:** Clicking "Finish Treatment" saves all data and sets status to **Completed**.

---

Treatment History and Resumption

* **History Screen:** Displays treatments in descending chronological order. Incomplete treatments are highlighted.

* **Editing:** Users can enter any treatment to update data, by clicking an icon on the row

* **Resumption Flow:** Resuming or editing requires passing through all screens from the beginning.

* **Status Preservation:** Editing a **Completed** treatment does not revert its status. Updating an **Incomplete** treatment to the end changes it to **Completed**.  
