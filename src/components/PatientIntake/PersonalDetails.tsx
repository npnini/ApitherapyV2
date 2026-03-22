import React, { useState, useEffect } from 'react';
import { PatientData } from '../../types/patient';
import styles from './PersonalDetails.module.css';
import { T } from '../T';

interface PersonalDetailsProps {
    patientData: Partial<PatientData>;
    onDataChange: (data: Partial<PatientData>, isInternal?: boolean) => void;
    showErrors?: boolean;
}

const PersonalDetails: React.FC<PersonalDetailsProps> = ({ patientData, onDataChange, showErrors = false }) => {
    const [age, setAge] = useState<string>('');

    const calculateAge = (birthDateStr: string): string => {
        if (!birthDateStr) return '';
        const birthDate = new Date(birthDateStr);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
        }
        return calculatedAge >= 0 ? calculatedAge.toString() : '';
    };

    useEffect(() => {
        const newAge = calculateAge(patientData.birthDate || '');
        setAge(newAge);
    }, [patientData.birthDate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        onDataChange({ ...patientData, [name]: value });
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value } = e.target;
        const newAge = calculateAge(value);
        onDataChange({ ...patientData, birthDate: value, age: newAge });
    };

    const isFieldMissing = (value: any) => !value || (typeof value === 'string' && !value.trim());

    const renderInput = (
        name: keyof PatientData,
        labelTitle: string,
        errorText: string,
        type: string = 'text',
        isRequired: boolean = true,
        isTextArea: boolean = false
    ) => {
        const value = patientData[name];
        const hasError = showErrors && isRequired && isFieldMissing(value);

        return (
            <div className={name === 'address' || name === 'profession' ? "md:col-span-2" : ""}>
                <label
                    htmlFor={name}
                    className={`${styles.label} ${hasError ? styles.errorLabel : ''}`}
                >
                    <T>{labelTitle}</T> {isRequired && <span className="text-red-500">*</span>}
                </label>
                {isTextArea ? (
                    <textarea
                        id={name}
                        name={name}
                        value={(value as string) || ''}
                        onChange={handleChange}
                        className={`${styles.textarea} ${hasError ? styles.errorInput : ''}`}
                    />
                ) : (
                    <input
                        type={type}
                        id={name}
                        name={name}
                        value={(value as string) || ''}
                        onChange={name === 'birthDate' ? handleDateChange : handleChange}
                        className={`${styles.input} ${hasError ? styles.errorInput : ''}`}
                    />
                )}
                {hasError && (
                    <p className={styles.errorMessage}>
                        <T>{errorText}</T>
                    </p>
                )}
            </div>
        );
    };

    return (
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderInput('fullName', 'Full Name', 'Full name cannot be empty')}
            {renderInput('identityNumber', 'Identity Number', 'Identity Number cannot be empty')}
            {renderInput('email', 'Email', 'Email cannot be empty', 'email')}
            {renderInput('mobile', 'Mobile', 'Mobile number cannot be empty', 'tel')}
            {renderInput('birthDate', 'Birth Date', 'Birth date cannot be empty', 'date')}

            <div>
                <label htmlFor="age" className={styles.label}><T>Age</T></label>
                <input type="text" id="age" name="age" value={age} className={styles.input} disabled />
            </div>

            <div className="md:col-span-2">
                <label className={`${styles.label} ${showErrors && !patientData.gender ? styles.errorLabel : ''}`}>
                    <T>Gender</T> <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={patientData.gender === 'male'}
                            onChange={() => onDataChange({ ...patientData, gender: 'male' })}
                        />
                        <T>Male</T>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={patientData.gender === 'female'}
                            onChange={() => onDataChange({ ...patientData, gender: 'female' })}
                        />
                        <T>Female</T>
                    </label>
                </div>
                {showErrors && !patientData.gender && (
                    <p className={styles.errorMessage}>
                        <T>Gender selection is required</T>
                    </p>
                )}
            </div>

            {renderInput('profession', 'Profession', 'Profession cannot be empty')}
            {renderInput('address', 'Address', 'Address cannot be empty', 'text', true, true)}
        </form>
    );
};

export default PersonalDetails;
