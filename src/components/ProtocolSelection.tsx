import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData } from '../types/patient';
import { Protocol } from '../types/protocol';
import { ChevronLeft, BrainCircuit, List, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ProtocolSelection.module.css';

interface ProtocolSelectionProps {
    patient: PatientData;
    onBack: () => void;
    onProtocolSelect: (protocol: Protocol) => void;
    treatmentNotes: { report: string; bloodPressure: string; heartRate: string };
    setTreatmentNotes: (notes: { report: string; bloodPressure: string; heartRate: string }) => void;
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({ patient, onBack, onProtocolSelect, treatmentNotes, setTreatmentNotes }) => {
    const { t, i18n } = useTranslation();
    const direction = i18n.dir();

    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [proposedProtocols, setProposedProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isFinding, setIsFinding] = useState<boolean>(false);
    const [showFullList, setShowFullList] = useState(false);

    const isFormValid = treatmentNotes.report.trim() !== '' && treatmentNotes.bloodPressure.trim() !== '' && treatmentNotes.heartRate.trim() !== '';

    useEffect(() => {
        const fetchProtocols = async () => {
            setIsLoading(true);
            const protocolSnapshot = await getDocs(collection(db, 'protocols'));
            const protocolsData = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol));
            setAllProtocols(protocolsData);
            setIsLoading(false);
        };
        fetchProtocols();
    }, []);

    const handleFindProtocol = async () => {
        if (!isFormValid) return;
        setIsFinding(true);
        setShowFullList(false);
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockProposals = allProtocols.slice(0, 2);
        setProposedProtocols(mockProposals);
        setIsFinding(false);
    };

    const BackIcon = direction === 'rtl' ? ChevronRight : ChevronLeft;

    return (
        <div className={styles.container} dir={direction}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>{t('start_new_treatment')}</h2>
                    <p className={styles.patientName}>{t('for_patient')}: {patient.fullName}</p>
                </div>
                <button onClick={onBack} className={styles.backButton}>
                    <BackIcon size={16} />
                    {t('back_to_dashboard')}
                </button>
            </div>

            <div className={styles.formContainer}>
                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="patientReport">
                        {t('patient_report')} <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <textarea id="patientReport" value={treatmentNotes.report} onChange={(e) => setTreatmentNotes({ ...treatmentNotes, report: e.target.value })} className={styles.textarea} rows={5} placeholder={t('patient_report_placeholder')}></textarea>
                </div>

                <div className={styles.inputGrid}>
                    <div>
                        <label className={styles.label} htmlFor="bloodPressure">
                            {t('blood_pressure')} <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="bloodPressure" type="text" value={treatmentNotes.bloodPressure} onChange={(e) => setTreatmentNotes({ ...treatmentNotes, bloodPressure: e.target.value })} className={styles.input} placeholder={t('blood_pressure_placeholder')} />
                    </div>
                    <div>
                        <label className={styles.label} htmlFor="heartRate">
                            {t('heart_rate')} <span className={styles.requiredAsterisk}>*</span>
                        </label>
                        <input id="heartRate" type="text" value={treatmentNotes.heartRate} onChange={(e) => setTreatmentNotes({ ...treatmentNotes, heartRate: e.target.value })} className={styles.input} placeholder={t('heart_rate_placeholder')} />
                    </div>
                </div>

                <div className={styles.buttonContainer}>
                    <button onClick={handleFindProtocol} disabled={!isFormValid || isFinding} className={styles.findButton}>
                        {isFinding ? (
                            <>{t('finding_protocols')}</>
                        ) : (
                            <><BrainCircuit size={16} /> {t('find_suggested_protocols')}</>
                        )}
                    </button>
                </div>

                {isFinding && (
                     <div className={styles.loadingMessage}>Analyzing report and finding best protocols...</div>
                )}
                
                {proposedProtocols.length > 0 && (
                    <div className={styles.suggestionsContainer}>
                        <h3 className={styles.suggestionsHeader}>{t('ai_suggested_protocols')}</h3>
                        <div className={styles.protocolList}>
                            {proposedProtocols.map(p => (
                                <div key={p.id} onClick={() => onProtocolSelect(p)} className={styles.protocolItem}>
                                    <h4 className={styles.protocolName}>{p.name}</h4>
                                    <p className={styles.protocolDescription}>{p.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className={styles.dividerContainer}>
                    <div className={styles.divider}></div>
                    <span className={styles.dividerText}>{t('or')}</span>
                    <div className={styles.divider}></div>
                </div>

                <div className={styles.fullListButtonContainer}>
                     <button onClick={() => setShowFullList(!showFullList)} disabled={allProtocols.length === 0 && !isLoading} className={styles.fullListButton}>
                        <List size={16} /> {showFullList ? t('hide_full_list') : t('select_from_full_list')}
                    </button>
                </div>

                {showFullList && (
                     <div className={styles.fullProtocolsContainer}>
                        <h3 className={styles.allProtocolsHeader}>{t('all_protocols')}</h3>
                        {isLoading ? (
                            <div className={styles.loadingMessage}>Loading protocols...</div>
                        ) : allProtocols.length === 0 ? (
                             <div className={styles.loadingMessage}>No protocols found. Please add protocols in the admin section.</div>
                        ) : (
                            <div className={styles.fullProtocolGrid}>
                            {allProtocols.map(p => (
                                    <div key={p.id} onClick={() => onProtocolSelect(p)} className={styles.fullProtocolItem}>
                                        <h4 className={styles.protocolName}>{p.name}</h4>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProtocolSelection;
