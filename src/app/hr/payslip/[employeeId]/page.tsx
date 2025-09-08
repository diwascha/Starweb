
import { getEmployee } from '@/services/employee-service';
import { getAttendance } from '@/services/attendance-service';
import { generatePayrollAndAnalytics } from '@/services/payroll-service';
import PayslipView from './_components/payslip-view';

const nepaliMonths = [
    "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
    "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];

export default async function PayslipPage({ params, searchParams }: { params: { employeeId: string }, searchParams: { year: string, month: string } }) {
    const { employeeId } = params;
    const bsYear = parseInt(searchParams.year, 10);
    const bsMonth = parseInt(searchParams.month, 10);

    if (isNaN(bsYear) || isNaN(bsMonth)) {
        return (
            <div className="flex justify-center items-center h-full">
                <p>Invalid year or month provided.</p>
            </div>
        );
    }

    const [employee, allAttendance] = await Promise.all([
        getEmployee(employeeId),
        getAttendance()
    ]);

    if (!employee) {
        return (
            <div className="flex justify-center items-center h-full">
                <p>Employee not found.</p>
            </div>
        );
    }
    
    // We generate payroll for just this one employee to be efficient
    const { payroll } = generatePayrollAndAnalytics(bsYear, bsMonth, [employee], allAttendance);
    
    if (payroll.length === 0) {
        return (
            <div className="flex justify-center items-center h-full">
                <p>No payroll data found for this employee for the selected period.</p>
            </div>
        );
    }
    
    const employeePayroll = payroll[0];
    const bsMonthName = nepaliMonths[bsMonth];

    return <PayslipView employee={employee} payroll={employeePayroll} bsYear={bsYear} bsMonthName={bsMonthName} />;
}
