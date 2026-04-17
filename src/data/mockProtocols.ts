import { Protocol } from '../types/protocol';

export const PROTOCOLS: Protocol[] = [
    {
        id: 'p1',
        name: { en: 'Arthritis Relief Protocol', he: 'הקלה בדלקת מפרקים' },
        description: { en: 'Focuses on peripheral joints and local inflammation reduction.', he: 'התמקדות במפרקים והפחתת דלקת מקומית.' },
        rationale: { en: 'Anti-inflammatory points.', he: 'נקודות אנטי-דלקתיות.' },
        points: [],
        status: 'active',
        reference_count: 0
    },
    {
        id: 'p2',
        name: { en: 'Immune Modulation Protocol', he: 'ויסות מערכת החיסון' },
        description: { en: 'Systemic support for autoimmune conditions or chronic fatigue.', he: 'תמיכה מערכתית למצבים אוטואימוניים.' },
        rationale: { en: 'Immune boosting.', he: 'חיזוק חיסוני.' },
        points: [],
        status: 'active',
        reference_count: 0
    },
    {
        id: 'p3',
        name: { en: 'Chronic Back Pain Protocol', he: 'טיפול בכאבי גב כרוניים' },
        description: { en: 'Focuses on spinal alignment points and lumbar relief.', he: 'התמקדות בעמוד השדרה והקלה לומברית.' },
        rationale: { en: 'Back pain relief.', he: 'הקלה בכאבי גב.' },
        points: [],
        status: 'active',
        reference_count: 0
    }
];
