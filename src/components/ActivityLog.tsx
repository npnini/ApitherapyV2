import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, getDoc, doc, startAfter, DocumentSnapshot, Timestamp } from 'firebase/firestore';
import { T, useTranslationContext } from './T';
import { RefreshCw } from 'lucide-react';
import styles from './ActivityLog.module.css';

/**
 * A log record. Since 21/11/2026 records hold IDs only for people: userId (no name) and patientId
 * (no patient name); entityName is kept only for knowledge-base / config items. Older records may
 * still carry userName and a patient's name in entityName (legacy), shown only when the ID cannot
 * be resolved. Names are resolved here for display and never written back to the log.
 */
interface AuditLogEntry {
    id: string;
    timestamp: Timestamp;
    userId: string;
    userName?: string;
    userRole: string;
    category: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName?: string;
    patientId?: string;
    detail: string;
}

type SortField = 'timestamp' | 'user' | 'category' | 'action' | 'entityType';

/**
 * Resolved names by ID. Missing key = not read yet. `name: null` = no such record (deleted);
 * `denied` = the read was refused by the security rules (e.g. the viewer has not yet accepted
 * a newly published User Terms version), so the record may well exist.
 */
type NameCache = Record<string, { name: string | null; denied?: boolean }>;

/** Label for an ID whose name is not available: deleted, not readable, or not loaded yet. */
const unresolvedLabel = (entry: { name: string | null; denied?: boolean } | undefined, id: string, kind: 'user' | 'patient') =>
    !entry ? shortId(id)
        : entry.denied ? `(no access) ${shortId(id)}`
        : `(deleted ${kind}) ${shortId(id)}`;

const PATIENT_CATEGORIES = ['patient', 'patientIntake'];

const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}…` : id);

/** The patient a record relates to: patientId, or the entity itself for older patient records. */
const patientIdOf = (e: AuditLogEntry): string | undefined =>
    e.patientId || (e.entityType === 'patient' ? e.entityId : undefined);
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 100;

const ActivityLog: React.FC = () => {
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const { language } = useTranslationContext();
    const isRtl = language === 'he';

    const [filterCategory, setFilterCategory] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterEntityType, setFilterEntityType] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [filterSearch, setFilterSearch] = useState('');

    const [sortField, setSortField] = useState<SortField>('timestamp');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const [userNames, setUserNames] = useState<NameCache>({});
    const [patientNames, setPatientNames] = useState<NameCache>({});

    const fetchEntries = useCallback(async (isLoadMore = false) => {
        if (isLoadMore) setLoadingMore(true); else setLoading(true);

        try {
            let q = query(
                collection(db, 'app_audit_log'),
                orderBy('timestamp', 'desc'),
                limit(PAGE_SIZE)
            );

            if (isLoadMore && lastDoc) {
                q = query(
                    collection(db, 'app_audit_log'),
                    orderBy('timestamp', 'desc'),
                    startAfter(lastDoc),
                    limit(PAGE_SIZE)
                );
            }

            const snapshot = await getDocs(q);
            const newEntries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as AuditLogEntry[];

            if (isLoadMore) {
                setEntries(prev => [...prev, ...newEntries]);
            } else {
                setEntries(newEntries);
            }

            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);
        } catch (err) {
            console.error('Failed to fetch audit log:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [lastDoc]);

    useEffect(() => {
        fetchEntries();
    }, []);

    // Resolve user and patient names for the loaded records (each ID is read once and cached)
    useEffect(() => {
        const userIds = new Set<string>();
        const patientIds = new Set<string>();
        entries.forEach(e => {
            if (e.userId) userIds.add(e.userId);
            if (e.entityType === 'user' && e.entityId) userIds.add(e.entityId);
            const pid = patientIdOf(e);
            if (pid) patientIds.add(pid);
        });
        const missingUsers = [...userIds].filter(id => !(id in userNames));
        const missingPatients = [...patientIds].filter(id => !(id in patientNames));
        if (!missingUsers.length && !missingPatients.length) return;

        const readNames = async (coll: string, ids: string[]): Promise<NameCache> => {
            const pairs = await Promise.all(ids.map(async (id): Promise<[string, NameCache[string]]> => {
                try {
                    const snap = await getDoc(doc(db, coll, id));
                    const data = snap.data();
                    const name = String(data?.fullName || data?.displayName || data?.email || '');
                    return [id, { name: snap.exists() && name ? name : null }];
                } catch (err) {
                    console.warn(`Activity log: could not read ${coll}/${id}:`, err);
                    return [id, { name: null, denied: true }];
                }
            }));
            return Object.fromEntries(pairs);
        };
        let cancelled = false;
        Promise.all([readNames('users', missingUsers), readNames('patients', missingPatients)]).then(([u, p]) => {
            if (cancelled) return;
            if (missingUsers.length) setUserNames(prev => ({ ...prev, ...u }));
            if (missingPatients.length) setPatientNames(prev => ({ ...prev, ...p }));
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries]);

    /** Name of the user who acted. Falls back to the stored legacy name, then a short ID. */
    const userLabel = (e: AuditLogEntry): string => {
        const cached = userNames[e.userId];
        if (cached?.name) return cached.name;
        if (e.userName) return e.userName;
        return unresolvedLabel(cached, e.userId, 'user');
    };

    /** Name of the patient the record relates to, or '—'. Older records: the stored name. */
    const patientLabel = (e: AuditLogEntry): string => {
        const pid = patientIdOf(e);
        const cached = pid ? patientNames[pid] : undefined;
        if (cached?.name) return cached.name;
        const legacy = PATIENT_CATEGORIES.includes(e.category) ? e.entityName : '';
        if (legacy) return legacy;
        if (pid) return unresolvedLabel(cached, pid, 'patient');
        return '—';
    };

    /** Entity name: a user's resolved name, a stored knowledge-base / config name, or '—' for patient data. */
    const entityLabel = (e: AuditLogEntry): string => {
        if (e.entityType === 'user') {
            const cached = userNames[e.entityId];
            return cached?.name || e.entityName || unresolvedLabel(cached, e.entityId, 'user');
        }
        if (PATIENT_CATEGORIES.includes(e.category)) return '—';
        return e.entityName || '—';
    };

    const handleRefresh = () => {
        setLastDoc(null);
        setHasMore(true);
        fetchEntries();
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir(field === 'timestamp' ? 'desc' : 'asc');
        }
    };

    const filtered = entries.filter(e => {
        if (filterCategory && e.category !== filterCategory) return false;
        if (filterAction && e.action !== filterAction) return false;
        if (filterEntityType && e.entityType !== filterEntityType) return false;
        if (filterUser && e.userId !== filterUser) return false;
        if (filterSearch) {
            const q = filterSearch.toLowerCase();
            if (!entityLabel(e).toLowerCase().includes(q) && !patientLabel(e).toLowerCase().includes(q)) return false;
        }
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'timestamp') {
            const tA = a.timestamp?.toMillis?.() || 0;
            const tB = b.timestamp?.toMillis?.() || 0;
            cmp = tA - tB;
        } else {
            const valA = (sortField === 'user' ? userLabel(a) : a[sortField] || '').toLowerCase();
            const valB = (sortField === 'user' ? userLabel(b) : b[sortField] || '').toLowerCase();
            cmp = valA.localeCompare(valB);
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const uniqueUsers = [...new Set(entries.map(e => e.userId))]
        .map(id => ({ id, label: userLabel(entries.find(e => e.userId === id)!) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const uniqueEntityTypes = [...new Set(entries.map(e => e.entityType))].sort();
    // Fixed values plus any found in the records (e.g. 'user' and the function actions such as roleChanged)
    const uniqueCategories = [...new Set(['patient', 'patientIntake', 'config', ...entries.map(e => e.category)])];
    const uniqueActions = [...new Set(['create', 'update', 'view', 'delete', ...entries.map(e => e.action)])];

    const formatTimestamp = (ts: Timestamp) => {
        if (!ts || !ts.toDate) return '—';
        const d = ts.toDate();
        return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    };

    const categoryBadge = (cat: string) => {
        const cls = cat === 'patient' ? styles.badgePatient
            : cat === 'patientIntake' ? styles.badgePatientIntake
            : styles.badgeConfig;
        return <span className={`${styles.badge} ${cls}`}>{cat}</span>;
    };

    const actionBadge = (action: string) => {
        const cls = action === 'create' ? styles.badgeCreate
            : action === 'update' ? styles.badgeUpdate
            : action === 'view' ? styles.badgeView
            : styles.badgeDelete;
        return <span className={`${styles.badge} ${cls}`}>{action}</span>;
    };

    const sortIndicator = (field: SortField) => {
        if (sortField !== field) return null;
        return <span className={styles.sortIndicator}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
    };

    return (
        <div className={styles.container} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className={styles.header}>
                <h1><T>Activity Log</T></h1>
                <div className={styles.headerActions}>
                    <button onClick={handleRefresh} className={styles.refreshBtn} disabled={loading}>
                        <RefreshCw size={14} />
                        <T>Refresh</T>
                    </button>
                </div>
            </div>

            <div className={styles.filters}>
                <select className={styles.filterSelect} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="">All Categories</option>
                    {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className={styles.filterSelect} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                    <option value="">All Actions</option>
                    {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select className={styles.filterSelect} value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
                    <option value="">All Entity Types</option>
                    {uniqueEntityTypes.map(et => <option key={et} value={et}>{et}</option>)}
                </select>
                <select className={styles.filterSelect} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                    <option value="">All Users</option>
                    {uniqueUsers.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
                <input
                    className={styles.filterInput}
                    type="text"
                    placeholder="Search entity or patient name..."
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                />
            </div>

            {loading ? (
                <div className={styles.loading}><T>Loading...</T></div>
            ) : sorted.length === 0 ? (
                <div className={styles.emptyState}><T>No log entries found</T></div>
            ) : (
                <>
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th onClick={() => handleSort('timestamp')}>
                                        <T>Timestamp</T>{sortIndicator('timestamp')}
                                    </th>
                                    <th onClick={() => handleSort('user')}>
                                        <T>User</T>{sortIndicator('user')}
                                    </th>
                                    <th onClick={() => handleSort('category')}>
                                        <T>Category</T>{sortIndicator('category')}
                                    </th>
                                    <th onClick={() => handleSort('action')}>
                                        <T>Action</T>{sortIndicator('action')}
                                    </th>
                                    <th onClick={() => handleSort('entityType')}>
                                        <T>Entity Type</T>{sortIndicator('entityType')}
                                    </th>
                                    <th><T>Entity Name</T></th>
                                    <th><T>Patient</T></th>
                                    <th><T>Detail</T></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(entry => (
                                    <tr key={entry.id}>
                                        <td>{formatTimestamp(entry.timestamp)}</td>
                                        <td>{userLabel(entry)}</td>
                                        <td>{categoryBadge(entry.category)}</td>
                                        <td>{actionBadge(entry.action)}</td>
                                        <td>{entry.entityType}</td>
                                        <td>{entityLabel(entry)}</td>
                                        <td>{patientLabel(entry)}</td>
                                        <td className={styles.detailText}>{entry.detail}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {hasMore && (
                        <div className={styles.loadMoreWrapper}>
                            <button
                                className={styles.loadMoreBtn}
                                onClick={() => fetchEntries(true)}
                                disabled={loadingMore}
                            >
                                {loadingMore ? <T>Loading...</T> : <T>Load More</T>}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ActivityLog;
