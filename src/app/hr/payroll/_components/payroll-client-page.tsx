

'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, Loader2, View } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { onPayrollUpdate, getPayrollYears } from '@/services/payroll-service';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import NepaliDate from 'nepali-date-converter';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const customEmployeeOrder = [
    "Tika Gurung", "Anju Bista", "Madhu Bhandari", "Amrita Lama", "sunil chaudhary",
    "KUMAR SHRESTHA", "Niroj Koirala", "Binod Magar", "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL", "Sunita Gurung"
];


export default function PayrollClientPage() {
    const [allPayroll, setAllPayroll] = useState<Payroll[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        const unsubPayroll = onPayrollUpdate(setAllPayroll);
        return () => unsubPayroll();
    }, []);

    useEffect(() => {
        if (allPayroll.length > 0) {
            const years = Array.from(new Set(allPayroll.map(p => p.bsYear))).sort((a, b) => b - a);
            setBsYears(years);

            if (!selectedBsYear || !years.includes(parseInt(selectedBsYear, 10))) {
                const currentNepaliDate = new NepaliDate();
                const currentYear = currentNepaliDate.getYear();
                const defaultYear = years.includes(currentYear) ? currentYear : years[0];
                setSelectedBsYear(String(defaultYear));

                if (!selectedBsMonth) {
                     setSelectedBsMonth(String(currentNepaliDate.getMonth()));
                }
            }
             setIsLoading(false);
        } else if (allPayroll) {
             setIsLoading(false);
        }
    }, [allPayroll, selectedBsYear, selectedBsMonth]);

    const monthlyPayroll = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '' || isLoading) return [];

        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        
        const filtered = allPayroll.filter(p => p.bsYear === year && p.bsMonth === month);

        filtered.sort((a, b) => {
            const indexA = customEmployeeOrder.indexOf(a.employeeName);
            const indexB = customEmployeeOrder.indexOf(b.employeeName);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.employeeName.localeCompare(b.employeeName);
        });
        
        return filtered;
    }, [allPayroll, selectedBsYear, selectedBsMonth, isLoading]);


    const totals = useMemo(() => {
        if (!monthlyPayroll) return null;
        return monthlyPayroll.reduce((acc, curr) => ({
            totalHours: acc.totalHours + (curr.totalHours || 0),
            otHours: acc.otHours + (curr.otHours || 0),
            regularHours: acc.regularHours + (curr.regularHours || 0),
            regularPay: acc.regularPay + (curr.regularPay || 0),
            otPay: acc.otPay + (curr.otPay || 0),
            totalPay: acc.totalPay + (curr.totalPay || 0),
            absentDays: acc.absentDays + (curr.absentDays || 0),
            deduction: acc.deduction + (curr.deduction || 0),
            allowance: acc.allowance + (curr.allowance || 0),
            bonus: acc.bonus + (curr.bonus || 0),
            salaryTotal: acc.salaryTotal + (curr.salaryTotal || 0),
            tds: acc.tds + (curr.tds || 0),
            gross: acc.gross + (curr.gross || 0),
            advance: acc.advance + (curr.advance || 0),
            netPayment: acc.netPayment + (curr.netPayment || 0),
        }), { 
            totalHours: 0, otHours: 0, regularHours: 0, regularPay: 0, otPay: 0, totalPay: 0,
            absentDays: 0, deduction: 0, allowance: 0, bonus: 0, salaryTotal: 0, tds: 0, gross: 0, advance: 0, netPayment: 0
        });
    }, [monthlyPayroll]);


    const handlePrint = () => {
        window.print();
    };

    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const payrollExport = monthlyPayroll?.map(p => ({
            'Name': p.employeeName,
            'Total Hours': p.totalHours, 'OT Hours': p.otHours, 'Normal Hours': p.regularHours,
            'Rate': p.rate, 'Regular Pay': p.regularPay, 'OT Pay': p.otPay, 'Total Pay': p.totalPay,
            'Absent Days': p.absentDays, 'Absent Amt.': p.deduction, 'Allowance': p.allowance, 'Bonus': p.bonus,
            'Salary Total': p.salaryTotal, 'TDS (1%)': p.tds, 'Gross': p.gross, 'Advance': p.advance,
            'Net Payment': p.netPayment, 'Remark': p.remark
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(payrollExport || []);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
        XLSX.writeFile(workbook, `Payroll-${selectedBsYear}-${nepaliMonths[parseInt(selectedBsMonth)].name}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">View Payroll</h1>
                <p className="text-muted-foreground">View imported payroll data for your employees.</p>
            </header>
            
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Payroll for {nepaliMonths[parseInt(selectedBsMonth)]?.name || '...'}, {selectedBsYear || '...'}</CardTitle>
                            <CardDescription>Select a Nepali month and year to view the imported payroll report.</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading || bsYears.length === 0}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading || bsYears.length === 0}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={handleExport} disabled={!monthlyPayroll || monthlyPayroll.length === 0}><Download className="mr-2 h-4 w-4" /> Export</Button>
                        <Button onClick={handlePrint} disabled={!monthlyPayroll || monthlyPayroll.length === 0}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </div>
                    <div className="printable-area">
                        <header className="hidden print:block text-center space-y-1 mb-4">
                            <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                            <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                            <h2 className="text-lg font-semibold underline mt-1">
                                Payroll for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                            </h2>
                            <p className="text-xs text-gray-500">
                                Generated by: {user?.username} on {format(new Date(), 'PPpp')}
                            </p>
                        </header>
                        <ScrollArea className="w-full whitespace-nowrap">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead rowSpan={2} className="w-[150px] sticky left-0 bg-background z-10 align-bottom">Name</TableHead>
                                        <TableHead colSpan={3} className="text-center">Time</TableHead>
                                        <TableHead rowSpan={2} className="print:hidden align-bottom">Rate</TableHead>
                                        <TableHead colSpan={3} className="text-center">Pay Calculation</TableHead>
                                        <TableHead colSpan={4} className="text-center">Adjustments</TableHead>
                                        <TableHead colSpan={5} className="text-center">Final Salary</TableHead>
                                        <TableHead rowSpan={2} className="align-bottom">Remark</TableHead>
                                        <TableHead rowSpan={2} className="print:hidden align-bottom">Actions</TableHead>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead>Total Hours</TableHead>
                                        <TableHead>OT Hours</TableHead>
                                        <TableHead>Normal Hours</TableHead>
                                        <TableHead>Regular Pay</TableHead>
                                        <TableHead>OT Pay</TableHead>
                                        <TableHead>Total Pay</TableHead>
                                        <TableHead>Abs. Days</TableHead>
                                        <TableHead>Absent Amt.</TableHead>
                                        <TableHead>Allowance</TableHead>
                                        <TableHead>Bonus</TableHead>
                                        <TableHead>Salary Total</TableHead>
                                        <TableHead>TDS (1%)</TableHead>
                                        <TableHead>Gross</TableHead>
                                        <TableHead>Advance</TableHead>
                                        <TableHead>Net Payment</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading && <TableRow><TableCell colSpan={19} className="text-center"><Loader2 className="mr-2 h-4 w-4 animate-spin inline-block" /> Loading payroll...</TableCell></TableRow>}
                                    {!isLoading && monthlyPayroll.length === 0 && <TableRow><TableCell colSpan={19} className="text-center">No payroll data found for this period.</TableCell></TableRow>}
                                    {!isLoading && monthlyPayroll.map(p => {
                                        return (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium sticky left-0 bg-background z-10">{p.employeeName}</TableCell>
                                            <TableCell>{p.totalHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell>{p.otHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell>{p.regularHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell className="print:hidden">{p.rate?.toFixed(2) || '0.00'}</TableCell>
                                            <TableCell>{p.regularPay?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.otPay?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.totalPay?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.absentDays || 0}</TableCell>
                                            <TableCell>{p.deduction?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.allowance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.bonus?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.salaryTotal?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.tds?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.gross?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.advance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell className="font-bold">{p.netPayment?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</TableCell>
                                            <TableCell>{p.remark}</TableCell>
                                            <TableCell className="print:hidden">
                                                <Button variant="ghost" size="sm" onClick={() => router.push(`/hr/payslip/${p.employeeId}?year=${selectedBsYear}&month=${selectedBsMonth}`)}>
                                                    <View className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                                {totals && monthlyPayroll.length > 0 && (
                                <TableFooter>
                                    <TableRow className="font-bold">
                                        <TableCell colSpan={1} className="sticky left-0 bg-background z-10">Totals</TableCell>
                                        <TableCell>{totals.totalHours.toFixed(1)}</TableCell>
                                        <TableCell>{totals.otHours.toFixed(1)}</TableCell>
                                        <TableCell>{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="print:hidden"></TableCell>
                                        <TableCell>{totals.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.absentDays}</TableCell>
                                        <TableCell>{totals.deduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.bonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.salaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="print:hidden"></TableCell>
                                    </TableRow>
                                </TableFooter>
                                )}
                            </Table>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>


            <style jsx global>{`
                @media print {
                  @page { size: A4 landscape; margin: 0.5in; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff; }
                  body * { visibility: hidden; }
                  .printable-area, .printable-area * { visibility: visible; }
                  .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 8px; }
                  .print\\:hidden { display: none; }
                }
            `}</style>
        </div>
    );
}
