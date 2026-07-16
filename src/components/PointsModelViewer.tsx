import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { StingPoint } from '../types/apipuncture';
import { Pause, Play, MapPin } from 'lucide-react';
import { T, useTranslationContext } from './T';
import BodyScene from './BodyScene';
import styles from './PointsModelViewer.module.css';

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        return value[lang] || value.en || '';
    }
    return '';
};

interface PointsModelViewerProps {
    points: StingPoint[];
}

const PointsModelViewer: React.FC<PointsModelViewerProps> = ({ points }) => {
    const { language } = useTranslationContext();
    const [isRolling, setIsRolling] = useState(true);
    const [selectedModel, setSelectedModel] = useState<'xbot' | 'corpo'>('xbot');
    const [highlightedPointIds, setHighlightedPointIds] = useState<Set<string>>(new Set());

    const togglePoint = (id: string) => {
        setHighlightedPointIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <div className={styles.viewportContainer}>
            <div className={styles.pointsListPanel}>
                <h4 className={styles.pointsListTitle}>
                    <MapPin size={14} />
                    <T>Sting Points</T> ({points.length})
                </h4>
                {points.length > 0 ? (
                    <ul className={styles.pointsList}>
                        {points.map(point => (
                            <li
                                key={point.id}
                                className={`${styles.pointItem} ${highlightedPointIds.has(point.id) ? styles.pointItemActive : ''}`}
                                onClick={() => togglePoint(point.id)}
                            >
                                <span className={styles.pointCode}>{point.code}</span>
                                <span className={styles.pointLabel}>{getMLValue(point.label, language)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className={styles.emptyText}><T>No points to display</T></p>
                )}
            </div>

            <div className={styles.canvasArea}>
                <div className={styles.controlBar}>
                    <button
                        className={styles.controlButton}
                        onClick={() => setIsRolling(r => !r)}
                    >
                        {isRolling ? <Pause size={16} /> : <Play size={16} />}
                        <T>{isRolling ? 'Pause rotation' : 'Resume rotation'}</T>
                    </button>
                    <div className={styles.modelToggle}>
                        <button
                            className={`${styles.modelToggleButton} ${selectedModel === 'xbot' ? styles.modelToggleActive : ''}`}
                            onClick={() => setSelectedModel('xbot')}
                        >
                            <T>Xbot</T>
                        </button>
                        <button
                            className={`${styles.modelToggleButton} ${selectedModel === 'corpo' ? styles.modelToggleActive : ''}`}
                            onClick={() => setSelectedModel('corpo')}
                        >
                            <T>Corpo</T>
                        </button>
                    </div>
                </div>
                <Canvas className={styles.canvas}>
                    <BodyScene
                        protocol={null}
                        points={points}
                        onPointSelect={(point) => togglePoint(point.id)}
                        activePointId={null}
                        highlightedPointIds={highlightedPointIds}
                        isRolling={isRolling}
                        selectedModel={selectedModel}
                    />
                </Canvas>
            </div>
        </div>
    );
};

export default PointsModelViewer;
