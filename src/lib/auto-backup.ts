/**
 * @fileOverview The automatic backup download.
 *
 * This used to run for EVERY user on their first login of the day, in every
 * browser. Each run read every document in the database - on the free plan
 * that alone could use up most of the 50,000 daily reads - and saved a copy
 * of all payroll and staff data into that PC's Downloads folder.
 *
 * Now it runs only for administrators, at most once a week per browser, and
 * leaves out the raw machine logs (the largest collection, and only the
 * source of attendance that is already stored). Anyone who needs a full
 * snapshot, or one right now, uses Settings > System > Backup.
 */

import { exportData, gzipString, RAW_LOGS_COLLECTION } from '@/services/backup-service';

const STORAGE_PREFIX = 'starsutra:lastAutoBackup:';
const INTERVAL_DAYS = 7;

const today = () => new Date().toISOString().slice(0, 10);

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

/** The date of this user's last automatic backup in this browser. */
export const lastAutoBackupDate = (userId: string): string | null => {
    try {
        return localStorage.getItem(storageKey(userId));
    } catch {
        // Private windows and blocked site data throw here.
        return null;
    }
};

/**
 * True when an administrator has had no automatic backup in this browser for
 * a week. When storage is unavailable this returns FALSE: without somewhere
 * to record the run it could not be throttled, and a full export on every
 * login is the behaviour being fixed.
 */
export const isAutoBackupDue = (userId: string, isAdmin: boolean): boolean => {
    if (!isAdmin) return false;
    try {
        localStorage.setItem(`${STORAGE_PREFIX}probe`, '1');
        localStorage.removeItem(`${STORAGE_PREFIX}probe`);
    } catch {
        return false;
    }
    const last = lastAutoBackupDate(userId);
    if (!last) return true;
    const ageDays = (Date.parse(today()) - Date.parse(last)) / 86_400_000;
    return !(ageDays >= 0 && ageDays < INTERVAL_DAYS);
};

const markDone = (userId: string) => {
    try {
        localStorage.setItem(storageKey(userId), today());
    } catch {
        /* nothing we can do; the next login simply tries again */
    }
};

/**
 * Download a backup if one is due. Deliberately NOT awaited by the caller -
 * the user is already signed in and should not wait on it. Returns true if a
 * backup was taken.
 */
export const runAutoBackup = async (username: string, userId: string, isAdmin: boolean): Promise<boolean> => {
    if (!isAutoBackupDue(userId, isAdmin)) return false;

    const data = await exportData({ exclude: [RAW_LOGS_COLLECTION] });

    // Compact JSON, gzipped where the platform has CompressionStream; plain
    // .json otherwise so a webview without it still gets its backup.
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

    // Recorded only after the download started, so a failure is retried at
    // the next login rather than skipped for the week.
    markDone(userId);
    return true;
};
