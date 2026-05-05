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
    directive?: { [key: string]: string } | string;
    isAdhoc?: boolean;
    status: 'active' | 'inactive';
    type: 'standard' | 'sensitivity' | 'ad-hoc';
    measureIds: string[];
    reference_count: number;
}
