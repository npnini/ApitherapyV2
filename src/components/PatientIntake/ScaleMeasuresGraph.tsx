import React, { useMemo, useState, useEffect } from 'react';
import styles from './ScaleMeasuresGraph.module.css';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { GroupedReading, getMeasureColor } from '../../services/measureService';
import { Measure } from '../../types/measure';
import { useTranslationContext, useT } from '../T';

interface ScaleMeasuresGraphProps {
    data: GroupedReading[];
    measures: Measure[];
    currentLang: string;
}

const ScaleMeasuresGraph: React.FC<ScaleMeasuresGraphProps> = ({ data, measures, currentLang }) => {
    const { getTranslation } = useTranslationContext();
    const [activeMeasureId, setActiveMeasureId] = useState<string | null>(null);
    const [hasSetDefault, setHasSetDefault] = useState(false);

    const scaleMeasures = useMemo(() => {
        const hasData = new Set<string>();
        data.forEach(reading => {
            Object.keys(reading).forEach(key => {
                if (key !== 'date' && key !== 'label' && key !== 'displayDate' && key !== 'timestamp' && key !== 'notes') {
                    hasData.add(key);
                }
            });
        });
        return measures.filter(m => hasData.has(m.id));
    }, [measures, data]);

    const getLocalizedName = (measure: Measure) => {
        const { name } = measure;
        if (typeof name === 'string') return name;
        if (name && typeof name === 'object') {
            return name[currentLang] || name['en'] || Object.values(name)[0] || measure.id;
        }
        return measure.id;
    };

    const maxValue = useMemo(() => {
        let max = 0;
        data.forEach(reading => {
            scaleMeasures.forEach(m => {
                const val = reading[m.id];
                if (typeof val === 'number' && val > max) max = val;
            });
        });
        return Math.ceil(max * 1.1); // Add 10% headroom
    }, [data, scaleMeasures]);

    useEffect(() => {
        if (hasSetDefault || data.length === 0 || scaleMeasures.length === 0) return;

        let bestMeasureId = scaleMeasures[0].id;
        let foundPriority1 = false;
        let priority2MeasureId: string | null = null;
        
        for (const measure of scaleMeasures) {
            const mId = measure.id;
            
            let totalPoints = 0;
            let nonZeroPoints = 0;

            for (const reading of data) {
                const val = reading[mId];
                if (typeof val === 'number') {
                    totalPoints++;
                    if (val !== 0) {
                        nonZeroPoints++;
                    }
                }
            }

            // Priority 1: At least one non-zero value, and data exists for more than one point
            if (totalPoints > 1 && nonZeroPoints >= 1) {
                bestMeasureId = mId;
                foundPriority1 = true;
                break;
            }

            // Priority 2: At least one non-zero value (but only a single point in the range)
            if (nonZeroPoints >= 1 && !priority2MeasureId) {
                priority2MeasureId = mId;
            }
        }

        // Fallback to priority 2 if priority 1 wasn't found
        if (!foundPriority1 && priority2MeasureId) {
            bestMeasureId = priority2MeasureId;
        }

        setActiveMeasureId(bestMeasureId);
        setHasSetDefault(true);
    }, [data, scaleMeasures, hasSetDefault]);

    const handleMeasureClick = (measureId: string) => {
        if (activeMeasureId === measureId) {
            setActiveMeasureId(null); // Show all
        } else {
            setActiveMeasureId(measureId); // Isolate
        }
    };

    if (data.length === 0 || scaleMeasures.length === 0) {
        return (
            <div className={styles.emptyStateContainer}>
                {useT('No measures data available')}
            </div>
        );
    }

    return (
        <div className={styles.chartContainer}>
            <div className={styles.measureButtonsContainer}>
                {scaleMeasures.map((measure, index) => {
                    const isActive = activeMeasureId === null || activeMeasureId === measure.id;
                    const color = getMeasureColor(index);
                    return (
                        <button
                            key={measure.id}
                            className={`${styles.measureButton} ${isActive ? styles.active : styles.inactive}`}
                            style={{ '--measure-color': color } as React.CSSProperties}
                            onClick={() => handleMeasureClick(measure.id)}
                            title={isActive && activeMeasureId !== null ? "Click to show all measures" : "Click to isolate this measure"}
                        >
                            <span className={styles.colorDot} style={{ backgroundColor: color }}></span>
                            {getLocalizedName(measure)}
                        </button>
                    )
                })}
            </div>
            <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                            dataKey="label"
                            stroke="#64748b"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            domain={[0, maxValue]}
                            stroke="#64748b"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{
                                borderRadius: '0.5rem',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}
                            formatter={(value: any, name: string | undefined, props: any) => {
                                const measure = scaleMeasures.find(m => m.id === props.dataKey);
                                return [value, measure ? getLocalizedName(measure) : (name || '')];
                            }}
                        />
                        {scaleMeasures.map((measure, index) => {
                            const isLineActive = activeMeasureId === null || activeMeasureId === measure.id;
                            const isHidden = activeMeasureId !== null && activeMeasureId !== measure.id;
                            
                            return (
                                <Line
                                    key={measure.id}
                                    type="monotone"
                                    dataKey={measure.id}
                                    name={getLocalizedName(measure)}
                                    stroke={getMeasureColor(index)}
                                    strokeWidth={isLineActive ? 3 : 1}
                                    dot={isLineActive ? { r: 4, strokeWidth: 2, fill: '#fff' } : false}
                                    activeDot={isLineActive ? { r: 6 } : false}
                                    connectNulls={true}
                                    hide={isHidden}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default ScaleMeasuresGraph;
