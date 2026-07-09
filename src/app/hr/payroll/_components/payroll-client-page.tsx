'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Payroll, Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, Loader2, View, Calculator, Upload, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { onPayrollUpdate, getPayrollYears, calculateAndSavePayrollForMonth, deletePayrollForMonth } from '@/services/payroll-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import NepaliDate from 'nepali-date-converter';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const customEmployeeOrder = [
    "Tika Gurung",
    "Anju Bista",
    "Madhu Bhandari",
    "Amrita Lama",
    "sunil chaudhary",
    "KUMAR SHRESTHA",
    "Niroj Koirala",
    "Binod Magar",
    "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL",
    "Sunita Gurung"
];

// Helper to determine extra spreadsheet columns
const standardMappedFields = [
    'employee', 'staff name', 'name', 'date', 'work date', 'period',
    'ot hrs', 'ot hour', 'ot hours', 'overtime hrs', 'regular hrs', 'normal hrs', 'regular hours', 'reg hrs',
    'base (salary or', 'rate', 'base rate', 'basic salary', 'base', 'basic pay', 'norman', 'regular pay', 'basic',
    'ot pay', 'ot amount', 'ot', 'gross', 'gross amount', 'total gross', 'absent days', 'absent', 'abs. days',
    'absent amt.', 'deduction', 'absent amount', 'abs amt', 'allowance', 'extra', 'other allowance', 'allowances', 'bonus', 'bonus amount',
    'gross salary', 'salary total', 'gross sal', 'tds', 'tds (1%)', 'tds amount', 'advance', 'salary advance', 'adv',
    'net', 'net amount', 'net salary', 'rounded net', 'round off', 'round', 'final net', 'net payment', 'net payable', 'total net', 'payable',
    'remark', 'remarks', 'narration', 'note'
];

export default function PayrollClientPage() {
    const [allPayroll, setAllPayroll] = useState<Payroll[]>([]);
    const [allAttendance, setAllAttendance] = useState<any[]>([]);
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);
    const router = useRouter();

    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        const unsubPayroll = onPayrollUpdate((payrolls) => {
            setAllPayroll(payrolls);
            if (payrolls.length > 0) {
                const years = Array.from(new Set(payrolls.map(p => p.bsYear))).sort((a, b) => b - a);
                setBsYears(years);
            }
            setIsLoading(false);
        });

        const unsubAttendance = onAttendanceUpdate(setAllAttendance);
        const unsubEmployees = onEmployeesUpdate(setAllEmployees);
        
        return () => {
            unsubPayroll();
            unsubAttendance();
            unsubEmployees();
        };
    }, []);
    
    useEffect(() => {
        if (!isLoading && bsYears.length > 0) {
            const currentNepaliDate = new NepaliDate();
            
            if (!selectedBsYear || !bsYears.includes(parseInt(selectedBsYear, 10))) {
                const mostRecentYear = Math.max(...bsYears);
                setSelectedBsYear(String(mostRecentYear));
            }
            if (selectedBsMonth === '') {
                const mostRecentEntryForYear = allPayroll
                    .filter(p => p.bsYear === parseInt(selectedBsYear || String(Math.max(...bsYears)), 10))
                    .reduce((latest, current) => current.bsMonth > latest.bsMonth ? current : latest, { bsMonth: -1 });
                
                setSelectedBsMonth(String(mostRecentEntryForYear.bsMonth !== -1 ? mostRecentEntryForYear.bsMonth : currentNepaliDate.getMonth()));
            }
        } else if (!isLoading && bsYears.length === 0) {
            const currentNepaliDate = new NepaliDate();
            setSelectedBsYear(String(currentNepaliDate.getYear()));
            setSelectedBsMonth(String(currentNepaliDate.getMonth()));
        }
    }, [isLoading, bsYears, allPayroll, selectedBsYear, selectedBsMonth]);


    const handleCalculatePayroll = async () => {
        if (!selectedBsYear || selectedBsMonth === '' || !user) {
            toast({ title: 'Error', description: 'Please select a valid year and month.', variant: 'destructive' });
            return;
        }
        setIsCalculating(true);
        try {
            const year = parseInt(selectedBsYear, 10);
            const month = parseInt(selectedBsMonth, 10);
            
            const result = await calculateAndSavePayrollForMonth(
                year,
                month,
                allEmployees,
                allAttendance,
                user.username
            );
            
            toast({
                title: 'Calculation Complete',
                description: `Successfully generated payroll for ${result.employeeCount} employees.`
            });

        } catch (error: any) {
            console.error("Payroll calculation failed:", error);
            toast({ title: 'Error', description: error.message || 'Could not calculate payroll.', variant: 'destructive' });
        } finally {
            setIsCalculating(false);
        }
    };
    
    const handleDeletePayrollForMonth = async () => {
        if (!selectedBsYear || selectedBsMonth === '') {
            toast({ title: 'Error', description: 'Please select a year and month to delete.', variant: 'destructive' });
            return;
        }
        try {
            const year = parseInt(selectedBsYear);
            const month = parseInt(selectedBsMonth);
            await deletePayrollForMonth(year, month);
            toast({ title: 'Deletion Successful', description: `Payroll data for ${nepaliMonths[month].name} ${year} has been removed.` });
        } catch (error) {
            console.error("Failed to delete payroll data:", error);
            toast({ title: 'Deletion Failed', description: 'Could not remove the payroll data for the selected month.', variant: 'destructive' });
        }
    };


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
            
            if (a.joiningDate && b.joiningDate) {
                const dateA = new Date(a.joiningDate).getTime();
                const dateB = new Date(b.joiningDate).getTime();
                if (dateA !== dateB) {
                    return dateA - dateB;
                }
            }
            return a.employeeName.localeCompare(b.employeeName);
        });
        
        return filtered;
    }, [allPayroll, selectedBsYear, selectedBsMonth, isLoading]);

    const extraHeaders = useMemo(() => {
        if (!monthlyPayroll || monthlyPayroll.length === 0) return [];
        
        const headersSet = new Set<string>();
        monthlyPayroll.forEach(p => {
            if (p.rawImportData) {
                Object.keys(p.rawImportData).forEach(k => {
                    const kl = k.toLowerCase().trim();
                    if (!standardMappedFields.includes(kl)) {
                        headersSet.add(k);
                    }
                });
            }
        });
        return Array.from(headersSet).sort();
    }, [monthlyPayroll]);


    const totals = useMemo(() => {
        if (!monthlyPayroll) return null;
        return monthlyPayroll.reduce((acc, curr) => ({
            regularHours: acc.regularHours + (curr.regularHours || 0),
            otHours: acc.otHours + (curr.otHours || 0),
            absentDays: acc.absentDays + (curr.absentDays || 0),
            regularPay: acc.regularPay + (curr.regularPay || 0),
            otPay: acc.otPay + (curr.otPay || 0),
            allowance: acc.allowance + (curr.allowance || 0),
            totalPay: acc.totalPay + (curr.totalPay || 0),
            tds: acc.tds + (curr.tds || 0),
            salaryTotal: acc.salaryTotal + (curr.salaryTotal || 0),
            advance: acc.advance + (curr.advance || 0),
            net: acc.net + (curr.net || 0),
            roundedNet: acc.roundedNet + (curr.roundedNet || 0),
            bonus: acc.bonus + (curr.bonus || 0),
            netPayment: acc.netPayment + (curr.netPayment || 0),
            deduction: acc.deduction + (curr.deduction || 0),
        }), { 
            regularHours: 0, otHours: 0, absentDays: 0, regularPay: 0, otPay: 0, allowance: 0, 
            totalPay: 0, tds: 0, salaryTotal: 0, advance: 0, net: 0, roundedNet: 0, bonus: 0, netPayment: 0,
            deduction: 0,
        });
    }, [monthlyPayroll]);


    const handlePrint = () => {
        window.print();
    };

    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const payrollExport = monthlyPayroll?.map(p => ({
            'Employee': p.employeeName,
            'Regular Hrs': p.regularHours,
            'OT Hrs': p.otHours,
            'Absent Days': p.absentDays,
            'Base': p.rate,
            'Basic Pay': p.regularPay,
            'OT Pay': p.otPay,
            'Allowance': p.allowance,
            'Gross': p.totalPay,
            'TDS': p.tds,
            'Gross Salary': p.salaryTotal,
            'Advance': p.advance,
            'Net': p.net,
            'Rounded Net': p.roundedNet,
            'Bonus': p.bonus,
            'Final Net': p.netPayment,
            'Remarks': p.remark,
            ...p.rawImportData
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
                <p className="text-muted-foreground">View calculated payroll data for your employees.</p>
            </header>
            
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Payroll for {nepaliMonths[parseInt(selectedBsMonth)]?.name || '...'}, {selectedBsYear || '...'}</CardTitle>
                            <CardDescription>Select a Nepali month and year, then click Calculate.</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                             <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="outline" onClick={() => router.push('/hr/payroll/import')} className="h-9 px-4 font-bold text-xs uppercase tracking-widest border-dashed">
                                <Upload className="mr-2 h-4 w-4" /> Import External Spreadsheet
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button disabled={isCalculating}>
                                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                                        {isCalculating ? 'Calculating...' : 'Calculate Payroll'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Recalculate Payroll?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will delete any existing payroll data for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear} and regenerate it from the attendance records. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleCalculatePayroll}>Confirm & Calculate</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-4 flex justify-end gap-2">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={!monthlyPayroll || monthlyPayroll.length === 0}><Trash2 className="mr-2 h-4 w-4" /> Delete Payroll Data</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete All Payroll Data for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete all payroll records for the selected month.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeletePayrollForMonth}>Confirm Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
                        <ScrollArea className="w-full whitespace-nowrap border rounded-lg">
                            <Table className="text-[11px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/50 font-bold h-10">
                                        <TableHead className="sticky left-0 bg-background z-20 border-r min-w-[140px]">Employee</TableHead>
                                        <TableHead className="text-right">Regular Hrs</TableHead>
                                        <TableHead className="text-right">OT Hrs</TableHead>
                                        <TableHead className="text-right">Absent Days</TableHead>
                                        <TableHead className="text-right text-red-600">Abs. Amt</TableHead>
                                        <TableHead className="text-right">Base</TableHead>
                                        <TableHead className="text-right">Basic Pay</TableHead>
                                        <TableHead className="text-right">OT Pay</TableHead>
                                        <TableHead className="text-right">Allowance</TableHead>
                                        <TableHead className="text-right bg-blue-50/30">Gross</TableHead>
                                        <TableHead className="text-right text-red-600">TDS</TableHead>
                                        <TableHead className="text-right font-black">Gross Salary</TableHead>
                                        <TableHead className="text-right">Advance</TableHead>
                                        <TableHead className="text-right font-black">Net</TableHead>
                                        <TableHead className="text-right font-black bg-blue-50/50">Rounded Net</TableHead>
                                        <TableHead className="text-right text-emerald-600">Bonus</TableHead>
                                        <TableHead className="text-right font-black text-emerald-700 bg-emerald-50/30">Final Net</TableHead>
                                        <TableHead className="min-w-[150px]">Remarks</TableHead>
                                        {extraHeaders.map(h => (
                                            <TableHead key={h} className="min-w-[100px] border-l bg-gray-50/50">{h}</TableHead>
                                        ))}
                                        <TableHead className="print:hidden sticky right-0 bg-background z-10 border-l"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading && <TableRow><TableCell colSpan={18 + extraHeaders.length} className="text-center py-20"><Loader2 className="mr-2 h-8 w-8 animate-spin inline-block opacity-20" /></TableCell></TableRow>}
                                    {!isLoading && monthlyPayroll.length === 0 && <TableRow><TableCell colSpan={18 + extraHeaders.length} className="text-center py-20 text-muted-foreground italic">No payroll records found.</TableCell></TableRow>}
                                    {!isLoading && monthlyPayroll.map(p => (
                                        <TableRow key={p.id} className="hover:bg-muted/30 h-12">
                                            <TableCell className="font-black sticky left-0 bg-background z-10 border-r">{p.employeeName}</TableCell>
                                            <TableCell className="text-right tabular-nums">{p.regularHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{p.otHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell className="text-right tabular-nums">{p.absentDays || 0}</TableCell>
                                            <TableCell className="text-right tabular-nums text-red-600">{(p.deduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">{(p.rate || 0).toLocaleString()}</TableCell>
                                            <TableCell className="text-right tabular-nums">{(p.regularPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums">{(p.otPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums">{(p.allowance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums font-bold bg-blue-50/10">{(p.totalPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums text-red-600">{(p.tds || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums font-bold">{(p.salaryTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums">{(p.advance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums font-bold">{(p.net || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums font-black bg-blue-50/30">{(p.roundedNet || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums text-emerald-600 font-bold">{(p.bonus || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums font-black text-emerald-700 bg-emerald-50/20">{(p.netPayment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">{p.remark}</TableCell>
                                            {extraHeaders.map(h => (
                                                <TableCell key={h} className="text-right border-l text-[10px] text-gray-600 tabular-nums">
                                                    {p.rawImportData?.[h] !== undefined ? String(p.rawImportData[h]) : '—'}
                                                </TableCell>
                                            ))}
                                            <TableCell className="print:hidden sticky right-0 bg-background z-10 border-l">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(`/hr/payslip?employeeId=${p.employeeId}&year=${selectedBsYear}&month=${selectedBsMonth}`)}>
                                                    <View className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                {totals && monthlyPayroll.length > 0 && (
                                <TableFooter className="bg-muted/50 font-bold h-12">
                                    <TableRow>
                                        <TableCell className="sticky left-0 bg-background z-20 border-r">TOTALS</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.otHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.absentDays}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.deduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right"></TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.salaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.roundedNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.bonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums">{totals.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell colSpan={1 + extraHeaders.length} className="print:hidden"></TableCell>
                                    </TableRow>
                                </TableFooter>
                                )}
                            </Table>
                            <ScrollBar orientation="horizontal" />
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