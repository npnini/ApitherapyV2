import React from 'react';
import { T } from '../T';
import { formatDate, toDateValue, toHHmm } from '../../utils/appointments/time';
import { getPointLabel } from '../../utils/storageUtils';
import styles from './TreatmentExport.module.css';

type MLText = string | Record<string, string> | undefined;

interface Vitals {
    systolic?: number | string;
    diastolic?: number | string;
    heartRate?: number | string;
}

/** The part of a hydrated treatment (see TreatmentHistory) the report needs. */
export interface ExportTreatment {
    id: string;
    caretakerId: string;
    createdTimestamp?: unknown;
    patientReport?: string;
    preTreatmentVitals?: Vitals;
    preTreatmentImage?: string;
    isSensitivityTest?: boolean;
    protocolId?: string;
    protocolIds?: string[];
    stungPoints?: Record<string, { left: number; right: number; single: number }>;
    status?: 'Incomplete' | 'Completed';
    postStingingVitals?: Vitals;
    finalVitals?: Vitals;
    finalNotes?: string;
    patientFeedback?: string;
    treatmentNumber?: number;
    resolvedStungPoints: Array<{ id: string; code: string; label?: string | Record<string, string> }>;
    measuredValues?: Array<{ label: string; value: string | number }>;
    feedbackMeasuredValues?: Array<{ label: string; value: string | number }>;
}

export interface ExportPatientFields {
    fullName?: string;
    identityNumber?: string;
    email?: string;
    mobile?: string;
}

interface Props {
    treatments: ExportTreatment[];
    patientFields: ExportPatientFields;
    caretakerNames: Map<string, string>;
    protocolsNamesMap: Map<string, MLText>;
    freeProtoId: string | null;
    language: string;
    /** Storage path -> blob URL. Only present when "Include images" was ticked. */
    imageUrls: Map<string, string>;
    includeImages: boolean;
}

const mlValue = (value: MLText, lang: string): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value[lang] || value.en || '';
    return '';
};

const formatDateTime = (value: unknown): string => {
    // toDateValue covers Firestore Timestamps, Dates, ms and ISO strings; plain {seconds} objects are legacy.
    let date = toDateValue(value);
    const seconds = (value as { seconds?: unknown } | null | undefined)?.seconds;
    if (!date && typeof seconds === 'number') date = new Date(seconds * 1000);
    return date ? `${formatDate(date)} ${toHHmm(date)}` : '-';
};

const hasVitals = (v?: Vitals): v is Vitals =>
    !!v && (v.systolic !== undefined || v.diastolic !== undefined || v.heartRate !== undefined);

const VitalsBlock: React.FC<{ title: string; vitals?: Vitals }> = ({ title, vitals }) => {
    if (!hasVitals(vitals)) return null;
    return (
        <div className={styles.item}>
            <h4 className={styles.label}><T>{title}</T></h4>
            <p className={styles.text}>
                {vitals.systolic !== undefined && <span className={styles.pair}><T>Systolic</T>: {String(vitals.systolic)}</span>}
                {vitals.diastolic !== undefined && <span className={styles.pair}><T>Diastolic</T>: {String(vitals.diastolic)}</span>}
                {vitals.heartRate !== undefined && <span className={styles.pair}><T>Heart Rate</T>: {String(vitals.heartRate)}</span>}
            </p>
        </div>
    );
};

const TreatmentExportReport: React.FC<Props> = ({
    treatments, patientFields, caretakerNames, protocolsNamesMap, freeProtoId, language, imageUrls, includeImages,
}) => {
    const direction = language === 'he' ? 'rtl' : 'ltr';
    const patientRows: Array<[string, string]> = [];
    if (patientFields.fullName) patientRows.push(['Full Name', patientFields.fullName]);
    if (patientFields.identityNumber) patientRows.push(['Identity Number', patientFields.identityNumber]);
    if (patientFields.email) patientRows.push(['Email', patientFields.email]);
    if (patientFields.mobile) patientRows.push(['Mobile', patientFields.mobile]);

    return (
        <div className={styles.report} dir={direction}>
            <header className={styles.reportHeader}>
                <h1 className={styles.reportTitle}><T>Treatment History</T></h1>
                <p className={styles.reportMeta}>
                    <T>Date</T>: {formatDate(new Date())} &nbsp;|&nbsp; <T>Treatments</T>: {treatments.length}
                </p>
                {patientRows.length > 0 && (
                    <div className={styles.patientBlock}>
                        {patientRows.map(([label, value]) => (
                            <div key={label}><strong><T>{label}</T>:</strong> {value}</div>
                        ))}
                    </div>
                )}
            </header>

            {treatments.map(t => {
                const protocolIds = t.protocolIds || (t.protocolId ? [t.protocolId] : []);
                const imageUrl = t.preTreatmentImage ? imageUrls.get(t.preTreatmentImage) : undefined;
                return (
                    <section key={t.id} className={styles.treatment}>
                        <div className={styles.treatmentHeader}>
                            <h2 className={styles.treatmentTitle}>
                                <T>Treatment</T> - {t.treatmentNumber || '-'}
                                {t.status === 'Incomplete' && <span> (<T>Incomplete</T>)</span>}
                                {t.isSensitivityTest && <span> (<T>Sensitivity Test</T>)</span>}
                            </h2>
                            <div className={styles.treatmentMeta}>
                                {formatDateTime(t.createdTimestamp)} &nbsp;|&nbsp; {caretakerNames.get(t.caretakerId) || ''}
                            </div>
                        </div>

                        <h3 className={styles.phaseTitle}><T>1. Session Opening</T></h3>
                        <div className={styles.item}>
                            <h4 className={styles.label}><T>Patient Report</T></h4>
                            <p className={styles.text}>{t.patientReport || <T>Not provided</T>}</p>
                        </div>
                        {t.measuredValues && t.measuredValues.length > 0 && (
                            <div className={styles.item}>
                                <h4 className={styles.label}><T>Initial Measures (KPIs)</T></h4>
                                <p className={styles.text}>
                                    {t.measuredValues.map((mv, i) => (
                                        <span key={i} className={styles.pair}>{mv.label}: {String(mv.value)}</span>
                                    ))}
                                </p>
                            </div>
                        )}
                        <VitalsBlock title="Pre-session Vitals" vitals={t.preTreatmentVitals} />
                        {includeImages && t.preTreatmentImage && (
                            <div className={styles.item}>
                                <h4 className={styles.label}><T>Pre-Treatment Photo</T></h4>
                                {imageUrl
                                    ? <img src={imageUrl} alt="" className={styles.photo} />
                                    : <p className={styles.text}><T>Image unavailable</T></p>}
                            </div>
                        )}

                        <h3 className={styles.phaseTitle}><T>2. Stung Points</T></h3>
                        {t.resolvedStungPoints.length > 0 ? (
                            <ul className={styles.pointsList}>
                                {t.resolvedStungPoints.map(point => {
                                    const c = t.stungPoints?.[point.id] ?? { left: 0, right: 0, single: 0 };
                                    return (
                                        <li key={point.id}>
                                            <strong>{point.code}</strong>, {getPointLabel(point.label)}, L={c.left}, R={c.right}, S={c.single}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className={styles.text}><T>No points stung</T></p>
                        )}

                        <h3 className={styles.phaseTitle}><T>3. Protocols Used</T></h3>
                        {protocolIds.length > 0 ? (
                            <ul className={styles.pointsList}>
                                {protocolIds.map((id, i) => {
                                    let name = mlValue(protocolsNamesMap.get(id), language);
                                    if (!name && id === freeProtoId) name = language === 'he' ? 'פרוטוקול חופשי' : 'Free Protocol';
                                    return <li key={i}>{name || id}</li>;
                                })}
                            </ul>
                        ) : (
                            <p className={styles.text}><T>No protocols recorded</T></p>
                        )}

                        <h3 className={styles.phaseTitle}><T>4. Finish Session</T></h3>
                        <VitalsBlock title="Post-Stinging Vitals" vitals={t.postStingingVitals} />
                        <VitalsBlock title="Final Vitals" vitals={t.finalVitals} />
                        <div className={styles.item}>
                            <h4 className={styles.label}><T>Final Notes</T></h4>
                            <p className={styles.text}>{t.finalNotes || <T>No notes</T>}</p>
                        </div>

                        {t.status !== 'Incomplete' && (t.patientFeedback || (t.feedbackMeasuredValues && t.feedbackMeasuredValues.length > 0)) && (
                            <>
                                <h3 className={styles.phaseTitle}><T>5. Treatment Feedback</T></h3>
                                {t.patientFeedback && (
                                    <div className={styles.item}>
                                        <h4 className={styles.label}><T>Patient Feedback</T></h4>
                                        <p className={styles.text}>{t.patientFeedback}</p>
                                    </div>
                                )}
                                {t.feedbackMeasuredValues && t.feedbackMeasuredValues.length > 0 && (
                                    <div className={styles.item}>
                                        <h4 className={styles.label}><T>Feedback Measures</T></h4>
                                        <p className={styles.text}>
                                            {t.feedbackMeasuredValues.map((mv, i) => (
                                                <span key={i} className={styles.pair}>{mv.label}: {String(mv.value)}</span>
                                            ))}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                );
            })}
        </div>
    );
};

export default TreatmentExportReport;
