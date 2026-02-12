
export type MeasureType = 'Category' | 'Scale';

export interface Measure {
    id: string;
    name: string;
    description: string;
    type: MeasureType;
    categories?: string[];
    scale?: {
        min?: number;
        max?: number;
    };
    documentUrl?: string;
}
