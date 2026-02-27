import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { GroupedReading, getMeasureColor } from '../../services/measureService';
import { Measure } from '../../types/measure';
import { useTranslationContext } from '../T';

interface ScaleMeasuresGraphProps {
    data: GroupedReading[];
    measures: Measure[];
    currentLang: string;
}

const ScaleMeasuresGraph: React.FC<ScaleMeasuresGraphProps> = ({ data, measures, currentLang }) => {
    const { getTranslation } = useTranslationContext();

    const scaleMeasures = useMemo(() => {
        const hasData = new Set<string>();
        data.forEach(reading => {
            Object.keys(reading).forEach(key => {
                if (key !== 'date' && key !== 'label' && key !== 'displayDate' && key !== 'timestamp') {
                    hasData.add(key);
                }
            });
        });
        return measures.filter(m => m.type === 'Scale' && hasData.has(m.id));
    }, [measures, data]);

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

    if (data.length === 0 || scaleMeasures.length === 0) {
        return (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                {getTranslation('No scale measures data available')}
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '400px', marginTop: '1rem' }}>
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
                    />
                    <Legend verticalAlign="top" height={36} />
                    {scaleMeasures.map((measure, index) => (
                        <Line
                            key={measure.id}
                            type="monotone"
                            dataKey={measure.id}
                            name={measure.name[currentLang] || measure.name['en'] || measure.id}
                            stroke={getMeasureColor(index)}
                            strokeWidth={3}
                            dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ScaleMeasuresGraph;
