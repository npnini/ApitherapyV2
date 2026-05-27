import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, startAfter, DocumentSnapshot, Timestamp } from 'firebase/firestore';
import { T, useTranslationContext } from './T';
import { RefreshCw } from 'lucide-react';
import styles from './ActivityLog.module.css';

interface AuditLogEntry {
    id: string;
    timestamp: Timestamp;
    userId: string;
    userName: string;
    userRole: string;
    category: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName: string;
    detail: string;
}

type SortField = 'timestamp' | 'userName' | 'category' | 'action' | 'entityType';
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
        if (filterUser && e.userName !== filterUser) return false;
        if (filterSearch && !e.entityName.toLowerCase().includes(filterSearch.toLowerCase())) return false;
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'timestamp') {
            const tA = a.timestamp?.toMillis?.() || 0;
            const tB = b.timestamp?.toMillis?.() || 0;
            cmp = tA - tB;
        } else {
            const valA = (a[sortField] || '').toLowerCase();
            const valB = (b[sortField] || '').toLowerCase();
            cmp = valA.localeCompare(valB);
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const uniqueUsers = [...new Set(entries.map(e => e.userName))].sort();
    const uniqueEntityTypes = [...new Set(entries.map(e => e.entityType))].sort();

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
                    <option value="patient">patient</option>
                    <option value="patientIntake">patientIntake</option>
                    <option value="config">config</option>
                </select>
                <select className={styles.filterSelect} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                    <option value="">All Actions</option>
                    <option value="create">create</option>
                    <option value="update">update</option>
                    <option value="view">view</option>
                    <option value="delete">delete</option>
                </select>
                <select className={styles.filterSelect} value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
                    <option value="">All Entity Types</option>
                    {uniqueEntityTypes.map(et => <option key={et} value={et}>{et}</option>)}
                </select>
                <select className={styles.filterSelect} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                    <option value="">All Users</option>
                    {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <input
                    className={styles.filterInput}
                    type="text"
                    placeholder="Search entity name..."
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
                                    <th onClick={() => handleSort('userName')}>
                                        <T>User</T>{sortIndicator('userName')}
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
                                    <th><T>Detail</T></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(entry => (
                                    <tr key={entry.id}>
                                        <td>{formatTimestamp(entry.timestamp)}</td>
                                        <td>{entry.userName}</td>
                                        <td>{categoryBadge(entry.category)}</td>
                                        <td>{actionBadge(entry.action)}</td>
                                        <td>{entry.entityType}</td>
                                        <td>{entry.entityName}</td>
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
