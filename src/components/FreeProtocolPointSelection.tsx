import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { StingPoint } from '../types/apipuncture';
import ShuttleSelector, { ShuttleItem } from './shared/ShuttleSelector';
import styles from './FreeProtocolPointSelection.module.css';
import { T, useT, useTranslationContext } from './T';
import { ChevronLeft, Loader } from 'lucide-react';

interface FreeProtocolPointSelectionProps {
    onBack: () => void;
    onPointsSelected: (points: StingPoint[]) => void;
}

const FreeProtocolPointSelection: React.FC<FreeProtocolPointSelectionProps> = ({ onBack, onPointsSelected }) => {
    const { language, direction } = useTranslationContext();
    const [allPoints, setAllPoints] = useState<StingPoint[]>([]);
    const [selectedItems, setSelectedItems] = useState<ShuttleItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const tPickPoints = useT('Select Points for Free Protocol');
    const tNextStep = useT('Next Step');
    const tLoading = useT('Loading points...');
    const tBack = useT('Back to Protocol Selection');

    useEffect(() => {
        const fetchPoints = async () => {
            setIsLoading(true);
            try {
                const querySnapshot = await getDocs(collection(db, 'cfg_acupuncture_points'));
                const points: StingPoint[] = querySnapshot.docs.map(doc => ({
                    ...doc.data(),
                    id: doc.id
                } as StingPoint));

                // Sort by code for better UX
                points.sort((a, b) => a.code.localeCompare(b.code));
                setAllPoints(points);
            } catch (error) {
                console.error('Error fetching points:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPoints();
    }, []);

    const shuttleAvailableItems: ShuttleItem[] = useMemo(() => {
        return allPoints.map(p => {
            const code = p.code || '??';
            const labelStr = typeof p.label === 'object'
                ? (p.label[language] || p.label.en || '')
                : (p.label || '');

            return {
                id: p.id,
                name: `${code} - ${labelStr}`
            };
        });
    }, [allPoints, language]);

    const handleNext = () => {
        const selectedIds = new Set(selectedItems.map(item => item.id));
        const finalSelectedPoints = allPoints.filter(p => selectedIds.has(p.id));
        onPointsSelected(finalSelectedPoints);
    };

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader className={styles.spinner} size={32} />
                <p>{tLoading}</p>
            </div>
        );
    }

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.header}>
                <button className={styles.backButton} onClick={onBack}>
                    <ChevronLeft size={20} />
                    {tBack}
                </button>
            </div>

            <div className={styles.content}>
                <h2 className={styles.title}>{tPickPoints}</h2>
                <div className={styles.selectorWrapper}>
                    <ShuttleSelector
                        availableItems={shuttleAvailableItems}
                        selectedItems={selectedItems}
                        onSelectionChange={setSelectedItems}
                        availableTitle="Available Points"
                        selectedTitle="Selected Points"
                    />
                </div>

                <div className={styles.footer}>
                    <button
                        className={styles.nextButton}
                        onClick={handleNext}
                        disabled={selectedItems.length === 0}
                    >
                        {tNextStep}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FreeProtocolPointSelection;
