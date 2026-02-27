import React, { useMemo } from 'react';
import { GroupedReading } from '../../services/measureService';
import { Measure } from '../../types/measure';
import { useTranslationContext } from '../T';
import styles from './PatientIntake.module.css';

interface CategoryMeasuresTableProps {
    data: GroupedReading[];
    measures: Measure[];
    currentLang: string;
}

const CategoryMeasuresTable: React.FC<CategoryMeasuresTableProps> = ({ data, measures, currentLang }) => {
    const { getTranslation } = useTranslationContext();

    const categoryMeasures = useMemo(() => {
        const hasData = new Set<string>();
        data.forEach(reading => {
            Object.keys(reading).forEach(key => {
                if (key !== 'date' && key !== 'label' && key !== 'displayDate' && key !== 'timestamp') {
                    hasData.add(key);
                }
            });
        });
        return measures.filter(m => m.type === 'Category' && hasData.has(m.id));
    }, [measures, data]);

    if (data.length === 0 || categoryMeasures.length === 0) {
        return (
            <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                {getTranslation('No category measures data available')}
            </div>
        );
    }

    const getLocalizedValue = (measure: Measure, value: any) => {
        if (value === undefined || value === null || value === '-') return '-';
        if (measure.type !== 'Category' || !measure.categories) return value;

        // Search for the value in all language keys of all categories
        const categoryMatch = measure.categories.find(cat =>
            Object.values(cat).some(v => String(v).toLowerCase() === String(value).toLowerCase())
        );

        if (categoryMatch) {
            return categoryMatch[currentLang] || categoryMatch['en'] || Object.values(categoryMatch)[0];
        }

        return value;
    };

    return (
        <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                <thead style={{ background: '#f8fafc' }}>
                    <tr>
                        <th style={headerCellStyle}><T>Measure Name</T></th>
                        {data.map(reading => (
                            <th key={reading.date} style={headerCellStyle}>{reading.label || reading.date}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {categoryMeasures.map(measure => (
                        <tr key={measure.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={cellStyle}>
                                {measure.name[currentLang] || measure.name['en'] || measure.id}
                            </td>
                            {data.map(reading => (
                                <td key={reading.date} style={cellStyle}>
                                    {getLocalizedValue(measure, reading[measure.id])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const headerCellStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap'
};

const cellStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    color: '#1e293b',
    whiteSpace: 'nowrap'
};

const T: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { getTranslation } = useTranslationContext();
    return <>{getTranslation(children as string)}</>;
};

export default CategoryMeasuresTable;
