/**
 * @fileOverview High-density VBA Report Import Service.
 * 
 * Handles the extraction of pre-computed reporting blocks from a specifically 
 * formatted Excel grid, routing data to separate financial and behavioral modules.
 */

import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, setDoc } from 'firebase/firestore';
import type { 
    Employee, 
    Payroll, 
    BehavioralPatternRecord, 
    EnhancedInsightRecord, 
    PatternInsightParsed, 
    DowPatternItem, 
    BehaviorComparisonRecord,
    ComparisonMetric
} from '@/lib/types';
import { getEmployees } from './employee-service';
import { createTimestamp, coerceNumber } from '@/lib/service-utils';
import { COLLECTIONS } from '@/lib/constants';

// Anchor column index Q (16)
const ANCHOR_COL = 16; 

/**
 * Main parser for VBA-produced Excel reports.
 * Locate each block by title, extract verbatim data, and persist to Firestore.
 */
export const importVbaReport = async (
    grid: any[][], 
    bsYear: number, 
    bsMonth: number, 
    importedBy: string
) => {
    const { db } = getFirebase();
    const employees = await getEmployees();
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
    
    const results = {
        payroll: 0,
        behavioralPatterns: 0,
        enhancedInsights: 0,
        patternInsights: false,
        dowPatterns: 0,
        comparison: 0,
        newEmployees: 0
    };

    // Shared Batch for Atomic Consistency
    let batch = writeBatch(db);
    let writeCount = 0;
    const now = createTimestamp();

    const commitIfNeeded = async () => {
        if (writeCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }
    };

    // 1. Employee Creation Utility
    const ensureEmployee = async (name: string) => {
        const lowerName = name.toLowerCase().trim();
        if (employeeMap.has(lowerName)) return employeeMap.get(lowerName)!;

        const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
        const newEmp: Omit<Employee, 'id'> = {
            name,
            status: 'Working',
            wageBasis: 'Monthly',
            wageAmount: 0,
            mobileNumber: 'Not Provided',
            createdBy: importedBy,
            createdAt: now
        };
        batch.set(empRef, newEmp);
        const employee = { id: empRef.id, ...newEmp } as Employee;
        employeeMap.set(lowerName, employee);
        results.newEmployees++;
        writeCount++;
        await commitIfNeeded();
        return employee;
    };

    // --- BLOCK 1: PAYROLL ---
    // Scan for payroll block - usually starts with "Employee" header at column Q
    const payrollStartIdx = findBlockStart(grid, "Employee", ANCHOR_COL);
    if (payrollStartIdx !== -1) {
        const headerRow = grid[payrollStartIdx];
        const isBonusMode = headerRow.some(c => String(c).toLowerCase().includes("bonus"));
        const dataRows = readBlock(grid, payrollStartIdx + 1, ANCHOR_COL);

        for (const row of dataRows) {
            const empName = String(row[0] || '').trim();
            if (!empName || empName.toLowerCase() === 'total' || empName.toLowerCase() === 'employee') continue;
            
            const employee = await ensureEmployee(empName);
            const payrollId = `${bsYear}-${bsMonth}-${employee.id}`;
            
            const payrollData: Omit<Payroll, 'id'> = {
                bsYear, bsMonth,
                employeeId: employee.id,
                employeeName: employee.name,
                regularHours: coerceNumber(row[1]),
                otHours: coerceNumber(row[2]),
                absentDays: coerceNumber(row[3]),
                rate: coerceNumber(row[4]),
                regularPay: coerceNumber(row[5]),
                otPay: coerceNumber(row[6]),
                allowance: coerceNumber(row[7]),
                totalPay: coerceNumber(row[8]),
                tds: coerceNumber(row[9]),
                salaryTotal: coerceNumber(row[10]),
                advance: coerceNumber(row[11]),
                net: coerceNumber(row[12]),
                roundedNet: coerceNumber(row[13]),
                bonus: isBonusMode ? coerceNumber(row[14]) : 0,
                netPayment: isBonusMode ? coerceNumber(row[15]) : coerceNumber(row[13]),
                remark: String(row[isBonusMode ? 16 : 14] || ''),
                createdBy: importedBy,
                createdAt: now
            };
            batch.set(doc(db, COLLECTIONS.PAYROLL, payrollId), payrollData, { merge: true });
            results.payroll++;
            writeCount++;
            await commitIfNeeded();
        }
    }

    // --- BLOCK 2: BEHAVIORAL PATTERNS ---
    const bhvStartIdx = findBlockStart(grid, "Behavioral Patterns (from attendance data)", ANCHOR_COL);
    if (bhvStartIdx !== -1) {
        const dataRows = readBlock(grid, bhvStartIdx + 2, ANCHOR_COL); // Header is at +1
        for (const row of dataRows) {
            const empName = String(row[0] || '').trim();
            if (!empName || empName.toLowerCase() === 'total' || empName.toLowerCase() === 'employee') continue;
            const employee = await ensureEmployee(empName);
            
            const bhvData: BehavioralPatternRecord = {
                employeeId: employee.id,
                employeeName: employee.name,
                workdays: coerceNumber(row[1]),
                onTimeDays: coerceNumber(row[2]),
                onTimePct: coerceNumber(row[3]),
                lateDays: coerceNumber(row[4]),
                earlyDays: coerceNumber(row[5]),
                missingPunchDays: coerceNumber(row[6]),
                absentDays: coerceNumber(row[7]),
                satWorked: coerceNumber(row[8]),
                phWorked: coerceNumber(row[9]),
                extraOkHours: coerceNumber(row[10]),
                insight: String(row[11] || '')
            };
            const docId = `${employee.id.toLowerCase()}_${bsYear}_${bsMonth}`;
            batch.set(doc(db, 'behavior_patterns', docId), bhvData, { merge: true });
            results.behavioralPatterns++;
            writeCount++;
            await commitIfNeeded();
        }
    }

    // --- BLOCK 3: ENHANCED INSIGHTS ---
    const enhStartIdx = findBlockStart(grid, "Enhanced Employee Insights", ANCHOR_COL);
    if (enhStartIdx !== -1) {
        const dataRows = readBlock(grid, enhStartIdx + 2, ANCHOR_COL);
        for (const row of dataRows) {
            const empName = String(row[0] || '').trim();
            if (!empName || empName.toLowerCase() === 'employee') continue;
            const employee = await ensureEmployee(empName);

            const enhData: EnhancedInsightRecord = {
                employeeId: employee.id,
                employeeName: employee.name,
                punctualityTrend: String(row[1] || ''),
                absencePattern: String(row[2] || ''),
                otImpact: String(row[3] || ''),
                shiftEndBehavior: String(row[4] || ''),
                performanceInsight: String(row[5] || '')
            };
            const docId = `${employee.id.toLowerCase()}_${bsYear}_${bsMonth}`;
            batch.set(doc(db, 'enhanced_insights', docId), enhData, { merge: true });
            results.enhancedInsights++;
            writeCount++;
            await commitIfNeeded();
        }
    }

    // --- BLOCK 4: PATTERN INSIGHTS (Company Level) ---
    const patStartIdx = findBlockStart(grid, "Pattern Insights", ANCHOR_COL);
    if (patStartIdx !== -1) {
        const dataRows = readBlock(grid, patStartIdx + 1, ANCHOR_COL);
        const rawLines = dataRows.map(r => String(r[0] || '').trim()).filter(Boolean);
        const parsed: PatternInsightParsed = { rawLines };

        rawLines.forEach(line => {
            const lower = line.toLowerCase();
            if (lower.includes("highest late arrivals")) {
                const match = line.match(/arrivals: (\w+) \((\d+) days\)/i);
                if (match) { parsed.highestLateWeekday = match[1]; parsed.highestLateCount = parseInt(match[2]); }
            } else if (lower.includes("highest absenteeism")) {
                const match = line.match(/absenteeism: (\w+) \((\d+) days\)/i);
                if (match) { parsed.highestAbsentWeekday = match[1]; parsed.highestAbsentCount = parseInt(match[2]); }
            } else if (lower.includes("most punctual weekday")) {
                const match = line.match(/weekday: (\w+) \((\d+(\.\d+)?)% late/i);
                if (match) { parsed.mostPunctualWeekday = match[1]; parsed.mostPunctualRate = parseFloat(match[2]); }
            } else if (lower.includes("saturday utilization")) {
                const match = line.match(/utilization: (\d+(\.\d+)?)%/i);
                if (match) { parsed.saturdayUtilPct = parseFloat(match[1]); }
            } else if (lower.includes("public holiday ot total")) {
                const match = line.match(/total: (\d+(\.\d+)?) hours/i);
                if (match) { parsed.phOtTotalHours = parseFloat(match[1]); }
            } else if (lower.includes("late hotspots")) {
                const part = line.split(':')[1];
                if (part) parsed.lateHotspots = part.split(',').map(s => s.trim());
            }
        });

        const docId = `${bsYear}_${bsMonth}`;
        batch.set(doc(db, 'pattern_insights', docId), parsed, { merge: true });
        results.patternInsights = true;
        writeCount++;
        await commitIfNeeded();
    }

    // --- BLOCK 5: DAY OF WEEK PATTERNS (Company Level, Offset AE) ---
    const dowStartIdx = findBlockStart(grid, "Day of Week Patterns:", 30); // Index 30 is approx AE
    if (dowStartIdx !== -1) {
        const dataRows = readBlock(grid, dowStartIdx + 2, 30);
        const dowPatterns: DowPatternItem[] = dataRows.slice(0, 7).map(row => ({
            day: String(row[0] || ''),
            punctualityPct: coerceNumber(row[1]),
            lateArrivalsPct: coerceNumber(row[2]),
            absenteeismPct: coerceNumber(row[3])
        }));

        const docId = `${bsYear}_${bsMonth}`;
        batch.set(doc(db, 'dow_patterns', docId), { patterns: dowPatterns }, { merge: true });
        results.dowPatterns = dowPatterns.length;
        writeCount++;
        await commitIfNeeded();
    }

    // --- BLOCK 6: MONTH-TO-MONTH BEHAVIORAL COMPARISON ---
    const compStartIdx = findBlockStart(grid, "Month-to-Month Behavioral Comparison", ANCHOR_COL);
    if (compStartIdx !== -1) {
        // Parse subtitle for period labels
        const subtitle = String(grid[compStartIdx + 1][ANCHOR_COL] || '');
        const currentPeriodLabel = subtitle.match(/Current: ([^ ]+)/)?.[1] || '';
        const prevPeriodLabel = subtitle.match(/Previous: ([^ ]+)/)?.[1] || '';

        const dataRows = readBlock(grid, compStartIdx + 4, ANCHOR_COL); // Header occupies 4 rows total
        for (const row of dataRows) {
            const empName = String(row[0] || '').trim();
            if (!empName || empName.toLowerCase() === 'employee') continue;
            const employee = await ensureEmployee(empName);

            const m = (idx: number): ComparisonMetric => ({
                thisMonth: coerceNumber(row[idx]),
                prevMonth: coerceNumber(row[idx + 1]),
                delta: coerceNumber(row[idx + 2])
            });

            const compData: BehaviorComparisonRecord = {
                employeeId: employee.id,
                employeeName: employee.name,
                currentPeriodLabel,
                prevPeriodLabel,
                metrics: {
                    lateArrivals: m(1),
                    earlyDepartures: m(4),
                    absentDays: m(7),
                    missingPunches: m(10),
                    onTimePct: m(13),
                    extraOkHrs: m(16),
                    otHours: m(19)
                },
                remarksFlag: String(row[22] || '')
            };
            const docId = `${employee.id.toLowerCase()}_${bsYear}_${bsMonth}`;
            batch.set(doc(db, 'behavior_comparison', docId), compData, { merge: true });
            results.comparison++;
            writeCount++;
            await commitIfNeeded();
        }
    }

    if (writeCount > 0) {
        await batch.commit();
    }

    return results;
};

/**
 * Scans the grid for a specific string marker in the designated anchor column.
 */
function findBlockStart(grid: any[][], title: string, anchorCol: number): number {
    const marker = title.toLowerCase();
    for (let i = 0; i < grid.length; i++) {
        if (!grid[i]) continue;
        const cell = String(grid[i][anchorCol] || '').toLowerCase().trim();
        if (cell.includes(marker)) return i;
    }
    return -1;
}

/**
 * Reads data rows from a starting point until a completely blank row is encountered.
 */
function readBlock(grid: any[][], startRow: number, anchorCol: number): any[][] {
    const data: any[][] = [];
    for (let i = startRow; i < grid.length; i++) {
        const rowSlice = grid[i].slice(anchorCol);
        // Stop if the anchor cell is empty AND the row is effectively empty
        if (!grid[i][anchorCol] && rowSlice.every(c => !c || String(c).trim() === '')) break;
        data.push(rowSlice);
    }
    return data;
}
