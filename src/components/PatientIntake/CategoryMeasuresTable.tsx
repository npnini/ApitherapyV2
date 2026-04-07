import React, { useMemo } from 'react';
import { GroupedReading } from '../../services/measureService';
import { Measure } from '../../types/measure';
import { useTranslationContext, useT, T } from '../T';
import styles from './CategoryMeasuresTable.module.css';

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
                if (key !== 'date' && key !== 'label' && key !== 'displayDate' && key !== 'timestamp' && key !== 'notes') {
                    hasData.add(key);
                }
            });
        });
        return measures.filter(m => m.type === 'Category' && hasData.has(m.id));
    }, [measures, data]);

    const getLocalizedName = (measure: Measure) => {
        const { name } = measure;
        if (typeof name === 'string') return name;
        if (name && typeof name === 'object') {
            return name[currentLang] || name['en'] || Object.values(name)[0] || measure.id;
        }
        return measure.id;
    };

    const hasNotes = useMemo(() => data.some(r => r.notes && r.notes.length > 0), [data]);

    if (data.length === 0 || (categoryMeasures.length === 0 && !hasNotes)) {
        return (
            <div className={styles.emptyTableState}>
                {useT('No category measures data available')}
            </div>
        );
    }

    const getLocalizedValue = (measure: Measure, value: any) => {
        if (value === undefined || value === null || value === '-') return '-';
        if (measure.type !== 'Category' || !measure.categories) return value;

        const categoryMatch = measure.categories.find(cat =>
            Object.values(cat).some(v => String(v).toLowerCase() === String(value).toLowerCase())
        );

        if (categoryMatch) {
            return categoryMatch[currentLang] || categoryMatch['en'] || Object.values(categoryMatch)[0];
        }

        return value;
    };

    return (
        <div className={styles.tableWrapper}>
            <table className={styles.categoryTable}>
                <thead className={styles.tableHead}>
                    <tr>
                        <th className={styles.headerCell}><T>Measure Name</T></th>
                        {data.map(reading => (
                            <th key={reading.date} className={styles.headerCell}>{reading.label || reading.date}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {categoryMeasures.map(measure => (
                        <tr key={measure.id} className={styles.tableRow}>
                            <td className={styles.tableCell}>
                                {getLocalizedName(measure)}
                            </td>
                            {data.map(reading => (
                                <td key={reading.date} className={styles.tableCell}>
                                    {getLocalizedValue(measure, reading[measure.id])}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {hasNotes && (
                        <tr className={styles.notesRow}>
                            <td className={styles.notesLabelCell}>
                                <T>Notes / Feedback</T>
                            </td>
                            {data.map(reading => (
                                <td key={reading.date} className={styles.notesContentCell}>
                                    {reading.notes && reading.notes.length > 0 ? (
                                        <ul className={styles.notesList}>
                                            {reading.notes.map((note: string, i: number) => (
                                                <li key={i}>{note}</li>
                                            ))}
                                        </ul>
                                    ) : '-'}
                                </td>
                            ))}
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default CategoryMeasuresTable;
