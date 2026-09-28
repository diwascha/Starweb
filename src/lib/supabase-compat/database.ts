/**
 * @fileOverview `firebase/database` stand-in. The app only used the Realtime
 * Database for the connection indicator ('.info/connected'); that now follows
 * the browser's online/offline state.
 */
export type Database = { type: 'database' };
export type DatabaseReference = { path: string };
type Snapshot = { val: () => any };

export const getDatabase = (_app?: unknown): Database => ({ type: 'database' });
export const ref = (_db: Database, path: string): DatabaseReference => ({ path });

const handlers = new Map<(s: Snapshot) => void, () => void>();

export function onValue(_r: DatabaseReference, cb: (s: Snapshot) => void, _onError?: (e: any) => void) {
    const emit = () => cb({ val: () => (typeof navigator === 'undefined' ? true : navigator.onLine) });
    emit();
    window.addEventListener('online', emit);
    window.addEventListener('offline', emit);
    const stop = () => {
        window.removeEventListener('online', emit);
        window.removeEventListener('offline', emit);
    };
    handlers.set(cb, stop);
    return () => { stop(); handlers.delete(cb); };
}

// `cb` may be the callback given to onValue, or (as the provider passes) the
// unsubscribe function onValue returned.
export function off(_r: DatabaseReference, _event?: string, cb?: any) {
    if (!cb) return;
    if (handlers.has(cb)) { handlers.get(cb)!(); handlers.delete(cb); }
    else if (typeof cb === 'function' && cb.length === 0) cb();
}
