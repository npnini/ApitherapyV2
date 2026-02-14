import React from 'react';
import { useTranslation } from 'react-i18next';
import { PatientData } from '../../types/patient';
import styles from './Questionnaire.module.css';

interface CheckboxGroupProps {
    title: string;
    options: string[];
    data: Partial<PatientData>;
    setData: (data: Partial<PatientData>) => void;
    optionLabels?: { [key: string]: string };
}

const CheckboxGroup: React.FC<CheckboxGroupProps> = ({ title, options, data, setData, optionLabels }) => {
    const { t } = useTranslation();

    const handleCheckboxChange = (field: string, value: boolean) => {
        setData({
            ...data,
            medicalRecord: {
                ...data.medicalRecord,
                questionnaire: {
                    ...data.medicalRecord?.questionnaire,
                    [field]: value,
                },
            },
        });
    };

    // Defensively ensure medicalRecord and questionnaire exist
    const questionnaire = data.medicalRecord?.questionnaire || {};

    return (
        <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>{title}</label>
            <div className={styles.radioGroup} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                {options.map(option => (
                    <label key={option} className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={questionnaire[option] || false}
                            onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                        />
                        {optionLabels ? t(optionLabels[option]) : t(option.replace(/([A-Z])/g, '_$1').toLowerCase())}
                    </label>
                ))}
            </div>
        </div>
    );
};

export default CheckboxGroup;
