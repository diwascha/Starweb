/**
 * @fileOverview `firebase/firestore`, implemented on Supabase.
 *
 * The app was written against the Firestore SDK in ~60 files. Rather than
 * rewrite each one, the build points `firebase/firestore` at this module
 * (next.config.ts + tsconfig.json paths), which offers the same functions on
 * top of the Supabase tables: one table per collection, `id` + `data jsonb`.
 *
 * Queries: `==` and `in` filters run in the database; `<`, `<=`, `>`, `>=`,
 * `!=`, orderBy and limit are applied here on the fetched rows, with
 * Firestore's comparison rules. Access control is Postgres row-level security
 * (supabase/migrations/0002_access_rules.sql); a denied write surfaces as a
 * `permission-denied` error, exactly as the app already handles.
 *
 * Live listeners (onSnapshot) fetch once, then re-fetch when Supabase Realtime
 * reports a change on that table. Batches and transactions run their writes
 * in order; they are not atomic the way Firestore's are.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';

// ------------------------------------------------------------------ types ---

export type DocumentData = { [field: string]: any };
export type WithFieldValue<T> = T;
export type Firestore = { type: 'firestore' };
export type SetOptions = { merge?: boolean };

export interface FirestoreDataConverter<T> {
    toFirestore(model: T): DocumentData;
    fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>, options?: unknown): T;
}

export class FirestoreError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
        this.name = 'FirebaseError';
    }
}

type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';
type Constraint =
    | { kind: 'where'; field: string; op: WhereOp; value: any }
    | { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
    | { kind: 'limit'; n: number };

export class CollectionReference<T = DocumentData> {
    readonly type = 'collection' as const;
    constructor(readonly id: string, readonly converter: FirestoreDataConverter<T> | null = null) {}
    get path() { return this.id; }
    withConverter<U>(converter: FirestoreDataConverter<U>): CollectionReference<U> {
        return new CollectionReference<U>(this.id, converter);
    }
}

export class DocumentReference<T = DocumentData> {
    readonly type = 'document' as const;
    constructor(readonly table: string, readonly id: string, readonly converter: FirestoreDataConverter<T> | null = null) {}
    get path() { return `${this.table}/${this.id}`; }
    get parent() { return new CollectionReference<T>(this.table, this.converter); }
    withConverter<U>(converter: FirestoreDataConverter<U>): DocumentReference<U> {
        return new DocumentReference<U>(this.table, this.id, converter);
    }
}

export class Query<T = DocumentData> {
    readonly type = 'query' as const;
    constructor(readonly table: string, readonly constraints: Constraint[], readonly converter: FirestoreDataConverter<T> | null = null) {}
}

export class DocumentSnapshot<T = DocumentData> {
    constructor(readonly ref: DocumentReference<T>, private readonly raw: DocumentData | undefined) {}
    get id() { return this.ref.id; }
    exists(): this is QueryDocumentSnapshot<T> { return this.raw !== undefined; }
    get metadata() { return { hasPendingWrites: false, fromCache: false }; }
    data(): T | undefined {
        if (this.raw === undefined) return undefined;
        if (!this.ref.converter) return this.raw as T;
        // The converter gets a snapshot of the raw document (no converter).
        const plainRef = new DocumentReference<DocumentData>(this.ref.table, this.ref.id, null);
        return this.ref.converter.fromFirestore(new QueryDocumentSnapshot<DocumentData>(plainRef, this.raw));
    }
    get(field: string): any { return getPath(this.raw, field); }
}

export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
    data(): T { return super.data() as T; }
}

export class QuerySnapshot<T = DocumentData> {
    constructor(readonly docs: QueryDocumentSnapshot<T>[]) {}
    get size() { return this.docs.length; }
    get empty() { return this.docs.length === 0; }
    forEach(cb: (d: QueryDocumentSnapshot<T>) => void) { this.docs.forEach(cb); }
    docChanges() { return this.docs.map(doc => ({ type: 'added' as const, doc })); }
}

// -------------------------------------------------------------- Timestamp ---

export class Timestamp {
    constructor(readonly seconds: number, readonly nanoseconds: number) {}
    static now() { return Timestamp.fromMillis(Date.now()); }
    static fromDate(d: Date) { return Timestamp.fromMillis(d.getTime()); }
    static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
    toDate() { return new Date(this.toMillis()); }
    toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
    toJSON() { return this.toDate().toISOString(); }
    valueOf() { return this.toDate().toISOString(); }
    isEqual(o: Timestamp) { return o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
}

// --------------------------------------------------------- field values ---

class FieldValue {
    constructor(readonly kind: 'serverTimestamp' | 'increment' | 'delete' | 'arrayUnion' | 'arrayRemove', readonly value?: any) {}
}
export const serverTimestamp = () => new FieldValue('serverTimestamp');
export const increment = (n: number) => new FieldValue('increment', n);
export const deleteField = () => new FieldValue('delete');
export const arrayUnion = (...items: any[]) => new FieldValue('arrayUnion', items);
export const arrayRemove = (...items: any[]) => new FieldValue('arrayRemove', items);

// ---------------------------------------------------------------- helpers ---

const isPlainObject = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v)
    && !(v instanceof Date) && !(v instanceof Timestamp) && !(v instanceof FieldValue);

const getPath = (obj: any, path: string) =>
    path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Serialize for storage: Dates/Timestamps become ISO strings, sentinels resolve against `existing`. */
const toStored = (value: any, existing?: any): any => {
    if (value instanceof FieldValue) {
        switch (value.kind) {
            case 'serverTimestamp': return new Date().toISOString();
            case 'increment': return (Number(existing) || 0) + value.value;
            case 'arrayUnion': {
                const base = Array.isArray(existing) ? [...existing] : [];
                for (const item of value.value) if (!base.some(b => JSON.stringify(b) === JSON.stringify(item))) base.push(item);
                return base;
            }
            case 'arrayRemove': {
                const base = Array.isArray(existing) ? existing : [];
                return base.filter(b => !value.value.some((r: any) => JSON.stringify(r) === JSON.stringify(b)));
            }
            case 'delete': return undefined;
        }
    }
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(v => toStored(v));
    if (isPlainObject(value)) {
        const out: DocumentData = {};
        for (const [k, v] of Object.entries(value)) {
            const s = toStored(v, existing?.[k]);
            if (s !== undefined && !(v instanceof FieldValue && v.kind === 'delete')) out[k] = s;
        }
        return out;
    }
    return value;
};

/** Merge `patch` into `base` (deep for maps, like setDoc merge / updateDoc). */
const mergeInto = (base: DocumentData, patch: DocumentData): DocumentData => {
    const out: DocumentData = { ...base };
    for (const [k, v] of Object.entries(patch)) {
        if (v instanceof FieldValue && v.kind === 'delete') { delete out[k]; continue; }
        if (v === undefined) continue;
        if (isPlainObject(v) && isPlainObject(out[k])) out[k] = mergeInto(out[k], v);
        else out[k] = toStored(v, out[k]);
    }
    return out;
};


const permissionDenied = (path: string) =>
    new FirestoreError('permission-denied', `Missing or insufficient permissions (${path}).`);

const toFirestoreError = (error: any, path: string): FirestoreError => {
    const code = error?.code;
    const msg = error?.message || String(error);
    if (code === '42501' || /row-level security|permission denied|locked/i.test(msg)) {
        const e = permissionDenied(path);
        e.message = msg;
        return e;
    }
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return new FirestoreError('unavailable', msg);
    return new FirestoreError('unknown', msg);
};

const newId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
};

// Firestore ordering: null < boolean < number < string < others.
const typeRank = (v: any) => v == null ? 0 : typeof v === 'boolean' ? 1 : typeof v === 'number' ? 2 : typeof v === 'string' ? 3 : 4;
const compare = (a: any, b: any): number => {
    if (a instanceof Timestamp) a = a.toDate().toISOString();
    if (b instanceof Timestamp) b = b.toDate().toISOString();
    if (a instanceof Date) a = a.toISOString();
    if (b instanceof Date) b = b.toISOString();
    const ra = typeRank(a), rb = typeRank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 4) return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
    return a < b ? -1 : a > b ? 1 : 0;
};
const norm = (v: any) => v instanceof Timestamp || v instanceof Date ? toStored(v) : v;

const matches = (data: DocumentData, c: Extract<Constraint, { kind: 'where' }>): boolean => {
    const v = getPath(data, c.field);
    const val = norm(c.value);
    switch (c.op) {
        case '==': return v !== undefined && compare(v, val) === 0;
        case '!=': return v !== undefined && compare(v, val) !== 0;
        case '<': return v !== undefined && typeRank(v) === typeRank(val) && compare(v, val) < 0;
        case '<=': return v !== undefined && typeRank(v) === typeRank(val) && compare(v, val) <= 0;
        case '>': return v !== undefined && typeRank(v) === typeRank(val) && compare(v, val) > 0;
        case '>=': return v !== undefined && typeRank(v) === typeRank(val) && compare(v, val) >= 0;
        case 'in': return (val as any[]).some(x => compare(v, norm(x)) === 0);
        case 'not-in': return v !== undefined && !(val as any[]).some(x => compare(v, norm(x)) === 0);
        case 'array-contains': return Array.isArray(v) && v.some(x => compare(x, val) === 0);
        case 'array-contains-any': return Array.isArray(v) && v.some(x => (val as any[]).some(y => compare(x, norm(y)) === 0));
    }
};

// Plain `==` on a scalar can run in the database (as text); everything else here.
const serverFilterable = (c: Constraint): c is Extract<Constraint, { kind: 'where' }> =>
    c.kind === 'where' && !c.field.includes('.') &&
    ((c.op === '==' && ['string', 'number', 'boolean'].includes(typeof c.value)) ||
     (c.op === 'in' && Array.isArray(c.value) && c.value.length > 0 && c.value.every((x: any) => ['string', 'number', 'boolean'].includes(typeof x))));

type Row = { id: string; data: DocumentData };

const PAGE = 1000;
const fetchRows = async (table: string, constraints: Constraint[]): Promise<Row[]> => {
    const sb = getSupabase();
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
        let q = sb.from(table).select('id, data').order('id').range(from, from + PAGE - 1);
        for (const c of constraints) {
            if (!serverFilterable(c)) continue;
            if (c.op === '==') q = q.filter(`data->>${c.field}`, 'eq', String(c.value));
            else q = q.filter(`data->>${c.field}`, 'in', `(${(c.value as any[]).map(x => `"${String(x).replace(/"/g, '\\"')}"`).join(',')})`);
        }
        const { data, error } = await q;
        if (error) throw toFirestoreError(error, table);
        rows.push(...((data || []) as Row[]));
        if (!data || data.length < PAGE) break;
    }
    return rows;
};

const runQuery = async (table: string, constraints: Constraint[]): Promise<Row[]> => {
    let rows = await fetchRows(table, constraints);
    for (const c of constraints) if (c.kind === 'where') rows = rows.filter(r => matches(r.data, c));
    const orders = constraints.filter((c): c is Extract<Constraint, { kind: 'orderBy' }> => c.kind === 'orderBy');
    if (orders.length) {
        // Firestore leaves out documents missing an orderBy field.
        rows = rows.filter(r => orders.every(o => getPath(r.data, o.field) !== undefined));
        rows.sort((a, b) => {
            for (const o of orders) {
                const d = compare(getPath(a.data, o.field), getPath(b.data, o.field));
                if (d) return o.dir === 'desc' ? -d : d;
            }
            return 0;
        });
    }
    const lim = constraints.find((c): c is Extract<Constraint, { kind: 'limit' }> => c.kind === 'limit');
    return lim ? rows.slice(0, lim.n) : rows;
};

const snapshotOf = <T>(ref: CollectionReference<T> | Query<T>, rows: Row[]) => {
    const table = ref instanceof Query ? ref.table : ref.id;
    return new QuerySnapshot<T>(rows.map(r => new QueryDocumentSnapshot<T>(new DocumentReference<T>(table, r.id, ref.converter), r.data)));
};

// ------------------------------------------------------------- references ---

export const getFirestore = (_app?: unknown): Firestore => ({ type: 'firestore' });
export const initializeFirestore = (_app?: unknown, _settings?: unknown): Firestore => ({ type: 'firestore' });
export const persistentLocalCache = (_o?: unknown) => ({});
export const persistentMultipleTabManager = () => ({});

export function collection(_db: Firestore | unknown, path: string): CollectionReference {
    return new CollectionReference(path);
}

export function doc<T>(parent: CollectionReference<T>, id?: string): DocumentReference<T>;
export function doc(parent: Firestore | unknown, path: string, id?: string): DocumentReference<DocumentData>;
export function doc<T = DocumentData>(parent: Firestore | CollectionReference<T> | unknown, pathOrId?: string, id?: string): DocumentReference<T> {
    if (parent instanceof CollectionReference) {
        return new DocumentReference<T>(parent.id, pathOrId ?? newId(), parent.converter);
    }
    if (id !== undefined) return new DocumentReference<T>(pathOrId as string, id);
    const [table, docId] = String(pathOrId).split('/');
    return new DocumentReference<T>(table, docId ?? newId());
}

export function query<T>(ref: CollectionReference<T> | Query<T>, ...constraints: Constraint[]): Query<T> {
    if (ref instanceof Query) return new Query<T>(ref.table, [...ref.constraints, ...constraints], ref.converter);
    return new Query<T>(ref.id, constraints, ref.converter);
}
export const where = (field: string, op: WhereOp, value: any): Constraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ kind: 'orderBy', field, dir });
export const limit = (n: number): Constraint => ({ kind: 'limit', n });

// ------------------------------------------------------------------ reads ---

const readRow = async (table: string, id: string): Promise<DocumentData | undefined> => {
    const { data, error } = await getSupabase().from(table).select('data').eq('id', id).maybeSingle();
    if (error) throw toFirestoreError(error, `${table}/${id}`);
    return data ? (data as { data: DocumentData }).data : undefined;
};

export async function getDoc<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
    return new DocumentSnapshot<T>(ref, await readRow(ref.table, ref.id));
}
export const getDocFromServer = getDoc;

export async function getDocs<T>(ref: CollectionReference<T> | Query<T>): Promise<QuerySnapshot<T>> {
    const table = ref instanceof Query ? ref.table : ref.id;
    const constraints = ref instanceof Query ? ref.constraints : [];
    return snapshotOf(ref, await runQuery(table, constraints));
}
export const getDocsFromServer = getDocs;

export async function getCountFromServer(ref: CollectionReference<any> | Query<any>) {
    const table = ref instanceof Query ? ref.table : ref.id;
    const constraints = ref instanceof Query ? ref.constraints : [];
    const onlyServer = constraints.every(c => serverFilterable(c));
    let count: number;
    if (onlyServer) {
        let q = getSupabase().from(table).select('id', { count: 'exact', head: true });
        for (const c of constraints) {
            if (!serverFilterable(c)) continue;
            if (c.op === '==') q = q.filter(`data->>${c.field}`, 'eq', String(c.value));
            else q = q.filter(`data->>${c.field}`, 'in', `(${(c.value as any[]).map(x => `"${String(x)}"`).join(',')})`);
        }
        const { count: n, error } = await q;
        if (error) throw toFirestoreError(error, table);
        count = n ?? 0;
    } else {
        count = (await runQuery(table, constraints)).length;
    }
    return { data: () => ({ count }) };
}

// ----------------------------------------------------------------- writes ---

const writeRow = async (table: string, id: string, data: DocumentData) => {
    const { error } = await getSupabase().from(table).upsert({ id, data, updated_at: new Date().toISOString() });
    if (error) throw toFirestoreError(error, `${table}/${id}`);
};

export async function setDoc<T>(ref: DocumentReference<T>, data: WithFieldValue<T> | DocumentData, options?: SetOptions): Promise<void> {
    const input = ref.converter ? ref.converter.toFirestore(data as T) : (data as DocumentData);
    if (options?.merge) {
        const existing = (await readRow(ref.table, ref.id)) || {};
        await writeRow(ref.table, ref.id, mergeInto(existing, input));
    } else {
        await writeRow(ref.table, ref.id, toStored(input));
    }
}

export async function updateDoc(ref: DocumentReference<any>, fields: DocumentData): Promise<void> {
    const existing = await readRow(ref.table, ref.id);
    if (existing === undefined) {
        throw new FirestoreError('not-found', `No document to update: ${ref.path}`);
    }
    // Firestore's updateDoc replaces nested maps it is given (no deep merge)
    // except via dotted paths, which this app does not use.
    const next: DocumentData = { ...existing };
    for (const [k, v] of Object.entries(fields)) {
        if (v instanceof FieldValue && v.kind === 'delete') delete next[k];
        else if (v !== undefined) next[k] = toStored(v, existing[k]);
    }
    const { data, error } = await getSupabase().from(ref.table)
        .update({ data: next, updated_at: new Date().toISOString() }).eq('id', ref.id).select('id');
    if (error) throw toFirestoreError(error, ref.path);
    if (!data || data.length === 0) throw permissionDenied(ref.path);
}

export async function addDoc<T>(ref: CollectionReference<T>, data: WithFieldValue<T> | DocumentData): Promise<DocumentReference<T>> {
    const docRef = new DocumentReference<T>(ref.id, newId(), ref.converter);
    await setDoc(docRef, data);
    return docRef;
}

export async function deleteDoc(ref: DocumentReference<any>): Promise<void> {
    const { error } = await getSupabase().from(ref.table).delete().eq('id', ref.id);
    if (error) throw toFirestoreError(error, ref.path);
}

// ------------------------------------------------- batches & transactions ---

type Op = () => Promise<void>;

export class WriteBatch {
    private ops: Op[] = [];
    set<T>(ref: DocumentReference<T>, data: WithFieldValue<T> | DocumentData, options?: SetOptions) { this.ops.push(() => setDoc(ref, data, options)); return this; }
    update(ref: DocumentReference<any>, fields: DocumentData) { this.ops.push(() => updateDoc(ref, fields)); return this; }
    delete(ref: DocumentReference<any>) { this.ops.push(() => deleteDoc(ref)); return this; }
    async commit() {
        const ops = this.ops;
        this.ops = [];
        // Deletes and plain sets in bulk would be faster; kept sequential so
        // a failure reports the first write that failed, like a batch does.
        for (const op of ops) await op();
    }
}
export const writeBatch = (_db?: unknown) => new WriteBatch();

export class Transaction {
    private ops: Op[] = [];
    get<T>(ref: DocumentReference<T>) { return getDoc(ref); }
    set<T>(ref: DocumentReference<T>, data: WithFieldValue<T> | DocumentData, options?: SetOptions) { this.ops.push(() => setDoc(ref, data, options)); return this; }
    update(ref: DocumentReference<any>, fields: DocumentData) { this.ops.push(() => updateDoc(ref, fields)); return this; }
    delete(ref: DocumentReference<any>) { this.ops.push(() => deleteDoc(ref)); return this; }
    async _commit() { for (const op of this.ops) await op(); }
}

export async function runTransaction<R>(_db: unknown, fn: (tx: Transaction) => Promise<R>): Promise<R> {
    const tx = new Transaction();
    const result = await fn(tx);
    await tx._commit();
    return result;
}

// ------------------------------------------------------------ listeners ---

type Unsubscribe = () => void;
type ErrorFn = (e: FirestoreError) => void;

const channels = new Map<string, { channel: RealtimeChannel; listeners: Set<() => void> }>();

const watchTable = (table: string, onChange: () => void): Unsubscribe => {
    let entry = channels.get(table);
    if (!entry) {
        const listeners = new Set<() => void>();
        const channel = getSupabase()
            .channel(`table-${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, () => listeners.forEach(l => l()))
            .subscribe();
        entry = { channel, listeners };
        channels.set(table, entry);
    }
    entry.listeners.add(onChange);
    return () => {
        const e = channels.get(table);
        if (!e) return;
        e.listeners.delete(onChange);
        if (e.listeners.size === 0) {
            getSupabase().removeChannel(e.channel);
            channels.delete(table);
        }
    };
};

type Observer<S> = ((snap: S) => void) | { next?: (snap: S) => void; error?: ErrorFn };
export function onSnapshot<T>(ref: DocumentReference<T>, onNext: Observer<DocumentSnapshot<T>>, onError?: ErrorFn): Unsubscribe;
export function onSnapshot<T>(ref: CollectionReference<T> | Query<T>, onNext: Observer<QuerySnapshot<T>>, onError?: ErrorFn): Unsubscribe;
export function onSnapshot<T>(
    ref: DocumentReference<T> | CollectionReference<T> | Query<T>,
    onNext: ((snap: any) => void) | { next?: (snap: any) => void; error?: ErrorFn },
    onError?: ErrorFn,
): Unsubscribe {
    const next = typeof onNext === 'function' ? onNext : onNext.next;
    const error = typeof onNext === 'function' ? onError : onNext.error;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
        try {
            const snap = ref instanceof DocumentReference ? await getDoc(ref) : await getDocs(ref);
            if (active) next?.(snap);
        } catch (e: any) {
            if (active) {
                if (error) error(e instanceof FirestoreError ? e : toFirestoreError(e, 'listener'));
                else console.error('onSnapshot failed', e);
            }
        }
    };
    // Several changes in quick succession (a batch) trigger one reload.
    const scheduleReload = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(load, 300);
    };

    void load();
    const table = ref instanceof DocumentReference ? ref.table : ref instanceof Query ? ref.table : ref.id;
    const stopWatching = watchTable(table, scheduleReload);
    return () => {
        active = false;
        if (timer) clearTimeout(timer);
        stopWatching();
    };
}
