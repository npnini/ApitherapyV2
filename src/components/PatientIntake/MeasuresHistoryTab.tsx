import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { T, useT, useTranslationContext } from '../T';
import styles from './PatientIntake.module.css';
import measureStyles from './MeasuresHistoryTab.module.css';
import { PatientData, MeasuredValueReading } from '../../types/patient';
import { Measure } from '../../types/measure';
import { getMeasuredValueReadings } from '../../firebase/patient';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { DateDensity, groupReadingsByDensity } from '../../services/measureService';
import ScaleMeasuresGraph from './ScaleMeasuresGraph';
import CategoryMeasuresTable from './CategoryMeasuresTable';
import { Loader } from 'lucide-react';

interface MeasuresHistoryTabProps {
    patientData: PatientData;
}

const MeasuresHistoryTab: React.FC<MeasuresHistoryTabProps> = ({ patientData }) => {
    const { language: currentLang, getTranslation } = useTranslationContext();
    const [readings, setReadings] = useState<MeasuredValueReading[]>([]);
    const [measures, setMeasures] = useState<Measure[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [density, setDensity] = useState<DateDensity>('week');

    const fetchData = useCallback(async () => {
        if (!patientData.id) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            // Fetch all measures for lookup
            const measuresSnapshot = await getDocs(collection(db, 'cfg_measures'));
            const fetchedMeasures = measuresSnapshot.docs.map(doc => ({
                ...(doc.data() as Omit<Measure, 'id'>),
                id: doc.id
            }));
            setMeasures(fetchedMeasures);

            // Fetch patient readings
            const fetchedReadings = await getMeasuredValueReadings(patientData.id);
            setReadings(fetchedReadings);
        } catch (error) {
            console.error('Error fetching measures history:', error);
        } finally {
            setIsLoading(false);
        }
    }, [patientData.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const validMeasureIds = useMemo(() => new Set(measures.map(m => m.id)), [measures]);

    const groupedData = useMemo(() =>
        groupReadingsByDensity(readings, density, validMeasureIds),
        [readings, density, validMeasureIds]);

    const tWeek = useT('The displayed value is at the end of the week');
    const tMonth = useT('The displayed value is at the end of the month');
    const tQuarter = useT('The displayed value is at the end of the quarter');
    const tYear = useT('The displayed value is at the end of the year');
    const tDay = useT('Day');
    const tWeekLabel = useT('Week');
    const tMonthLabel = useT('Month');
    const tQuarterLabel = useT('Quarter');
    const tYearLabel = useT('Year');

    const aggregationNote = useMemo(() => {
        if (density === 'day') return null;
        const noteMap: Record<string, string> = {
            week: tWeek,
            month: tMonth,
            quarter: tQuarter,
            year: tYear,
        };
        return noteMap[density] || null;
    }, [density, tWeek, tMonth, tQuarter, tYear]);

    if (isLoading) {
        return (
            <div className={styles.placeholderTab}>
                <div className={measureStyles.placeholderLoader}>
                    <Loader className={styles.loader} size={48} />
                    <p className={measureStyles.loaderText}><T>Loading measures history...</T></p>
                </div>
            </div>
        );
    }

    if (!patientData.id || readings.length === 0) {
        return (
            <div className={styles.placeholderTab}>
                <h2><T>Measures History</T></h2>
                <div className={measureStyles.emptyStateContainer}>
                    <T>No measures history found for this patient.</T>
                </div>
            </div>
        );
    }

    return (
        <div className={`${styles.measuresHistoryContainer} ${measureStyles.historyContainer}`}>
            <div className={measureStyles.tabHeader}>
                <h2 className={measureStyles.tabTitle}><T>Measures History</T></h2>

                <div className={measureStyles.timeScaleConfig}>
                    <label htmlFor="density-select" className={measureStyles.timeScaleLabel}>
                        <T>Time Scale</T>:
                    </label>
                    <select
                        id="density-select"
                        value={density}
                        onChange={(e) => setDensity(e.target.value as DateDensity)}
                        className={measureStyles.densitySelect}
                    >
                        <option value="day">{tDay}</option>
                        <option value="week">{tWeekLabel}</option>
                        <option value="month">{tMonthLabel}</option>
                        <option value="quarter">{tQuarterLabel}</option>
                        <option value="year">{tYearLabel}</option>
                    </select>
                </div>
            </div>

            <div className={measureStyles.sectionContainer}>
                <div className={measureStyles.sectionHeader}>
                    <h3 className={measureStyles.sectionTitle}>
                        <T>Scale Measures</T>
                    </h3>
                    {aggregationNote && <span className={measureStyles.aggregationNote}>{aggregationNote}</span>}
                </div>
                <div className={measureStyles.chartWrapper}>
                    <ScaleMeasuresGraph
                        data={groupedData}
                        measures={measures}
                        currentLang={currentLang}
                    />
                </div>
            </div>

            <div className={measureStyles.sectionContainer}>
                <div className={measureStyles.sectionHeader}>
                    <h3 className={measureStyles.sectionTitle}>
                        <T>Category Measures</T>
                    </h3>
                    {aggregationNote && <span className={measureStyles.aggregationNote}>{aggregationNote}</span>}
                </div>
                <div className={measureStyles.tableWrapper}>
                    <CategoryMeasuresTable
                        data={groupedData}
                        measures={measures}
                        currentLang={currentLang}
                    />
                </div>
            </div>
        </div>
    );
};

export default MeasuresHistoryTab;
