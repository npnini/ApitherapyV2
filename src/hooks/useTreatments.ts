import { useState, useEffect } from 'react';
import { TreatmentSession } from '../types/treatmentSession';
import { getTreatmentsByPatientId } from '../services/storageService';

export const useTreatments = (patientId: string) => {
    const [treatments, setTreatments] = useState<TreatmentSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!patientId) {
            setTreatments([]);
            setLoading(false);
            return;
        }

        const fetchTreatments = async () => {
            try {
                setLoading(true);
                const fetchedTreatments = await getTreatmentsByPatientId(patientId);
                // The service function is mistyped, so we cast to the correct type.
                const treatmentSessions = fetchedTreatments as unknown as TreatmentSession[];
                // Sort treatments by date in descending order
                const sortedTreatments = treatmentSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                setTreatments(sortedTreatments);
                setError(null);
            } catch (err) {
                setError('Failed to fetch treatments');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchTreatments();
    }, [patientId]);

    return { treatments, loading, error };
};
