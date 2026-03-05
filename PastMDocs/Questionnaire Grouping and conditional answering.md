Questionnaire Grouping and conditional answering

\* Reasoning:  
The actual requirement for which this mechanism is set is \- there are a group of questions regarding gynaecological questions. Those have to be shown only to females under 60 years. The mechanism is set to be data driven instead of had coding

\* Functional requirement:  
Allow creating Question Groups so that it will be possible to set questions that belong to the group.  
Allow defining conditions when to display the group questions when the questionnaire is displayed in the PatientIntake process.

\* Proposed UX behavior:  
The QuetionnaireAdmin edit page has to be refactored to 2 pages.   
Page one \- Groups definitions \- for defining groups and conditions.  
Page 2 \- Questions definition \- for defining questions and assigning questions to groups.  
\* Page 1 \- Group definition page:   
It shall be possible to create, modify, delete or view multiple groups for each questionnaire  
For each group it shall be possible to set a group name.  
For each group it shall be possible to define whether the condition between the conditions is AND/OR  
For each group it shall be possible to define the conditions in a tabular format that contains the following columns:

* Field name \- select key name from patient collection  
* Condition \- display selection of condition \- equal, not equal, greater than, greater equal than, smaller then, smaller equal than  
* Value \- set a value

There shall be a Next button. The Next button will display Page 2 \- Questions definition

\* Page 2 \- questions definition  
Thiis is the current Questionnaire page. A column should be added as a 2nd column, titled “Group”, letting selection from the defined Question Groups or leaving empty.

\* src\\components\\PatientIntake\\QuestionnaireStep.tsx  
The component has to be modified to decide according to grouping whether or not to display a set of questions.

