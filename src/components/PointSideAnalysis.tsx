import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import { logger } from '../utils/logger';
import { StingPoint } from '../types/apipuncture';
import { PointGroup } from '../types/pointGroup';
import { analyzePoints, buildAnalysisCsv, PointAnalysisResult } from '../utils/pointSideAnalysis';
import { T } from './T';
import styles from './PointSideAnalysis.module.css';

const PointSideAnalysis: React.FC = () => {
  const [result, setResult] = useState<PointAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setShowOnlyFlagged(false);
    try {
      const [pointsSnapshot, groupsSnapshot] = await Promise.all([
        getDocs(collection(db, 'cfg_acupuncture_points')),
        getDocs(collection(db, 'cfg_point_groups')),
      ]);
      const points = pointsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as StingPoint));
      const pointGroups = groupsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PointGroup));
      setResult(analyzePoints(points, pointGroups));
    } catch (err) {
      logger.error('Failed to run point side analysis:', err);
      setError('Failed to load point data. You must be an administrator to run this check.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Runs automatically against whichever environment this screen was opened
  // in (dev emulator, staging, or production) - whatever `db` is wired to.
  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const handleDownload = () => {
    if (!result) return;
    const csv = buildAnalysisCsv(result.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `point_side_analysis_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const visibleRows = result
    ? (showOnlyFlagged ? result.rows.filter((r) => r.consistencyFlag !== 'OK') : result.rows)
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}><T>Point Side &amp; Pairing Verification</T></h1>
        <div className={styles.headerActions}>
          <button className={styles.runButton} onClick={runAnalysis} disabled={loading}>
            <RefreshCw size={16} className={loading ? styles.spinning : undefined} />
            {loading ? <T>Analyzing...</T> : <T>Re-run Analysis</T>}
          </button>
          {result && (
            <button className={styles.downloadButton} onClick={handleDownload}>
              <Download size={16} />
              <T>Download CSV</T>
            </button>
          )}
        </div>
      </div>

      <p className={styles.description}>
        <T>Checks every point's stored corpo position against its expected Left, Right or Midline classification based on its Point Grouping, and flags anything that looks inconsistent for manual review.</T>
      </p>

      {error && <p className={styles.errorBox}>{error}</p>}

      {loading && !result && (
        <p className={styles.emptyState}><T>Loading points...</T></p>
      )}

      {result && (
        <>
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>{result.summary.totalPoints}</span>
              <span className={styles.summaryLabel}><T>Total points</T></span>
            </div>
            <button
              type="button"
              className={`${styles.summaryCard} ${styles.summaryCardButton} ${result.summary.flaggedCount > 0 ? styles.summaryCardWarning : ''} ${showOnlyFlagged ? styles.summaryCardActive : ''}`}
              onClick={() => setShowOnlyFlagged((v) => !v)}
              disabled={result.summary.flaggedCount === 0}
              aria-pressed={showOnlyFlagged}
            >
              <span className={styles.summaryValue}>{result.summary.flaggedCount}</span>
              <span className={styles.summaryLabel}>
                <T>{showOnlyFlagged ? 'Showing flagged only' : 'Flagged for review'}</T>
              </span>
            </button>
            {result.summary.pointsWithoutCorpoPosition > 0 && (
              <div className={`${styles.summaryCard} ${styles.summaryCardWarning}`}>
                <span className={styles.summaryValue}>{result.summary.pointsWithoutCorpoPosition}</span>
                <span className={styles.summaryLabel}><T>Missing corpo position</T></span>
              </div>
            )}
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th className={styles.headerCell}><T>Code</T></th>
                  <th className={styles.headerCell}><T>Label</T></th>
                  <th className={styles.headerCell}><T>Geometric Side</T></th>
                  <th className={styles.headerCell}><T>Expected Pairing</T></th>
                  <th className={styles.headerCell}><T>Status</T></th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {visibleRows.map((row) => (
                  <tr key={row.id} className={row.consistencyFlag !== 'OK' ? styles.rowFlagged : undefined}>
                    <td className={`${styles.cell} ${styles.codeCell}`}>{row.code}</td>
                    <td className={styles.cell}>{row.label}</td>
                    <td className={styles.cell}>{row.corpoSide}</td>
                    <td className={styles.cell}>{row.expectedPairing}</td>
                    <td className={styles.cell}>
                      {row.consistencyFlag !== 'OK' ? (
                        <span className={styles.flagBadge}>
                          <AlertTriangle size={12} />
                          {row.consistencyFlag}
                        </span>
                      ) : (
                        <span className={styles.okBadge}><T>OK</T></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default PointSideAnalysis;
