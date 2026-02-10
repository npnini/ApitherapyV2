
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData } from '../types/patient';
import { Protocol } from '../types/protocol';
import { VitalSigns } from '../types/treatmentSession';
import { ChevronLeft, BrainCircuit, List, ChevronRight, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ProtocolSelection.module.css';
import ConfirmationModal from './ConfirmationModal';

// This sub-component was the source of the persistent system confirmation dialog.
// It has been rewritten to use the custom ConfirmationModal component.
interface VitalSignsInputProps {
    label: string;
    value: number | '';
    onChange: (value: number | '') => void;
    min: number;
    max: number;
    placeholder: string;
}

const VitalSignsInput: React.FC<VitalSignsInputProps> = ({ label, value, onChange, min, max, placeholder }) => {
    const { t } = useTranslation();
    
    // State to manage whether the input currently holds an out-of-range value that has been approved.
    const [isWarningActive, setIsWarningActive] = useState(false);
    // State to control the visibility of the confirmation modal.
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Handles user input as they type.
    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // When the user starts typing, we clear any existing warning state.
        setIsWarningActive(false);
        const val = e.target.value;
        onChange(val === '' ? '' : Number(val));
    };

    // This function is triggered when the input field loses focus.
    const handleBlur = () => {
        const numericValue = Number(value);
        if (value === '' || isNaN(numericValue)) {
            setIsWarningActive(false); // No value means no warning.
            return;
        }

        // The window.confirm call has been permanently removed and replaced with this modal logic.
        if (numericValue < min || numericValue > max) {
            // If the value is out of the specified range, open the custom modal.
            setIsModalOpen(true);
        } else {
            // If the value is within range, ensure no warning is shown.
            setIsWarningActive(false);
        }
    };
    
    // This function is triggered when a key is pressed in the input field.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            // Blurring the input triggers the onBlur event.
            e.currentTarget.blur();
        }
    };

    // Called when the user clicks "Confirm" in the modal.
    const handleConfirm = () => {
        // The user has approved the out-of-range value.
        // We activate the warning indicator and close the modal.
        setIsWarningActive(true);
        setIsModalOpen(false);
    };

    // Called when the user clicks "Cancel" in the modal.
    const handleCancel = () => {
        // The user has rejected the out-of-range value, so we clear the input.
        onChange('');
        setIsWarningActive(false);
        setIsModalOpen(false);
    };

    return (
        <div>
            <ConfirmationModal
                isOpen={isModalOpen}
                title={t('value_out_of_range')}
                message={t('approve_out_of_range')}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
            <label className={styles.label} htmlFor={label}>
                {label} <span className={styles.requiredAsterisk}>*</span>
            </label>
            <input
                id={label}
                type="number"
                value={value}
                onChange={handleValueChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`${styles.input} ${isWarningActive ? styles.inputWarning : ''}`}
                placeholder={placeholder}
            />
            {isWarningActive && (
                <div className={styles.warningText}>
                    <AlertTriangle size={14} className="inline-block mr-1" />
                    {t('value_out_of_range')}
                </div>
            )}
        </div>
    );
};


interface ProtocolSelectionProps {
    patient: PatientData;
    onBack: () => void;
    onProtocolSelect: (protocol: Protocol, patientReport: string, preStingVitals: VitalSigns) => void;
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({ patient, onBack, onProtocolSelect }) => {
    const { t, i18n } = useTranslation();
    const direction = i18n.dir();

    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [proposedProtocols, setProposedProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isFinding, setIsFinding] = useState<boolean>(false);
    const [showFullList, setShowFullList] = useState(false);

    const [patientReport, setPatientReport] = useState('');
    const [preStingVitals, setPreStingVitals] = useState<Partial<VitalSigns>>({});


    const isFormValid =
        patientReport.trim() !== '' &&
        preStingVitals.systolic !== undefined &&
        preStingVitals.diastolic !== undefined &&
        preStingVitals.heartRate !== undefined;

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

    const handleProtocolSelect = (protocol: Protocol) => {
        if (isFormValid) {
            onProtocolSelect(protocol, patientReport, preStingVitals as VitalSigns);
        } else {
            // This can be replaced with a more user-friendly notification
            alert("Please fill all required fields before selecting a protocol.");
        }
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
                    <textarea id="patientReport" value={patientReport} onChange={(e) => setPatientReport(e.target.value)} className={styles.textarea} rows={5} placeholder={t('patient_report_placeholder')}></textarea>
                </div>

                <h3 className={styles.vitalsHeader}>{t('pre_stinging_measures')}</h3>
                <div className={styles.inputGrid}>
                    <VitalSignsInput
                        label={t('systolic')}
                        value={preStingVitals.systolic ?? ''}
                        onChange={(val) => setPreStingVitals(v => ({ ...v, systolic: val === '' ? undefined : Number(val) }))}
                        min={90}
                        max={140}
                        placeholder={t('systolic_placeholder')}
                    />
                    <VitalSignsInput
                        label={t('diastolic')}
                        value={preStingVitals.diastolic ?? ''}
                        onChange={(val) => setPreStingVitals(v => ({ ...v, diastolic: val === '' ? undefined : Number(val) }))}
                        min={60}
                        max={90}
                        placeholder={t('diastolic_placeholder')}
                    />
                    <VitalSignsInput
                        label={t('heart_rate')}
                        value={preStingVitals.heartRate ?? ''}
                        onChange={(val) => setPreStingVitals(v => ({ ...v, heartRate: val === '' ? undefined : Number(val) }))}
                        min={40}
                        max={100}
                        placeholder={t('heart_rate_placeholder')}
                    />
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
                                <div key={p.id} onClick={() => handleProtocolSelect(p)} className={styles.protocolItem}>
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
                            <div className={styles.protocolList}>
                            {allProtocols.map(p => (
                                    <div key={p.id} onClick={() => handleProtocolSelect(p)} className={styles.protocolItem}>
                                        <h4 className={styles.protocolName}>{p.name}</h4>
                                        <p className={styles.protocolDescription}>{p.description}</p>
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
