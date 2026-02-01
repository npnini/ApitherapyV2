export interface StingingPoint {
    id: string;
    name: string;
}

export interface Protocol {
    id: string;
    name: string;
    description: string;
    stingingPoints: StingingPoint[];
}
