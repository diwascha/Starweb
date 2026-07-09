import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, setDoc, deleteDoc } from 'firebase/firestore';
import type { Payroll, Employee, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics, AttendanceRecord } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from './settings-service';
import { COLLECTIONS, NEPALI_MONTHS } from '@/lib/constants';
import { createTimestamp, logServiceError, coerceNumber } from '@/lib/service-utils';
import { format, startOfDay, getDay } from 'date-fns';

const getPayrollCollection = () => {
    const { db } = getFirebase();
    return collection(db, COLLECTIONS.PAYROLL);
}

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Payroll => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeId: data.employeeId,
        employeeName: String(data.employeeName || ''),
        joiningDate: data.joiningDate || null,
        totalHours: coerceNumber(data.totalHours),
        otHours: coerceNumber(data.otHours),
        regularHours: coerceNumber(data.regularHours),
        rate: coerceNumber(data.rate),
        regularPay: coerceNumber(data.regularPay),
        otPay: coerceNumber(data.otPay),
        allowance: coerceNumber(data.allowance),
        totalPay: coerceNumber(data.totalPay),
        absentDays: coerceNumber(data.absentDays),
        deduction: coerceNumber(data.deduction),
        tds: coerceNumber(data.tds),
        salaryTotal: coerceNumber(data.salaryTotal),
        advance: coerceNumber(data.advance),
        net: coerceNumber(data.net),
        roundedNet: coerceNumber(data.roundedNet),
        bonus: coerceNumber(data.bonus),
        netPayment: coerceNumber(data.netPayment),
        remark: String(data.remark || ''),
        createdBy: data.createdBy,
        createdAt: data.createdAt,
    };
};

export const onPayrollUpdate = (callback: (records: Payroll[]) => void): () => void => {
    return onSnapshot(getPayrollCollection(), (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    }, (error) => {
        logServiceError('onPayrollUpdate', error);
    });
};

export const getPayrollForEmployee = async (employeeId: string, bsYear: number, bsMonth: number): Promise<Payroll | null> => {
    try {
        const docSnap = await getDocs(query(getPayrollCollection(), where("employeeId", "==", employeeId), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth), limit(1)));
        
        if (docSnap.empty) return null;
        return fromFirestore(docSnap.docs[0]);
    } catch (error) {
        logServiceError('getPayrollForEmployee', error);
        return null;
    }
};

export const getPayrollYears = async (): Promise<number[]> => {
    try {
        const snapshot = await getDocs(getPayrollCollection());
        if (snapshot.empty) return [];
        const years = new Set(snapshot.docs.map(doc => doc.data().bsYear as number));
        return Array.from(years).sort((a, b) => b - a);
    } catch (error) {
        logServiceError('getPayrollYears', error);
        return [];
    }
};

export const deletePayrollForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const { db } = getFirebase();
    try {
        const q = query(getPayrollCollection(), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
        const snapshot = await getDocs(q);

        if (snapshot.empty) return;

        const CHUNK_SIZE = 400;
        const docsToDelete = snapshot.docs;

        for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
            const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    } catch (error) {
        logServiceError('deletePayrollForMonth', error);
        throw error;
    }
};

export const calculateAndSavePayrollForMonth = async (
    bsYear: number,
    bsMonth: number,
    allEmployees: Employee[],
    allAttendance: AttendanceRecord[],
    calculatedBy: string
): Promise<{ employeeCount: number }> => {
    const { db } = getFirebase();
    try {
        const payrollLockSetting = await getSetting('payrollLocks');
        const payrollLocks = payrollLockSetting?.value || {};
        const lockKey = `${bsYear}-${bsMonth}`;
        const monthName = NEPALI_MONTHS.find(m => m.value === bsMonth)?.name || `Month ${bsMonth + 1}`;
        
        if (payrollLocks[lockKey]) {
            throw new Error(`Payroll for ${monthName} ${bsYear} is locked and cannot be recalculated.`);
        }
        
        const workingEmployees = allEmployees.filter(e => e.status === 'Working');
        const monthlyAttendance = allAttendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
        
        const now = createTimestamp();
        const batch = writeBatch(db);
        let writeCount = 0;

        for (const employee of workingEmployees) {
            const employeeAttendance = monthlyAttendance.filter(r => r.employeeId === employee.id);
            const regularHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.regularHours) || 0), 0);
            const otHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0);
            const absentDays = employeeAttendance.filter(r => r.status === 'Absent').length;

            let rate = 0;
            const year = bsYear;
            const month = bsMonth;
            const nextMonth = month === 11 ? 0 : month + 1;
            const nextYear = month === 11 ? year + 1 : year;
            const nextMonthDate = new NepaliDate(nextYear, nextMonth, 1);
            nextMonthDate.setDate(nextMonthDate.getDate() - 1);
            const daysInMonth = nextMonthDate.getDate();

            let basicPay = 0;
            let otPay = 0;
            let deduction = 0;

            if (employee.wageBasis === 'Monthly') {
                rate = (Number(employee.wageAmount) || 0) / daysInMonth / 8;
                const baseSalary = Number(employee.wageAmount) || 0;
                const dayRate = baseSalary / daysInMonth;
                deduction = absentDays * dayRate;
                basicPay = baseSalary - deduction;
                otPay = otHours * rate; 
            } else { 
                rate = Number(employee.wageAmount) || 0;
                basicPay = regularHours * rate;
                otPay = otHours * rate;
            }

            const allowance = Number(employee.allowance) || 0;
            const gross = basicPay + otPay + allowance;
            const tds = gross * 0.01;
            const grossSalary = gross - tds;
            const advance = 0;
            const net = grossSalary - advance;
            const roundedNet = Math.round(net / 5) * 5;
            const bonus = 0;
            const finalNet = roundedNet + bonus;

            // Deterministic ID to prevent duplicates
            const payrollId = `${bsYear}-${bsMonth}-${employee.id}`;
            const payrollData: Omit<Payroll, 'id'> = {
                bsYear, bsMonth,
                employeeId: employee.id,
                employeeName: employee.name,
                joiningDate: employee.joiningDate || null,
                totalHours: regularHours + otHours,
                regularHours, otHours, rate,
                regularPay: basicPay,
                otPay,
                allowance,
                totalPay: gross,
                absentDays,
                deduction,
                tds,
                salaryTotal: grossSalary,
                advance,
                net,
                roundedNet,
                bonus,
                netPayment: finalNet,
                remark: '',
                createdBy: calculatedBy,
                createdAt: now,
            };

            batch.set(doc(getPayrollCollection(), payrollId), payrollData, { merge: true });
            writeCount++;

            if (writeCount >= 490) {
                await batch.commit();
                writeCount = 0;
            }
        }

        if (writeCount > 0) await batch.commit();
        return { employeeCount: workingEmployees.length };
    } catch (error) {
        logServiceError('calculateAndSavePayrollForMonth', error);
        throw error;
    }
};

/**
 * Filter function to identify rows that represent analytics data instead of employees.
 */
const isAnalyticsRow = (name: string): boolean => {
    if (!name) return true;
    const n = name.trim().toLowerCase();
    return (
        n === 'employee' || // Header repetition
        n === 'total' ||
        n.includes('current:') ||
        n.includes('previous:') ||
        n.includes('trend:') ||
        n.includes('insights') ||
        n.includes('absenteeism') ||
        n.includes('late arrivals') ||
        n.includes('hotspots') ||
        n.includes('punctual') ||
        n.includes('utilization') ||
        n.includes('ot total') ||
        n.includes('shift-start') ||
        n.includes('comparison') ||
        n.includes('behavioral') ||
        (n.includes('employee') && (n.includes('insight') || n.includes('pattern')))
    );
};

export const importPayrollFromSheet = async (
    jsonData: any[][],
    employees: Employee[],
    importedBy: string,
    bsYear: number,
    bsMonth: number
): Promise<{ createdCount: number, updatedCount: number, newEmployeesCount: number, newEmployees: Employee[] }> => {
    const { db } = getFirebase();
    try {
        let headerIndex = -1;
        for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
            const row = jsonData[i];
            if (row && row.some(cell => String(cell || '').toLowerCase().includes('employee') || String(cell || '').toLowerCase().includes('regular hrs'))) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) throw new Error("Could not find required columns like 'Employee' or 'Regular Hrs'.");

        const headerRow = jsonData[headerIndex];
        const dataRows = jsonData.slice(headerIndex + 1);
        
        const headerMap = getHeaderMap(headerRow);
        const nameIndex = (headerMap as any).name;
        if (nameIndex === undefined) throw new Error("Required column 'Employee' not found.");

        const batchSize = 400;
        let batch = writeBatch(db);
        let writeCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        let newEmployeesCount = 0;
        const newlyCreatedEmployees: Employee[] = [];

        const employeeMap = new Map(employees.map(e => [e.name.toLowerCase().trim(), e]));
        const processedEmployeeIdsInThisSheet = new Set<string>();

        for (const fullRow of dataRows) {
            const employeeName = String(fullRow[nameIndex] || '').trim();
            
            // SKIP Analytics/Summary Rows
            if (!employeeName || isAnalyticsRow(employeeName)) continue;

            let employee = employeeMap.get(employeeName.toLowerCase());
            
            if (!employee) {
                const empRef = doc(collection(db, COLLECTIONS.EMPLOYEES));
                const now = createTimestamp();
                const newEmpData: Omit<Employee, 'id'> = {
                    name: employeeName,
                    status: 'Working',
                    wageBasis: 'Monthly',
                    wageAmount: 0,
                    mobileNumber: 'Not Provided',
                    createdBy: importedBy,
                    createdAt: now,
                };
                batch.set(empRef, newEmpData);
                
                employee = { id: empRef.id, ...newEmpData } as Employee;
                employeeMap.set(employeeName.toLowerCase(), employee);
                newlyCreatedEmployees.push(employee);
                newEmployeesCount++;
                writeCount++;
                
                if (writeCount >= batchSize) {
                    await batch.commit();
                    batch = writeBatch(db);
                    writeCount = 0;
                }
            }
            
            if (processedEmployeeIdsInThisSheet.has(employee.id)) continue;
            processedEmployeeIdsInThisSheet.add(employee.id);

            const getValue = (key: string) => {
                const index = (headerMap as any)[key];
                if (index === undefined || index === null) return null;
                // Specifically allow reading only financial data part (Columns Q-AG)
                if (index < 16 || index > 32) return null;
                return fullRow[index] !== undefined ? fullRow[index] : null;
            };
            
            const otHours = coerceNumber(getValue('otHours'));
            const regularHours = coerceNumber(getValue('regularHours'));
            
            const payrollData: Omit<Payroll, 'id'> = {
                bsYear, bsMonth,
                employeeId: employee.id,
                employeeName,
                joiningDate: employee.joiningDate || null,
                totalHours: regularHours + otHours,
                otHours, regularHours,
                rate: coerceNumber(getValue('rate')),
                regularPay: coerceNumber(getValue('regularPay')),
                otPay: coerceNumber(getValue('otPay')),
                allowance: coerceNumber(getValue('allowance')),
                totalPay: coerceNumber(getValue('totalPay')),
                absentDays: coerceNumber(getValue('absentDays')),
                deduction: coerceNumber(getValue('deduction')),
                tds: coerceNumber(getValue('tds')),
                salaryTotal: coerceNumber(getValue('salaryTotal')),
                advance: coerceNumber(getValue('advance')),
                net: coerceNumber(getValue('net')),
                roundedNet: coerceNumber(getValue('roundedNet')),
                bonus: coerceNumber(getValue('bonus')),
                netPayment: coerceNumber(getValue('netPayment')),
                remark: String(getValue('remark') || ''),
                createdBy: importedBy,
                createdAt: createTimestamp(),
            };
            
            const payrollId = `${bsYear}-${bsMonth}-${employee.id}`;
            const docRef = doc(getPayrollCollection(), payrollId);
            
            batch.set(docRef, payrollData, { merge: true });
            createdCount++;
            writeCount++;

            if (writeCount >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                writeCount = 0;
            }
        }

        if (writeCount > 0) await batch.commit();
        return { createdCount, updatedCount, newEmployeesCount, newEmployees: newlyCreatedEmployees };
    } catch (error) {
        logServiceError('importPayrollFromSheet', error);
        throw error;
    }
};

export const getHeaderMap = (headerRow: any[]) => {
    const map: Record<string, number> = {};
    const payrollHeaders: Record<string, string[]> = {
        name: ['employee', 'staff name', 'name'],
        otHours: ['ot hrs', 'ot hour', 'ot hours'],
        regularHours: ['regular hrs', 'normal hrs', 'regular hours'],
        rate: ['base (salary or', 'rate', 'base rate', 'basic salary'],
        regularPay: ['basic pay', 'norman', 'regular pay'],
        otPay: ['ot pay', 'ot amount'],
        totalPay: ['gross'],
        absentDays: ['absent days', 'absent'],
        deduction: ['absent amt.', 'deduction', 'absent amount'],
        allowance: ['allowance', 'extra'],
        bonus: ['bonus'],
        salaryTotal: ['gross salary', 'salary total'],
        tds: ['tds', 'tds (1%)'],
        advance: ['advance', 'salary advance'],
        net: ['net'],
        roundedNet: ['rounded net', 'round off'],
        netPayment: ['final net', 'net payment', 'net payable'],
        remark: ['remark', 'remarks']
    };

    // Prioritize searching from index 16 onwards (Column Q) for financial data
    const searchOrder = [
        ...Array.from({ length: headerRow.length - 16 }, (_, i) => i + 16),
        ...Array.from({ length: 16 }, (_, i) => i)
    ];

    for (const key in payrollHeaders) {
        for (const index of searchOrder) {
            if (index >= headerRow.length) continue;
            const cell = String(headerRow[index] || '').trim().toLowerCase();
            if (payrollHeaders[key].some(alias => cell === alias || cell.includes(alias))) {
                map[key] = index;
                break;
            }
        }
    }
    return map;
};

export interface AnalyticsData {
    punctuality: PunctualityInsight[];
    behavior: BehaviorInsight[];
    workforce: WorkforceAnalytics[];
    patterns: PatternInsight[];
    highestAbsenteeism: { day: string; count: number };
    highestLateArrivals: { day: string; count: number };
    lateHotspots: { date: string; count: number }[];
    saturdayUtilization: number;
    mostPunctualWeekday: { day: string; rate: number };
    worstShiftStart: { time: string; rate: number };
}

export const generateAnalyticsForMonth = (
    bsYear: number,
    bsMonth: number,
    allEmployees: Employee[],
    allAttendance: AttendanceRecord[]
): AnalyticsData => {
    const monthlyAttendance = allAttendance.filter(r => r.bsYear === bsYear && r.bsMonth === bsMonth);
    const punctuality: PunctualityInsight[] = [];
    const behavior: BehaviorInsight[] = [];
    const workforce: WorkforceAnalytics[] = [];
    
    const dayStats: Record<string, { total: number, absent: number, late: number }> = {
        'Sunday': { total: 0, absent: 0, late: 0 }, 'Monday': { total: 0, absent: 0, late: 0 },
        'Tuesday': { total: 0, absent: 0, late: 0 }, 'Wednesday': { total: 0, absent: 0, late: 0 },
        'Thursday': { total: 0, absent: 0, late: 0 }, 'Friday': { total: 0, absent: 0, late: 0 },
        'Saturday': { total: 0, absent: 0, late: 0 }
    };

    const hotspots: Record<string, number> = {};
    const shifts: Record<string, { total: number, late: number }> = {};
    let saturdaysWithWork = 0;
    let totalSaturdays = 0;

    const workingEmployees = allEmployees.filter(e => e.status === 'Working');

    for (const employee of workingEmployees) {
        const empAtt = monthlyAttendance.filter(r => r.employeeId === employee.id);
        const presentDays = empAtt.filter(r => r.status === 'Present' || r.status === 'EXTRAOK').length;
        const absentDays = empAtt.filter(r => r.status === 'Absent' || r.status.includes('Miss')).length;
        const lates = empAtt.filter(r => r.remarks?.toLowerCase().includes('late') || r.remarks?.toLowerCase().includes('review')).length;
        const earlys = empAtt.filter(r => r.remarks?.toLowerCase().includes('early')).length;

        punctuality.push({
            employeeId: employee.id,
            employeeName: employee.name,
            scheduledDays: 26,
            presentDays,
            absentDays,
            attendanceRate: presentDays / 26,
            lateArrivals: lates,
            earlyDepartures: earlys,
            onTimeDays: presentDays - lates,
            punctualityScore: presentDays > 0 ? (presentDays - (lates * 0.5)) / presentDays : 0
        });

        behavior.push({
            employeeId: employee.id,
            employeeName: employee.name,
            punctualityTrend: lates > 3 ? 'Declining' : 'Stable',
            absencePattern: absentDays > 2 ? 'Frequent' : 'Normal',
            otImpact: empAtt.reduce((sum, r) => sum + r.overtimeHours, 0) > 10 ? 'High' : 'Low',
            shiftEndBehavior: earlys > 2 ? 'Early Exit' : 'Standard',
            performanceInsight: presentDays > 24 && lates < 2 ? 'Exemplary' : 'Average'
        });

        empAtt.forEach(r => {
            const dayName = format(new Date(r.date), 'EEEE');
            dayStats[dayName].total++;
            if (r.status === 'Absent') dayStats[dayName].absent++;
            if (r.remarks?.toLowerCase().includes('late')) {
                dayStats[dayName].late++;
                const dateKey = format(new Date(r.date), 'yyyy-MM-dd');
                hotspots[dateKey] = (hotspots[dateKey] || 0) + 1;
            }

            if (dayName === 'Saturday') {
                if (r.status === 'Present' || r.status === 'EXTRAOK' || r.overtimeHours > 0) saturdaysWithWork++;
                totalSaturdays++;
            }

            if (r.onDuty) {
                const time = r.onDuty.substring(0, 5);
                if (!shifts[time]) shifts[time] = { total: 0, late: 0 };
                shifts[time].total++;
                if (r.remarks?.toLowerCase().includes('late')) shifts[time].late++;
            }
        });
    }

    const sortedAbs = Object.entries(dayStats).sort((a, b) => b[1].absent - a[1].absent);
    const sortedLate = Object.entries(dayStats).sort((a, b) => b[1].late - a[1].late);
    const sortedHotspots = Object.entries(hotspots).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const sortedShifts = Object.entries(shifts).sort((a, b) => (b[1].late / b[1].total) - (a[1].late / a[1].total));
    const sortedPunctual = Object.entries(dayStats).sort((a, b) => (a[1].late / a[1].total) - (b[1].late / b[1].total));

    return {
        punctuality,
        behavior,
        workforce,
        patterns: [{ finding: 'Personnel Trend', description: `Average absenteeism is highest on ${sortedAbs[0][0]}.` }],
        highestAbsenteeism: { day: sortedAbs[0][0], count: sortedAbs[0][1].absent },
        highestLateArrivals: { day: sortedLate[0][0], count: sortedLate[0][1].late },
        lateHotspots: sortedHotspots.map(([date, count]) => ({ date, count })),
        saturdayUtilization: totalSaturdays > 0 ? (saturdaysWithWork / totalSaturdays) * 100 : 0,
        mostPunctualWeekday: { day: sortedPunctual[0][0], rate: (1 - (sortedPunctual[0][1].late / sortedPunctual[0][1].total)) * 100 },
        worstShiftStart: sortedShifts.length > 0 ? { time: sortedShifts[0][0], rate: (sortedShifts[0][1].late / sortedShifts[0][1].total) * 100 } : { time: 'N/A', rate: 0 }
    };
};
