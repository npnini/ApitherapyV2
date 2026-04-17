import React, { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { T, useT, useTranslationContext } from './T';
import { Protocol } from '../types/protocol';
import { VitalSigns } from '../types/treatmentSession';
import { StingPoint } from '../types/apipuncture';
import BodyScene from './BodyScene';
import VitalsInputGroup from './VitalsInputGroup';
import { AlertTriangle, CheckCircle, Trash2, Loader, MousePointerClick, List, ChevronLeft, FileText, PlusCircle, XSquare, Image, BookOpen, X, Maximize } from 'lucide-react';
import styles from './TreatmentExecution.module.css';

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
    isSensitivityTest: boolean;
    accumulatedStungPointIds: string[];
    onRoundComplete: (stungPointIds: string[]) => void;
    onNext: (stungPointIds: string[]) => void;
    onBack: () => void;
    onExit?: () => void;
    preferredModel?: 'xbot' | 'corpo';
    customPoints?: StingPoint[];
    canGoToAnother: boolean;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const transformGDriveLink = (url: string | undefined, mode: 'view' | 'preview' | 'img' = 'view'): string | undefined => {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('drive.google.com')) {
        // Extract ID from /d/ID/view or ?id=ID
        const fileId = url.match(/\/d\/(.+?)\//)?.[1] || url.match(/id=(.+?)(&|$)/)?.[1];
        if (fileId) {
            if (mode === 'preview') return `https://drive.google.com/file/d/${fileId}/preview`;
            if (mode === 'img') return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
            return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
    }
    return url;
};

const getDocumentUrl = (documentUrl: any, lang: string): string | undefined => {
    if (!documentUrl) return undefined;
    let url: string | undefined;
    if (typeof documentUrl === 'string') url = documentUrl;
    else if (typeof documentUrl === 'object') {
        url = documentUrl[lang] || documentUrl.en || Object.values(documentUrl)[0] as string;
    }
    return transformGDriveLink(url, 'view');
};

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({
    protocol,
    isSensitivityTest,
    accumulatedStungPointIds,
    onRoundComplete,
    onNext,
    onBack,
    preferredModel = 'xbot',
    customPoints,
    canGoToAnother,
}) => {
    const { language, direction, getTranslation } = useTranslationContext();

    const tFailedToLoadModel = useT('Failed to load 3D model data.');
    const tNotesPlaceholder = useT('Add any final observations or notes here...');
    const tAnotherProtocol = useT('Another Protocol');
    const tEndTreatment = useT('End Treatment');
    const tNextStep = useT('Next Step');
    const tSensitivityBanner = useT('This session uses the sensitivity test protocol.');
    const tNoPointsStung = useT('No points have been marked as stung yet.');
    const tStungPoints = useT('Stung Points');
    const tFinalNotes = useT('Final Notes');
    const tSensDirectiveFallback = useT('Wait 10 minutes. If there is an allergic reaction, press Next Step. If there is no allergic reaction, press Another Protocol');
    const tStdDirectiveFallback = useT('Wait 15 minutes before removing the stingers, then measure the final vitals');
    const tSensitivityLevel = useT('Sensitivity Level');
    const tNoAdditionalDetails = useT('No additional details available in this language.');

    const [hydratedProtocol, setHydratedProtocol] = useState<HydratedProtocol | null>(null);
    const [isHydrating, setIsHydrating] = useState(true);
    const [hydrationError, setHydrationError] = useState<string | null>(null);
    const [resetTrigger, setResetTrigger] = useState(0);
    const [isMaximized, setIsMaximized] = useState(false);

    const [stungPoints, setStungPoints] = useState<StingPoint[]>([]);
    const [activePointId, setActivePointId] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<'xbot' | 'corpo'>(preferredModel);
    const [isRolling, setIsRolling] = useState(true);
    const [selectedSensitivity, setSelectedSensitivity] = useState<'all' | 'Low' | 'Medium' | 'High'>('all');
    const [pointDetailToShow, setPointDetailToShow] = useState<{ point: StingPoint; type: 'doc' | 'image' | 'text' } | null>(null);
    // Hydrated previously-stung points from prior protocols in this treatment
    const [resolvedPrevPoints, setResolvedPrevPoints] = useState<StingPoint[]>([]);

    const [appConfig, setAppConfig] = useState<any>(null);

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

    // Reset current-protocol stung points when protocol changes, and hydrate accumulated IDs
    useEffect(() => {
        setStungPoints([]);
        setActivePointId(null);

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

            const pointIds = (protocol as any).points as string[];
            if (!pointIds || pointIds.length === 0) {
                setHydratedProtocol({ ...(protocol as any), points: [] });
                setIsHydrating(false);
                return;
            }
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
        setStungPoints(prev => prev.some(p => p.id === pointToAdd.id) ? prev : [...prev, pointToAdd]);
        setActivePointId(pointToAdd.id);
    }, []);

    const handleRemoveStungPoint = (id: string) => {
        setStungPoints(prev => prev.filter(p => p.id !== id));
        if (activePointId === id) setActivePointId(null);
    };

    const handleAnotherProtocol = () => {
        onRoundComplete(stungPoints.map(p => p.id));
    };

    const handleNext = () => {
        onNext(stungPoints.map(p => p.id));
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

    const getPointDocUrl = (p: StingPoint): string | null => {
        if (!p.documentUrl) return null;
        let url: string | undefined;
        if (typeof p.documentUrl === 'string') url = p.documentUrl;
        else url = p.documentUrl[language] || p.documentUrl['en'] || Object.values(p.documentUrl)[0] as string;
        return transformGDriveLink(url, 'preview') || null;
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

    const displayedPoints = hydratedProtocol?.points.filter(p => {
        if (selectedSensitivity === 'all') return true;
        const pointLevel = normalizeSensitivity(p.sensitivity);
        const selectedLevel = normalizeSensitivity(selectedSensitivity);
        return pointLevel === selectedLevel;
    }) || [];

    const canCompleteRound = stungPoints.length > 0;

    if (isHydrating) {
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
                <button onClick={onBack} className={styles.backButton}>
                    <ChevronLeft size={20} />
                </button>
                <h2 className={styles.headerTitle}>
                    {protocol ? getMLValue(protocol.name, language) : <T>Free Selection</T>}
                    {/* Document icon if protocol has a document URL */}
                    {protocol && getDocumentUrl(protocol.documentUrl, language) && (
                        <a
                            href={getDocumentUrl(protocol.documentUrl, language)}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.docLink}
                            title="View protocol document"
                        >
                            <FileText size={18} />
                        </a>
                    )}
                </h2>
            </div>


            <div className={styles.grid}>
                {/* Left: Protocol point list */}
                <div className={styles.pointsPanel}>
                    <div className={styles.panelHeader}>
                        <List size={16} />
                        <span><T>Protocol Points</T></span>
                    </div>
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


                    {/* Model Switcher */}
                    <div className={styles.modelSwitcher}>
                        <button
                            className={`${styles.modelTab} ${selectedModel === 'xbot' ? styles.modelTabActive : ''}`}
                            onClick={() => setSelectedModel('xbot')}
                        >
                            <T>Xbot</T>
                        </button>
                        <button
                            className={`${styles.modelTab} ${selectedModel === 'corpo' ? styles.modelTabActive : ''}`}
                            onClick={() => setSelectedModel('corpo')}
                        >
                            <T>Corpo</T>
                        </button>
                    </div>
                    <p className={styles.hintText}><T>Click a point to mark it as stung.</T></p>
                    <div className={styles.pointsList}>
                        {displayedPoints.map(p => {
                            const docUrl = getPointDocUrl(p);
                            const pointHasLongText = hasPointLongText(p);
                            const isStung = stungPoints.some(sp => sp.id === p.id);
                            const level = normalizeSensitivity(p.sensitivity);
                            const color = sensitivityColorMap[level];

                            return (
                                <div
                                    key={p.id}
                                    onMouseEnter={() => setActivePointId(p.id)}
                                    onMouseLeave={() => setActivePointId(null)}
                                    onClick={() => handlePointSelect(p)}
                                    className={`${styles.pointItem} ${activePointId === p.id ? styles.pointItemActive : ''} ${isStung ? styles.pointItemStung : ''}`}
                                    style={{ borderLeftColor: color }}
                                >
                                    <div className={styles.pointInfo}>
                                        <span className={styles.pointCode} style={{ color }}>{p.code}</span>
                                        <span className={styles.pointLabel} style={{ color }}>{getMLValue(p.label, language)}</span>
                                    </div>
                                    <div className={styles.pointActions}>
                                        {docUrl && (
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
                                        {isStung && (
                                            <CheckCircle size={14} className={styles.stungIcon} style={{ color }} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
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
                    <Canvas className={styles.canvas}>
                        <BodyScene
                            protocol={hydratedProtocol ? { ...hydratedProtocol, points: displayedPoints } : null}
                            onPointSelect={handlePointSelect}
                            activePointId={activePointId}
                            isRolling={isRolling}
                            selectedModel={selectedModel}
                            resetTrigger={resetTrigger}
                            sensitivityColorMap={sensitivityColorMap}
                        />
                    </Canvas>

                    {/* Detail Modal Overlay — positioned over the 3D canvas */}
                    {pointDetailToShow && (() => {
                        const pToShow = pointDetailToShow.point;
                        const detailType = pointDetailToShow.type;
                        const detailDocUrl = getPointDocUrl(pToShow);
                        const detailHasLongText = hasPointLongText(pToShow);
                        const detailHasImage = !!pToShow.imageURL;
                        const detailHasDoc = !!detailDocUrl;

                        // Check if the requested content ACTUALLY exists (fallback case)
                        const hasRequestedContent =
                            (detailType === 'text' && detailHasLongText) ||
                            (detailType === 'image' && detailHasImage) ||
                            (detailType === 'doc' && detailHasDoc);

                        return (
                            <div className={styles.detailModalOverlay} onClick={() => setPointDetailToShow(null)}>
                                <div className={styles.detailModalContent} onClick={(e) => e.stopPropagation()}>
                                    <div className={styles.detailModalHeader}>
                                        <h3 className={styles.detailModalTitle}>
                                            {pToShow.code} - {getMLValue(pToShow.label, language)}
                                        </h3>
                                        <button className={styles.detailModalClose} onClick={() => setPointDetailToShow(null)}>
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div className={styles.detailModalBody}>
                                        {!hasRequestedContent && (
                                            <p className={styles.noData}>{tNoAdditionalDetails}</p>
                                        )}

                                        {detailType === 'text' && detailHasLongText && (
                                            <div className={styles.detailSection}>
                                                <div className={styles.detailSectionLabel}>
                                                    <BookOpen size={14} />
                                                    <T>Details</T>
                                                </div>
                                                <div className={styles.longTextContainer}>
                                                    {pToShow.longText![language].split('\n').map((text: string, idx: number) => (
                                                        <p key={idx} className={styles.paragraph}>{text}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {detailType === 'image' && detailHasImage && (
                                            <div className={styles.detailSection}>
                                                <div className={styles.detailSectionLabel}>
                                                    <Image size={14} />
                                                    <T>Image</T>
                                                </div>
                                                <img
                                                    src={transformGDriveLink(pToShow.imageURL, 'img')}
                                                    alt={pToShow.code}
                                                    className={styles.detailImage}
                                                />
                                            </div>
                                        )}

                                        {detailType === 'doc' && detailHasDoc && (
                                            <div className={styles.detailSection}>
                                                <div className={styles.detailSectionLabel}>
                                                    <FileText size={14} />
                                                    <T>Document</T>
                                                </div>
                                                <iframe
                                                    src={detailDocUrl!}
                                                    className={styles.detailIframe}
                                                    title={`${pToShow.code} document`}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Right: Stung data + vitals + actions */}
                <div className={styles.dataPanel}>
                    <h3 className={styles.dataTitle}>
                        <MousePointerClick size={18} />
                        <T>Treatment Data</T>
                    </h3>

                    {/* Stung points list */}
                    <div className={styles.stungSection}>
                        <label className={styles.sectionLabel}>{tStungPoints} ({stungPoints.length + resolvedPrevPoints.length})</label>

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
                                            <span><span className={styles.pointCode}>{p.code}</span> – {getMLValue(p.label, language)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Current protocol stung points (removable) */}
                        <label className={styles.subSectionLabel}><T>This protocol</T></label>
                        <div className={styles.stungList}>
                            {stungPoints.length === 0 ? (
                                <p className={styles.emptyStung}>{tNoPointsStung}</p>
                            ) : stungPoints.map(p => (
                                <div
                                    key={p.id}
                                    className={`${styles.stungItem} ${activePointId === p.id ? styles.stungItemActive : ''}`}
                                    onClick={() => setActivePointId(p.id)}
                                >
                                    <span><span className={styles.pointCode}>{p.code}</span> – {getMLValue(p.label, language)}</span>
                                    <button onClick={e => { e.stopPropagation(); handleRemoveStungPoint(p.id); }} className={styles.removeBtn}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Directives and Vitals */}
                    {isSensitivityTest && (
                        <div className={styles.directiveBox}>
                            <AlertTriangle size={16} />
                            <span>
                                {(getMLValue(appConfig?.treatmentSettings?.sensitivityWaitDirective, language) || tSensDirectiveFallback)
                                    .replace(/End Treatment/g, tNextStep)
                                    .replace(/סיום טיפול/g, tNextStep)}
                            </span>
                        </div>
                    )}

                    {/* Main action buttons */}
                    <div className={styles.actionRow}>
                        <button
                            className={styles.btnAnotherProtocol}
                            disabled={!canCompleteRound || !canGoToAnother}
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
        </div>
    );
};

export default TreatmentExecution;
