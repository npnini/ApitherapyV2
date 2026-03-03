Patient Feedback form for caretaker fillup

Objective:
Add a component enabling the caretaker to record feedback from the patient, typically, a day or few after the treatment.

The new page shall be added to the PatientIntake modal. source is at src/components/PatientIntake folder.

Add a button labeled “Treatment Feedback” following the “Start New Treatment” button. The button will be active if the latest treatment.patientId.feedbackMeasureReadingId is not set.

When clicked, the displayed page shall be split to panes treatment (left) and feedback (right).
Treatment will show:
Treatment date and time
Patient report
Protocol rounds, per round:
Protocol name
Stung points code and label
Final notes

Feedback will show:
Extendable feedback textarea
Measures list retrieved from patient_medical_data.treatment_plan.measureIds map. 

For each measure will be shown:
Name
Description
Input field - depending on measure type - either category selectable from list of values, or scale numeric value
 
There shall be a Save button. The button will initially be inactive, become active when all input fields have been set, and will become inactive after update. 
When clicked:
A document shall be inserted to measured_values collection
The inserted document id shall be set to treatment.patientId.feedbackMeasureReadingId
An update success (green) or failure (red) message shall be displayed following the button.


Note for UI-UX considerations:
A scheduled process is planned to sent an email with a url to the patient a day after the treatment, allowing him to enter himself the feedback. The url is supposed to be a url to an identical page, that displays only the modal, on a clear background, with an empty sidebar, showing only the logo on the top left corner of the sidebar. The patient shall be able to enter data and submit the form, provided the feedback for the treatment was not entered yet.
