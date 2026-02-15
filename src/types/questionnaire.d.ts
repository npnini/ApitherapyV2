
      export interface QuestionTranslation {
        language: string;
        text: string;
      }
      
      export interface Question {
        order: number;
        name: string;
        type: 'boolean' | 'string' | 'number';
        translations: QuestionTranslation[];
      }
      
      export interface Questionnaire {
        id: string; // Firestore document ID
        domain: string;
        versionNumber: number;
        questions: Question[];
        isInUse?: boolean;
      }
      