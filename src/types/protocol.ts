export interface StingingPoint {
    id: string;
    name: string;
}

export interface Protocol {
    points: any;
    id: string;
    name: string;
    description: string;
    rationale: string; 
    stingingPoints?: StingingPoint[];
}
