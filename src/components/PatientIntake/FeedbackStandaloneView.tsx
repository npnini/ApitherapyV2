import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader, CheckCircle, AlertTriangle, Activity, Info } from 'lucide-react';
import styles from './FeedbackStandaloneView.module.css';
import TreatmentSummary from './TreatmentSummary';
import { TreatmentSession } from '../../types/treatmentSession';

interface MeasureDef {
    id: string;
    name: any;
    description: any;
    min: number;
    max: number;
    improvementDirection: 'UP' | 'DOWN';
}

interface FeedbackSession {
    treatmentId: string;
    patientId: string;
    status: 'pending' | 'completed' | 'expired';
    language: string;
    measures: MeasureDef[];
    responses?: Record<string, any>;
    feedbackText?: string;
}

const getMLValue = (value: any, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || Object.values(value)[0] || '';
    return '';
};

// Simple translations dictionary for this standalone view, defaulting to Hebrew or falling back to English.
const translations: Record<string, Record<string, string>> = {
    'Loading...': {
        'en': 'Loading...',
        'he': 'טוען...'
    },
    'Invalid or expired link.': {
        'en': 'This feedback link is invalid or has expired.',
        'he': 'קישור זה אינו חוקי או שפג תוקפו.'
    },
    'Thank you! Your feedback has been recorded.': {
        'en': 'Thank you! Your feedback has been recorded.',
        'he': 'תודה רבה! המשוב שלך נקלט בהצלחה.'
    },
    'Post-Treatment Feedback': {
        'en': 'Post-Treatment Feedback',
        'he': 'משוב לאחר הטיפול'
    },
    'Please tell us how you feel today.': {
        'en': 'Please tell us how you feel today following your recent treatment.',
        'he': 'אנא ספר/י לנו איך את/ה מרגיש/ה היום בעקבות הטיפול האחרון שלך.'
    },
    'General Comments': {
        'en': 'General Comments',
        'he': 'הערות כלליות'
    },
    'Enter your feedback here...': {
        'en': 'Enter your feedback here...',
        'he': 'הזן/הזיני את המשוב שלך כאן...'
    },
    'Submit Feedback': {
        'en': 'Submit Feedback',
        'he': 'שלח משוב'
    },
    'Failed to submit feedback. Please try again.': {
        'en': 'Failed to submit feedback. Please try again.',
        'he': 'שליחת המשוב נכשלה. אנא נסה/י שוב.'
    },
    'Notice': {
        'en': 'Notice',
        'he': 'הודעה'
    },
    'Invalid link.': {
        'en': 'Invalid link.',
        'he': 'קישור לא תקין.'
    },
    'You have already submitted feedback for this treatment.': {
        'en': 'You have already submitted feedback for this treatment.',
        'he': 'כבר שלחת משוב עבור טיפול זה.'
    },
};

const FeedbackStandaloneView: React.FC<{ sessionId: string }> = ({ sessionId }) => {
    const [session, setSession] = useState<FeedbackSession | null>(null);
    const [treatment, setTreatment] = useState<TreatmentSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [feedbackText, setFeedbackText] = useState('');
    const [measureValues, setMeasureValues] = useState<Record<string, string | number>>({});

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const docRef = doc(db, 'feedback_sessions', sessionId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const sessionData = docSnap.data() as FeedbackSession;
                    setSession(sessionData);

                    // Fetch treatment details
                    if (sessionData.treatmentId) {
                        const treatmentSnap = await getDoc(doc(db, 'treatments', sessionData.treatmentId));
                        if (treatmentSnap.exists()) {
                            setTreatment({ ...treatmentSnap.data(), id: treatmentSnap.id } as TreatmentSession);
                        }
                    }
                } else {
                    setError('Invalid or expired link.');
                }
            } catch (err) {
                console.error("Error fetching session:", err);
                setError('Invalid or expired link.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchSession();
    }, [sessionId]);

    const handleMeasureChange = (measureId: string, value: string | number) => {
        setMeasureValues(prev => ({ ...prev, [measureId]: value }));
    };

    const handleSave = async () => {
        if (!session || isSaving || !isFormValid) return;
        setIsSaving(true);
        setError(null);

        try {
            const docRef = doc(db, 'feedback_sessions', sessionId);
            // Notice: The trigger expects exact structure.
            // and the firestore rules only allow specific keys: ['responses', 'status', 'completedAt', 'feedbackText']
            await updateDoc(docRef, {
                status: 'completed',
                responses: measureValues,
                feedbackText: feedbackText,
                completedAt: serverTimestamp()
            });

            setSession({ ...session, status: 'completed' });
        } catch (err) {
            console.error("Error updating session:", err);
            setError('Failed to submit feedback. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const lang = session?.language || 'he';
    const isRtl = lang === 'he' || lang === 'ar';
    const t = (key: string) => translations[key]?.[lang] || translations[key]?.['en'] || key;

    if (isLoading) {
        return (
            <div className={styles.loadingContainer}>
                <Loader size={48} className={styles.spinner} />
                <p>{t('Loading...')}</p>
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className={styles.cardContainer} dir={isRtl ? 'rtl' : 'ltr'}>
                <div className={styles.card}>
                    <AlertTriangle size={48} className={styles.errorIcon} />
                    <h2 className={styles.title}>{t('Notice')}</h2>
                    <p className={styles.message}>{error ? t(error) : t('Invalid link.')}</p>
                </div>
            </div>
        );
    }

    if (session.status === 'completed') {
        return (
            <div className={styles.cardContainer} dir={isRtl ? 'rtl' : 'ltr'}>
                <div className={styles.card}>
                    <CheckCircle size={64} className={styles.successIcon} />
                    <h2 className={styles.title}>{t('Thank you! Your feedback has been recorded.')}</h2>
                </div>
            </div>
        );
    }

    const measures = session.measures || [];
    const isFormValid = measures.every(m => measureValues[m.id] !== undefined && measureValues[m.id] !== '');

    return (
        <div className={styles.cardContainer} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className={styles.grid}>
                <div className={styles.leftPane}>
                    <div className={styles.header}>
                        <Info size={24} className={styles.headerIcon} />
                        <h2 className={styles.title}>{t('Treatment Summary')}</h2>
                    </div>
                    {treatment ? (
                        <TreatmentSummary 
                            treatment={treatment} 
                            language={lang} 
                            direction={isRtl ? 'rtl' : 'ltr'} 
                        />
                    ) : (
                        <p>{t('Loading summary...')}</p>
                    )}
                </div>

                <div className={styles.rightPane}>
                    <div className={styles.card}>
                        <div className={styles.header}>
                            <Activity size={32} className={styles.headerIcon} />
                            <h1 className={styles.title}>{t('Post-Treatment Feedback')}</h1>
                        </div>

                        <p className={styles.subtitle}>{t('Please tell us how you feel today.')}</p>

                        <div className={styles.formContainer}>
                            <div className={styles.measuresGrid}>
                                {measures.map(measure => {
                                    const value = measureValues[measure.id] ?? '';
                                    return (
                                        <div key={measure.id} className={styles.measureItem}>
                                            <div className={styles.measureHeader}>
                                                <span className={styles.measureName}>{getMLValue(measure.name, lang)}</span>
                                                <span className={styles.measureDesc}>{getMLValue(measure.description, lang)}</span>
                                            </div>
                                            <input
                                                type="number"
                                                className={styles.measureInput}
                                                value={value}
                                                min={measure.min}
                                                max={measure.max}
                                                placeholder={`${measure.min ?? 0} – ${measure.max ?? 10}`}
                                                onChange={e => handleMeasureChange(measure.id, e.target.value === '' ? '' : Number(e.target.value))}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className={styles.section}>
                                <h4 className={styles.sectionTitle}>{t('General Comments')}</h4>
                                <textarea
                                    className={styles.textarea}
                                    value={feedbackText}
                                    onChange={e => setFeedbackText(e.target.value)}
                                    placeholder={t('Enter your feedback here...')}
                                    rows={4}
                                />
                            </div>

                            {error && (
                                <div className={styles.errorMessage}>
                                    <AlertTriangle size={16} /> {t(error)}
                                </div>
                            )}

                            <button
                                className={styles.submitBtn}
                                onClick={handleSave}
                                disabled={!isFormValid || isSaving}
                            >
                                {isSaving ? <Loader size={20} className={styles.spinner} /> : <CheckCircle size={20} />}
                                {t('Submit Feedback')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FeedbackStandaloneView;
