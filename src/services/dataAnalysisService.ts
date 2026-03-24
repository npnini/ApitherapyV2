import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

const functions = getFunctions(app, 'me-west1');

export interface TreatmentEffectivenessParams {
    startDate: string;
    endDate: string;
    viewLevel: 'high-level' | 'caretaker' | 'patient' | 'gender' | 'age_group' | 'age_group_drilldown';
    caretakerId?: string;
    ageLow?: number;
    ageHigh?: number;
}

export const getTreatmentEffectiveness = async (params: TreatmentEffectivenessParams) => {
    const getEffFn = httpsCallable(functions, 'getTreatmentEffectiveness');
    try {
        const result = await getEffFn(params);
        return result.data as { data: any[] };
    } catch (error) {
        console.error('Error calling getTreatmentEffectiveness:', error);
        throw error;
    }
};
