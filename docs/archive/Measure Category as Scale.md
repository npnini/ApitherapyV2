Measure Category as Scale

The problem:  
When doing data analysis, the category type measures are a problem, because it is not possible to compute the effectiveness of a categorial measure, as the difference over a period of time. With scale measures, it is simple. This features comes to solve it, by assigning a numerical value to each category, thus enabling the user to assign a clear categorial value, and still order those values on a scale, so that each category will have numerical value.

The change requires as follows:

Measures document \- for a measure of type category, add a numerical value key for each category value.

Measured\_values document \- readings array structure \- for a measure with type=”Category” add a key with the numerical value of the category value from the measures document.

src\\components\\MeasureAdmin:  
All measure categories are locked from change (no add-change-delete) if there are already readings in the measured\_values collection with the measureId.

Below the list of categories and above the Description title, add a text literal saying “set the order of the categories from low to high”.

Allow grabbing and moving the categories to modify the order. This shall be available, provided the measure is not used yet in any measured\_values document.

When saving a measure that is not used yet (in any measured\_values document), assign (or re-assign) a numerical value to each category using hundreds (i.e. 100, 200, 300, etc).

src\\components\\PatientIntake\\SessionOpening.tsx:  
When storing a measured\_values document with the measure values entered in the  opening session page (pointed by treatments.preTreatmentMeasureReadingId) set into the measured\_values reading array, for measures of type category, also the numerical value of the category.

src\\components\\PatientIntake\\FeedbackStandaloneView.tsx:  
Same as defined for SessionOpening.

functions\\src\\[index.ts]:  
Same as defined for SessionOpening