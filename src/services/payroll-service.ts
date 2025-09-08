
import { getDay, differenceInMinutes, parse, format } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import type { Employee, Payroll, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics, AttendanceRecord, AttendanceStatus, RawAttendanceRow } from '@/lib/types';
import { calculateAttendance } from '@/lib/attendance';

export interface PayrollAndAnalyticsData {
    payroll: Payroll[];
    punctuality: PunctualityInsight[];
    behavior: BehaviorInsight[];
    patternInsights: PatternInsight[];
    workforce: WorkforceAnalytics[];
    dayOfWeek: { day: string; lateArrivals: number; absenteeism: number }[];
}


export function generatePayrollAndAnalytics(
    bsYear: number,
    bsMonth: number,
    employees: Employee[],
    allAttendance: AttendanceRecord[]
): PayrollAndAnalyticsData {
    
    const workingEmployees = employees.filter(e => e.status === 'Working');

    const monthlyAttendance = allAttendance.filter(r => {
        try {
            if (!r.date || isNaN(new Date(r.date).getTime())) return false;
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === bsYear && nepaliDate.getMonth() === bsMonth;
        } catch (e) {
            return false;
        }
    });

    const payroll: Payroll[] = workingEmployees.map(employee => {
        const employeeAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        
        const regularHours = employeeAttendance.reduce((sum, r) => sum + (r.regularHours || 0), 0);
        const overtimeHours = employeeAttendance.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
        const totalHours = regularHours + overtimeHours;
        
        const absentDays = employeeAttendance.filter(r => ['ABSENT', 'C/I MISS', 'C/O MISS', 'TRUE'].includes(r.status.toUpperCase())).length;
        
        let rate = 0;
        let regularPay = 0;
        let otPay = 0;
        let deduction = 0;
        
        if (employee.wageBasis === 'Monthly') {
            const monthlySalary = employee.wageAmount;
            
            const nextMonthFirstDay = new NepaliDate(bsMonth === 11 ? bsYear + 1 : bsYear, (bsMonth + 1) % 12, 1);
            const daysInMonth = (new NepaliDate(nextMonthFirstDay.valueOf() - (24*60*60*1000))).getDate();

            const dailyRate = monthlySalary / daysInMonth;
            const hourlyRate = dailyRate / 8;
            rate = hourlyRate;

            regularPay = regularHours * hourlyRate;
            otPay = overtimeHours * hourlyRate * 1.5; // Assuming 1.5x OT rate
            deduction = absentDays * dailyRate;

        } else { // Hourly
            rate = employee.wageAmount;
            regularPay = regularHours * rate;
            otPay = overtimeHours * rate * 1.5;
        }

        const totalPay = regularPay + otPay;
        const allowance = employee.allowance || 0;
        const salaryTotal = totalPay + allowance - deduction;
        const tds = salaryTotal * 0.01; // Simplified 1% TDS
        const gross = salaryTotal - tds;
        const advance = 0; // This will be handled by adjustments
        const netPayment = gross - advance;
        
        return {
            employeeId: employee.id,
            employeeName: employee.name,
            totalHours: +totalHours.toFixed(1),
            otHours: +overtimeHours.toFixed(1),
            regularHours: +regularHours.toFixed(1),
            rate: +rate.toFixed(2),
            regularPay: +regularPay.toFixed(2),
            otPay: +otPay.toFixed(2),
            totalPay: +totalPay.toFixed(2),
            absentDays,
            deduction: +deduction.toFixed(2),
            allowance,
            salaryTotal: +salaryTotal.toFixed(2),
            tds: +tds.toFixed(2),
            gross: +gross.toFixed(2),
            advance,
            netPayment: +netPayment.toFixed(2),
            remark: '',
        };
    });

    // --- Analytics Calculations ---
    const punctuality: PunctualityInsight[] = [];
    const behavior: BehaviorInsight[] = [];
    const patternInsights: PatternInsight[] = [];
    const workforce: WorkforceAnalytics[] = [];
    
    const GRACE_MIN = 5;
    const dayOfWeekStats = { 0: {l:0,a:0}, 1:{l:0,a:0}, 2:{l:0,a:0}, 3:{l:0,a:0}, 4:{l:0,a:0}, 5:{l:0,a:0}, 6:{l:0,a:0} };

    workingEmployees.forEach(employee => {
        const empAttendance = monthlyAttendance.filter(r => r.employeeName === employee.name);
        if (empAttendance.length === 0) return;

        let lateArrivals = 0;
        let earlyDepartures = 0;
        let onTimeStreak = 0;
        let currentStreak = 0;

        empAttendance.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(r => {
            const day = getDay(new Date(r.date));
            let isLate = false;
            let isEarly = false;

            if(r.clockIn && r.onDuty) {
                try {
                    const clockInTime = parse(r.clockIn, 'HH:mm', new Date());
                    const onDutyTime = parse(r.onDuty, 'HH:mm', new Date());
                    if(differenceInMinutes(clockInTime, onDutyTime) > GRACE_MIN) {
                        lateArrivals++;
                        isLate = true;
                        dayOfWeekStats[day as keyof typeof dayOfWeekStats].l++;
                    }
                } catch {}
            }
             if(r.clockOut && r.offDuty) {
                try {
                    const clockOutTime = parse(r.clockOut, 'HH:mm', new Date());
                    const offDutyTime = parse(r.offDuty, 'HH:mm', new Date());
                    if(differenceInMinutes(offDutyTime, clockOutTime) > GRACE_MIN) {
                        earlyDepartures++;
                        isEarly = true;
                    }
                } catch {}
            }
            if (r.status.toUpperCase() === 'ABSENT' || r.status.toUpperCase() === 'TRUE') {
                dayOfWeekStats[day as keyof typeof dayOfWeekStats].a++;
            }

            if (!isLate && !isEarly && r.status === 'Present') {
                currentStreak++;
            } else {
                onTimeStreak = Math.max(onTimeStreak, currentStreak);
                currentStreak = 0;
            }
        });
        onTimeStreak = Math.max(onTimeStreak, currentStreak);


        const scheduledDays = empAttendance.filter(r => r.status !== 'Saturday' && r.status !== 'Public Holiday').length;
        const presentDays = empAttendance.filter(r => r.status === 'Present' || r.status === 'EXTRAOK').length;
        const absentDays = scheduledDays - presentDays;
        
        punctuality.push({
            employeeId: employee.id,
            employeeName: employee.name,
            scheduledDays,
            presentDays,
            absentDays,
            attendanceRate: scheduledDays > 0 ? (presentDays / scheduledDays) * 100 : 0,
            lateArrivals,
            earlyDepartures,
            onTimeDays: presentDays - lateArrivals - earlyDepartures,
            punctualityScore: presentDays > 0 ? ((presentDays - lateArrivals - earlyDepartures) / presentDays) * 100 : 0,
        });

        const totalRegularHours = empAttendance.reduce((sum, r) => sum + r.regularHours, 0);
        const totalOvertimeHours = empAttendance.reduce((sum, r) => sum + r.overtimeHours, 0);

        workforce.push({
            employeeId: employee.id,
            employeeName: employee.name,
            overtimeRatio: totalRegularHours > 0 ? (totalOvertimeHours / totalRegularHours) * 100 : 0,
            onTimeStreak,
            saturdaysWorked: empAttendance.filter(r => getDay(new Date(r.date)) === 6 && r.grossHours > 0).length,
        });
        
        behavior.push({
            employeeId: employee.id,
            employeeName: employee.name,
            punctualityTrend: 'Stable', // Placeholder
            absencePattern: absentDays > 3 ? 'High' : 'Normal', // Placeholder
            otImpact: 'N/A', // Placeholder
            shiftEndBehavior: earlyDepartures > 3 ? 'Leaves Early' : 'Stays Full Shift', // Placeholder
            performanceInsight: 'Consistent', // Placeholder
        });
    });

    patternInsights.push({ finding: "No significant patterns detected.", description: "Overall attendance behavior is within normal parameters for the selected period." });

    const dayOfWeek = [
        { day: 'Sunday', lateArrivals: dayOfWeekStats[0].l, absenteeism: dayOfWeekStats[0].a },
        { day: 'Monday', lateArrivals: dayOfWeekStats[1].l, absenteeism: dayOfWeekStats[1].a },
        { day: 'Tuesday', lateArrivals: dayOfWeekStats[2].l, absenteeism: dayOfWeekStats[2].a },
        { day: 'Wednesday', lateArrivals: dayOfWeekStats[3].l, absenteeism: dayOfWeekStats[3].a },
        { day: 'Thursday', lateArrivals: dayOfWeekStats[4].l, absenteeism: dayOfWeekStats[4].a },
        { day: 'Friday', lateArrivals: dayOfWeekStats[5].l, absenteeism: dayOfWeekStats[5].a },
    ];


    return { payroll, punctuality, behavior, patternInsights, workforce, dayOfWeek };
}
