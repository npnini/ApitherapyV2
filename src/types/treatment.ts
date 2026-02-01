export interface Treatment {
    id: string;
    point: string;
    status: 'pending' | 'done' | 'missed' | 'skipped';
}
