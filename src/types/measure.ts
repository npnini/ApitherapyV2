
export type ImprovementDirection = 'UP' | 'DOWN';

export interface Measure {
    id: string;
    name: { [key: string]: string };
    description: { [key: string]: string };
    min: number;
    max: number;
    improvementDirection: ImprovementDirection;
    documentUrl?: string | { [key: string]: string };
    status: 'active' | 'inactive';
    reference_count: number;
}
