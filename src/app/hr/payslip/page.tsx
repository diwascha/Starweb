'use client';

import { useState, useEffect, Suspense, use } from 'react';
import type { Payroll, Employee } from '@/lib/types';
import { getPayrollForEmployee } from '@/services/payroll-service';
import { getEmployee } from '@/services/employee-service';
import { useRouter } from 'next/navigation';
import PayslipView from './_components/payslip-view';
import { Skeleton } from '@/components/ui/skeleton';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

function PayslipContent(props: { params: Promise<any>, searchParams: Promise<any> }) {
    // Next.js 15: Unwrap dynamic params and searchParams
    use(props.params);
    const searchParams = use(props.searchParams);
    
    const employeeId = searchParams.employeeId;
    const year = searchParams.year;
    const month = searchParams.month;

    const [employee, setEmployee] = useState<Employee | null>(null);
    const [payrollData, setPayrollData] = useState<Payroll | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (employeeId && year && month) {
            setLoading(true);
            Promise.all([
                getEmployee(employeeId),
                getPayrollForEmployee(employeeId, parseInt(year), parseInt(month))
            ]).then(([emp, payroll]) => {
                setEmployee(emp);
                setPayrollData(payroll);
                setLoading(false);
            });
        }
    }, [employeeId, year, month]);

    if (loading) return <div className="p-8">Loading payslip...</div>;
    if (!employee || !payrollData) return <div className="p-8">Payslip data not found for the selected period.</div>;
    
    return (
        <PayslipView 
            employee={employee} 
            payroll={payrollData} 
            bsYear={parseInt(year)} 
            bsMonthName={nepaliMonths[parseInt(month)]?.name || ''} 
        />
    );
}

export default function PayslipPage(props: { params: Promise<any>, searchParams: Promise<any> }) {
    return (
        <Suspense fallback={
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/4" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        }>
            <PayslipContent {...props} />
        </Suspense>
    );
}
