export interface Treatment {
    id: string;
    point: string;
    quantity: number;
    status: 'pending' | 'done' | 'missed' | 'skipped';
}
