import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { T, useTranslationContext, useT } from './T';
import { VitalSigns } from '../types/treatmentSession';
import { StingPoint } from '../types/apipuncture';
import { Protocol } from '../types/protocol';
import VitalsInputGroup from './VitalsInputGroup';
import { CheckCircle, ChevronLeft, Loader, List, ClipboardList } from 'lucide-react';
import styles from './PostStingScreen.module.css';

interface PostStingData {
    postTreatmentVitals: Partial<VitalSigns>;
    finalVitals: Partial<VitalSigns>;
    finalNotes: string;
}

interface PostStingScreenProps {
    stungPointIds: string[];
    protocolIds: string[];
    onFinish: (data: PostStingData) => void;
    onBack: () => void;
    onExit?: () => void;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

const PostStingScreen: React.FC<PostStingScreenProps> = ({
    stungPointIds,
    protocolIds,
    onFinish,
    onBack,
    onExit
}) => {
    const { language, direction } = useTranslationContext();
    const tFinishTreatment = useT('Finish Treatment');
    const tPostStingTitle = useT('Post-Treatment Summary');
    const tNotesPlaceholder = useT('Add any final observations or notes here...');

    const [points, setPoints] = useState<StingPoint[]>([]);
    const [protocols, setProtocols] = useState<Protocol[]>([]);
    const [isHydrating, setIsHydrating] = useState(true);

    const [postTreatmentVitals, setPostTreatmentVitals] = useState<Partial<VitalSigns>>({});
    const [finalVitals, setFinalVitals] = useState<Partial<VitalSigns>>({});
    const [finalNotes, setFinalNotes] = useState('');

    useEffect(() => {
        const hydrateData = async () => {
            setIsHydrating(true);
            try {
                // Fetch points
                const pointDocs = await Promise.all(
                    stungPointIds.map(id => getDoc(doc(db, 'cfg_acupuncture_points', id)))
                );
                const loadedPoints = pointDocs
                    .filter(d => d.exists())
                    .map(d => ({ ...d.data(), id: d.id } as StingPoint));

                // Fetch protocols
                const protocolDocs = await Promise.all(
                    protocolIds.map(id => getDoc(doc(db, 'cfg_protocols', id)))
                );
                const loadedProtocols = protocolDocs
                    .filter(d => d.exists())
                    .map(d => ({ ...d.data(), id: d.id } as Protocol));

                setPoints(loadedPoints);
                setProtocols(loadedProtocols);
            } catch (err) {
                console.error('PostStingScreen: hydration error', err);
            } finally {
                setIsHydrating(false);
            }
        };

        hydrateData();
    }, [stungPointIds, protocolIds]);

    const handleFinish = () => {
        onFinish({
            postTreatmentVitals: postTreatmentVitals,
            finalVitals: finalVitals,
            finalNotes: finalNotes
        });
    };

    if (isHydrating) {
        return (
            <div className={styles.centeredMsg} dir={direction}>
                <Loader className={styles.spinner} size={32} />
                <p><T>Loading treatment summary...</T></p>
            </div>
        );
    }

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.header}>
                <button onClick={onBack} className={styles.backButton}>
                    <ChevronLeft size={24} />
                </button>
                <h2 className={styles.headerTitle}>{tPostStingTitle}</h2>
            </div>

            <div className={styles.grid}>
                <div className={styles.leftCol}>
                    <div className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            <List size={20} />
                            <T>Protocols Used</T>
                        </h3>
                        {protocols.length === 0 ? (
                            <p><T>No specific protocols used (Free selection)</T></p>
                        ) : (
                            <div className={styles.list}>
                                {protocols.map(p => (
                                    <div key={p.id} className={styles.listItem}>
                                        <span className={styles.pointLabel}>{getMLValue(p.name, language)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={styles.section} style={{ marginTop: '1rem' }}>
                        <h3 className={styles.sectionTitle}>
                            <ClipboardList size={20} />
                            <T>Treated Points</T> ({points.length})
                        </h3>
                        <div className={styles.list}>
                            {points.map(p => (
                                <div key={p.id} className={styles.listItem}>
                                    <span className={styles.pointCode}>{p.code}</span>
                                    <span className={styles.pointLabel}>{getMLValue(p.label, language)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={styles.rightCol}>
                    <div className={styles.section}>
                        <VitalsInputGroup
                            title="Post-Stinging Measures (Optional)"
                            vitals={postTreatmentVitals}
                            onVitalsChange={setPostTreatmentVitals}
                        />

                        <VitalsInputGroup
                            title="Stinger Removal Measures (Optional)"
                            vitals={finalVitals}
                            onVitalsChange={setFinalVitals}
                        />

                        <h3 className={styles.sectionTitle} style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                            <T>Final Notes</T>
                        </h3>
                        <textarea
                            className={styles.textArea}
                            value={finalNotes}
                            onChange={(e) => setFinalNotes(e.target.value)}
                            placeholder={tNotesPlaceholder}
                        />
                    </div>
                </div>
            </div>

            <div className={styles.actionRow}>
                <button className={styles.btnPrimary} onClick={handleFinish}>
                    <CheckCircle size={18} />
                    {tFinishTreatment}
                </button>
            </div>
        </div>
    );
};

export default PostStingScreen;
