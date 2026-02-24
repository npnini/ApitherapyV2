import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { db } from '../firebase';
import { PatientData } from '../types/patient';
import { Protocol } from '../types/protocol';
import { VitalSigns } from '../types/treatmentSession';
import { ChevronLeft, BrainCircuit, List, ChevronRight, AlertTriangle } from 'lucide-react';
import styles from './ProtocolSelection.module.css';
import ConfirmationModal from './ConfirmationModal';
import { T, useT, useTranslationContext } from './T';

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
    const [isWarningActive, setIsWarningActive] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsWarningActive(false);
        const val = e.target.value;
        onChange(val === '' ? '' : Number(val));
    };

    const handleBlur = () => {
        const numericValue = Number(value);
        if (value === '' || isNaN(numericValue) || numericValue === 0) {
            setIsWarningActive(false);
            return;
        }

        if (numericValue < min || numericValue > max) {
            setIsModalOpen(true);
        } else {
            setIsWarningActive(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const handleConfirm = () => {
        setIsWarningActive(true);
        setIsModalOpen(false);
    };

    const handleCancel = () => {
        onChange('');
        setIsWarningActive(false);
        setIsModalOpen(false);
    };

    const modalTitle = useT('Value out of range');
    const modalMessage = useT('This value is outside the typical range. Do you want to approve it?');
    const warningText = useT('Value out of range');

    return (
        <div>
            <ConfirmationModal
                isOpen={isModalOpen}
                title={modalTitle}
                message={modalMessage}
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
                    {warningText}
                </div>
            )}
        </div>
    );
};


interface ProtocolSelectionProps {
    patient: PatientData;
    onBack: () => void;
    onProtocolSelect: (protocol: Protocol, patientReport: string, preStingVitals: VitalSigns) => void;
    isModal?: boolean;
}

const ProtocolSelection: React.FC<ProtocolSelectionProps> = ({ patient, onBack, onProtocolSelect, isModal }) => {
    const { language, registerString } = useTranslationContext();
    const isRtl = language === 'he';

    const [user, setUser] = useState<User | null>(null);
    const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
    const [proposedProtocols, setProposedProtocols] = useState<Protocol[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true); // Start with loading true
    const [isFinding, setIsFinding] = useState<boolean>(false);
    const [showFullList, setShowFullList] = useState(false);
    const [isValidationModalOpen, setValidationModalOpen] = useState(false);

    const [patientReport, setPatientReport] = useState('');
    const [preStingVitals, setPreStingVitals] = useState<Partial<VitalSigns>>({});

    const isFormValid =
        patientReport.trim() !== '' &&
        preStingVitals.systolic !== undefined &&
        preStingVitals.diastolic !== undefined &&
        preStingVitals.heartRate !== undefined;

    // String Registry
    const stringsToRegister = useMemo(() => [
        'Value out of range',
        'This value is outside the typical range. Do you want to approve it?',
        'Missing Information',
        'Please fill in all required fields before proceeding.',
        'Patient Report',
        'Enter patient feedback or symptoms...',
        'Systolic',
        'Enter systolic BP',
        'Diastolic',
        'Enter diastolic BP',
        'Heart Rate',
        'Enter heart rate',
        'Finding protocols...',
        'Start New Treatment',
        'For patient',
        'Back to Dashboard',
        'Patient report',
        'Patient report description',
        'Pre-stinging Measures',
        'Find Suggested Protocols',
        'AI Suggested Protocols',
        'Analyzing report and finding best protocols...',
        'or',
        'Hide Full List',
        'Select from Full List',
        'All Protocols',
        'No protocols found. Please add protocols in the admin section.',
        'Loading protocols...'
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [registerString, stringsToRegister]);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const fetchProtocols = async () => {
            if (!user) {
                // If there is no user, do not fetch. We can also clear old data.
                setAllProtocols([]);
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const protocolSnapshot = await getDocs(collection(db, 'protocols'));
                const protocolsData = protocolSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Protocol));
                setAllProtocols(protocolsData);
            } catch (error) {
                console.error("Error fetching protocols: ", error); // Log error for debugging
                // Optionally set an error state to show a message to the user
            }
            setIsLoading(false);
        };
        fetchProtocols();
    }, [user]); // This effect depends on the user state

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
            setValidationModalOpen(true);
        }
    };

    const BackIcon = isRtl ? ChevronRight : ChevronLeft;

    const validationModalTitle = useT('Missing Information');
    const validationModalMessage = useT('Please fill in all required fields before proceeding.');
    const patientReportPlaceholder = useT('Enter patient feedback or symptoms...');
    const systolicPlaceholder = useT('Enter systolic BP');
    const diastolicPlaceholder = useT('Enter diastolic BP');
    const heartRatePlaceholder = useT('Enter heart rate');

    return (
        <div className={styles.container}>
            <ConfirmationModal
                isOpen={isValidationModalOpen}
                title={validationModalTitle}
                message={validationModalMessage}
                onConfirm={() => setValidationModalOpen(false)}
                showCancelButton={false}
            />

            {!isModal && (
                <div className={styles.header}>
                    <button onClick={onBack} className={styles.backButton}>
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className={styles.title}>
                        <T>{`Start Treatment for ${patient.fullName}`}</T>
                    </h1>
                </div>
            )}

            <div className={styles.formContainer}>
                <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="patientReport">
                        <T>Patient report</T> <span className={styles.requiredAsterisk}>*</span>
                    </label>
                    <textarea id="patientReport" value={patientReport} onChange={(e) => setPatientReport(e.target.value)} className={styles.textarea} rows={5} placeholder={patientReportPlaceholder}></textarea>
                </div>

                <h3 className={styles.vitalsHeader}><T>Pre-stinging Measures</T></h3>
                <div className={styles.inputGrid}>
                    <VitalSignsInput
                        label={useT('Systolic')}
                        value={preStingVitals.systolic ?? ''}
                        onChange={(val) => setPreStingVitals(v => ({ ...v, systolic: val === '' ? undefined : Number(val) }))}
                        min={90}
                        max={140}
                        placeholder={systolicPlaceholder}
                    />
                    <VitalSignsInput
                        label={useT('Diastolic')}
                        value={preStingVitals.diastolic ?? ''}
                        onChange={(val) => setPreStingVitals(v => ({ ...v, diastolic: val === '' ? undefined : Number(val) }))}
                        min={60}
                        max={90}
                        placeholder={diastolicPlaceholder}
                    />
                    <VitalSignsInput
                        label={useT('Heart Rate')}
                        value={preStingVitals.heartRate ?? ''}
                        onChange={(val) => setPreStingVitals(v => ({ ...v, heartRate: val === '' ? undefined : Number(val) }))}
                        min={40}
                        max={100}
                        placeholder={heartRatePlaceholder}
                    />
                </div>

                <div className={styles.buttonContainer}>
                    <button onClick={handleFindProtocol} disabled={!isFormValid || isFinding} className={styles.findButton}>
                        {isFinding ? (
                            <><T>Finding protocols...</T></>
                        ) : (
                            <><BrainCircuit size={16} /> <T>Find Suggested Protocols</T></>
                        )}
                    </button>
                </div>

                {isFinding && (
                    <div className={styles.loadingMessage}><T>Analyzing report and finding best protocols...</T></div>
                )}

                {proposedProtocols.length > 0 && (
                    <div className={styles.suggestionsContainer}>
                        <h3 className={styles.suggestionsHeader}><T>AI Suggested Protocols</T></h3>
                        <div className={styles.protocolList}>
                            {proposedProtocols.map(p => (
                                <div key={p.id} onClick={() => handleProtocolSelect(p)} className={styles.protocolItem}>
                                    <h4 className={styles.protocolName}>
                                        {(typeof p.name === 'object' ? (p.name[language] || (p.name as any)['en'] || Object.values(p.name)[0]) : p.name) as string}
                                    </h4>
                                    <p className={styles.protocolDescription}>
                                        {(typeof p.description === 'object' ? (p.description[language] || (p.description as any)['en'] || Object.values(p.description)[0]) : p.description) as string}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className={styles.dividerContainer}>
                    <div className={styles.divider}></div>
                    <span className={styles.dividerText}><T>or</T></span>
                    <div className={styles.divider}></div>
                </div>

                <div className={styles.fullListButtonContainer}>
                    <button onClick={() => setShowFullList(!showFullList)} disabled={allProtocols.length === 0 && !isLoading} className={styles.fullListButton}>
                        <List size={16} /> {showFullList ? <T>Hide Full List</T> : <T>Select from Full List</T>}
                    </button>
                </div>

                {showFullList && (
                    <div className={styles.fullProtocolsContainer}>
                        <h3 className={styles.allProtocolsHeader}><T>All Protocols</T></h3>
                        {isLoading ? (
                            <div className={styles.loadingMessage}><T>Loading protocols...</T></div>
                        ) : allProtocols.length === 0 ? (
                            <div className={styles.loadingMessage}><T>No protocols found. Please add protocols in the admin section.</T></div>
                        ) : (
                            <div className={styles.protocolList}>
                                {allProtocols.map(p => (
                                    <div key={p.id} onClick={() => handleProtocolSelect(p)} className={styles.protocolItem}>
                                        <h4 className={styles.protocolName}>
                                            {(typeof p.name === 'object' ? (p.name[language] || (p.name as any)['en'] || Object.values(p.name)[0]) : p.name) as string}
                                        </h4>
                                        <p className={styles.protocolDescription}>
                                            {(typeof p.description === 'object' ? (p.description[language] || (p.description as any)['en'] || Object.values(p.description)[0]) : p.description) as string}
                                        </p>
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
