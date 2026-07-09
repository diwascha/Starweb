import { getFirebase } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit } from 'firebase/firestore';
import type { Payroll, Employee, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
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
        rawImportData: data.rawImportData || {},
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

        for (const employee of workingEmployees) {
            const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
            const regularHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.regularHours) || 0), 0);
            const otHours = employeeAttendance.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0);
            const absentDays = employeeAttendance.filter(r => r.status === 'Absent').length;

            let rate = 0;
            if (employee.wageBasis === 'Monthly') {
                const year = bsYear;
                const month = bsMonth;
                const date = new NepaliDate(year, month, 1);
                const nextMonth = month === 11 ? 0 : month + 1;
                const nextYear = month === 11 ? year + 1 : year;
                const nextMonthDate = new NepaliDate(nextYear, nextMonth, 1);
                nextMonthDate.setDate(nextMonthDate.getDate() - 1);
                const daysInMonth = nextMonthDate.getDate();

                rate = (Number(employee.wageAmount) || 0) / daysInMonth / 8;
                
                const baseSalary = Number(employee.wageAmount) || 0;
                const dayRate = baseSalary / daysInMonth;
                const basicPay = baseSalary - (absentDays * dayRate);
                const otPay = otHours * rate; 
                const allowance = Number(employee.allowance) || 0;
                const gross = basicPay + otPay + allowance;
                const tds = gross * 0.01;
                const grossSalary = gross - tds;
                const advance = 0;
                const net = grossSalary - advance;
                const roundedNet = Math.round(net / 5) * 5;
                const bonus = 0;
                const finalNet = roundedNet + bonus;

                payrollRecords.push({
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
                    deduction: absentDays * dayRate,
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
                    rawImportData: {}
                });
            } else { 
                rate = Number(employee.wageAmount) || 0;
                const basicPay = regularHours * rate;
                const otPay = otHours * rate;
                const allowance = Number(employee.allowance) || 0;
                const gross = basicPay + otPay + allowance;
                const tds = gross * 0.01;
                const grossSalary = gross - tds;
                const advance = 0;
                const net = grossSalary - advance;
                const roundedNet = Math.round(net / 5) * 5;
                const bonus = 0;
                const finalNet = roundedNet + bonus;

                payrollRecords.push({
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
                    deduction: 0,
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
                    rawImportData: {}
                });
            }
        }

        const CHUNK_SIZE = 400;
        const { db } = getFirebase();
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
): Promise<{ createdCount: number, updatedCount: number, newEmployeesCount: number, newEmployees: Employee[] }> => {
    const { db } = getFirebase();
    try {
        let headerIndex = -1;
        for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
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
        
        // Tracking within this sheet to avoid duplicates if same employee has two rows
        const processedEmployeeIdsInThisSheet = new Set<string>();

        // Fetch existing payroll for this period once to avoid per-row queries
        const qExisting = query(getPayrollCollection(), where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
        const existingPayrollSnap = await getDocs(qExisting);
        const existingPayrollMap = new Map(existingPayrollSnap.docs.map(d => [d.data().employeeId, d.ref]));

        for (const fullRow of dataRows) {
            const employeeName = String(fullRow[nameIndex] || '').trim();
            if (!employeeName || employeeName.toUpperCase() === 'TOTAL') continue;

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
                const val = fullRow[index];
                return val !== undefined ? val : null;
            };
            
            const otHours = coerceNumber(getValue('otHours'));
            const regularHours = coerceNumber(getValue('regularHours'));
            
            const payrollData: Omit<Payroll, 'id'> = {
                bsYear: bsYear, 
                bsMonth: bsMonth,
                employeeId: employee.id,
                employeeName,
                joiningDate: employee.joiningDate || null,
                totalHours: regularHours + otHours,
                otHours: otHours,
                regularHours: regularHours,
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
                rawImportData: headerRow.reduce((obj, header, index) => {
                    obj[String(header || `col_${index}`)] = fullRow[index] !== undefined ? fullRow[index] : null;
                    return obj;
                }, {} as Record<string, any>)
            };
            
            const existingDocRef = existingPayrollMap.get(employee.id);

            if (!existingDocRef) {
                const docRef = doc(getPayrollCollection());
                batch.set(docRef, payrollData);
                createdCount++;
            } else {
                batch.update(existingDocRef, payrollData);
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
        date: ['date', 'work date', 'period'],
        otHours: ['ot hrs', 'ot hour', 'ot hours', 'overtime hrs'],
        regularHours: ['regular hrs', 'normal hrs', 'regular hours', 'reg hrs'],
        rate: ['base (salary or', 'rate', 'base rate', 'basic salary', 'base'],
        regularPay: ['basic pay', 'norman', 'regular pay', 'basic'],
        otPay: ['ot pay', 'ot amount', 'ot'],
        totalPay: ['gross', 'gross amount', 'total gross'],
        absentDays: ['absent days', 'absent', 'abs. days'],
        deduction: ['absent amt.', 'deduction', 'absent amount', 'abs amt'],
        allowance: ['allowance', 'extra', 'other allowance', 'allowances'],
        bonus: ['bonus', 'bonus amount'],
        salaryTotal: ['gross salary', 'salary total', 'gross sal'],
        tds: ['tds', 'tds (1%)', 'tds amount'],
        advance: ['advance', 'salary advance', 'adv'],
        net: ['net', 'net amount', 'net salary'],
        roundedNet: ['rounded net', 'round off', 'round'],
        netPayment: ['final net', 'net payment', 'net payable', 'total net', 'payable'],
        remark: ['remark', 'remarks', 'narration', 'note']
    };

    // Prioritize search from Column Q (index 16) onwards to match user's layout
    // but fall back to entire row if not found there
    const searchOrder = [
        ...Array.from({ length: headerRow.length - 16 }, (_, i) => i + 16),
        ...Array.from({ length: 16 }, (_, i) => i)
    ];

    for (const key in payrollHeaders) {
        for (const index of searchOrder) {
            if (index >= headerRow.length) continue;
            const headerCell = headerRow[index];
            const normalizedHeader = String(headerCell || '').trim().toLowerCase();
            if (payrollHeaders[key].some(alias => normalizedHeader === alias || normalizedHeader.includes(alias))) {
                map[key] = index;
                break; // Found for this key
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
    const patterns: PatternInsight[] = [];

    const workingEmployees = allEmployees.filter(e => e.status === 'Working');

    for (const employee of workingEmployees) {
        const employeeAttendance = monthlyAttendance.filter(r => r.employeeId === employee.id);
        const scheduledDays = 26; 
        const presentDays = employeeAttendance.filter(r => r.status === 'Present').length;
        const absentDays = employeeAttendance.filter(r => r.status === 'Absent').length;
        
        const lateArrivals = employeeAttendance.filter(r => r.remarks?.toLowerCase().includes('late')).length;
        const earlyDepartures = employeeAttendance.filter(r => r.remarks?.toLowerCase().includes('early')).length;

        const attendanceRate = presentDays / scheduledDays;
        const punctualityScore = (presentDays - (lateArrivals * 0.5)) / presentDays || 0;

        punctuality.push({
            employeeId: employee.id,
            employeeName: employee.name,
            scheduledDays,
            presentDays,
            absentDays,
            attendanceRate,
            lateArrivals,
            earlyDepartures,
            onTimeDays: presentDays - lateArrivals,
            punctualityScore
        });

        behavior.push({
            employeeId: employee.id,
            employeeName: employee.name,
            punctualityTrend: lateArrivals > 3 ? 'Declining' : 'Stable',
            absencePattern: absentDays > 2 ? 'Frequent' : 'Normal',
            otImpact: employeeAttendance.reduce((sum, r) => sum + r.overtimeHours, 0) > 10 ? 'High' : 'Low',
            shiftEndBehavior: earlyDepartures > 2 ? 'Early Exit Pattern' : 'Standard',
            performanceInsight: punctualityScore > 0.9 ? 'Exemplary' : 'Average'
        });

        workforce.push({
            employeeId: employee.id,
            employeeName: employee.name,
            overtimeRatio: employeeAttendance.reduce((sum, r) => sum + r.overtimeHours, 0) / (presentDays * 8) || 0,
            onTimeStreak: 0, 
            saturdaysWorked: employeeAttendance.filter(r => new Date(r.date).getDay() === 6).length
        });
    }

    patterns.push({
        finding: 'Attendance Trends',
        description: `Average attendance rate for this period is ${((punctuality.reduce((s, p) => s + p.attendanceRate, 0) / workingEmployees.length) * 100).toFixed(1)}%`
    });

    return { punctuality, behavior, workforce, patterns };
};
