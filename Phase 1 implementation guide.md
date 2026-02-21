Implementation Plan: Multilingual Support for Measure Categories
This plan addresses the limitation where user-defined dropdown values (categories) in Measures are stored as simple strings, preventing localization for patients.

Proposed Changes
[Component Name] Core Types & Schema
[MODIFY] 
measure.ts
Update the 
Measure
 interface:

Change categories?: string[] to categories?: Array<{ [key: string]: string }>.
Change 
name
 and description to { [key: string]: string }.
[MODIFY] 
problem.ts
Change 
name
 and description to { [key: string]: string }.
[MODIFY] 
apipuncture.ts
Change label and description to { [key: string]: string }.
[MODIFY] 
protocol.ts
Change 
name
, description, and rationale to { [key: string]: string }.
[MODIFY] 
questionnaire.ts
Update 
Translation
 pattern from array Translation[] to map { [role: string]: string } for consistency.
Ensure 
QuestionOption
 uses the same map pattern.
[Component Name] Admin UI
[MODIFY] 
MeasureAdmin.tsx
State Management: Update categoryInput and editingCategory transitions to handle language-specific values.
Form UI: Add a language toggle (English/Hebrew) to the 
EditMeasureForm
. When a language is selected, the input fields for 
name
, description, and categories will show/edit the value for that language.
Category Logic: 
handleAddCategory
 will now push an object { [lang]: value } or update an existing object in the categories array.
[MODIFY] 
ProblemForm.tsx
Transition 
name
 and description from string to { [key: string]: string }.
Add a language selector to allow entering values for both supported languages.
[MODIFY] 
QuestionnaireForm.tsx
Update the type dropdown to include text and select.
Implement an Options Editor for the select type.
The Options Editor will allow users to define multiple options, each with a value (slug) and multilingual labels (map pattern).
Transition question text from array-based translations to the map-based pattern.
[MODIFY] 
PointsAdmin.tsx
Transition label and description to the map-based multilingual pattern.
Update 
EditPointForm
 to allow language-specific inputs.
[MODIFY] 
ProtocolAdmin.tsx
Transition 
name
, description, and rationale to the map-based multilingual pattern.
Update 
EditProtocolForm
 to allow language-specific inputs.
[Component Name] Patient UI
[MODIFY] [PatientFeedbackForm.tsx] (or equivalent)
Update the viewing logic to select the correct language string from the multilingual objects based on i18n.language.
Verification Plan
Manual Verification
Open the Admin panel for Measures.
Create a "Category" type Measure.
Enter category values for both English ("Mild") and Hebrew ("קל").
Save the Measure and verify the document structure in Firestore.
Open a Patient Feedback link.
Switch the app language and verify that the dropdown options change correctly.