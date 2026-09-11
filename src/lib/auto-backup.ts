/**
 * @fileOverview Throttling the automatic backup download.
 *
 * The login page used to call exportData() on EVERY successful sign-in. That
 * reads every document in ~30 collections, serialises the lot to JSON, and
 * drops a file in the user's Downloads folder. Three things were wrong with
 * it, and they get worse as the database grows:
 *
 *   - Cost and time. It is a full read of the entire database, per login,
 *     per user. Five staff signing in three times a day is fifteen complete
 *     exports, billed per document read.
 *   - It blocked the login. The call was awaited before the session was
 *     handed over, so sign-in waited for the whole database to download.
 *   - It littered Downloads with a near-identical file every single time.
 *
 * The backup itself is worth keeping - it is the only copy the business
 * controls - so this throttles it to once per calendar day per user, per
 * browser, and lets it run after the user is already inside the app.
 *
 * NOTE ON SCOPE: this is a client-side safety net, not a backup strategy. It
 * still costs one full database read per user per day, and it only captures
 * what that browser can see. A scheduled `gcloud firestore export` runs
 * server-side, costs nothing on the client, and is the thing to move to when
 * the dataset gets large.
 */

import { exportData, gzipString } from '@/services/backup-service';

const STORAGE_PREFIX = 'starsutra:lastAutoBackup:';

const today = () => new Date().toISOString().slice(0, 10);

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

/** The date of this user's last successful auto-backup in this browser. */
export const lastAutoBackupDate = (userId: string): string | null => {
    try {
        return localStorage.getItem(storageKey(userId));
    } catch {
        // Private windows and blocked site data throw here.
        return null;
    }
};

/**
 * True when this user has not had an automatic backup in this browser today.
 *
 * When storage is unavailable this returns FALSE rather than true: without
 * somewhere to record the run we cannot throttle it, and silently downloading
 * the whole database on every single login is the behaviour being fixed.
 */
export const isAutoBackupDue = (userId: string): boolean => {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}probe`, '1');
        localStorage.removeItem(`${STORAGE_PREFIX}probe`);
    } catch {
        return false;
    }
    return lastAutoBackupDate(userId) !== today();
};

const markDone = (userId: string) => {
    try {
        localStorage.setItem(storageKey(userId), today());
    } catch {
        /* nothing we can do; the next login simply tries again */
    }
};

/**
 * Download a full backup if one is due today.
 *
 * Deliberately NOT awaited by the caller - the user is already signed in and
 * should not wait on this. Returns true if a backup was taken.
 */
export const runDailyAutoBackup = async (username: string, userId: string): Promise<boolean> => {
    if (!isAutoBackupDue(userId)) return false;

    const data = await exportData();

    // Compact JSON, then gzip where the platform has CompressionStream.
    // The pretty-printed export was ~16 MB and growing; this brings it to
    // roughly a fifth of that. Falls back to plain .json so a webview
    // without CompressionStream still gets its backup.
    const json = JSON.stringify(data);
    const gz = await gzipString(json);
    const blob = gz ?? new Blob([json], { type: 'application/json' });
    const extension = gz ? 'json.gz' : 'json';

    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `starsutra-autobackup-${username}-${today()}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        URL.revokeObjectURL(url);
    }

    // Recorded only after the download actually started, so a failure is
    // retried at the next login rather than skipped for the day.
    markDone(userId);
    return true;
};
