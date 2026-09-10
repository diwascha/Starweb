/**
 * @fileOverview Already-calculated attendance importer.
 *
 * The monthly detail sheets inside the newer "Consolidated Ledger" workbook
 * (and some legacy sheets) already carry computed Regular Hours / Overtime /
 * Remarks for every punch - they are the old system's own final output, not
 * raw machine punches. Re-running this app's own hourly-calculation engine
 * over them would silently replace historical, already-audited numbers with
 * numbers computed under today's grace/rounding/free-late rules, which is
 * exactly the kind of quiet data change historical import must avoid.
 *
 * This module writes `processAttendanceImport`'s output straight to the
 * processed Attendance collection, using its own regularHours/overtimeHours
 * as-is - no raw log, no recalculation.
 */
import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import type { AttendanceRecord, Employee } from '@/lib/types';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp } from '@/lib/service-utils';
import { processAttendanceImport, resolveDominantPeriod, resolvePeriodFromSheetName } from '@/lib/attendance';
import { getEmployees } from '../employee-service';
import { getAttendanceCollection } from './data';
import { findPayrollBlockStart, importLegacyPayrollSheet } from '../payroll/legacy-import';
import { importConsolidatedLedger } from '../vba-import-service';
import { setFiscalYearPeriodLock } from '../period-lock';

export const CONSOLIDATED_LEDGER_SUMMARY_SHEET = 'consolidated ledger';
// Sheets that are never a month's attendance/payroll data, regardless of name.
export const NON_DATA_SHEETS = new Set(['dashboard', 'log', 'rates']);

/**
 * Looks up a column by header name (case/whitespace-insensitive, substring
 * match) in a row's raw imported data. Historical sheets don't all carry the
 * same columns, so any of these may legitimately be absent.
 */
const findRawColumn = (rawImportData: Record<string, any>, aliases: string[]): any => {
    const entries = Object.entries(rawImportData);
    for (const alias of aliases) {
        const exact = entries.find(([key]) => key.trim().toLowerCase() === alias);
        if (exact) return exact[1];
    }
    for (const alias of aliases) {
        const partial = entries.find(([key]) => key.trim().toLowerCase().includes(alias));
        if (partial) return partial[1];
    }
    return undefined;
};

/** Parses an Excel duration cell (decimal hours, "H:MM" text, or a time-of-day fraction) into hours. */
const parseDurationHours = (raw: any): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') {
        return raw < 1 ? raw * 24 : raw;
    }
    const str = String(raw).trim();
    if (!str || str === '-') return null;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
        const [h, m] = str.split(':').map(Number);
        return (h || 0) + (m || 0) / 60;
    }
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
};

export interface CalculatedAttendanceImportResult {
    attendanceRecords: number;
    newEmployees: number;
    skippedRows: number;
}

/**
 * Imports one sheet's already-calculated attendance block (columns A through
 * whichever column precedes the payroll block, keyed by header name - Date,
 * Name, On Duty, Off Duty, Clock In, Clock Out, Absent, Overtime, Regular
 * Hours, Remarks) directly into the processed Attendance collection.
 *
 * @param grid - Full sheet grid (header: 1 style).
 * @param sourceSheet - Sheet name, stored for audit/debug.
 * @param importedBy - Operator username.
 */
export const importCalculatedAttendanceSheet = async (
    grid: any[][],
    sourceSheet: string,
    importedBy: string
): Promise<CalculatedAttendanceImportResult> => {
    const result: CalculatedAttendanceImportResult = { attendanceRecords: 0, newEmployees: 0, skippedRows: 0 };
    const { processedData, skippedCount } = processAttendanceImport(grid);
    result.skippedRows = skippedCount;
    if (processedData.length === 0) return result;

    const { db } = getFirebase();
    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    const now = createTimestamp();
    let batch = writeBatch(db);
    let writeCount = 0;

    const commit = async () => {
        if (writeCount === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        writeCount = 0;
    };

    const ensureEmployee = (name: string): Employee => {
        const lowerName = name.toLowerCase().trim();
        const existing = employeeMap.get(lowerName);
        if (existing) return existing;

        const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
        const newEmp: Omit<Employee, 'id'> = {
            name: name.trim(),
            status: 'Working',
            wageBasis: 'Monthly',
            wageAmount: 0,
            mobileNumber: 'Not Provided',
            createdBy: importedBy,
            createdAt: now,
            ownership: 'Both',
        };
        batch.set(empRef, newEmp);
        writeCount++;
        const employee = { id: empRef.id, ...newEmp } as Employee;
        employeeMap.set(lowerName, employee);
        result.newEmployees++;
        return employee;
    };

    for (const row of processedData) {
        const employee = ensureEmployee(row.employeeName);
        const dateKey = row.dateADISO.slice(0, 10);
        const docId = `${employee.id}_${dateKey}_ledger`;
        const weekdayFromSheet = String(findRawColumn(row.rawImportData, ['weekday', 'week day']) ?? '').trim();
        const record: Omit<AttendanceRecord, 'id'> = {
            date: row.dateADISO,
            dateBS: row.dateBS,
            bsYear: row.bsYear,
            bsMonth: row.bsMonth,
            employeeName: employee.name,
            employeeId: employee.id,
            onDuty: row.onDuty,
            offDuty: row.offDuty,
            clockIn: row.clockIn,
            clockOut: row.clockOut,
            status: row.status,
            grossHours: (row.regularHours || 0) + (row.overtimeHours || 0),
            overtimeHours: row.overtimeHours || 0,
            regularHours: row.regularHours || 0,
            calculatedAt: now,
            calculatedBy: importedBy,
            remarks: row.remarks || null,
            rowIndex: row.importRowIndex,
            weekday: weekdayFromSheet || format(new Date(row.dateADISO), 'EEEE'),
            absent: row.status === 'Absent',
            gTime: parseDurationHours(findRawColumn(row.rawImportData, ['g. time', 'g time', 'gross time'])),
            breakHours: parseDurationHours(findRawColumn(row.rawImportData, ['break'])),
            gHours: parseDurationHours(findRawColumn(row.rawImportData, ['g. hours', 'g hours'])),
        };
        batch.set(doc(getAttendanceCollection(), docId), record, { merge: true });
        writeCount++;
        result.attendanceRecords++;

        if (writeCount >= 400) await commit();
    }

    await commit();
    return result;
};

/* =========================
   Sheet mapping preview
   ========================= */

export interface LedgerSheetPreview {
    sheetName: string;
    isConsolidatedSummary: boolean;
    hasAttendance: boolean;
    hasPayroll: boolean;
    guessedYear: number | null;
    guessedMonth: number | null; // 0-11
    rowCount: number;
}

/**
 * Inspects one sheet (without writing anything) so the import page can show
 * the user what it found and let them confirm or correct the year/month
 * before anything is committed. The payroll block has no date column of its
 * own, so this guess - or the user's correction of it - is the only source
 * of truth for which period payroll-only rows land in.
 *
 * A sheet literally named "Consolidated Ledger" is ALSO checked for a normal
 * monthly attendance/payroll layout (Name/Date rows plus an "Employee"
 * payroll block), same as any other sheet - not every workbook that carries
 * this name is the VBA-generated 5-section summary sheet, and even when it
 * is, some source files still cram real monthly attendance/payroll rows onto
 * it too. Flagging it as the summary sheet must never by itself suppress the
 * normal detection path - either or both can end up populated, and the
 * caller decides (via includeAttendance/includePayroll and
 * includeConsolidatedSummary) which of them to actually import.
 */
export const previewLedgerSheet = (sheetName: string, grid: any[][]): LedgerSheetPreview => {
    const isConsolidatedSummary = sheetName.trim().toLowerCase() === CONSOLIDATED_LEDGER_SUMMARY_SHEET;

    let hasAttendance = false;
    let hasPayroll = false;
    let guessedYear: number | null = null;
    let guessedMonth: number | null = null;

    try {
        const { processedData, headerRow, headerIndex } = processAttendanceImport(grid);
        if (processedData.length > 0) {
            hasAttendance = true;
            const dominant = resolveDominantPeriod(processedData);
            if (dominant) { guessedYear = dominant.year; guessedMonth = dominant.month; }
        }
        if (headerIndex >= 0) {
            hasPayroll = findPayrollBlockStart(headerRow) !== null;
        }
    } catch {
        // No parseable "Name"/"Date" header at all - not a normal
        // attendance/payroll sheet. Still fine if it's the VBA summary sheet.
    }

    if (guessedYear === null) {
        const fallback = resolvePeriodFromSheetName(sheetName);
        if (fallback) { guessedYear = fallback.year; guessedMonth = fallback.month; }
    }

    return { sheetName, isConsolidatedSummary, hasAttendance, hasPayroll, guessedYear, guessedMonth, rowCount: grid.length };
};

/* =========================
   Confirmed-mapping import
   ========================= */

export interface ConfirmedSheetMapping {
    sheetName: string;
    year: number;
    month: number;
    includeAttendance: boolean;
    includePayroll: boolean;
}

export interface LedgerWorkbookImportResult {
    attendanceRecords: number;
    payrollRecords: number;
    newEmployees: number;
    bonusSummaries: number;
    behaviorLedger: number;
    behaviorAnalytics: number;
    skippedSheets: string[];
}

/**
 * Runs the import for exactly the sheets and periods the user confirmed in
 * the mapping dialog - never the raw auto-detected guesses.
 *
 * @param sheets - Every candidate sheet's grid, keyed by sheet name.
 * @param mappings - The user-confirmed year/month and inclusion flags.
 * @param includeConsolidatedSummary - Whether to also run the 5-section
 *   "Consolidated Ledger" summary sheet importer, when that sheet exists.
 */
export const importLedgerWorkbook = async (
    sheets: Map<string, any[][]>,
    mappings: ConfirmedSheetMapping[],
    includeConsolidatedSummary: boolean,
    importedBy: string,
    onProgress: (label: string) => void
): Promise<LedgerWorkbookImportResult> => {
    const result: LedgerWorkbookImportResult = {
        attendanceRecords: 0, payrollRecords: 0, newEmployees: 0,
        bonusSummaries: 0, behaviorLedger: 0, behaviorAnalytics: 0,
        skippedSheets: [],
    };

    // Every period actually written to during this import gets locked by
    // default once the import finishes - imported historical data must be
    // protected from accidental recalculation/deletion from the moment it
    // lands, not left open until someone remembers to lock it manually.
    const importedPeriods = new Map<string, { bsYear: number; bsMonth: number }>();
    const markImported = (bsYear: number, bsMonth: number) => importedPeriods.set(`${bsYear}-${bsMonth}`, { bsYear, bsMonth });

    for (const mapping of mappings) {
        if (!mapping.includeAttendance && !mapping.includePayroll) continue;
        const grid = sheets.get(mapping.sheetName);
        if (!grid) continue;

        onProgress(mapping.sheetName);

        // Attendance and payroll are two independent blocks on the same
        // sheet - a failure in one (e.g. a Firestore rejection specific to
        // one field) must not silently discard the other's already-written
        // records, and must not disappear as an unexplained "skipped sheet".
        if (mapping.includeAttendance) {
            try {
                const attResult = await importCalculatedAttendanceSheet(grid, mapping.sheetName, importedBy);
                result.attendanceRecords += attResult.attendanceRecords;
                result.newEmployees += attResult.newEmployees;
                if (attResult.attendanceRecords > 0) markImported(mapping.year, mapping.month);
            } catch (error: any) {
                console.error(`Ledger import: attendance block failed for sheet "${mapping.sheetName}"`, error);
                result.skippedSheets.push(`${mapping.sheetName} (attendance: ${error?.message || 'unknown error'})`);
            }
        }
        if (mapping.includePayroll) {
            try {
                const { headerRow, headerIndex } = processAttendanceImport(grid);
                if (headerIndex >= 0) {
                    const payResult = await importLegacyPayrollSheet(
                        grid, headerRow, headerIndex, mapping.year, mapping.month,
                        mapping.sheetName, importedBy, 'consolidated-ledger-import'
                    );
                    result.payrollRecords += payResult.payrollRecords;
                    result.newEmployees += payResult.newEmployees;
                    if (payResult.payrollRecords > 0) markImported(mapping.year, mapping.month);
                }
            } catch (error: any) {
                console.error(`Ledger import: payroll block failed for sheet "${mapping.sheetName}"`, error);
                result.skippedSheets.push(`${mapping.sheetName} (payroll: ${error?.message || 'unknown error'})`);
            }
        }
    }

    if (includeConsolidatedSummary) {
        const summaryGrid = sheets.get(
            Array.from(sheets.keys()).find(name => name.trim().toLowerCase() === CONSOLIDATED_LEDGER_SUMMARY_SHEET) || ''
        );
        if (summaryGrid) {
            onProgress('Consolidated Ledger (summary)');
            const summaryResult = await importConsolidatedLedger(summaryGrid, importedBy, () => {});
            result.payrollRecords += summaryResult.payroll;
            result.newEmployees += summaryResult.newEmployees;
            result.bonusSummaries += summaryResult.bonusSummaries;
            result.behaviorLedger += summaryResult.behaviorLedger;
            result.behaviorAnalytics += summaryResult.behaviorAnalytics;
        }
    }

    if (importedPeriods.size > 0) {
        try {
            await setFiscalYearPeriodLock(Array.from(importedPeriods.values()), true, importedBy);
        } catch (error) {
            console.error('Ledger import: failed to auto-lock imported periods', error);
        }
    }

    return result;
};
