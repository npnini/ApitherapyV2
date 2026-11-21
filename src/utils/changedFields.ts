/**
 * Lists which fields really changed between two versions of a record, for the activity log `detail`.
 *
 * Returns dotted paths of the changed leaves, e.g. "description.he" or "auditLogSettings.retentionDays".
 * - Objects are compared key by key (key order does not matter); an array is compared as a whole and
 *   reported by its own path (e.g. "points").
 * - A missing key and `undefined` count as equal.
 * - Timestamp-like keys (updatedAt, createdAt, ...) and Firestore sentinels such as serverTimestamp()
 *   are ignored: they change on every save and are not a user change.
 * Field names only, never values: the log must not hold clinical data (see auditLogService.ts).
 */

const IGNORED_KEYS = new Set(['updatedAt', 'createdAt', 'updatedTimestamp', 'createdTimestamp']);

/** Firestore FieldValue sentinels (serverTimestamp(), arrayUnion(), ...) are written, never compared. */
function isSentinel(v: unknown): boolean {
    return !!v && typeof v === 'object' && '_methodName' in (v as object);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Deep equality, ignoring key order and treating missing keys as undefined. */
function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        return [...keys].every(k => deepEqual(a[k], b[k]));
    }
    // Firestore Timestamp and other class instances: compare by their JSON form
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
}

function collect(before: unknown, after: unknown, path: string, out: string[]): void {
    if (isPlainObject(before) && isPlainObject(after)) {
        const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
        for (const k of keys) {
            if (IGNORED_KEYS.has(k) || isSentinel(after[k])) continue;
            collect(before[k], after[k], path ? `${path}.${k}` : k, out);
        }
        return;
    }
    if (!deepEqual(before, after)) out.push(path || '(all)');
}

/**
 * @param before The record as it was (e.g. as loaded).
 * @param after  The record being saved.
 * @param onlyKeysOf When given, only these top-level keys are compared (e.g. the keys an update writes),
 *                   so fields the save does not touch (id, computed fields) are not reported.
 * @return Changed field paths, sorted.
 */
export function changedFieldPaths(
    before: Record<string, any> | null | undefined,
    after: Record<string, any>,
    onlyKeysOf?: Record<string, any>,
): string[] {
    const out: string[] = [];
    const b = before || {};
    const keys = onlyKeysOf ? Object.keys(onlyKeysOf) : [...new Set([...Object.keys(b), ...Object.keys(after)])];
    for (const k of keys) {
        if (IGNORED_KEYS.has(k) || isSentinel(after[k])) continue;
        collect(b[k], after[k], k, out);
    }
    return out.sort();
}

/** The paths as one `detail` string, capped so a large change does not produce a huge record. */
export function changedFieldsDetail(paths: string[], max = 15): string {
    if (paths.length === 0) return 'no changes';
    const shown = paths.slice(0, max).join(', ');
    return paths.length > max ? `${shown} (+${paths.length - max} more)` : shown;
}
