
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { VitalSigns } from '../types/treatmentSession';
import { AlertCircle } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

interface VitalsInputGroupProps {
    title: string;
    vitals: Partial<VitalSigns>;
    onVitalsChange: (vitals: Partial<VitalSigns>) => void;
}

// Defines the fields that are numeric vital signs.
type VitalField = keyof Omit<VitalSigns, 'outOfRange'>;

const VitalsInputGroup: React.FC<VitalsInputGroupProps> = ({ title, vitals, onVitalsChange }) => {
    const { t } = useTranslation();

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
        const value = valueStr ? parseInt(valueStr, 10) : undefined;
        setLocalVitals(current => ({ ...current, [field]: value }));
    };

    const handleBlur = (field: VitalField) => {
        const value = localVitals[field];

        if (value === undefined || isNaN(value)) {
            // Check if any other values are still out of range before setting the flag to false.
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
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const handleConfirmOutOfRange = () => {
        if (pendingChange) {
            onVitalsChange({
                ...vitals,
                [pendingChange.field]: pendingChange.value,
                outOfRange: true,
            });
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
        
        // The field is considered problematic if the user has confirmed an out-of-range value for it.
        const isConfirmedProblematic = vitals.outOfRange && isCurrentValueOutOfRange;

        return (
            <div className="text-center">
                <div className="relative w-full">
                    <input
                        type="number"
                        value={value === undefined ? '' : String(value)}
                        onChange={(e) => handleChange(field, e.target.value)}
                        onBlur={() => handleBlur(field)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        className={`w-full p-3 bg-slate-100 border-2 rounded-lg text-lg text-center font-bold transition-colors duration-200 outline-none ${
                            isCurrentValueOutOfRange && !isConfirmedProblematic ? 'border-yellow-400 focus:border-yellow-600' : 'border-slate-200 focus:border-slate-400'
                        }`}
                    />
                    {isCurrentValueOutOfRange && !isConfirmedProblematic && 
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2" title={t('value_out_of_range')}>
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                        </div>
                    }
                </div>
                <label className="text-xs text-slate-500 mt-1">{t(field)} <span className="text-red-500">*</span></label>
                {isConfirmedProblematic && (
                    <p className="text-xs text-yellow-600 font-bold mt-1">{t('value_out_of_range')}</p>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-4">
            <ConfirmationModal
                isOpen={isModalOpen}
                title={t('value_out_of_range')}
                message={t('approve_out_of_range')}
                onConfirm={handleConfirmOutOfRange}
                onCancel={handleCancelOutOfRange}
            />
            <h3 className="text-md font-bold text-slate-700 text-center mb-3">{title}</h3>
            <div className="grid grid-cols-3 gap-3">
                 {renderInput('systolic', t('systolic_placeholder'))}
                 {renderInput('diastolic', t('diastolic_placeholder'))}
                 {renderInput('heartRate', t('heart_rate_placeholder'))}
            </div>
        </div>
    );
};

export default VitalsInputGroup;
