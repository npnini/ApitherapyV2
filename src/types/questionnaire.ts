export interface Questionnaire {
    id: string;
    domain: string;
    versionNumber: number;
    questions: Question[];
}

export interface Question {
    order: number;
    name: string;
    type: 'boolean' | 'string' | 'number' | 'text' | 'select';
    translations: Translation[];
    options?: QuestionOption[];
    required?: boolean;
}

export interface QuestionOption {
    value: string;
    translations: {[language: string]: string};
}

export interface Translation {
    language: string;
    text: string;
}
