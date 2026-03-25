import React, { useState, useEffect } from 'react';
import { AppUser } from '../../types/user';
import { T, useT } from '../T';
import { getTreatmentEffectiveness, TreatmentEffectivenessParams } from '../../services/dataAnalysisService';
import { RotateCcw, ArrowLeft, BarChart2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import styles from './TreatmentEffectiveness.module.css';

interface Props {
    user: AppUser;
    onPatientClick?: (patientId: string) => void;
}

type DrillDownLevel = 'high-level' | 'caretaker' | 'patient' | 'gender' | 'age_group' | 'age_group_drilldown';

interface HistoryState {
    viewLevel: DrillDownLevel;
    caretakerId?: string;
    ageLow?: number;
    ageHigh?: number;
    problemNameEn?: string;
    measureNameEn?: string;
    gender?: string;
    patientId?: string;
    data: any[];
    title: string;
}

const TreatmentEffectiveness: React.FC<Props> = ({ user, onPatientClick }) => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const oneYearAgo = new Date(yesterday);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [startDate, setStartDate] = useState(oneYearAgo.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(yesterday.toISOString().split('T')[0]);

    const [history, setHistory] = useState<HistoryState[]>([]);
    const [nameCache, setNameCache] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const currentState = history.length > 0 ? history[history.length - 1] : null;

    useEffect(() => {
        if (!currentState || !currentState.data) return;

        const hydrateNames = async () => {
            const idsToFetch = new Set<string>();
            currentState.data.forEach((row: any) => {
                if (row.caretaker_id && !nameCache[row.caretaker_id]) {
                    idsToFetch.add(`users:${row.caretaker_id}`);
                }
                if (row.patient_id && !nameCache[row.patient_id]) {
                    idsToFetch.add(`patients:${row.patient_id}`);
                }
            });

            if (idsToFetch.size === 0) return;

            const updates: Record<string, string> = {};
            await Promise.all([...idsToFetch].map(async (entry) => {
                const [collectionName, id] = entry.split(':');
                try {
                    const docSnap = await getDoc(doc(db, collectionName, id));
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        updates[id] = d.fullName || d.displayName || id;
                    }
                } catch (err) {
                    console.warn(`Failed to hydrate ${collectionName}/${id}:`, err);
                }
            }));

            if (Object.keys(updates).length > 0) {
                setNameCache(prev => ({ ...prev, ...updates }));
            }
        };

        hydrateNames();
    }, [currentState?.data, nameCache]);

    const tNoEffect = useT('No effect');
    const tDegradation = useT('Degradation');
    const tImprovement = useT('Improvement');

    const isAdmin = user.role === 'admin' || user.role === 'superadmin';

    const fetchLevel = async (
        level: DrillDownLevel,
        params: Partial<TreatmentEffectivenessParams> = {},
        title: string
    ) => {
        setIsLoading(true);
        setError('');
        try {
            const isRtl = document.documentElement.dir === 'rtl';
            const res = await getTreatmentEffectiveness({
                startDate,
                endDate,
                viewLevel: level,
                isRtl,
                ...params
            });
            const newState: HistoryState = {
                viewLevel: level,
                data: res.data || [],
                title,
                ...params
            };
            setHistory(prev => [...prev, newState]);
        } catch (err: any) {
            console.error("Analysis Fetch Error:", err);
            // Show more detail if available
            const detail = err.details?.message || err.message || 'Failed to fetch data';
            setError(detail);
        } finally {
            setIsLoading(false);
        }
    };

    const handleHighLevel = () => {
        fetchLevel('high-level', {}, 'High Level');
    };

    const handleBack = () => {
        setHistory(prev => prev.slice(0, prev.length - 1));
    };



    const renderEffectiveness = (val: number) => {
        if (val === undefined || val === null) return null;
        let color = '#f59e0b'; // yellow
        let text = tNoEffect;
        if (val > 0) {
            color = '#ef4444'; // red
            text = tDegradation;
        } else if (val < 0) {
            color = '#10b981'; // green
            text = tImprovement;
        }
        return (
            <span style={{ backgroundColor: color, color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', display: 'inline-block' }}>
                {text} ({val.toFixed(2)})
            </span>
        );
    };

    const resolveName = (id: string | undefined): string => {
        if (!id) return '';
        return nameCache[id] || id;
    };

    const renderRowButtons = (row: any) => {
        if (!currentState) return null;
        const { viewLevel } = currentState;

        const rowParams = {
            problemNameEn: row.problem_name_en,
            measureNameEn: row.measure_name_en
        };

        if (viewLevel === 'high-level') {
            return null; // Moved to global header
        }

        if (viewLevel === 'caretaker') {
            return (
                <button
                    className={styles.actionButton}
                    onClick={() => fetchLevel('patient', { ...rowParams, caretakerId: row.caretaker_id }, `Patients of Caretaker (${row.caretaker_id})`)}
                >
                    <T>Patient</T>
                </button>
            );
        }

        if (viewLevel === 'gender') {
            return (
                <button
                    className={styles.actionButton}
                    onClick={() => fetchLevel('patient', { ...rowParams, gender: row.patient_gender }, `Patients of Gender (${row.patient_gender === 'male' ? 'Male' : 'Female'})`)}
                >
                    <T>Patient</T>
                </button>
            );
        }

        if (viewLevel === 'age_group') {
            const parts = row.age_group ? row.age_group.split('-') : [];
            let ageLow = 0, ageHigh = 9;
            if (parts.length === 2) {
                ageLow = parseInt(parts[0], 10);
                ageHigh = parseInt(parts[1], 10);
            }
            return (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className={styles.actionButton}
                        onClick={() => fetchLevel('age_group_drilldown', { ...rowParams, ageLow, ageHigh }, `Ages of Age Group (${row.age_group})`)}
                    >
                        <T>Age</T>
                    </button>
                    <button
                        className={styles.actionButton}
                        onClick={() => fetchLevel('patient', { ...rowParams, ageLow, ageHigh }, `Patients of Age Group (${row.age_group})`)}
                    >
                        <T>Patient</T>
                    </button>
                </div>
            );
        }

        if (viewLevel === 'age_group_drilldown') {
            return (
                <button
                    className={styles.actionButton}
                    onClick={() => fetchLevel('patient', { ...rowParams, ageLow: row.patient_age, ageHigh: row.patient_age }, `Patients of Age (${row.patient_age})`)}
                >
                    <T>Patient</T>
                </button>
            );
        }

        return null;
    };

    const renderTableHeaders = () => {
        if (!currentState) return null;
        const { viewLevel } = currentState;

        return (
            <tr>
                {viewLevel === 'caretaker' && <th className={styles.th}><T>Caretaker</T></th>}
                <th className={styles.th}><T>Problem Name</T></th>
                <th className={styles.th}><T>Measure Name</T></th>

                {viewLevel === 'patient' && <th className={styles.th}><T>Patient</T></th>}
                {viewLevel === 'gender' && <th className={styles.th}><T>Gender</T></th>}
                {viewLevel === 'age_group' && <th className={styles.th}><T>Age Group</T></th>}
                {viewLevel === 'age_group_drilldown' && <th className={styles.th}><T>Age</T></th>}

                <th className={styles.th}><T>Effectiveness</T></th>
                {viewLevel !== 'patient' && viewLevel !== 'high-level' && <th className={styles.th}><T>Actions</T></th>}
            </tr>
        );
    };

    const renderTableBody = () => {
        if (!currentState || !currentState.data) return null;
        const { viewLevel, data } = currentState;
        const isRtl = document.documentElement.dir === 'rtl';

        return data.map((row, idx) => {
            const probName = isRtl ? row.problem_name_he || row.problem_name_en : row.problem_name_en;
            const measureName = isRtl ? row.measure_name_he || row.measure_name_en : row.measure_name_en;

            const effValue = viewLevel === 'patient' ? row.effectiveness : row.avg_effectiveness;

            return (
                <tr key={idx}>
                    {viewLevel === 'caretaker' && <td className={styles.td}>{resolveName(row.caretaker_id)}</td>}
                    <td className={styles.td}>{probName}</td>
                    <td className={styles.td}>{measureName}</td>

                    {viewLevel === 'patient' && (
                        <td className={styles.td}>
                            <span
                                className={onPatientClick && row.patient_id ? styles.link : ''}
                                onClick={() => {
                                    if (row.patient_id) {
                                        console.log(`[TRACER] TreatmentEffectiveness: Clinic link for patient_id: "${row.patient_id}"`);
                                        const url = new URL(window.location.href);
                                        url.searchParams.set('patientId', String(row.patient_id));
                                        window.open(url.toString(), '_blank');
                                    }
                                }}
                            >
                                {resolveName(row.patient_id)}
                            </span>
                        </td>
                    )}
                    {viewLevel === 'gender' && <td className={styles.td}><T>{row.patient_gender || 'Unknown'}</T></td>}
                    {viewLevel === 'age_group' && <td className={styles.td}>{row.age_group}</td>}
                    {viewLevel === 'age_group_drilldown' && <td className={styles.td}>{row.patient_age}</td>}

                    <td className={styles.td}>{renderEffectiveness(effValue)}</td>
                    {viewLevel !== 'patient' && viewLevel !== 'high-level' && <td className={styles.td}>{renderRowButtons(row)}</td>}
                </tr>
            );
        });
    };

    return (
        <div className={styles.container}>
            <div className={styles.filterBar}>
                <div className={styles.inputsSection}>
                    <div className={styles.inputGroup}>
                        <label><T>Start Date</T></label>
                        <input
                            type="date"
                            className={styles.datePicker}
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label><T>End Date</T></label>
                        <input
                            type="date"
                            className={styles.datePicker}
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className={styles.actionsSection}>
                    <button
                        className={styles.refreshButton}
                        onClick={handleHighLevel}
                        disabled={isLoading}
                    >
                        <RotateCcw size={16} />
                        <T>{history.length === 0 ? 'View Analytics' : 'Reset to High Level'}</T>
                    </button>

                    {currentState?.viewLevel === 'high-level' && (
                        <div className={styles.globalDrilldown}>
                            <span className={styles.drilldownLabel}><T>Drill Down By:</T></span>
                            {isAdmin && (
                                <button className={styles.actionButton} onClick={() => fetchLevel('caretaker', {}, 'All Caretakers')}>
                                    <T>Caretaker</T>
                                </button>
                            )}
                            <button className={styles.actionButton} onClick={() => fetchLevel('gender', {}, 'By Gender')}>
                                <T>Gender</T>
                            </button>
                            <button className={styles.actionButton} onClick={() => fetchLevel('age_group', {}, 'By Age Group')}>
                                <T>Age Group</T>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className={styles.errorBox}>
                    <strong><T>Error:</T></strong> <T>{error}</T>
                </div>
            )}

            {history.length > 0 && (
                <div className={styles.historyBar}>
                    {history.length > 1 && (
                        <button className={styles.backButton} onClick={handleBack} disabled={isLoading}>
                            <ArrowLeft size={16} />
                            <T>Back</T>
                        </button>
                    )}
                    <h3 className={styles.breadcrumb}>
                        {history.map((h, i) => (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {i > 0 ? <span style={{ color: 'var(--color-text-secondary)' }}>&gt;</span> : ''}
                                <T>{h.title.replace(/\(([^)]+)\)/, (match, id) => `(${resolveName(id)})`)}</T>
                            </span>
                        ))}
                    </h3>
                    {isLoading && <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}><T>Loading...</T></span>}
                </div>
            )}

            <div className={styles.tableContainer}>
                {!currentState ? (
                    <div className={styles.placeholder}>
                        <BarChart2 size={48} className={styles.placeholderIcon} />
                        <p><T>Please select a date range and click "View Analytics" to start.</T></p>
                        <button
                            className={styles.refreshButton}
                            onClick={handleHighLevel}
                            disabled={isLoading}
                        >
                            <RotateCcw size={16} />
                            {isLoading ? <T>Loading...</T> : <T>View Analytics</T>}
                        </button>
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead className={styles.thead}>
                            {renderTableHeaders()}
                        </thead>
                        <tbody>
                            {!isLoading && (!currentState.data || currentState.data.length === 0) ? (
                                <tr>
                                    <td colSpan={10} className={styles.noData}>
                                        <T>No data found for the selected date range.</T>
                                    </td>
                                </tr>
                            ) : (
                                renderTableBody()
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default TreatmentEffectiveness;
