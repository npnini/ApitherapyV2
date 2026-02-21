export interface StingingPoint {
    id: string;
    name: string;
}

export interface Protocol {
    id: string;
    name: { [key: string]: string };
    description: { [key: string]: string };
    rationale: { [key: string]: string };
    points: any;
    stingingPoints?: any[];
    documentUrl?: { [key: string]: string } | string;
}
