import React, { useState, useEffect } from 'react';
import { T, useT, useTranslationContext } from './T';
import { VitalSigns } from '../types/treatmentSession';
import { AlertCircle } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';
import styles from './VitalsInputGroup.module.css';

interface VitalsInputGroupProps {
    title: string;
    vitals: Partial<VitalSigns>;
    onVitalsChange: (vitals: Partial<VitalSigns>) => void;
}

// Defines the fields that are numeric vital signs.
type VitalField = keyof Omit<VitalSigns, 'outOfRange'>;

const VitalsInputGroup: React.FC<VitalsInputGroupProps> = ({ title, vitals, onVitalsChange }) => {
    const { language, direction } = useTranslationContext();
    const tOutOfRange = useT('Value out of range');
    const tHeartRate = useT('Heart Rate');
    const tSystolic = useT('Systolic');
    const tDiastolic = useT('Diastolic');
    const tEg120 = useT('e.g., 120');
    const tEg80 = useT('e.g., 80');
    const tEg70 = useT('e.g., 70');
    const tApproveAnyway = useT('The value entered is outside the normal range. Do you want to approve it anyway?');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [pendingChange, setPendingChange] = useState<{ field: VitalField; value: number } | null>(null);
    const [localVitals, setLocalVitals] = useState(vitals);

    useEffect(() => {
        setLocalVitals(vitals);
    }, [vitals]);

    const isValueOutOfRange = (field: VitalField, value: number) => {
        switch (field) {
            case 'systolic': return value < 90 || value > 140;
            case 'diastolic': return value < 60 || value > 90;
            case 'heartRate': return value < 40 || value > 100;
            default: return false;
        }
    };

    const handleChange = (field: VitalField, valueStr: string) => {
        const cleanValueStr = valueStr.replace(/\D/g, '');
        const value = cleanValueStr ? parseInt(cleanValueStr, 10) : undefined;

        console.log(`VitalsInputGroup[${title}] update ${field}:`, value);
        setLocalVitals(current => ({ ...current, [field]: value }));

        const updatedVitals = { ...vitals, [field]: value };
        const otherFields: VitalField[] = ['systolic', 'diastolic', 'heartRate'];
        const isAnyOutOfRange = otherFields.some(f => {
            const val = f === field ? value : vitals[f];
            return val !== undefined && isValueOutOfRange(f, val);
        });

        onVitalsChange({ ...updatedVitals, outOfRange: isAnyOutOfRange });
    };

    const handleBlur = (field: VitalField) => {
        const value = localVitals[field];

        if (value === undefined || isNaN(value)) {
            const otherFields: VitalField[] = ['systolic', 'diastolic', 'heartRate'];
            const isAnyOtherValueOutOfRange = otherFields
                .filter(f => f !== field)
                .some(f => vitals[f] !== undefined && isValueOutOfRange(f, vitals[f]!));
            onVitalsChange({ ...vitals, [field]: undefined, outOfRange: isAnyOtherValueOutOfRange });
            return;
        }

        if (isValueOutOfRange(field, value)) {
            setPendingChange({ field, value });
            setIsModalOpen(true);
        } else {
            const otherFields: VitalField[] = ['systolic', 'diastolic', 'heartRate'];
            const isAnyOtherValueOutOfRange = otherFields
                .filter(f => f !== field)
                .some(f => vitals[f] !== undefined && isValueOutOfRange(f, vitals[f]!));
            onVitalsChange({ ...vitals, [field]: value, outOfRange: isAnyOtherValueOutOfRange });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
    };

    const handleConfirmOutOfRange = () => {
        if (pendingChange) {
            onVitalsChange({ ...vitals, [pendingChange.field]: pendingChange.value, outOfRange: true });
        }
        setIsModalOpen(false);
        setPendingChange(null);
    };

    const handleCancelOutOfRange = () => {
        setLocalVitals(vitals);
        setIsModalOpen(false);
        setPendingChange(null);
    };

    const renderInput = (field: VitalField, placeholder: string) => {
        const value = localVitals[field];
        const isCurrentValueOutOfRange = value !== undefined && isValueOutOfRange(field, value);
        const isConfirmedProblematic = vitals.outOfRange && isCurrentValueOutOfRange;
        const fieldLabel = field === 'heartRate' ? tHeartRate : field === 'systolic' ? tSystolic : tDiastolic;

        return (
            <div className={styles.fieldWrapper}>
                <input
                    type="number"
                    value={value === undefined ? '' : String(value)}
                    onChange={(e) => handleChange(field, e.target.value)}
                    onBlur={() => handleBlur(field)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`${styles.input} ${isCurrentValueOutOfRange && !isConfirmedProblematic ? styles.inputWarning : ''}`}
                />
                {isCurrentValueOutOfRange && !isConfirmedProblematic && (
                    <span className={styles.warningIcon} title={tOutOfRange}>
                        <AlertCircle size={16} />
                    </span>
                )}
                <label className={styles.label}>
                    {fieldLabel} <span className={styles.requiredStar}>*</span>
                </label>
                {isConfirmedProblematic && (
                    <p className={styles.warningText}>{tOutOfRange}</p>
                )}
            </div>
        );
    };

    return (
        <div className={styles.container}>
            <ConfirmationModal
                isOpen={isModalOpen}
                title={tOutOfRange}
                message={tApproveAnyway}
                onConfirm={handleConfirmOutOfRange}
                onCancel={handleCancelOutOfRange}
            />
            <h3 className={styles.title}><T>{title}</T></h3>
            <div className={styles.grid}>
                {renderInput('systolic', tEg120)}
                {renderInput('diastolic', tEg80)}
                {renderInput('heartRate', tEg70)}
            </div>
        </div>
    );
};

export default VitalsInputGroup;
