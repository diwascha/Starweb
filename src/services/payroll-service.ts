
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, onSnapshot, DocumentData, QueryDocumentSnapshot, getDocs, query, where, limit, getDoc } from 'firebase/firestore';
import type { Payroll, Employee, AttendanceRecord, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';

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

export const addPayrollRecords = async (records: Omit<Payroll, 'id'>[]): Promise<void> => {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(record => {
            const docRef = doc(payrollCollection);
            batch.set(docRef, record);
        });
        await batch.commit();
    }
};

export const deletePayrollForMonth = async (bsYear: number, bsMonth: number): Promise<void> => {
    const q = query(payrollCollection, where("bsYear", "==", bsYear), where("bsMonth", "==", bsMonth));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        console.log("No payroll records to delete for the specified month.");
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

    console.log(`Deleted ${docsToDelete.length} payroll records for ${bsYear}-${bsMonth + 1}.`);
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
    const allRecords = await getDocs(payrollCollection).then(snap => snap.docs.map(d => d.data()));
    const years = new Set(allRecords.map(r => r.bsYear) as number[]);
    return Array.from(years).sort((a, b) => b - a);
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
