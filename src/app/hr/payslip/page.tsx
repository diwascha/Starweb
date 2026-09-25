'use client';

import { useState, useEffect, Suspense } from 'react';
import type { Payroll, Employee } from '@/lib/types';
import { getPayrollForEmployee, getPayrollHistoryForEmployee } from '@/services/payroll-service';
import { getEmployee } from '@/services/employee-service';
import PayslipView from './_components/payslip-view';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

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
    const hasPeriod = Boolean(year && month);

    const [employee, setEmployee] = useState<Employee | null>(null);
    const [payrollData, setPayrollData] = useState<Payroll | null>(null);
    // Every period this employee has been paid for, used when the caller
    // didn't name one. The Employees page links here without a year or month
    // (it has no period context to offer), which used to leave the page
    // stuck on "Loading payslip..." forever because the fetch - and the
    // setLoading(false) inside it - only ran when both were present.
    const [periods, setPeriods] = useState<Payroll[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!employeeId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);

        const work = hasPeriod
            ? Promise.all([
                getEmployee(employeeId),
                getPayrollForEmployee(employeeId, parseInt(year!), parseInt(month!)),
            ]).then(([emp, payroll]) => {
                if (cancelled) return;
                setEmployee(emp);
                setPayrollData(payroll);
            })
            : Promise.all([
                getEmployee(employeeId),
                getPayrollHistoryForEmployee(employeeId),
            ]).then(([emp, history]) => {
                if (cancelled) return;
                setEmployee(emp);
                setPeriods(history);
            });

        work
            .catch(() => { /* fall through to the not-found state below */ })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [employeeId, year, month, hasPeriod]);

    if (loading) {
        return (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin opacity-40" />
                <p className="text-xs font-bold uppercase tracking-widest">Loading payslip</p>
            </div>
        );
    }

    if (!employeeId) {
        return <div className="p-8 text-sm text-muted-foreground">No employee selected.</div>;
    }

    // No period in the link: offer the ones this employee actually has.
    if (!hasPeriod) {
        return (
            <div className="flex flex-col gap-6">
                <header>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Payslips</h1>
                    <p className="text-sm text-muted-foreground">
                        {employee?.name ?? 'Employee'} — choose a period.
                    </p>
                </header>
                {periods.length === 0 ? (
                    <Card className="border-2">
                        <CardContent className="py-14 text-center text-sm text-muted-foreground">
                            No payroll records exist for this employee yet.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {periods.map(p => (
                            <Link
                                key={p.id}
                                href={`/hr/payslip?employeeId=${employeeId}&year=${p.bsYear}&month=${p.bsMonth}`}
                                className="flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:border-primary hover:bg-primary/5"
                            >
                                <span className="text-sm font-black uppercase tracking-tight">
                                    {nepaliMonths[p.bsMonth]?.name || p.bsMonth} {p.bsYear}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                    Rs. {(p.roundedNet ?? p.netPayment ?? 0).toLocaleString('en-IN')}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (!employee || !payrollData) {
        return <div className="p-8 text-sm text-muted-foreground">Payslip data not found for the selected period.</div>;
    }

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
