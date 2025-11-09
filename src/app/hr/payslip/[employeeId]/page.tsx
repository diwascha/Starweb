
import { getEmployee, getEmployees } from '@/services/employee-service';
import { getPayrollForEmployee } from '@/services/payroll-service';
import PayslipView from './_components/payslip-view';

const nepaliMonths = [
    "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
    "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];

// This function is required for Next.js static exports to work with dynamic routes.
export async function generateStaticParams() {
  // Always try to generate params for desktop builds
  if (process.env.TAURI_BUILD !== 'true') {
    return [];
  }
  try {
    const employees = await getEmployees(true); // Force fetch for build
    if (!employees || employees.length === 0) {
      return [];
    }
    // We can't know which year/month combos exist without fetching all payroll data,
    // which is inefficient. Instead, we can return just the employee IDs.
    // The page will need to handle cases where a payslip for a specific month doesn't exist.
    return employees.map((employee) => ({
      employeeId: employee.id,
    }));
  } catch (error) {
    console.error("Failed to generate static params for payslips:", error);
    return [];
  }
}

export default async function PayslipPage({ params, searchParams }: { params: { employeeId: string }, searchParams: { year: string, month: string } }) {
    const { employeeId } = params;
    const bsYear = parseInt(searchParams?.year, 10);
    const bsMonth = parseInt(searchParams?.month, 10);

    if (isNaN(bsYear) || isNaN(bsMonth)) {
        return (
            <div className="flex justify-center items-center h-full">
                <p>Invalid year or month provided in the URL parameters.</p>
            </div>
        );
    }

    const [employee, payrollData] = await Promise.all([
        getEmployee(employeeId),
        getPayrollForEmployee(employeeId, bsYear, bsMonth)
    ]);

    if (!employee) {
        return (
            <div className="flex justify-center items-center h-full">
                <p>Employee not found.</p>
            </div>
        );
    }
    
    if (!payrollData) {
        return (
            <div className="flex justify-center items-center h-full">
                <p>No payroll data found for this employee for the selected period. Please ensure it has been imported or calculated.</p>
            </div>
        );
    }
    
    const bsMonthName = nepaliMonths[bsMonth];

    return <PayslipView employee={employee} payroll={payrollData} bsYear={bsYear} bsMonthName={bsMonthName} />;
}
