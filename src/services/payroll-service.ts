
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, getDoc } from 'firebase/firestore';
import type { Payroll, Employee, AttendanceRecord, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { getSetting } from './settings-service';

const payrollCollection = collection(db, 'payroll');

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData> | DocumentData): Payroll => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        bsYear: data.bsYear,
        bsMonth: data.bsMonth,
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        joiningDate: data.joiningDate,
        totalHours: data.totalHours,
        otHours: data.otHours,
        regularHours: data.regularHours,
        rate: data.rate,
        regularPay: data.regularPay,
        otPay: data.otPay,
        totalPay: data.totalPay,
        absentDays: data.absentDays,
        deduction: data.deduction,
        allowance: data.allowance,
        bonus: data.bonus,
        salaryTotal: data.salaryTotal,
        tds: data.tds,
        gross: data.gross,
        advance: data.advance,
        netPayment: data.netPayment,
        remark: data.remark,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        rawImportData: data.rawImportData,
    };
};


export const onPayrollUpdate = (callback: (records: Payroll[]) => void): () => void => {
    return onSnapshot(payrollCollection, (snapshot) => {
        callback(snapshot.docs.map(fromFirestore));
    });
};

export const getPayrollForEmployee = async (employeeId: string, bsYear: number, bsMonth: number): Promise<Payroll | null> => {
    const q = query(payrollCollection, 
        where("employeeId", "==", employeeId),
        where("bsYear", "==", bsYear),
        where("bsMonth", "==", bsMonth),
        limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
        return null;
    }
    return fromFirestore(snapshot.docs[0]);
};

export const getPayrollYears = async (): Promise<number[]> => {
    try {
        const q = query(collection(db, 'payroll'));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return [];
        }
        const years = new Set(snapshot.docs.map(doc => doc.data().bsYear as number));
        return Array.from(years).sort((a, b) => b - a);
    } catch (error) {
        console.error("Error fetching payroll years:", error);
        return [];
    }
};

export const deletePayrollForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const q = query(payrollCollection, where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        return;
    }

    const CHUNK_SIZE = 400;
    const docsToDelete = snapshot.docs;

    for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
        const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
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

    const payrollLockSetting = await getSetting('payrollLocks');
    const payrollLocks = payrollLockSetting?.value || {};
    const lockKey = `${bsYear}-${bsMonth}`;
    const monthName = nepaliMonths.find(m => m.value === bsMonth)?.name || `Month ${bsMonth + 1}`;
    if (payrollLocks[lockKey]) {
        throw new Error(`Payroll for ${monthName} ${bsYear} is locked and cannot be recalculated.`);
    }
    
    // First, delete any existing payroll for that month
    await deletePayrollForMonth(bsYear, bsMonth);

    const workingEmployees = allEmployees.filter(e => e.status === 'Working');
    const monthlyAttendance = allAttendance.filter(r => {
        try {
            if (!r.date || isNaN(new Date(r.date).getTime())) return false;
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        } catch {
            return false;
        }
    });
    
    const payrollRecords: Omit<Payroll, 'id'>[] = [];
    const now = new Date().toISOString();

    for (const employee of workingEmployees) {
        const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        
        const regularHours = employeeAttendance.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const otHours = employeeAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const absentDays = employeeAttendance.filter(r => r.status === 'Absent').length;

        let rate = 0;
        if (employee.wageBasis === 'Monthly') {
            const daysInMonth = new NepaliDate(bsYear, bsMonth, 1).getMonthDays();
            rate = employee.wageAmount / daysInMonth / 8; // Assuming 8-hour day
        } else { // Hourly
            rate = employee.wageAmount;
        }

        const regularPay = regularHours * rate;
        const otPay = otHours * rate * 1.5; // Assuming OT at 1.5x
        const totalPay = regularPay + otPay;
        const deduction = absentDays * 8 * rate; // Deduction for 8 hours per absent day
        
        const allowance = employee.allowance || 0;
        const bonus = 0; // Bonus calculation can be added here if needed
        const salaryTotal = totalPay - deduction + allowance + bonus;
        const tds = salaryTotal > 0 ? salaryTotal * 0.01 : 0;
        const gross = salaryTotal - tds;
        const advance = 0; // Advance deduction can be added here
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

    // Batch write to Firestore
    const CHUNK_SIZE = 400;
    for (let i = 0; i < payrollRecords.length; i += CHUNK_SIZE) {
        const chunk = payrollRecords.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(record => {
            const docRef = doc(payrollCollection);
            batch.set(docRef, record);
        });
        await batch.commit();
    }
    
    return { employeeCount: payrollRecords.length };
};


const getHeaderMap = (headerRow: any[]): { [key: string]: number } => {
    const map: { [key: string]: number } = {};
    const payrollHeaders = {
        otHours: ['ot hour'],
        regularHours: ['normal hrs'],
        rate: ['rate'],
        regularPay: ['norman'], // Mapped from 'Norman'
        otPay: ['ot'],
        totalPay: ['total'],
        absentDays: ['absent'],
        deduction: ['deduction'], // Mapped from 'Deduction'
        allowance: ['extra'], // Mapped from 'Extra'
        bonus: ['bonus'],
        salaryTotal: ['salary total'],
        tds: ['tds'],
        gross: ['gross'],
        advance: ['advance'],
        netPayment: ['net payment'],
        remark: ['remark']
    };

    headerRow.forEach((headerCell, index) => {
        const normalizedHeader = String(headerCell || '').trim().toLowerCase();
        for (const key in payrollHeaders) {
            if (payrollHeaders[key as keyof typeof payrollHeaders].includes(normalizedHeader)) {
                map[key] = index;
            }
        }
    });
    
    const requiredHeaders = ['netPayment', 'regularPay'];
    const missingHeaders = requiredHeaders.filter(h => !(h in map));

    if (missingHeaders.length > 0) {
        throw new Error(`Required payroll columns (e.g., 'Net Payment', 'Norman') not found. Please check the Excel file headers.`);
    }

    return map;
};


export const importPayrollFromSheet = async (
    jsonData: any[][],
    employees: Employee[],
    importedBy: string,
    bsYear: number,
    bsMonth: number
): Promise<{ createdCount: number, updatedCount: number }> => {
    
    const headerRow = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    const nameIndex = headerRow.map(h => String(h || '').trim().toLowerCase()).indexOf('name');
    if (nameIndex === -1) {
        throw new Error("Required column 'Name' not found in the sheet.");
    }
    
    const headerMap = getHeaderMap(headerRow);
    
    const BATCH_LIMIT = 400;
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

        const getValue = (key: keyof typeof headerMap) => {
            const index = headerMap[key];
            if (index === undefined) return null;
            const val = fullRow[index];
            return val === undefined || val === null || val === '' ? null : val;
        };
        
        const otHours = Number(getValue('otHours') || 0);
        const regularHours = Number(getValue('regularHours') || 0);
        
        const payrollData: Omit<Payroll, 'id'> = {
            bsYear, bsMonth,
            employeeId: employee.id,
            employeeName,
            joiningDate: employee.joiningDate || undefined,
            totalHours: regularHours + otHours, // Calculated
            otHours: otHours,
            regularHours: regularHours,
            rate: Number(getValue('rate') || 0),
            regularPay: Number(getValue('regularPay') || 0),
            otPay: Number(getValue('otPay') || 0),
            totalPay: Number(getValue('totalPay') || 0),
            absentDays: Number(getValue('absentDays') || 0),
            deduction: Number(getValue('deduction') || 0),
            allowance: Number(getValue('allowance') || 0),
            bonus: Number(getValue('bonus') || 0),
            salaryTotal: Number(getValue('salaryTotal') || 0),
            tds: Number(getValue('tds') || 0),
            gross: Number(getValue('gross') || 0),
            advance: Number(getValue('advance') || 0),
            netPayment: Number(getValue('netPayment') || 0),
            remark: String(getValue('remark') || ''),
            createdBy: importedBy,
            createdAt: new Date().toISOString(),
            rawImportData: headerRow.reduce((obj, header, index) => {
                obj[header] = fullRow[index];
                return obj;
            }, {} as Record<string, any>)
        };
        
        const q = query(payrollCollection,
            where("employeeId", "==", employee.id),
            where("bsYear", "==", bsYear),
            where("bsMonth", "==", bsMonth),
            limit(1)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            const docRef = doc(payrollCollection);
            batch.set(docRef, payrollData);
            createdCount++;
        } else {
            const docRef = snapshot.docs[0].ref;
            batch.update(docRef, payrollData);
            updatedCount++;
        }
        
        writeCount++;
        if (writeCount >= BATCH_LIMIT) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }
    }

    if (writeCount > 0) {
        await batch.commit();
    }

    return { createdCount, updatedCount };
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
            if (!r.date || isNaN(new Date(r.date).getTime())) return false;
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        } catch {
            return false;
        }
    });

    const punctuality: PunctualityInsight[] = [];
    const behavior: BehaviorInsight[] = [];
    const workforce: WorkforceAnalytics[] = [];
    
    // Employee-level analytics
    for (const employee of workingEmployees) {
        const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        
        const scheduledDays = employeeAttendance.length;
        if (scheduledDays === 0) continue;

        const presentDays = employeeAttendance.filter(r => ['Present', 'EXTRAOK', 'Saturday', 'Public Holiday'].includes(r.status)).length;
        const absentDays = scheduledDays - presentDays;
        const attendanceRate = scheduledDays > 0 ? presentDays / scheduledDays : 0;
        
        const lateArrivals = employeeAttendance.filter(r => r.onDuty && r.clockIn && r.clockIn > r.onDuty).length;
        const earlyDepartures = employeeAttendance.filter(r => r.offDuty && r.clockOut && r.clockOut < r.offDuty).length;
        
        const onTimeDays = presentDays - lateArrivals - earlyDepartures;
        const punctualityScore = presentDays > 0 ? onTimeDays / presentDays : 0;
        
        const otHours = employeeAttendance.reduce((sum, r) => sum + r.overtimeHours, 0);

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
            overtimeRatio: employeeAttendance.reduce((sum, r) => sum + r.regularHours, 0) > 0 ? otHours / employeeAttendance.reduce((sum, r) => sum + r.regularHours, 0) : 0,
            onTimeStreak: 0, // Simplified for now
            saturdaysWorked: employeeAttendance.filter(r => r.status === 'Saturday' && r.regularHours > 0).length
        });
    }
    
    // Workforce-level pattern analysis
    const patterns: PatternInsight[] = [];
    const totalLate = punctuality.reduce((sum, p) => sum + p.lateArrivals, 0);
    if (totalLate > workingEmployees.length) {
        patterns.push({ finding: 'Widespread Tardiness', description: 'A significant number of employees are arriving late.' });
    }
    const totalAbsent = punctuality.reduce((sum, p) => sum + p.absentDays, 0);
    if (totalAbsent > workingEmployees.length * 2) {
        patterns.push({ finding: 'High Absenteeism', description: 'Overall absenteeism is high for this period.' });
    }
    const totalOT = workforce.reduce((sum, w) => sum + (w.overtimeRatio > 0 ? 1 : 0), 0) / workforce.length;
    if (totalOT > 0.5) {
        patterns.push({ finding: 'High Overtime Reliance', description: 'More than half the workforce is working overtime.' });
    }

    return { punctuality, behavior, patterns, workforce };
};
