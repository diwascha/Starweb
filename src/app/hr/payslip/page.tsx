'use client';

import { useState, useEffect, Suspense } from 'react';
import type { Payroll, Employee } from '@/lib/types';
import { getPayrollForEmployee } from '@/services/payroll-service';
import { getEmployee } from '@/services/employee-service';
import PayslipView from './_components/payslip-view';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

function PayslipContent() {
    const searchParams = useSearchParams();
    const employeeId = searchParams.get('employeeId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

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
            bsYear={parseInt(year!)} 
            bsMonthName={nepaliMonths[parseInt(month!)]?.name || ''} 
        />
    );
}

export default function PayslipPage() {
    return (
        <Suspense fallback={
            <div className="space-y-4">
                <Skeleton className="h-10 w-1/4" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        }>
            <PayslipContent />
        </Suspense>
    );
}
