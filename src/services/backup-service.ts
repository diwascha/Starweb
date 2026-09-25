import { getFirebase } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { getLockedPeriodKeys } from './period-lock';

// Collections that are pure operational trails (grow with every click, not
// with real business records). Capped in backups so they don't dominate the
// file size; the most recent entries are kept for audit purposes.
const CAPPED_COLLECTIONS: Record<string, number> = {
    logs: 2000,
};

const collectionsToBackup = [
    'reports',
    'products',
    'purchaseOrders',
    'rawMaterials',
    'employees',
    'attendance',
    'payroll',
    'vehicles',
    'drivers',
    'policies',
    'transactions',
    'parties',
    'accounts',
    'uom',
    'destinations',
    'trips',
    'settings',
    'notes',
    'pageVisits',
    'tdsCalculations',
    'estimatedInvoices',
    'cheques',
    'expenses',
    'logs',
    'rentalProperties',
    'rentalUnits',
    'rentalAgreements',
    'rentalBills',
    'system_users',
    'usernames',
    'raw_machine_logs',
    'bonus_ledger',
    'bonus_summaries',
    'behavior_ledger',
    'behavior_analytics',
    'analytics_reports',
    'hr_shifts',
    'leave_requests',
    // Previously missing, so a backup could not bring these back.
    'public_holidays',
    'attendance_periods',
    'payroll_periods',
    'numberCounters',
    'crm_contacts',
    'crm_deals',
    'crm_followups',
    'crm_interactions',
    'costReports',
    'gsm_reports',
    'payment_tracker'
];

/** Written into every backup so a partial one can never pass for complete. */
export interface BackupMeta {
    createdAt: string;
    skipped: { collection: string; reason: string }[];
    /** Left out on purpose. A restore leaves these collections untouched. */
    excluded?: string[];
}

/**
 * Raw fingerprint-machine punches: by far the largest collection, and only
 * the source for attendance that is already calculated and stored.
 */
export const RAW_LOGS_COLLECTION = 'raw_machine_logs';

export const exportData = async (options: { exclude?: string[] } = {}): Promise<Record<string, any>> => {
    const { db } = getFirebase();
    const data: Record<string, any> = {};
    const skipped: BackupMeta['skipped'] = [];
    const excluded = collectionsToBackup.filter(c => options.exclude?.includes(c));

    for (const collectionName of collectionsToBackup) {
        if (excluded.includes(collectionName)) continue;
        try {
            const cap = CAPPED_COLLECTIONS[collectionName];
            const querySnapshot = cap
                ? await getDocs(query(collection(db, collectionName), orderBy('createdAt', 'desc'), limit(cap)))
                : await getDocs(collection(db, collectionName));
            data[collectionName] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error: any) {
            // Recorded rather than swallowed: a collection this user cannot
            // read (or that failed mid-export) must not look like an empty one.
            skipped.push({ collection: collectionName, reason: error?.code || error?.message || 'unknown' });
        }
    }

    data._meta = { createdAt: new Date().toISOString(), skipped, excluded } satisfies BackupMeta;
    return data;
};

// Backups are compressed client-side (gzip via the native CompressionStream
// API) since the raw JSON export can otherwise run into tens of MB. Falls
// back to plain, unindented JSON if the browser lacks CompressionStream.
export const compressBackup = async (data: unknown): Promise<{ blob: Blob; gzipped: boolean }> => {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (typeof CompressionStream === 'undefined') {
        return { blob: new Blob([bytes], { type: 'application/json' }), gzipped: false };
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const blob = await new Response(stream).blob();
    return { blob, gzipped: true };
};

// Reads a backup file produced by compressBackup (gzip) or a legacy
// plain-JSON backup, and returns the parsed data.
export const readBackupFile = async (file: File): Promise<Record<string, any[]>> => {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    let jsonText: string;
    if (isGzip) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('This browser cannot decompress gzip backups. Please use an up-to-date browser.');
        }
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        jsonText = await new Response(stream).text();
    } else {
        jsonText = new TextDecoder().decode(buffer);
    }
    return JSON.parse(jsonText);
};

// Never restored. Login accounts and username mappings are tied to Firebase
// Auth and the rules refuse to rewrite admin accounts - the old restore died
// on exactly this, after it had already deleted everything before it. Logs
// and page visits are append-only trails that the rules only let a user
// write for themselves.
const NOT_RESTORED = new Set(['system_users', 'usernames', 'sessions', 'logs', 'pageVisits']);

// Restored last, so every payroll/attendance write is checked against the
// locks as they are now, not half-way through changing them.
const RESTORE_LAST = ['attendance_periods', 'payroll_periods'];
const LOCKED_BY_PERIOD = new Set(['payroll', 'attendance']);

const WRITE_CHUNK = 400;

export interface RestoreCollectionPlan {
    collection: string;
    add: { id: string; data: any }[];
    update: { id: string; data: any }[];
    unchanged: number;
    /** In the database but not in the backup. Deleted only if asked. */
    extra: string[];
    /** Changed records in locked months; the rules refuse to rewrite them. */
    lockedSkipped: number;
}

export interface RestorePlan {
    createdAt: string | null;
    collections: RestoreCollectionPlan[];
    /** In the file but not restored, with the reason. */
    ignored: { collection: string; reason: string }[];
}

export interface RestoreResult {
    collection: string;
    written: number;
    deleted: number;
    error?: string;
}

// JSON turns a Firestore Timestamp into {seconds, nanoseconds}; turn it back.
const reviveTimestamps = (value: any): any => {
    if (Array.isArray(value)) return value.map(reviveTimestamps);
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).filter(k => k !== 'type');
        if (keys.length === 2 && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
            return new Timestamp(value.seconds, value.nanoseconds);
        }
        const out: any = {};
        for (const [k, v] of Object.entries(value)) out[k] = reviveTimestamps(v);
        return out;
    }
    return value;
};

// Key-order independent comparison, with Timestamps in their JSON shape on
// both sides.
const canonical = (value: any): string => JSON.stringify(value, (_k, v) => {
    if (v instanceof Timestamp) return { seconds: v.seconds, nanoseconds: v.nanoseconds };
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = v[k]; return acc; }, {});
    }
    return v;
});

const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');

/**
 * Reads the backup against the live database and works out what a restore
 * would change. Writes nothing. Only collections present in the file are
 * considered - a collection missing from the file is left alone, never
 * emptied.
 */
export const planRestore = async (data: Record<string, any>): Promise<RestorePlan> => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('This file is not a StarSutra backup.');
    }
    const skippedInBackup = new Map<string, string>(
        (data._meta?.skipped || []).map((s: any) => [s.collection, s.reason])
    );
    const known = collectionsToBackup.filter(c => Array.isArray(data[c]));
    if (known.length === 0) throw new Error('This file does not contain any StarSutra data.');

    const ignored: RestorePlan['ignored'] = [];
    const targets: string[] = [];
    for (const name of known) {
        if (NOT_RESTORED.has(name)) ignored.push({ collection: name, reason: 'user accounts and logs are never restored' });
        else if (skippedInBackup.has(name)) ignored.push({ collection: name, reason: `could not be read when the backup was made (${skippedInBackup.get(name)})` });
        else if (data[name].some((item: any) => !validId(item?.id))) ignored.push({ collection: name, reason: 'contains records without a valid id' });
        else targets.push(name);
    }
    targets.sort((a, b) => Number(RESTORE_LAST.includes(a)) - Number(RESTORE_LAST.includes(b)));

    const { db } = getFirebase();
    const lockedKeys = await getLockedPeriodKeys();
    const isLocked = (d: any) => d && lockedKeys.has(`${d.bsYear}-${d.bsMonth}`);

    const collections: RestoreCollectionPlan[] = [];
    for (const name of targets) {
        const snap = await getDocs(collection(db, name));
        const current = new Map(snap.docs.map(d => [d.id, d.data()]));
        const plan: RestoreCollectionPlan = { collection: name, add: [], update: [], unchanged: 0, extra: [], lockedSkipped: 0 };
        const inBackup = new Set<string>();

        for (const item of data[name]) {
            const { id, ...rest } = item;
            inBackup.add(id);
            const restored = reviveTimestamps(rest);
            const existing = current.get(id);
            if (existing === undefined) {
                plan.add.push({ id, data: restored });
            } else if (canonical(existing) === canonical(restored)) {
                plan.unchanged++;
            } else if (LOCKED_BY_PERIOD.has(name) && (isLocked(existing) || isLocked(restored))) {
                plan.lockedSkipped++;
            } else {
                plan.update.push({ id, data: restored });
            }
        }
        for (const id of current.keys()) if (!inBackup.has(id)) plan.extra.push(id);
        collections.push(plan);
    }

    return { createdAt: data._meta?.createdAt || null, collections, ignored };
};

/**
 * Applies a plan from planRestore. Every collection is written (added and
 * updated) before anything is deleted, and deletion of records that are not
 * in the backup only happens when `deleteExtra` is set. A failure in one
 * collection is reported and the rest carry on, so nothing is left
 * half-deleted.
 */
export const applyRestore = async (plan: RestorePlan, deleteExtra: boolean): Promise<RestoreResult[]> => {
    const { db } = getFirebase();
    const results = new Map<string, RestoreResult>(
        plan.collections.map(c => [c.collection, { collection: c.collection, written: 0, deleted: 0 }])
    );

    const run = async (name: string, ops: ((b: ReturnType<typeof writeBatch>) => void)[], field: 'written' | 'deleted') => {
        const result = results.get(name)!;
        if (result.error) return;
        for (let i = 0; i < ops.length; i += WRITE_CHUNK) {
            const batch = writeBatch(db);
            const chunk = ops.slice(i, i + WRITE_CHUNK);
            chunk.forEach(op => op(batch));
            try {
                await batch.commit();
                result[field] += chunk.length;
            } catch (error: any) {
                result.error = error?.code || error?.message || 'write failed';
                return;
            }
        }
    };

    for (const c of plan.collections) {
        const writes = [...c.add, ...c.update].map(({ id, data }) =>
            (b: ReturnType<typeof writeBatch>) => b.set(doc(db, c.collection, id), data));
        await run(c.collection, writes, 'written');
    }

    if (deleteExtra) {
        for (const c of plan.collections) {
            const deletes = c.extra.map(id => (b: ReturnType<typeof writeBatch>) => b.delete(doc(db, c.collection, id)));
            await run(c.collection, deletes, 'deleted');
        }
    }

    return Array.from(results.values());
};

/**
 * Gzip a string in the browser, when the platform supports it.
 *
 * A full export of this database is around 16 MB of pretty-printed JSON and
 * grows with every month of attendance. Measured on data shaped like this
 * app's (random ids, varied values - the least compressible realistic case),
 * dropping the indentation and gzipping takes 16.9 MB to 3.2 MB, about 5x.
 *
 * CompressionStream is not everywhere: the Tauri wrapper uses the system
 * webview, which on Linux is WebKitGTK and may not have it. Callers fall
 * back to uncompressed rather than failing the backup.
 */
export const gzipString = async (text: string): Promise<Blob | null> => {
    if (typeof CompressionStream === 'undefined') return null;
    try {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        return await new Response(stream).blob();
    } catch {
        return null;
    }
};
