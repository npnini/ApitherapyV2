
export type MeasureType = 'Category' | 'Scale';

export interface Measure {
    id: string;
    name: { [key: string]: string };
    description: { [key: string]: string };
    type: MeasureType;
    categories?: Array<{ [key: string]: string }>;
    scale?: {
        min?: number;
        max?: number;
    };
    documentUrl?: string | { [key: string]: string };
}
