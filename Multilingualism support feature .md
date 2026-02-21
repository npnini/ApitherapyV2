  
Multi linguality feature  
Background:  
The system is built to support multiple languages. A user is a caretaker or an admin. A user has in his profile a preferred language that he can set from the languages supported by the app. The languages supported by the app are configured in the app application setting (app-config collection). The use cases supported by the system from the sidebar menu are available either only to admin \- those under the title Configuration in the menu, or also to a caretaker user.  
The entities that can be configured by admin are: problems, protocols, points, measures, questionnaires. They hold medical terms.  
The entities that are used by caretakers are patients and treatments. When a patient is onboarded to the system by a caretaker, personal details are collected and stored, as well as medical records. A questionnaire is filled up during the intake and stored in the medical records collection. Treatments to patients are done using the system, letting the caretaker to select the problem to treat, the protocol to use, the points that are defined for the protocol. A treatment that was given is stored in the medical records. A feedback form is sent to the patient a day after to set effectiveness of treatment by various measures.

Objective:  
Prepare the system for true multilingual support

Phase 1:  
Modify processes to let the admin set data per language supported by the system.   
Supporting that means that the data such as the name of a measure, its description and maybe more data items \- have to be set in the languages the system supports.  
The Questionnaire admin is partially already done for that.  
The concept is that when an admin selects to enter an entity (measures, points, protocols, etc.) for editing or viewing, the initial view shall display the data in the language set in the admin profile.  
The admin will select an entity instance (a specific point, a specific problem, etc.) to view the edit form. The captions of fields will be translated by a translation service according to the language set in the admin profile. the admin shall be able to set the data fields (name, description, etc.) in the languages the system supports. The result is that the entire medical data that is displayed and used by the caretaker is data driven and not hard coded anywhere.

This phase has to be implemented for problems, points, measures, protocols, questionnaires.

Phase 2:  
Currently , the pages support English and Hebrew using i18n service. This method requires managing json translation files. It is a headache. I want to replace it by using the google translate api. The concept is to store the translated pages in the firestore database, that will be used as a cache. For this phase I have prepared a script to convert the current pages automatically to the new approach.  
We will start with phase 1\.