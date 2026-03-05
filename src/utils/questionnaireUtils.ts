import { QuestionGroup, Condition } from '../types/questionnaire';
import { PatientData } from '../types/patient';

export const calculateAge = (birthDate: string): number => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
};

export const evaluateCondition = (condition: Condition, patientData: PatientData): boolean => {
    let patientValue: any;

    if (condition.fieldName === 'age') {
        patientValue = calculateAge(patientData.birthDate);
    } else {
        patientValue = patientData[condition.fieldName as keyof PatientData];
    }

    const { operator, value } = condition;

    switch (operator) {
        case 'equal': return patientValue === value;
        case 'not_equal': return patientValue !== value;
        case 'greater_than': return (patientValue as number) > (value as number);
        case 'greater_equal': return (patientValue as number) >= (value as number);
        case 'smaller_than': return (patientValue as number) < (value as number);
        case 'smaller_equal': return (patientValue as number) <= (value as number);
        default: return false;
    }
};

export const evaluateGroupVisibility = (group: QuestionGroup, patientData: PatientData): boolean => {
    if (!group.conditions || group.conditions.length === 0) return true;

    if (group.logic === 'AND') {
        return group.conditions.every(c => evaluateCondition(c, patientData));
    } else {
        return group.conditions.some(c => evaluateCondition(c, patientData));
    }
};
