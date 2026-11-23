import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../common/Modal';
import { T, useT } from '../T';
import { auth } from '../../firebase';
import { logAction } from '../../services/auditLogService';
import TreatmentExportReport, { ExportPatientFields, ExportTreatment } from './TreatmentExportReport';
import { prepareExportImages, revokeExportImages, waitForImages } from './exportImages';
import styles from './TreatmentExport.module.css';

/** Body class that makes the print stylesheet (globals.css) show only the report. */
const PRINTING_CLASS = 'treatment-export-printing';

type PiiKey = 'fullName' | 'identityNumber' | 'email' | 'mobile';

const PII_OPTIONS: Array<{ key: PiiKey; label: string }> = [
    { key: 'fullName', label: 'Full Name' },
    { key: 'identityNumber', label: 'Identity Number' },
    { key: 'email', label: 'Email' },
    { key: 'mobile', label: 'Mobile' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    patientId: string;
    patient: Partial<Record<PiiKey, string>>;
    /** Selected treatments, already sorted latest first. */
    treatments: ExportTreatment[];
    caretakerNames: Map<string, string>;
    protocolsNamesMap: Map<string, string | Record<string, string> | undefined>;
    freeProtoId: string | null;
    language: string;
}

type Phase = 'options' | 'preparing' | 'printing';

const TreatmentExportModal: React.FC<Props> = ({
    isOpen, onClose, patientId, patient, treatments, caretakerNames, protocolsNamesMap, freeProtoId, language,
}) => {
    const tTitle = useT('Export Treatments');
    const [pii, setPii] = useState<Record<PiiKey, boolean>>({ fullName: false, identityNumber: false, email: false, mobile: false });
    const [includeImages, setIncludeImages] = useState(true);
    const [phase, setPhase] = useState<Phase>('options');
    const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
    const [failedImages, setFailedImages] = useState(0);
    const urlsRef = useRef<Map<string, string>>(new Map());
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Fresh choices every time the popup opens: nothing is remembered between exports.
    useEffect(() => {
        if (isOpen) {
            setPii({ fullName: false, identityNumber: false, email: false, mobile: false });
            setIncludeImages(true);
            setPhase('options');
            setFailedImages(0);
        }
    }, [isOpen]);

    const releaseImages = () => {
        revokeExportImages(urlsRef.current);
        urlsRef.current = new Map();
        setImageUrls(new Map());
    };

    // Releases images and the print class if the component goes away mid-export.
    useEffect(() => () => {
        document.body.classList.remove(PRINTING_CLASS);
        revokeExportImages(urlsRef.current);
    }, []);

    // Once the report is on the page and its images are decoded, open the browser's print window.
    useEffect(() => {
        if (phase !== 'printing') return;

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            window.removeEventListener('afterprint', finish);
            document.body.classList.remove(PRINTING_CLASS);
            releaseImages();
            if (mountedRef.current) {
                setPhase('options');
                onClose();
            }
        };

        window.addEventListener('afterprint', finish);
        document.body.classList.add(PRINTING_CLASS);
        // Two frames so the portal's DOM is laid out before the print preview is taken.
        requestAnimationFrame(() => requestAnimationFrame(() => window.print()));

        return () => {
            window.removeEventListener('afterprint', finish);
            document.body.classList.remove(PRINTING_CLASS);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    const handleExport = async () => {
        const fields = PII_OPTIONS.filter(o => pii[o.key]).map(o => o.key);

        // IDs only: patient ID, counts and field NAMES. Never patient values or clinical data.
        const actor = auth.currentUser;
        if (actor) {
            logAction(actor, {
                category: 'patient',
                action: 'export',
                entityType: 'treatmentsExport',
                entityId: patientId,
                patientId,
                detail: `n=${treatments.length}; fields=${fields.join(',') || 'none'}; images=${includeImages ? 'yes' : 'no'}`,
            });
        }

        setPhase('preparing');
        let urls = new Map<string, string>();
        let failed = 0;
        if (includeImages) {
            const paths = treatments.map(t => t.preTreatmentImage).filter((p): p is string => !!p);
            const prepared = await prepareExportImages(paths);
            urls = prepared.urls;
            failed = prepared.failed;
            await waitForImages(urls.values());
        }
        if (!mountedRef.current) {
            revokeExportImages(urls);
            return;
        }
        urlsRef.current = urls;
        setImageUrls(urls);
        setFailedImages(failed);
        setPhase('printing');
    };

    const patientFields: ExportPatientFields = {};
    PII_OPTIONS.forEach(o => {
        if (pii[o.key]) patientFields[o.key] = patient[o.key] || '';
    });

    const busy = phase !== 'options';

    return (
        <>
            <Modal isOpen={isOpen} onClose={busy ? () => undefined : onClose} title={tTitle}>
                <div className={styles.popupBody}>
                    <p className={styles.summary}><T>Selected treatments</T>: {treatments.length}</p>

                    <fieldset className={styles.group} disabled={busy}>
                        <legend className={styles.groupTitle}><T>Patient details to include</T></legend>
                        <p className={styles.hint}><T>Nothing is included unless you tick it.</T></p>
                        {PII_OPTIONS.map(o => (
                            <label key={o.key} className={styles.checkRow}>
                                <input
                                    type="checkbox"
                                    checked={pii[o.key]}
                                    onChange={() => setPii(prev => ({ ...prev, [o.key]: !prev[o.key] }))}
                                />
                                <span><T>{o.label}</T></span>
                            </label>
                        ))}
                    </fieldset>

                    <fieldset className={styles.group} disabled={busy}>
                        <legend className={styles.groupTitle}><T>Content</T></legend>
                        <label className={styles.checkRow}>
                            <input
                                type="checkbox"
                                checked={includeImages}
                                onChange={() => setIncludeImages(v => !v)}
                            />
                            <span><T>Include images</T></span>
                        </label>
                    </fieldset>

                    {phase === 'preparing' && <p className={styles.summary}><T>Preparing…</T></p>}
                    {failedImages > 0 && (
                        <p className={styles.warning}><T>Image unavailable</T>: {failedImages}</p>
                    )}

                    <div className={styles.footer}>
                        <button type="button" className={styles.cancelButton} onClick={onClose} disabled={busy}>
                            <T>Cancel</T>
                        </button>
                        <button type="button" className={styles.exportButton} onClick={handleExport} disabled={busy || treatments.length === 0}>
                            <T>Export</T>
                        </button>
                    </div>
                </div>
            </Modal>

            {phase === 'printing' && createPortal(
                <TreatmentExportReport
                    treatments={treatments}
                    patientFields={patientFields}
                    caretakerNames={caretakerNames}
                    protocolsNamesMap={protocolsNamesMap}
                    freeProtoId={freeProtoId}
                    language={language}
                    imageUrls={imageUrls}
                    includeImages={includeImages}
                />,
                document.body
            )}
        </>
    );
};

export default TreatmentExportModal;
