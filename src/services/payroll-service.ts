import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, updateDoc } from 'firebase/firestore';
import type { Payroll, Employee, AttendanceRecord, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from './settings-service';
import { COLLECTIONS } from '@/lib/constants';
import { createTimestamp, logServiceError, coerceNumber } from '@/lib/service-utils';

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
        joiningDate: data.joiningDate,
        totalHours: coerceNumber(data.totalHours),
        otHours: coerceNumber(data.otHours),
        regularHours: coerceNumber(data.regularHours),
        rate: coerceNumber(data.rate),
        regularPay: coerceNumber(data.regularPay),
        otPay: coerceNumber(data.otPay),
        totalPay: coerceNumber(data.totalPay),
        absentDays: coerceNumber(data.absentDays),
        deduction: coerceNumber(data.deduction),
        allowance: coerceNumber(data.allowance),
        bonus: coerceNumber(data.bonus),
        salaryTotal: coerceNumber(data.salaryTotal),
        tds: coerceNumber(data.tds),
        gross: coerceNumber(data.gross),
        advance: coerceNumber(data.advance),
        netPayment: coerceNumber(data.netPayment),
        remark: String(data.remark || ''),
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        rawImportData: data.rawImportData,
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
        const q = query(getPayrollCollection(), 
            where("employeeId", "==", employeeId),
            where("bsYear", "==", bsYear),
            where("bsMonth", "==", bsMonth),
            limit(1)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return fromFirestore(snapshot.docs[0]);
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

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

export const calculateAndSavePayrollForMonth = async (
    bsYear: number,
    bsMonth: number,
    allEmployees: Employee[],
    allAttendance: AttendanceRecord[],
    calculatedBy: string
): Promise<{ employeeCount: number }> => {
    try {
        const payrollLockSetting = await getSetting('payrollLocks');
        const payrollLocks = payrollLockSetting?.value || {};
        const lockKey = `${bsYear}-${bsMonth}`;
        const monthName = nepaliMonths.find(m => m.value === bsMonth)?.name || `Month ${bsMonth + 1}`;
        
        if (payrollLocks[lockKey]) {
            throw new Error(`Payroll for ${monthName} ${bsYear} is locked and cannot be recalculated.`);
        }
        
        await deletePayrollForMonth(bsYear, bsMonth);

        const workingEmployees = allEmployees.filter(e => e.status === 'Working');
        const monthlyAttendance = allAttendance.filter(r => {
            try {
                if (!r.date) return false;
                const nepaliDate = new NepaliDate(new Date(r.date));
                return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
            } catch {
                return false;
            }
        });
        
        const payrollRecords: Omit<Payroll, 'id'>[] = [];
        const now = createTimestamp();
        const { db } = getFirebase();

        for (const employee of workingEmployees) {
            const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
            const regularHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.regularHours) || 0), 0);
            const otHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0);
            const absentDays = employeeAttendance.filter(r => r.status === 'Absent').length;

            let rate = 0;
            if (employee.wageBasis === 'Monthly') {
                const daysInMonth = new NepaliDate(bsYear, bsMonth, 1).getMonthDays();
                rate = (Number(employee.wageAmount) || 0) / daysInMonth / 8;
            } else { 
                rate = Number(employee.wageAmount) || 0;
            }

            const regularPay = regularHours * rate;
            const otPay = otHours * rate * 1.5;
            const totalPay = regularPay + otPay;
            const deduction = absentDays * 8 * rate;
            
            const allowance = Number(employee.allowance) || 0;
            const bonus = 0;
            const salaryTotal = totalPay - deduction + allowance + bonus;
            const tds = salaryTotal > 0 ? salaryTotal * 0.01 : 0;
            const gross = salaryTotal - tds;
            const advance = 0;
            const netPayment = gross - advance;
            
            payrollRecords.push({
                bsYear, bsMonth,
                employeeId: employee.id,
                employeeName: employee.name,
                joiningDate: employee.joiningDate || undefined,
                totalHours: regularHours + otHours,
                regularHours, otHours, rate,
                regularPay, otPay, totalPay,
                absentDays, deduction, allowance, bonus,
                salaryTotal, tds, gross, advance, netPayment,
                remark: '',
                createdBy: calculatedBy,
                createdAt: now
            });
        }

        const CHUNK_SIZE = 400;
        for (let i = 0; i < payrollRecords.length; i += CHUNK_SIZE) {
            const chunk = payrollRecords.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);
            chunk.forEach(record => {
                const docRef = doc(getPayrollCollection());
                batch.set(docRef, record);
            });
            await batch.commit();
        }
        
        return { employeeCount: payrollRecords.length };
    } catch (error) {
        logServiceError('calculateAndSavePayrollForMonth', error);
        throw error;
    }
};

export const importPayrollFromSheet = async (
    jsonData: any[][],
    employees: Employee[],
    importedBy: string,
    bsYear: number,
    bsMonth: number
): Promise<{ createdCount: number, updatedCount: number }> => {
    const { db } = getFirebase();
    try {
        const headerRow = jsonData[0];
        const dataRows = jsonData.slice(1);
        const nameIndex = headerRow.map(h => String(h || '').trim().toLowerCase()).indexOf('name');
        if (nameIndex === -1) throw new Error("Required column 'Name' not found.");
        
        const headerMap = getHeaderMap(headerRow);
        const batchSize = 400;
        let batch = writeBatch(db);
        let writeCount = 0;
        let createdCount = 0;
        let updatedCount = 0;

        const employeeMap = new Map(employees.map(e => [e.name.toLowerCase(), e]));

        for (const fullRow of dataRows) {
            const employeeName = String(fullRow[nameIndex] || '').trim();
            if (!employeeName) continue;

            const employee = employeeMap.get(employeeName.toLowerCase());
            if (!employee) continue;

            const getValue = (key: string) => {
                const index = (headerMap as any)[key];
                return index !== undefined ? fullRow[index] : null;
            };
            
            const otHours = coerceNumber(getValue('otHours'));
            const regularHours = coerceNumber(getValue('regularHours'));
            
            const payrollData: Omit<Payroll, 'id'> = {
                bsYear, bsMonth,
                employeeId: employee.id,
                employeeName,
                joiningDate: employee.joiningDate || undefined,
                totalHours: regularHours + otHours,
                otHours: otHours,
                regularHours: regularHours,
                rate: coerceNumber(getValue('rate')),
                regularPay: coerceNumber(getValue('regularPay')),
                otPay: coerceNumber(getValue('otPay')),
                totalPay: coerceNumber(getValue('totalPay')),
                absentDays: coerceNumber(getValue('absentDays')),
                deduction: coerceNumber(getValue('deduction')),
                allowance: coerceNumber(getValue('allowance')),
                bonus: coerceNumber(getValue('bonus')),
                salaryTotal: coerceNumber(getValue('salaryTotal')),
                tds: coerceNumber(getValue('tds')),
                gross: coerceNumber(getValue('gross')),
                advance: coerceNumber(getValue('advance')),
                netPayment: coerceNumber(getValue('netPayment')),
                remark: String(getValue('remark') || ''),
                createdBy: importedBy,
                createdAt: createTimestamp(),
                rawImportData: headerRow.reduce((obj, header, index) => {
                    obj[String(header || `col_${index}`)] = fullRow[index];
                    return obj;
                }, {} as Record<string, any>)
            };
            
            const q = query(getPayrollCollection(),
                where("employeeId", "==", employee.id),
                where("bsYear", "==", bsYear),
                where("bsMonth", "==", bsMonth),
                limit(1)
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                const docRef = doc(getPayrollCollection());
                batch.set(docRef, payrollData);
                createdCount++;
            } else {
                const docRef = snapshot.docs[0].ref;
                batch.update(docRef, payrollData);
                updatedCount++;
            }
            
            writeCount++;
            if (writeCount >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                writeCount = 0;
            }
        }

        if (writeCount > 0) await batch.commit();
        return { createdCount, updatedCount };
    } catch (error) {
        logServiceError('importPayrollFromSheet', error);
        throw error;
    }
};

const getHeaderMap = (headerRow: any[]) => {
    const map: Record<string, number> = {};
    const payrollHeaders: Record<string, string[]> = {
        otHours: ['ot hour', 'ot hours'],
        regularHours: ['normal hrs', 'regular hours'],
        rate: ['rate'],
        regularPay: ['norman', 'regular pay'],
        otPay: ['ot', 'ot pay'],
        totalPay: ['total', 'total pay'],
        absentDays: ['absent', 'absent days'],
        deduction: ['deduction', 'absent amt.'],
        allowance: ['extra', 'allowance'],
        bonus: ['bonus'],
        salaryTotal: ['salary total'],
        tds: ['tds', 'tds (1%)'],
        gross: ['gross'],
        advance: ['advance'],
        netPayment: ['net payment'],
        remark: ['remark']
    };

    headerRow.forEach((headerCell, index) => {
        const normalizedHeader = String(headerCell || '').trim().toLowerCase();
        for (const key in payrollHeaders) {
            if (payrollHeaders[key].includes(normalizedHeader)) {
                map[key] = index;
            }
        }
    });
    return map;
};

export interface AnalyticsData {
    punctuality: PunctualityInsight[];
    behavior: BehaviorInsight[];
    patterns: PatternInsight[];
    workforce: WorkforceAnalytics[];
}

export const generateAnalyticsForMonth = (
    bsYear: number,
    bsMonth: number,
    employees: Employee[],
    allAttendance: AttendanceRecord[]
): AnalyticsData => {
    const workingEmployees = employees.filter(e => e.status === 'Working');

    const monthlyAttendance = allAttendance.filter(r => {
        try {
            if (!r.date) return false;
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        } catch {
            return false;
        }
    });

    const punctuality: PunctualityInsight[] = [];
    const behavior: BehaviorInsight[] = [];
    const workforce: WorkforceAnalytics[] = [];
    
    for (const employee of workingEmployees) {
        const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        const scheduledDays = employeeAttendance.length;
        if (scheduledDays === 0) continue;

        const presentDays = employeeAttendance.filter(r => ['Present', 'EXTRAOK', 'Saturday', 'Public Holiday'].includes(r.status || '')).length;
        const absentDays = scheduledDays - presentDays;
        const attendanceRate = scheduledDays > 0 ? presentDays / scheduledDays : 0;
        const lateArrivals = employeeAttendance.filter(r => r.onDuty && r.clockIn && r.clockIn > r.onDuty).length;
        const earlyDepartures = employeeAttendance.filter(r => r.offDuty && r.clockOut && r.clockOut < r.offDuty).length;
        const onTimeDays = presentDays - lateArrivals - earlyDepartures;
        const punctualityScore = presentDays > 0 ? onTimeDays / presentDays : 0;
        const otHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0);

        punctuality.push({
            employeeId: employee.id, employeeName: employee.name, scheduledDays, presentDays, absentDays, attendanceRate,
            lateArrivals, earlyDepartures, onTimeDays, punctualityScore
        });

        behavior.push({
            employeeId: employee.id, employeeName: employee.name,
            punctualityTrend: punctualityScore > 0.9 ? 'Excellent' : punctualityScore > 0.7 ? 'Good' : 'Needs Improvement',
            absencePattern: absentDays > 4 ? 'High' : absentDays > 1 ? 'Moderate' : 'Low',
            otImpact: otHours > 20 ? 'High OT' : otHours > 5 ? 'Moderate OT' : 'Low OT',
            shiftEndBehavior: earlyDepartures > 2 ? 'Frequently leaves early' : 'Generally completes shifts',
            performanceInsight: attendanceRate > 0.9 ? 'Reliable' : 'Inconsistent attendance',
        });
        
        workforce.push({
            employeeId: employee.id, employeeName: employee.name,
            overtimeRatio: employeeAttendance.reduce((sum, r) => sum + (Number(r.regularHours) || 0), 0) > 0 ? otHours / employeeAttendance.reduce((sum, r) => sum + (Number(r.regularHours) || 0), 0) : 0,
            onTimeStreak: 0,
            saturdaysWorked: employeeAttendance.filter(r => r.status === 'Saturday' && (Number(r.regularHours) || 0) > 0).length
        });
    }
    
    const patterns: PatternInsight[] = [];
    if (punctuality.reduce((sum, p) => sum + p.lateArrivals, 0) > workingEmployees.length) {
        patterns.push({ finding: 'Widespread Tardiness', description: 'A significant number of employees are arriving late.' });
    }
    return { punctuality, behavior, patterns, workforce };
};
