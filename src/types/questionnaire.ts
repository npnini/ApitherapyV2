export interface Questionnaire {
  id: string;
  domain: string;
  versionNumber: number;
  questions: Question[];
}

export interface Question {
  order: number;
  name: string;
  type: 'boolean' | 'string' | 'number';
  translations: Translation[];
}

export interface Translation {
  language: string;
  text: string;
}
