Apitherapy \- treatment effectiveness data analysis \- V2

Background:  
Each patient can be related to several problems.   
A problem can be in an active or inactive status  
In a treatment session, the caretaker can choose to treat in 1 of 2 ways:

* Choose the protocol of an active problem  
* Choose the “Free Selection” protocol

After selecting a protocol, the caretaker is required to enter values for the measures that serve to measure the effectiveness of the treatment. Entering the values before the treated protocol is marked as “pre” measures.  
Following each treatment, feedback from the patient can be updated. Either by the patient or by the caretaker. The feedback, if collected, contains text description, and measure values for the protocols treated in the treatment session. This measure collection is called “post”.

 Essentially, for each treatment, the collected information is as follows:

* Pre-treatment \- measure values for protocols before actually treating them  
* Post treatment \- measure values for the protocols that were treated in the treatment.

Each measure has a direction definition \- up or down \- that determines the improvement direction. A range of 1 to 10 can go up for improvement (sleeping hours) or down(pain level).

The objective is to create a flat joined view that will be used for data analysis. The view columns should be:

* Treatment timestamp  
* Caretaker id  
* Patient id  
* Patient gender \- male o female  
* Patient birthdate \- for creating age group dimension  
* Problem id  
* Measure id  
* Pre treatment Measure value  
* Post treatment measure value  
* Measure improvement direction \- up or down  
* Effectiveness \- computed based on pre-post measure values and improvement direction, as improvement, degradation, neutral

This view allows creating data analysis pivots dimensioned by caretaker, gender, age, problem, to show the effectiveness of a measure over selected period of date-time

Verify if this structure agrees ith the current treatment effectiveness service that already exists. Point out what are the differences that arise. Differences arise because measures definition was moved from problems to protocols.