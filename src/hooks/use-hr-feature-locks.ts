'use client';
/**
 * @fileOverview Reads the admin-controlled HR feature locks.
 *
 * Attendance Logs, Data Import, Performance Benchmark and Payroll Analytics
 * each stream a fiscal year (two BS years) of attendance/raw-log records to
 * display far less than that, and together they blew past Firestore's free
 * daily read quota - a write anywhere in the app (not just HR) then fails,
 * since writes cannot be served from cache the way reads can.
 *
 * These flags let an administrator switch each feature back on temporarily
 * from Settings > System when it's actually needed, without deleting any of
 * the underlying code. Stored in their own settings document rather than
 * folded into `hr_config`, because HR Setting saves that document wholesale
 * from its own local state (see src/app/hr/office/page.tsx) - a flag kept
 * there would be silently wiped the next time someone saves that page.
 *
 * Every flag defaults to `false`. A missing or unreadable document leaves
 * everything locked, which is the safe failure mode here - the opposite
 * default would let a permissions hiccup silently re-open the read-heavy
 * pages for everyone.
 */
import { useEffect, useState } from 'react';
import { onSettingUpdate, setSetting } from '@/services/settings-service';

export const HR_FEATURE_LOCKS_SETTING_ID = 'hr_feature_locks';

export interface HrFeatureLocks {
    attendanceLogsEnabled: boolean;
    dataImportEnabled: boolean;
    benchmarkEnabled: boolean;
    payrollAnalyticsEnabled: boolean;
}

export const DEFAULT_HR_FEATURE_LOCKS: HrFeatureLocks = {
    attendanceLogsEnabled: false,
    dataImportEnabled: false,
    benchmarkEnabled: false,
    payrollAnalyticsEnabled: false,
};

/**
 * Reads the current locks. `isLoading` matters as much as the flags
 * themselves: every attendance/raw-log subscription this feature gates must
 * wait for `!isLoading`, not just check the flag, or it fires during the
 * first render before the document has arrived - the exact 17,000-read
 * mistake this whole mechanism exists to prevent.
 */
export const useHrFeatureLocks = (): { locks: HrFeatureLocks; isLoading: boolean } => {
    const [locks, setLocks] = useState<HrFeatureLocks>(DEFAULT_HR_FEATURE_LOCKS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSettingUpdate(HR_FEATURE_LOCKS_SETTING_ID, (setting) => {
            setLocks({ ...DEFAULT_HR_FEATURE_LOCKS, ...(setting?.value || {}) });
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return { locks, isLoading };
};

export const setHrFeatureLocks = async (
    locks: HrFeatureLocks,
    modifiedBy: string,
): Promise<void> => {
    await setSetting(HR_FEATURE_LOCKS_SETTING_ID, {
        ...locks,
        lastModifiedBy: modifiedBy,
        lastModifiedAt: new Date().toISOString(),
    });
};
