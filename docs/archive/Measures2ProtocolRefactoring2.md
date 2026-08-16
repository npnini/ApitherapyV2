Treatment data structure

Current situation:  
The problem arises when I want to do data analysis on treatment effectiveness.  
Currently, the logical structure of entities is - problems are set to a patient by the care taker after questioning the patient. A patient might have several problems. A problem might be set as active or inactive. A problem is assigned a treatment protocol and measures to record pre and post values, when a treatment is applied. When a treatment starts, the caretaker can change the status of a problem, add or remove  a problem, based on the questioning at the start of a treatment. Then the care taker can enter values for the measures of the active problems.  Following that, the caretaker can select a protocol from the list of protocols of the active problems, or click a “free selection” button. If the caretaker selected a predefined protocol, he is routed to the treatment execution page. If the caretaker clicks the free selection button, he is routed to the point selection page, and after he selected points he is routed to the treatment execution page.

There is a treatment session entity that records which protocols were executed in the session, which points were treated in the session, and a link in the treatment to pre and post measures document with the readings that were entered for each measure.

The data analysis was initially planned to show the change in measures over time per problem , because initially there was a problem with protocol setting, and the measures were set per problem.

The current scenarios break the simple logical structure.

1. The measures are set per problem and not per protocol. If the treatment was executed for a single protocol, the measures might be collected unrelated to the protocol that was executed.
2. There is a “sensitivity test” that must be executed at the beginning of the 2 first treatment sessions. If there is no problem, another protocol can be done in the same session. There is a sensitivity protocol, but its measures are not defined and not set at all because measures are set to a problem that is set to the patient.
3. “Free selection” - the caretaker can select to use the “targeted pain protocol” which allows him to choose treatment points that are not related to the problems that were defined for the patient. There are no measures defined for such a vague protocol, so practically it is not possible to follow up on treatments that were done using ad-hoc selected points.





The proposed solution - functional requirements:

1. Measures should be defined at configuration time by the administrator - linked to protocols.
2. Measures shall not be recorded in the patient\_medical\_data
3. Sensitivity protocol should have measures defined for it
4. “Targeted pain protocol” should have general measures assigned to it,
5. The “free selection” button should select this protocol for the treatment session.
6. Following selection of a protocol for treatment, the caretaker will be required to enter the pre-treatment values for the measures defined for the protocol.
7. In the treatment feedback scenario, the user will see a collapsible list of all protocols treated in the session. Protocol names will be displayed in the list headers; clicking a header will expand the measures for that protocol. As measures are completed for a protocol, its header will turn green. In a single-protocol session, the list will be expanded by default.
8. Shared Measures Optimization: If multiple protocols in a session share the same measure (e.g., "Pain Level"), entering a value for one will automatically sync it to the others to minimize redundant input.

Regarding problems:

1. There shall be an "General Pain“ defined as a problem
2. It shall be possible to set problems to a patient, and set each problem as active or inactive.
3. The history of changing problem status will be recorded in the database (including timestamp, new status, and the userId of the caretaker making the change)
4. In a treatment session, when a protocol is selected, it shall be possible to set for which of the active problems the protocol is executed.
5. targeted pain protocol - when selected for treatment,  it shall be possible to link it to an active problem of the patient, or to a system configured problem named “General pain”. It is expected that the caretaker will document in the treatment session text the information that led to the ad hoc treatment.
6. Sensitivity protocol - the first treatment sessions will be forced to start with this protocol.
7. Sensitivity protocol - This protocol will not be linked to a problem. It's measures will be recorded before treatment like any selected protocol
8. Sensitivity protocol - it shall be possible to enter measures for the protocol in feedback like any other protocol.





Development requirements:  

"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\ApplicationSettings.tsx"
done - remove from cfg\_app\_config.treatmentSettings the keys sensitivityProtocolIdentifier, cfg\_app\_config.freeProtocolIdentifier from UX

done - Add cfg\_app\_config.treatmentSettings.adhocProblemIdentifier, let the user select a problem from a dropdown showing list of problems in cfg\_problems. validate if the selected problem is linked to a protocol set with type=ad-hoc. if not, show a modal error message "select a problem linked to a protocol that is set with type=ad-hoc". 


"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\ProblemAdmin\\ProblemAdmin.tsx":  
done - Remove functionality to select measures  
done - Database mapping - remove measureIds from cfg\_problems documents



"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\ProtocolAdmin.tsx":
46. done -  Add functionality to select measures using shutter selector. Set it in the edit form after “Select Points”.
47. done - Database - add storing measureIds array in cfg\_protocols document.
48. done - Database - add a "type" attribute to cfg\_protocols with values: "standard", "sensitivity", or "ad-hoc".

* "Sensitivity protocol" will be set to "sensitivity".
* "Targeted pain protocol" (for free selection) will be set to "ad-hoc".
* All other protocols will be set to "standard".

49\. done - in the protocol edit page, let the user select a protocol type. the default type for a new protocol shall be standard. when a user sets type to sensitivity or ad-hoc, verify there is no other active protocol set with the same value.



"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake\\ProblemsTab.tsx"

done - The “Selected Problems” rectangle that shows rows of selected protocols shall be modified to show as follows, from start to end - Active button, Remove button, Problem name, Protocol name, measure names of measures defined for the protocol.

done - The Measures rectangle shall be removed.
53. The measures of the protocols shall NOT be recorded in patient\_medical\_data.measureIds.
54. done - When modifying the status of a problem, the action shall be recorded in problemStatusHistory (array of objects containing: status, timestamp, and userId).





"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake\\SessionOpening.tsx"  
done - Remove entering of “Problem-Specific Measures”



"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\ProtocolSelection.module.css"

61. Do the following changes in the “Problems-protocols” rectangle:
62. done - In the “Problems-protocols” rectangle, display the active problems and their standard protocols. this already exists. 
63. Add a dedicated "Ad-hoc / Targeted Pain" section below the active problems list. This section will contain a "Free Selection" button.
64. When "Free Selection" is clicked, it shall default to the protocol with type "ad-hoc" (Targeted Pain Protocol) that is set with status=active.
65. The system shall allow linking this ad-hoc protocol to one of the patient's active problems or to the "General Pain" system problem that is defined in cfg\_app\_config.treatmentSettings.adhocProblemIdentifier. The selected link will be recorded in the treatment document.

Remove the “Request a New Problem/Protocol” button.  
Remove the “Didn't find what you were looking for?” text string

Below the “Problems-protocols” rectangle, add a rectangle titled - “Selected protocol measures”.
72. In the rectangle, display the name of the selected protocol, and input fields for the protocol measures.
73. In the Session opening component, when a new treatment is started and the treatment number is <= cfg\_app\_config.initialSensitivityTestTreatments:

* Display a clear on-screen message: "Initial Sessions: Sensitivity Protocol Required".
* set the selected protocol to be the protocol with type = sensitivity and status=active
* Route the user to protocol selection with all standard protocol buttons inactive.
* The “Selected protocol measures” rectangle shall automatically display the measures for the sensitivity protocol that was selected.
74. The buttons at the bottom of the page shall be “Back” and “Next step”. The “Back" button shall route to the Session Opening page. The “Next step” button shall route to the Treatment execution page.



"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake\\TreatmentFeedback.tsx"  
"C:\\Users\\User\\Dev\\Projects\\ApitherapyV2\\src\\components\\PatientIntake\\FeedbackStandaloneView.tsx"

79. Changes in feedback UX as follows:
80. Right Pane Layout: Replace the flat "Measures" list with a **Collapsible Protocol List**.

    * Each treated protocol has a header (Protocol Name).
    * Clicking a header expands the measure inputs for that protocol.
    * Completed protocols (where all measures have values) will have a **green font** for the header.
    * If a single protocol was treated, it is expanded by default.
81. Shared Measures Sync: If a measure is shared across multiple protocols in the session, updating it in one collapsible section will update it in all others.
82. The “Save Feedback” button will be active only if:

    * Feedback text is entered.
    * Measures have been entered for ALL protocols in the treatment.
83. Tooltip: If the "Save Feedback" button is inactive, hovering will show: "Please enter measures for \[First Missing Protocol Name]".



Manual administrator actions:  
Sensitivity protocol - define measures for the protocol.
86. Targeted pain protocol - define measures for the protocol.
87. Database Cleanup: Erase all existing treatment records in the development environment (Clean Break).
88. Database Configuration:

* Remove `measureIds` from all `cfg\\\_problems` documents.
* Remove `patient\\\_medical\\\_data.measureIds` from patient documents.
* Set `type` (standard, sensitivity, ad-hoc) for all `cfg\\\_protocols`.
* Remove from cfg\_app\_config.treatmentSettings the keys sensitivityProtocolIdentifier, cfg\_app\_config.freeProtocolIdentifier



