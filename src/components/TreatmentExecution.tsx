import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { T, useT, useTranslationContext } from './T';
import { Protocol } from '../types/protocol';
import { VitalSigns } from '../types/treatmentSession';
import { StingPoint } from '../types/apipuncture';
import { getCachedPoints, setCachedPoints } from '../utils/pointsCache';
import { findNearestPoints } from '../utils/findNearestPoints';
import { StungPointCounts } from '../utils/pointSide';
import { PointGroup, PointGroupLaterality } from '../types/pointGroup';
import BodyScene from './BodyScene';
import VitalsInputGroup from './VitalsInputGroup';
import { AlertTriangle, CheckCircle, Trash2, Loader, MousePointerClick, List, ChevronLeft, ChevronRight, FileText, PlusCircle, XSquare, Image, BookOpen, X, Maximize, RefreshCw, Plus, ChevronUp, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import styles from './TreatmentExecution.module.css';
import { useStorageUrl } from "../hooks/useStorageUrl";
import { useMediaQuery } from '../hooks/useMediaQuery';
import { resolveStoragePath, getFieldContent, getPointLabel, getGDriveFallbackUrls } from '../utils/storageUtils';

interface HydratedProtocol extends Omit<Protocol, 'points'> {
    points: StingPoint[];
}

// Local interface for execution data
export interface ExecutionData {
    protocolId: string;
    problemId: string;
    stungPointIds: string[];
}

interface TreatmentExecutionProps {
    protocol?: Protocol;
    displayTitle?: string;
    isSensitivityTest: boolean;
    accumulatedStungPointIds: string[];
    onRoundComplete: (stungPointIds: string[], stungPointCounts: Record<string, StungPointCounts>) => void;
    onNext: (stungPointIds: string[], stungPointCounts: Record<string, StungPointCounts>) => void;
    onBack: () => void;
    onExit?: () => void;
    customPoints?: StingPoint[];
    canGoToAnother: boolean;
}

// Removed legacy transformGDriveLink and getDocumentUrl helpers as they are now handled by resolveStoragePath and useStorageUrl

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({
    protocol,
    displayTitle,
    isSensitivityTest,
    accumulatedStungPointIds,
    onRoundComplete,
    onNext,
    onBack,
    customPoints,
    canGoToAnother,
}) => {
    const { language, direction, getTranslation } = useTranslationContext();
    const { url: protocolDocUrl } = useStorageUrl(protocol?.documentUrl, language, 'doc');
    const BackIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;

    const tFailedToLoadModel = useT('Failed to load 3D model data.');
    const tZoomIn = useT('Zoom in');
    const tZoomOut = useT('Zoom out');
    const tNotesPlaceholder = useT('Add any final observations or notes here...');
    const tAnotherProtocol = useT('Another Protocol');
    const tEndTreatment = useT('End Treatment');
    const tNextStep = useT('Finish Treatment');
    const tSensitivityBanner = useT('This session uses the sensitivity test protocol.');
    const tNoPointsStung = useT('No points have been marked as stung yet.');
    const tStungPoints = useT('Stung Points');
    const tFinalNotes = useT('Final Notes');
    const tSensDirectiveFallback = useT('Wait 10 minutes. If there is an allergic reaction, press Finish Treatment. If there is no allergic reaction, press Another Protocol');
    const tStdDirectiveFallback = useT('Wait 15 minutes before removing the stingers, then measure the final vitals');
    const tSensitivityLevel = useT('Sensitivity Level');
    const tAllLevels = useT('All');
    const tLowLevel = useT('Low');
    const tMediumLevel = useT('Medium');
    const tHighLevel = useT('High');
    const tNoAdditionalDetails = useT('No additional details available in this language.');
    const tMissingCountsError = useT('Enter a sting count before continuing for:');

    const [hydratedProtocol, setHydratedProtocol] = useState<HydratedProtocol | null>(null);
    const [isHydrating, setIsHydrating] = useState(true);
    const [hydrationError, setHydrationError] = useState<string | null>(null);
    const [resetTrigger, setResetTrigger] = useState(0);
    const [isMaximized, setIsMaximized] = useState(false);

    const [stungPoints, setStungPoints] = useState<StingPoint[]>([]);
    const [stungPointCounts, setStungPointCounts] = useState<Record<string, StungPointCounts>>({});
    const [pointGroups, setPointGroups] = useState<PointGroup[]>([]);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [activePointId, setActivePointId] = useState<string | null>(null);
    // A touch screen: the model does not rotate by itself (a moving target is hard to tap) and zooms with the
    // camera only (pinch or the + / - buttons), without growing the page.
    const isCoarsePointer = useMediaQuery('(pointer: coarse)');
    const [isRolling, setIsRolling] = useState(() => !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));
    const [zoomRequest, setZoomRequest] = useState<{ dir: 1 | -1; id: number } | undefined>(undefined);
    const requestZoom = (dir: 1 | -1) => setZoomRequest(prev => ({ dir, id: (prev?.id ?? 0) + 1 }));
    const [selectedSensitivity, setSelectedSensitivity] = useState<'all' | 'Low' | 'Medium' | 'High'>('all');
    const [pointDetailToShow, setPointDetailToShow] = useState<{ point: StingPoint; type: 'doc' | 'image' | 'text' } | null>(null);
    // Hydrated previously-stung points from prior protocols in this treatment
    const [resolvedPrevPoints, setResolvedPrevPoints] = useState<StingPoint[]>([]);

    const [appConfig, setAppConfig] = useState<any>(null);

    // The same on every device (mouse or finger): a click or tap on a list row only highlights the point
    // on the model; the "+" button records it. A point that is not paired starts at a sting count of 1.
    const tMarkAsStung = useT('Mark as stung');
    const tDecrease = useT('Decrease');
    const tIncrease = useT('Increase');

    type ProxTapMode = 'idle' | 'loading' | 'results' | 'empty-radius';
    const [proxTapMode, setProxTapMode]         = React.useState<ProxTapMode>('idle');
    const [tapPosition, setTapPosition]         = React.useState<{ x: number; y: number; z: number } | null>(null);
    const [candidatePoints, setCandidatePoints] = React.useState<StingPoint[]>([]);
    const [canvasScale, setCanvasScale] = useState(1);
    const scrollWrapperRef = useRef<HTMLDivElement>(null);

    // Keep the model centered in the viewport when zooming in
    useEffect(() => {
        const wrapper = scrollWrapperRef.current;
        if (!wrapper || canvasScale <= 1) return;
        
        const timer = setTimeout(() => {
            const { scrollWidth, scrollHeight, clientWidth, clientHeight } = wrapper;
            // Center the scrollbars
            wrapper.scrollLeft = (scrollWidth - clientWidth) / 2;
            wrapper.scrollTop = (scrollHeight - clientHeight) / 2;
        }, 50); // Slight delay to wait for DOM resize
        return () => clearTimeout(timer);
    }, [canvasScale]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const configDoc = await getDoc(doc(db, 'cfg_app_config', 'main'));
                if (configDoc.exists()) {
                    setAppConfig(configDoc.data());
                }
            } catch (err) {
                console.error('Error fetching app config:', err);
            }
        };
        fetchConfig();
    }, []);

    useEffect(() => {
        const fetchPointGroups = async () => {
            try {
                const snap = await getDocs(collection(db, 'cfg_point_groups'));
                setPointGroups(snap.docs.map(d => ({ ...d.data(), id: d.id } as PointGroup)));
            } catch (err) {
                console.error('Error fetching point groups:', err);
            }
        };
        fetchPointGroups();
    }, []);

    const getLaterality = useCallback((p: StingPoint): PointGroupLaterality | null => {
        const group = pointGroups.find(g => g.id === p.Point_Grouping);
        return group?.laterality ?? null;
    }, [pointGroups]);

    // Reset current-protocol stung points when protocol changes, and hydrate accumulated IDs
    useEffect(() => {
        setStungPoints([]);
        setStungPointCounts({});
        setActivePointId(null);
        setValidationError(null);

        if (!accumulatedStungPointIds || accumulatedStungPointIds.length === 0) {
            setResolvedPrevPoints([]);
            return;
        }
        // Fetch previously stung points from Firestore to show as read-only list
        const fetchPrev = async () => {
            try {
                const docs = await Promise.all(
                    accumulatedStungPointIds.map(id => getDoc(doc(db, 'cfg_acupuncture_points', id)))
                );
                const points: StingPoint[] = docs
                    .filter(d => d.exists())
                    .map(d => ({ ...d.data(), id: d.id } as StingPoint));
                setResolvedPrevPoints(points);
            } catch (err) {
                console.error('TreatmentExecution: failed to hydrate accumulated stung points', err);
            }
        };
        fetchPrev();
    }, [protocol?.id, accumulatedStungPointIds]);

    const hydrateProtocol = useCallback(async () => {
        setIsHydrating(true);
        setHydrationError(null);
        try {
            if (customPoints && customPoints.length > 0) {
                setHydratedProtocol({ ...(protocol as any || {}), points: customPoints });
                setIsHydrating(false);
                return;
            }

            if (!protocol) {
                setHydratedProtocol(null);
                setIsHydrating(false);
                return;
            }

            const rawPoints = (protocol as any).points;
            if (!rawPoints || rawPoints.length === 0) {
                setHydratedProtocol({ ...(protocol as any), points: [] });
                setIsHydrating(false);
                return;
            }

            // Check if points are already hydrated (objects with an id and x/y/z)
            if (typeof rawPoints[0] === 'object' && rawPoints[0] !== null && 'id' in rawPoints[0]) {
                setHydratedProtocol({ ...(protocol as any), points: rawPoints as StingPoint[] });
                setIsHydrating(false);
                return;
            }

            const pointIds = rawPoints as string[];
            const pointDocs = await Promise.all(pointIds.map(id => getDoc(doc(db, 'cfg_acupuncture_points', id))));
            const points: StingPoint[] = pointDocs.map(d => {
                if (!d.exists()) throw new Error(`Point with ID ${d.id} not found.`);
                return { ...d.data(), id: d.id } as StingPoint;
            });
            setHydratedProtocol({ ...(protocol as any), points });
        } catch (err) {
            console.error('TreatmentExecution: hydration error', err);
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setHydrationError(`${tFailedToLoadModel} ${msg}`);
        } finally {
            setIsHydrating(false);
        }
    }, [protocol, tFailedToLoadModel, customPoints]);

    useEffect(() => {
        hydrateProtocol();
    }, [hydrateProtocol]);

    const handlePointSelect = useCallback((pointToAdd: StingPoint) => {
        // A point that is not paired starts at 1. A paired point always starts at 0 on both
        // sides: only the caretaker decides which side (or both) was stung.
        const initialCounts: StungPointCounts = getLaterality(pointToAdd) !== 'Paired'
            ? { left: 0, right: 0, single: 1 }
            : { left: 0, right: 0, single: 0 };
        setStungPoints(prev => prev.some(p => p.id === pointToAdd.id) ? prev : [...prev, pointToAdd]);
        setStungPointCounts(prev => prev[pointToAdd.id] ? prev : { ...prev, [pointToAdd.id]: initialCounts });
        setActivePointId(pointToAdd.id);
    }, [getLaterality]);

    // Tapping a point on the model in touch mode only highlights it (the list's "+" records it)
    const handlePointHighlight = useCallback((point: StingPoint) => {
        setActivePointId(prev => prev === point.id ? null : point.id);
    }, []);

    const handleRemoveStungPoint = (id: string) => {
        setStungPoints(prev => prev.filter(p => p.id !== id));
        setStungPointCounts(prev => {
            const { [id]: _removed, ...rest } = prev;
            return rest;
        });
        if (activePointId === id) setActivePointId(null);
        setValidationError(null);
    };

    const handleSetPointCount = (id: string, field: keyof StungPointCounts, rawValue: string) => {
        const n = Math.max(0, parseInt(rawValue, 10) || 0);
        setStungPointCounts(prev => {
            const existing = prev[id] ?? { left: 0, right: 0, single: 0 };
            return { ...prev, [id]: { ...existing, [field]: n } };
        });
        setValidationError(null);
    };

    // Every stung point must have a nonzero count before the round can be completed:
    // Paired points need L and/or R > 0, everything else needs S > 0.
    const validateStungPointCounts = (): string[] => {
        return stungPoints
            .filter(p => {
                const counts = stungPointCounts[p.id] ?? { left: 0, right: 0, single: 0 };
                return getLaterality(p) === 'Paired'
                    ? counts.left === 0 && counts.right === 0
                    : counts.single === 0;
            })
            .map(p => p.code);
    };

    const handleModelTap = useCallback(async (pos: { x: number; y: number; z: number }) => {
        if (protocol) return; // only active in Free Selection
        setProxTapMode('loading');
        setTapPosition(pos);

        const ttl    = appConfig?.treatmentSettings?.pointsCacheTTLMinutes    ?? 60;
        const maxN   = appConfig?.treatmentSettings?.proximityResultsCount    ?? 10;
        const radius = appConfig?.treatmentSettings?.proximitySearchRadiusCun ?? 3;

        let allPoints = getCachedPoints(ttl);
        if (!allPoints) {
            try {
                const snap = await getDocs(collection(db, 'cfg_acupuncture_points'));
                allPoints = snap.docs.map(d => ({ ...d.data(), id: d.id } as StingPoint));
                setCachedPoints(allPoints);
            } catch (err) {
                console.error('Proximity Tap: failed to fetch all points', err);
                setProxTapMode('idle');
                return;
            }
        }

        const results = findNearestPoints(pos, allPoints, maxN, radius);
        setCandidatePoints(results.map(r => r.point));
        setProxTapMode(results.length === 0 ? 'empty-radius' : 'results');
    }, [protocol, appConfig]);

    const handleClearAndRestart = useCallback(() => {
        setProxTapMode('idle');
        setTapPosition(null);
        setCandidatePoints([]);
        // stungPoints intentionally NOT cleared — they accumulate across taps
    }, []);

    const handleAnotherProtocol = () => {
        const missing = validateStungPointCounts();
        if (missing.length > 0) {
            setValidationError(`${tMissingCountsError} ${missing.join(', ')}`);
            return;
        }
        setValidationError(null);
        onRoundComplete(stungPoints.map(p => p.id), stungPointCounts);
    };

    const handleNext = () => {
        const missing = validateStungPointCounts();
        if (missing.length > 0) {
            setValidationError(`${tMissingCountsError} ${missing.join(', ')}`);
            return;
        }
        setValidationError(null);
        onNext(stungPoints.map(p => p.id), stungPointCounts);
    };

    // Normalization helper for sensitivity keys
    const normalizeSensitivity = (s: string | undefined): 'Low' | 'Medium' | 'High' => {
        if (!s) return 'Medium';
        const val = s.trim();
        const tLow = getTranslation('Low');
        const tMed = getTranslation('Medium');
        const tHigh = getTranslation('High');

        if (val === 'Low' || val === tLow || val === 'נמוכה') return 'Low';
        if (val === 'High' || val === tHigh || val === 'גבוהה') return 'High';
        if (val === 'Medium' || val === tMed || val === 'בינונית') return 'Medium';
        return 'Medium';
    };

    const hasPointDoc = (p: StingPoint): boolean => {
        return !!getFieldContent(p.documentUrl, language);
    };

    const hasPointLongText = (p: StingPoint): boolean => {
        if (!p.longText || !p.longText[language]) return false;
        const text = p.longText[language].trim();
        return text !== '' && text !== 'null' && text !== '<p><br></p>' && text !== '<p></p>';
    };

    const sensitivityColorMap: Record<string, string> = {
        'Low': '#93c5fd',    // light blue
        'Medium': '#3b82f6', // medium blue
        'High': '#1e3a8a'    // bold blue
    };

    const displayedPoints = useMemo(() => {
        let source: StingPoint[] = [];
        
        // Priority 1: Free Selection / Custom Points (Scenario 2)
        // We prioritize this to ensure that manual selection always takes precedence
        // if both are somehow present during state transitions.
        if (customPoints && customPoints.length > 0) {
            source = customPoints;
        }
        // Priority 2: Standard Protocol (Scenario 1)
        else if (protocol) {
            source = hydratedProtocol?.points || [];
        } 
        // Priority 3: Proximity Tap Results (Scenario 3)
        else if (proxTapMode === 'results' || proxTapMode === 'empty-radius') {
            source = candidatePoints;
        }

        if (selectedSensitivity === 'all') return source;
        return source.filter(p => 
            p && normalizeSensitivity(p.sensitivity) === normalizeSensitivity(selectedSensitivity)
        );
    }, [protocol, customPoints, hydratedProtocol, proxTapMode, candidatePoints, selectedSensitivity]);

    const canCompleteRound = stungPoints.length > 0 || (accumulatedStungPointIds && accumulatedStungPointIds.length > 0);

    // A sting count: a number (can be typed) with up / down arrows. The same on every device.
    const renderCountInput = (id: string, field: keyof StungPointCounts, value: number) => (
        <div className={styles.countField}>
            <input
                type="number"
                min={0}
                inputMode="numeric"
                className={styles.counterInput}
                value={value}
                onChange={e => handleSetPointCount(id, field, e.target.value)}
            />
            <div className={styles.countArrows}>
                <button
                    type="button"
                    className={styles.countArrowBtn}
                    onClick={() => handleSetPointCount(id, field, String(value + 1))}
                    aria-label={tIncrease}
                >
                    <ChevronUp size={14} />
                </button>
                <button
                    type="button"
                    className={styles.countArrowBtn}
                    onClick={() => handleSetPointCount(id, field, String(Math.max(0, value - 1)))}
                    disabled={value <= 0}
                    aria-label={tDecrease}
                >
                    <ChevronDown size={14} />
                </button>
            </div>
        </div>
    );

    if (isHydrating && (!customPoints || customPoints.length === 0)) {
        return (
            <div className={styles.centeredMsg}>
                <Loader className={styles.spinner} size={32} />
                <p><T>Loading protocol points for 3D model...</T></p>
            </div>
        );
    }

    if (hydrationError) {
        return (
            <div className={styles.errorBox}>
                <AlertTriangle size={32} />
                <h3><T>Error Loading Data</T></h3>
                <p>{hydrationError}</p>
                <button onClick={onBack} className={styles.btnSecondary}><T>Back</T></button>
            </div>
        );
    }

    return (
        <div className={styles.container} dir={direction}>
            {/* Header */}
            <div className={styles.header}>
                <h2 className={styles.headerTitle}>
                    {displayTitle || (protocol ? getFieldContent(protocol.name, language) : <T>Free Selection</T>)}
                    {/* Document icon if protocol has a document URL */}
                    {protocol && protocolDocUrl && (
                        <a
                            href={protocolDocUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.docLink}
                            title="View protocol document"
                        >
                            <FileText size={18} />
                        </a>
                    )}
                </h2>
                <button onClick={onBack} className={styles.btnBack}>
                    <BackIcon size={16} />
                    <T>Back</T>
                </button>
            </div>


            <div className={styles.grid}>
                {/* Left: Protocol point list */}
                <div className={styles.pointsPanel}>
                    <div className={styles.panelHeader}>
                        <List size={16} />
                        <span><T>Protocol Points</T></span>
                    </div>
                    <div className={styles.pointsControls}>
                    <label className={styles.toggleLabel}>
                        <span><T>Auto-Rotate</T></span>
                        <div className={styles.toggle} onClick={() => setIsRolling(r => !r)}>
                            <div className={`${styles.toggleTrack} ${isRolling ? styles.toggleOn : ''}`} />
                            <div className={`${styles.toggleThumb} ${isRolling ? styles.toggleThumbOn : ''}`} />
                        </div>
                    </label>


                    {/* Sensitivity Selector */}
                    <div className={styles.sensitivitySelector}>
                        <label className={styles.selectorLabel}>{tSensitivityLevel}</label>
                        {/* Phone: a compact list box instead of the four buttons (the buttons are hidden by CSS) */}
                        <select
                            className={styles.sensitivitySelect}
                            aria-label={tSensitivityLevel}
                            value={selectedSensitivity}
                            onChange={e => setSelectedSensitivity(e.target.value as 'all' | 'Low' | 'Medium' | 'High')}
                        >
                            <option value="all">{tSensitivityLevel}: {tAllLevels}</option>
                            <option value="Low">{tLowLevel}</option>
                            <option value="Medium">{tMediumLevel}</option>
                            <option value="High">{tHighLevel}</option>
                        </select>
                        <div className={styles.sensitivityOptions}>
                            {['all', 'Low', 'Medium', 'High'].map(level => {
                                const isActive = selectedSensitivity === level;
                                const levelColor = sensitivityColorMap[level] || 'var(--primary-color)';
                                return (
                                    <button
                                        key={level}
                                        className={`${styles.sensitivityBtn} ${isActive ? styles.sensitivityBtnActive : ''}`}
                                        style={isActive ? { backgroundColor: levelColor, borderColor: levelColor } : { color: levelColor }}
                                        onClick={() => setSelectedSensitivity(level as any)}
                                    >
                                        <T>{level === 'all' ? 'All' : level}</T>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    </div>



                    {!protocol && displayedPoints.length === 0 && proxTapMode === 'idle' && (
                        <div className={styles.proxTapCTA}>
                            <MousePointerClick size={28} />
                            <p><T>Tap the 3D model to find nearby acupuncture points</T></p>
                        </div>
                    )}

                    {!protocol && displayedPoints.length === 0 && proxTapMode === 'loading' && (
                        <div className={styles.proxTapLoading}>
                            <Loader size={18} className={styles.spinner} />
                            <span><T>Finding nearest points...</T></span>
                        </div>
                    )}

                    {!protocol && proxTapMode === 'empty-radius' && (
                        <div className={styles.proxTapEmpty}>
                            <p><T>No acupuncture points found in this area.</T></p>
                            <p><T>Try tapping a different location or increase the search radius in Settings.</T></p>
                            <button className={styles.clearRestartBtn} onClick={handleClearAndRestart}>
                                <RefreshCw size={14} /> <T>Try Again</T>
                            </button>
                        </div>
                    )}

                    {!protocol && proxTapMode === 'results' && (
                        <button className={styles.clearRestartBtn} onClick={handleClearAndRestart}>
                            <RefreshCw size={14} /> <T>Clear &amp; Restart</T>
                        </button>
                    )}

                    {displayedPoints.length > 0 && (
                        <p className={styles.hintText}><T>Press + to mark a point as stung.</T></p>
                    )}
                    
                    {displayedPoints.length > 0 && (
                        <div className={styles.pointsList}>
                        {displayedPoints.map(p => {

                            const pointHasLongText = hasPointLongText(p);
                            const isStung = stungPoints.some(sp => sp.id === p.id) || 
                                           accumulatedStungPointIds.includes(p.id);
                            const level = normalizeSensitivity(p.sensitivity);
                            const color = sensitivityColorMap[level];

                            return (
                                <div
                                    key={p.id}
                                    onClick={() => handlePointHighlight(p)}
                                    className={`${styles.pointItem} ${activePointId === p.id ? styles.pointItemActive : ''} ${isStung ? styles.pointItemStung : ''}`}
                                    style={{ borderLeftColor: color }}
                                >
                                    <div className={styles.pointInfo}>
                                        <span className={styles.pointCode} style={{ color }}>{p.code}</span>
                                        <span className={styles.pointLabel} style={{ color }}>{getPointLabel(p.label)}</span>
                                    </div>
                                    <div className={styles.pointActions}>
                                        {hasPointDoc(p) && (
                                            <button
                                                className={styles.pointDocLink}
                                                onClick={(e) => { e.stopPropagation(); setPointDetailToShow({ point: p, type: 'doc' }); }}
                                                title={getTranslation('View Document')}
                                            >
                                                <FileText size={14} />
                                            </button>
                                        )}
                                        {p.imageURL && (
                                            <button
                                                className={styles.pointImgLink}
                                                onClick={(e) => { e.stopPropagation(); setPointDetailToShow({ point: p, type: 'image' }); }}
                                                title={getTranslation('View Image')}
                                            >
                                                <Image size={14} />
                                            </button>
                                        )}
                                        {pointHasLongText && (
                                            <button
                                                className={styles.pointInfoLink}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setPointDetailToShow({ point: p, type: 'text' });
                                                }}
                                                title={getTranslation('Details')}
                                            >
                                                <BookOpen size={14} />
                                            </button>
                                        )}
                                        {!isStung && (
                                            <button
                                                type="button"
                                                className={styles.pointAddBtn}
                                                onClick={(e) => { e.stopPropagation(); handlePointSelect(p); }}
                                                aria-label={tMarkAsStung}
                                                title={tMarkAsStung}
                                            >
                                                <Plus size={20} />
                                            </button>
                                        )}
                                        {isStung && (
                                            <CheckCircle size={14} className={styles.stungIcon} style={{ color }} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    )}
                </div>
                {/* Center: 3D Model */}
                <div className={styles.canvasPanel}>
                    <button
                        className={styles.resetViewBtn}
                        onClick={() => setResetTrigger(v => v + 1)}
                        title={getTranslation('Reset View')}
                    >
                        <Maximize size={20} />
                    </button>
                    <div className={styles.zoomBtns}>
                        <button
                            className={`${styles.resetViewBtn} ${styles.zoomBtn}`}
                            onClick={() => requestZoom(1)}
                            title={tZoomIn}
                            aria-label={tZoomIn}
                        >
                            <ZoomIn size={20} />
                        </button>
                        <button
                            className={`${styles.resetViewBtn} ${styles.zoomBtn}`}
                            onClick={() => requestZoom(-1)}
                            title={tZoomOut}
                            aria-label={tZoomOut}
                        >
                            <ZoomOut size={20} />
                        </button>
                    </div>
                    <div 
                        className={styles.canvasScrollWrapper}
                        ref={scrollWrapperRef}
                    >
                        {/* canvasSizer expands based on canvasScale.
                            When scale > 1, the scrollbars appear in the wrapper. */}
                        <div 
                            className={styles.canvasSizer}
                            style={{ 
                                width: `${100 * canvasScale}%`, 
                                height: `${100 * canvasScale}%`,
                                transition: 'width 0.2s ease-out, height 0.2s ease-out'
                            }}
                        >
                            <Canvas className={styles.canvas}>
                                <BodyScene
                                    protocol={hydratedProtocol}
                                    points={displayedPoints}
                                    onPointSelect={handlePointHighlight}
                                    activePointId={activePointId}
                                    isRolling={isRolling}
                                    resetTrigger={resetTrigger}
                                    onZoomChange={isCoarsePointer ? undefined : setCanvasScale}
                                    zoomRequest={zoomRequest}
                                    sensitivityColorMap={sensitivityColorMap}
                                    onModelTap={(!protocol && (!customPoints || customPoints.length === 0)) ? handleModelTap : undefined}
                                    tapPosition={(!protocol && (!customPoints || customPoints.length === 0)) ? tapPosition : null}
                                />
                            </Canvas>
                        </div>
                    </div>
                </div>

                {/* Right: Stung data + vitals + actions */}
                <div className={styles.dataPanel}>
                    <h3 className={styles.dataTitle}>
                        <MousePointerClick size={18} />
                        <T>Treatment Data</T>
                        <span className={styles.dataTitleCount}>{tStungPoints} ({stungPoints.length + resolvedPrevPoints.length})</span>
                    </h3>

                    {/* Stung points list */}
                    <div className={styles.stungSection}>

                        {/* Previously stung in this treatment (read-only) */}
                        {resolvedPrevPoints.length > 0 && (
                            <>
                                <label className={styles.subSectionLabel}><T>Previous protocols</T></label>
                                <div className={styles.stungList}>
                                    {resolvedPrevPoints.map(p => (
                                        <div
                                            key={p.id}
                                            className={`${styles.stungItem} ${styles.stungItemPrev}`}
                                            onClick={() => setActivePointId(p.id)}
                                        >
                                            <span><span className={styles.pointCode}>{p.code}</span> – {getPointLabel(p.label)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Current protocol stung points (removable) */}
                        {resolvedPrevPoints.length > 0 && <label className={styles.subSectionLabel}><T>This protocol</T></label>}
                        <div className={styles.stungList}>
                            {stungPoints.length === 0 ? (
                                <p className={styles.emptyStung}>{tNoPointsStung}</p>
                            ) : stungPoints.map(p => {
                                const counts = stungPointCounts[p.id] ?? { left: 0, right: 0, single: 0 };
                                const isPaired = getLaterality(p) === 'Paired';
                                return (
                                    <div
                                        key={p.id}
                                        className={`${styles.stungItem} ${activePointId === p.id ? styles.stungItemActive : ''}`}
                                        onClick={() => setActivePointId(p.id)}
                                    >
                                        <span><span className={styles.pointCode}>{p.code}</span> – {getPointLabel(p.label)}</span>
                                        <div className={styles.stungItemControls}>
                                            <div className={styles.counterGroup} onClick={e => e.stopPropagation()}>
                                                {isPaired ? (
                                                    <>
                                                        <div className={styles.counterBox} title={getTranslation('Left')}>
                                                            <span className={styles.counterLabel}>L</span>
                                                            {renderCountInput(p.id, 'left', counts.left)}
                                                        </div>
                                                        <div className={styles.counterBox} title={getTranslation('Right')}>
                                                            <span className={styles.counterLabel}>R</span>
                                                            {renderCountInput(p.id, 'right', counts.right)}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className={styles.counterBox} title={getTranslation('Midline-Unilateral')}>
                                                        <span className={styles.counterLabel}>S</span>
                                                        {renderCountInput(p.id, 'single', counts.single)}
                                                    </div>
                                                )}
                                            </div>
                                            <button onClick={e => { e.stopPropagation(); handleRemoveStungPoint(p.id); }} className={styles.removeBtn}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Directives and Vitals */}
                    {isSensitivityTest && (
                        <div className={styles.directiveBox}>
                            <AlertTriangle size={16} />
                            <span>
                                {getFieldContent(appConfig?.treatmentSettings?.sensitivityWaitDirective, language) || tSensDirectiveFallback}
                            </span>
                        </div>
                    )}

                    {validationError && (
                        <div className={styles.validationErrorBox}>
                            <AlertTriangle size={16} />
                            <span>{validationError}</span>
                        </div>
                    )}

                    {/* Main action buttons */}
                    <div className={styles.actionRow}>
                        <button
                            className={styles.btnAnotherProtocol}
                            disabled={!canCompleteRound || canGoToAnother === false}
                            onClick={handleAnotherProtocol}
                        >
                            <PlusCircle size={15} /> {tAnotherProtocol}
                        </button>
                        <button
                            className={styles.btnEndTreatment}
                            disabled={!canCompleteRound}
                            onClick={handleNext}
                        >
                            <CheckCircle size={15} /> {tNextStep}
                        </button>
                    </div>
                </div>
            </div>
            {pointDetailToShow && (
                <PointDetailModal
                    point={pointDetailToShow.point}
                    type={pointDetailToShow.type}
                    language={language}
                    onClose={() => setPointDetailToShow(null)}
                    tNoAdditionalDetails={tNoAdditionalDetails}
                />
            )}
        </div>
    );
};

interface PointDetailModalProps {
    point: StingPoint;
    type: 'doc' | 'image' | 'text';
    language: string;
    onClose: () => void;
    tNoAdditionalDetails: any;
}

const PointDetailModal: React.FC<PointDetailModalProps> = ({ point, type, language, onClose, tNoAdditionalDetails }) => {
    const { url: imageUrl, loading: imageLoading, error: imageError } = useStorageUrl(point.imageURL, language, 'image');
    const { url: docUrl, loading: docLoading, error: docError } = useStorageUrl(point.documentUrl, language, 'doc');

    const isLoading = (type === 'image' && imageLoading) || (type === 'doc' && docLoading);

    // Fallback URLs for Google Drive images — tried in order on <img> onError
    const fallbackUrlsRef = useRef<string[]>([]);
    useEffect(() => {
        fallbackUrlsRef.current = getGDriveFallbackUrls(imageUrl);
    }, [imageUrl]);

    const handleImgError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const next = fallbackUrlsRef.current.shift();
        if (next) {
            (e.target as HTMLImageElement).src = next;
        }
    }, []);

    const hasLongText = !!(point.longText && point.longText[language]);
    const hasImage = !!imageUrl;
    const hasDoc = !!docUrl;

    const hasRequestedContent =
        (type === 'text' && hasLongText) ||
        (type === 'image' && (imageLoading || hasImage || !!imageError)) ||
        (type === 'doc' && (docLoading || hasDoc || !!docError));

    // Raw storage path / URL for "Open in new tab" error fallback
    const rawDocPath = typeof point.documentUrl === 'string'
        ? point.documentUrl
        : (point.documentUrl as Record<string, string>)?.[language] ?? (point.documentUrl as Record<string, string>)?.en;
    const rawImagePath = typeof point.imageURL === 'string' ? point.imageURL : undefined;

    return (
        <div className={styles.detailModalOverlay} onClick={onClose}>
            <div className={styles.detailModalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.detailModalHeader}>
                    <h3 className={styles.detailModalTitle}>
                        {point.code} - {getPointLabel(point.label)}
                    </h3>
                    <button className={styles.detailModalClose} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className={styles.detailModalBody}>

                    {/* Loading spinner while blob URL is being fetched */}
                    {isLoading && (
                        <div className={styles.centeredMsg}>
                            <Loader size={28} className={styles.spinner} />
                        </div>
                    )}

                    {/* No-content fallback (only shown once loading is done) */}
                    {!isLoading && !hasRequestedContent && (
                        <p className={styles.noData}>{tNoAdditionalDetails}</p>
                    )}

                    {/* Long text */}
                    {type === 'text' && hasLongText && (
                        <div className={styles.detailSection}>
                            <div className={styles.detailSectionLabel}>
                                <BookOpen size={14} />
                                <T>Details</T>
                            </div>
                            <div className={styles.longTextContainer}>
                                {(getFieldContent(point.longText, language) || '').split('\n').map((text: string, idx: number) => (
                                    <p key={idx} className={styles.paragraph}>{text}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Image — renders once blob URL is ready */}
                    {type === 'image' && !imageLoading && (
                        <div className={styles.detailSection}>
                            <div className={styles.detailSectionLabel}>
                                <Image size={14} />
                                <T>Image</T>
                            </div>
                            {imageError ? (
                                <p className={styles.noData}>
                                    <T>Failed to load image.</T>{' '}
                                    {rawImagePath && (
                                        <a href={rawImagePath} target="_blank" rel="noopener noreferrer">
                                            <T>Open in new tab</T>
                                        </a>
                                    )}
                                </p>
                            ) : hasImage ? (
                                <img
                                    src={imageUrl}
                                    alt={point.code}
                                    className={styles.detailImage}
                                    onError={handleImgError}
                                    referrerPolicy="no-referrer"
                                />
                            ) : null}
                        </div>
                    )}

                    {/* Document — renders inline via blob URL (avoids Content-Disposition: attachment) */}
                    {type === 'doc' && !docLoading && (
                        <div className={styles.detailSection}>
                            <div className={styles.detailSectionLabel}>
                                <FileText size={14} />
                                <T>Document</T>
                            </div>
                            {docError ? (
                                <p className={styles.noData}>
                                    <T>Failed to load document.</T>{' '}
                                    {rawDocPath && (
                                        <a href={rawDocPath} target="_blank" rel="noopener noreferrer">
                                            <T>Open in new tab</T>
                                        </a>
                                    )}
                                </p>
                            ) : hasDoc ? (
                                <iframe
                                    src={docUrl}
                                    className={styles.detailIframe}
                                    title={`${point.code} document`}
                                />
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TreatmentExecution;
