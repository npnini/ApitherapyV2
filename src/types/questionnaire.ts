export interface Condition {
    fieldName: 'gender' | 'age';
    operator: 'equal' | 'not_equal' | 'greater_than' | 'greater_equal' | 'smaller_than' | 'smaller_equal';
    value: string | number;
}

export interface QuestionGroup {
    id: string;
    translations: Translation[];
    logic: 'AND' | 'OR';
    conditions: Condition[];
}

export interface Questionnaire {
    id: string;
    domain: string;
    versionNumber: number;
    questions: Question[];
    groups?: QuestionGroup[];
}

export interface Question {
    order: number;
    name: string;
    type: 'boolean' | 'string' | 'number' | 'text' | 'select';
    translations: Translation[];
    options?: QuestionOption[];
    required?: boolean;
    groupId?: string;
}

export interface QuestionOption {
    value: string;
    translations: { [language: string]: string };
}

export interface Translation {
    language: string;
    text: string;
}
