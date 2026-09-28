/**
 * @fileOverview Backup reminder for administrators.
 *
 * The app used to download a backup automatically: first on every login, then
 * (after the audit) weekly for admins only. Either way it read the WHOLE
 * database, one read per record (about 3,300 in September 2026, growing
 * with every month of payroll and attendance). "Weekly" was tracked per
 * browser, so a fresh browser or a reinstalled desktop app ran a full backup
 * on every login - two logins on one day cost 6,600 reads.
 *
 * Nothing is read automatically any more. An admin who has not downloaded a
 * backup in this browser for a week gets a reminder (at most once a day), and
 * the backup runs only when they click the backup icon in the sidebar footer
 * (or Download in Settings > System > Backup).
 */

const LAST_BACKUP_PREFIX = 'starsutra:lastBackup:';
const LAST_REMINDER_PREFIX = 'starsutra:lastBackupReminder:';
const INTERVAL_DAYS = 7;

const today = () => new Date().toISOString().slice(0, 10);

const read = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        // Private windows and blocked site data throw here.
        return null;
    }
};

const write = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* nothing to do: the reminder may simply show again */
    }
};

const daysSince = (isoDate: string | null): number | null => {
    if (!isoDate) return null;
    const ms = Date.parse(today()) - Date.parse(isoDate);
    return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
};

/** Call after a backup file has been downloaded. */
export const recordBackupTaken = (userId: string) => write(`${LAST_BACKUP_PREFIX}${userId}`, today());

/**
 * For an administrator, a reminder message if no backup has been downloaded
 * in this browser for a week and no reminder has been shown today; otherwise
 * null. Reads nothing from the database.
 */
export const backupReminder = (userId: string, isAdmin: boolean): string | null => {
    if (!isAdmin) return null;
    if (read(`${LAST_REMINDER_PREFIX}${userId}`) === today()) return null;
    const age = daysSince(read(`${LAST_BACKUP_PREFIX}${userId}`));
    if (age !== null && age >= 0 && age < INTERVAL_DAYS) return null;
    write(`${LAST_REMINDER_PREFIX}${userId}`, today());
    return age === null
        ? 'No backup has been downloaded on this computer yet. Use the backup icon at the bottom of the sidebar.'
        : `Last backup on this computer was ${age} days ago. Use the backup icon at the bottom of the sidebar.`;
};
