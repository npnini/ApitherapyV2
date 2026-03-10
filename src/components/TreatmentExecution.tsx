
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { T, useT, useTranslationContext } from './T';
import { Protocol } from '../types/protocol';
import { ProtocolRound, VitalSigns } from '../types/treatmentSession';
import { StingPoint } from '../types/apipuncture';
import BodyScene from './BodyScene';
import VitalsInputGroup from './VitalsInputGroup';
import { AlertTriangle, CheckCircle, Trash2, Loader, MousePointerClick, List, ChevronLeft, FileText, PlusCircle, XSquare } from 'lucide-react';
import styles from './TreatmentExecution.module.css';

interface HydratedProtocol extends Omit<Protocol, 'points'> {
    points: StingPoint[];
}

interface TreatmentExecutionProps {
    protocol: Protocol;
    problemId: string;
    isSensitivityTest: boolean;
    onRoundComplete: (round: ProtocolRound) => void;
    onEndTreatment: (finalRound: ProtocolRound, postStingingVitals: Partial<VitalSigns>, finalVitals: Partial<VitalSigns>, finalNotes: string) => void;
    onBack: () => void;
    preferredModel?: 'xbot' | 'corpo';
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const getDocumentUrl = (documentUrl: any, lang: string): string | undefined => {
    if (!documentUrl) return undefined;
    if (typeof documentUrl === 'string') return documentUrl;
    if (typeof documentUrl === 'object') return documentUrl[lang] || documentUrl.en || Object.values(documentUrl)[0];
    return undefined;
};

const TreatmentExecution: React.FC<TreatmentExecutionProps> = ({
    protocol,
    problemId,
    isSensitivityTest,
    onRoundComplete,
    onEndTreatment,
    onBack,
    preferredModel = 'xbot',
}) => {
    const { language, direction } = useTranslationContext();

    const tFailedToLoadModel = useT('Failed to load 3D model data.');
    const tNotesPlaceholder = useT('Add any final observations or notes here...');
    const tAnotherProtocol = useT('Another Protocol');
    const tEndTreatment = useT('End Treatment');
    const tSensitivityBanner = useT('This session uses the sensitivity test protocol.');
    const tNoPointsStung = useT('No points have been marked as stung yet.');
    const tStungPoints = useT('Stung Points');
    const tPostStingingMeasures = useT('Post-Stinging Measures (Optional)');
    const tFinalNotes = useT('Final Notes');
    const tSensDirectiveFallback = useT('Wait 10 minutes. If there is an allergic reaction, press End Treatment. If there is no allergic reaction, press Another Protocol');
    const tStdDirectiveFallback = useT('Wait 15 minutes before removing the stingers, then measure the final vitals');

    const [hydratedProtocol, setHydratedProtocol] = useState<HydratedProtocol | null>(null);
    const [isHydrating, setIsHydrating] = useState(true);
    const [hydrationError, setHydrationError] = useState<string | null>(null);

    const [stungPoints, setStungPoints] = useState<StingPoint[]>([]);
    const [activePointId, setActivePointId] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<'xbot' | 'corpo'>(preferredModel);
    const [isRolling, setIsRolling] = useState(true);

    // End-treatment fields (shown when "End Treatment" is clicked)
    const [showEndPanel, setShowEndPanel] = useState(false);
    const [postStingingVitals, setPostStingingVitals] = useState<Partial<VitalSigns>>({});
    const [finalVitals, setFinalVitals] = useState<Partial<VitalSigns>>({});
    const [finalNotes, setFinalNotes] = useState('');

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

    const hydrateProtocol = useCallback(async () => {
        setIsHydrating(true);
        setHydrationError(null);
        try {
            const pointIds = (protocol as any).points as string[];
            if (!pointIds || pointIds.length === 0) {
                setHydratedProtocol({ ...(protocol as any), points: [] });
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
    }, [protocol, tFailedToLoadModel]);

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

    const buildRound = (): ProtocolRound => ({
        protocolId: protocol.id,
        problemId,
        stungPointIds: stungPoints.map(p => p.id),
    });

    const handleAnotherProtocol = () => {
        onRoundComplete(buildRound());
    };

    const handleEndTreatmentConfirm = () => {
        onEndTreatment(buildRound(), postStingingVitals, finalVitals, finalNotes);
    };

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
                    {getMLValue(protocol.name, language)}
                    {/* Document icon if protocol has a document URL */}
                    {getDocumentUrl(protocol.documentUrl, language) && (
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

            {/* Sensitivity test banner */}
            {isSensitivityTest && (
                <div className={styles.sensitivityBanner}>
                    <AlertTriangle size={16} />
                    <span>{tSensitivityBanner}</span>
                </div>
            )}

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
                        {hydratedProtocol?.points.map(p => {
                            const docUrl = getDocumentUrl((p as any).documentUrl, language);
                            const isStung = stungPoints.some(sp => sp.id === p.id);
                            return (
                                <div
                                    key={p.id}
                                    onMouseEnter={() => setActivePointId(p.id)}
                                    onMouseLeave={() => setActivePointId(null)}
                                    onClick={() => handlePointSelect(p)}
                                    className={`${styles.pointItem} ${activePointId === p.id ? styles.pointItemActive : ''} ${isStung ? styles.pointItemStung : ''}`}
                                >
                                    <div className={styles.pointInfo}>
                                        <span className={styles.pointCode}>{p.code}</span>
                                        <span className={styles.pointLabel}>{getMLValue(p.label, language)}</span>
                                    </div>
                                    <div className={styles.pointActions}>
                                        {docUrl && (
                                            <a
                                                href={docUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className={styles.pointDocLink}
                                                title="View point document"
                                            >
                                                <FileText size={13} />
                                            </a>
                                        )}
                                        {isStung && <CheckCircle size={15} className={styles.stungIcon} />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Center: 3D Model */}
                <div className={styles.canvasPanel}>
                    <Canvas className={styles.canvas}>
                        <BodyScene
                            protocol={hydratedProtocol}
                            onPointSelect={handlePointSelect}
                            activePointId={activePointId}
                            isRolling={isRolling}
                            selectedModel={selectedModel}
                        />
                    </Canvas>
                </div>

                {/* Right: Stung data + vitals + actions */}
                <div className={styles.dataPanel}>
                    <h3 className={styles.dataTitle}>
                        <MousePointerClick size={18} />
                        <T>Treatment Data</T>
                    </h3>

                    {/* Stung points list */}
                    <div className={styles.stungSection}>
                        <label className={styles.sectionLabel}>{tStungPoints} ({stungPoints.length})</label>
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
                    {isSensitivityTest && !showEndPanel && (
                        <div className={styles.directiveBox}>
                            <AlertTriangle size={16} />
                            <span>
                                {getMLValue(appConfig?.treatmentSettings?.sensitivityWaitDirective, language) || tSensDirectiveFallback}
                            </span>
                        </div>
                    )}

                    {/* End Treatment expansion panel */}
                    {showEndPanel && (
                        <div className={styles.endPanel}>
                            <VitalsInputGroup
                                title={useT('Post-Stinging Measures (Optional)')}
                                vitals={postStingingVitals}
                                onVitalsChange={setPostStingingVitals}
                            />

                            <div className={styles.standardDirective}>
                                {getMLValue(appConfig?.treatmentSettings?.standardWaitDirective, language) || tStdDirectiveFallback}
                            </div>

                            <VitalsInputGroup
                                title={useT('Stinger Removal Measures (Optional)')}
                                vitals={finalVitals}
                                onVitalsChange={setFinalVitals}
                            />
                            <label className={styles.sectionLabel}>{tFinalNotes}</label>
                            <textarea
                                className={styles.notesTextarea}
                                rows={3}
                                value={finalNotes}
                                onChange={e => setFinalNotes(e.target.value)}
                                placeholder={tNotesPlaceholder}
                            />
                            <div className={styles.endActions}>
                                <button className={styles.btnSecondary} onClick={() => setShowEndPanel(false)}>
                                    <XSquare size={15} /> <T>Cancel</T>
                                </button>
                                <button
                                    className={styles.btnEndConfirm}
                                    disabled={!canCompleteRound}
                                    onClick={handleEndTreatmentConfirm}
                                >
                                    <CheckCircle size={15} /> {tEndTreatment}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Main action buttons */}
                    {!showEndPanel && (
                        <div className={styles.actionRow}>
                            <button
                                className={styles.btnAnotherProtocol}
                                disabled={!canCompleteRound}
                                onClick={handleAnotherProtocol}
                            >
                                <PlusCircle size={15} /> {tAnotherProtocol}
                            </button>
                            <button
                                className={styles.btnEndTreatment}
                                disabled={!canCompleteRound}
                                onClick={() => setShowEndPanel(true)}
                            >
                                <CheckCircle size={15} /> {tEndTreatment}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TreatmentExecution;
