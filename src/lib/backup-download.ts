/**
 * @fileOverview Download a backup file. Shared by the sidebar backup icon
 * and Settings > System > Backup.
 */
import { exportData, compressBackup, RAW_LOGS_COLLECTION } from '@/services/backup-service';
import { recordBackupTaken } from '@/lib/auto-backup';

export interface BackupDownloadResult {
    records: number;
    skipped: { collection: string; reason: string }[];
    gzipped: boolean;
}

/** Reads every collection once (one read per record), then saves the file. */
export const downloadBackup = async (userId: string, options: { includeRawLogs?: boolean } = {}): Promise<BackupDownloadResult> => {
    const data = await exportData({ exclude: options.includeRawLogs ? [] : [RAW_LOGS_COLLECTION] });
    const { blob, gzipped } = await compressBackup(data);
    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `starsutra-backup-${new Date().toISOString().slice(0, 10)}.json${gzipped ? '.gz' : ''}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        URL.revokeObjectURL(url);
    }
    recordBackupTaken(userId);
    const records = Object.values(data).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
    return { records, skipped: data?._meta?.skipped || [], gzipped };
};
