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
import { onPayrollUpdate, calculateAndSavePayrollForMonth, deletePayrollForMonth } from '@/services/payroll-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import NepaliDate from 'nepali-date-converter';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { NEPALI_MONTHS } from '@/lib/constants';

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
            toast({ title: 'Deletion Successful', description: `Payroll data for ${NEPALI_MONTHS[month].name} ${year} has been removed.` });
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
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(payrollExport || []);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
        XLSX.writeFile(workbook, `Payroll-${selectedBsYear}-${NEPALI_MONTHS[parseInt(selectedBsMonth)].name}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="print:hidden">
                <h1 className="text-3xl font-bold tracking-tight">Payroll Registry</h1>
                <p className="text-muted-foreground">Manage and audit finalized employee financial records.</p>
            </header>
            
             <Card className="print:hidden">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Ledger for {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name || '...'}, {selectedBsYear || '...'}</CardTitle>
                            <CardDescription>Select period for verification or recalculation.</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                             <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{NEPALI_MONTHS.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button variant="outline" onClick={() => router.push('/hr/payroll/import')} className="h-9 px-4 font-bold text-xs uppercase tracking-widest border-dashed">
                                <Upload className="mr-2 h-4 w-4" /> Import External Spreadsheet
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button disabled={isCalculating} className="h-9 px-4 font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                                        {isCalculating ? 'Recalculating...' : 'Re-Run Logic'}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogTitle>Recalculate Entire Period?</AlertDialogTitle>
                                    <AlertDialogDescription>This will wipe existing payroll records for this month and regenerate them using current HR Office rules and Attendance records.</AlertDialogDescription>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleCalculatePayroll}>Confirm Commit</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card className="shadow-lg border-gray-100 bg-white overflow-hidden">
                <CardContent className="pt-6">
                    <div className="mb-4 flex justify-end gap-2 print:hidden">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" className="text-destructive h-9 font-bold text-xs uppercase tracking-widest" disabled={!monthlyPayroll || monthlyPayroll.length === 0}><Trash2 className="mr-2 h-4 w-4" /> Purge Period</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Permanent Deletion?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will delete ALL payroll records for {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeletePayrollForMonth} className="bg-destructive text-white">Delete Everything</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        <Button variant="outline" onClick={handleExport} disabled={!monthlyPayroll || monthlyPayroll.length === 0} className="h-9 font-bold text-xs uppercase tracking-widest">
                            <Download className="mr-2 h-4 w-4" /> Export Excel
                        </Button>
                        <Button onClick={handlePrint} disabled={!monthlyPayroll || monthlyPayroll.length === 0} className="h-9 font-bold text-xs uppercase tracking-widest">
                            <Printer className="mr-2 h-4 w-4" /> Print Sheet
                        </Button>
                    </div>
                    
                    <div className="printable-area">
                        <header className="hidden print:block text-center space-y-1 mb-6">
                            <h1 className="text-2xl font-black uppercase">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                            <p className="text-sm font-bold text-muted-foreground uppercase">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                            <h2 className="text-lg font-black underline mt-2 uppercase tracking-tighter">
                                Payroll Registry: {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                            </h2>
                        </header>

                        <ScrollArea className="w-full whitespace-nowrap border rounded-xl overflow-hidden">
                            <Table className="text-[11px] border-collapse">
                                <TableHeader>
                                    <TableRow className="bg-muted/50 font-black h-11 border-b-2">
                                        <TableHead className="sticky left-0 bg-background z-20 border-r min-w-[160px] text-gray-900 uppercase tracking-tighter">Employee</TableHead>
                                        <TableHead className="text-right uppercase px-3">Regular Hrs</TableHead>
                                        <TableHead className="text-right uppercase px-3">OT Hrs</TableHead>
                                        <TableHead className="text-right uppercase px-3">Absent Days</TableHead>
                                        <TableHead className="text-right uppercase px-3 text-muted-foreground">Base Rate</TableHead>
                                        <TableHead className="text-right uppercase px-3 bg-blue-50/20 text-blue-900">Basic Pay</TableHead>
                                        <TableHead className="text-right uppercase px-3">OT Pay</TableHead>
                                        <TableHead className="text-right uppercase px-3">Allowance</TableHead>
                                        <TableHead className="text-right uppercase px-3 font-black bg-muted/20">Gross</TableHead>
                                        <TableHead className="text-right uppercase px-3 text-red-600">TDS (1%)</TableHead>
                                        <TableHead className="text-right uppercase px-3 font-black">Gross Salary</TableHead>
                                        <TableHead className="text-right uppercase px-3">Advance</TableHead>
                                        <TableHead className="text-right uppercase px-3 font-black">Net</TableHead>
                                        <TableHead className="text-right uppercase px-3 font-black bg-blue-50/50">Rounded Net</TableHead>
                                        <TableHead className="text-right uppercase px-3 text-emerald-600">Bonus</TableHead>
                                        <TableHead className="text-right uppercase px-3 font-black text-emerald-700 bg-emerald-50/30">Final Net</TableHead>
                                        <TableHead className="min-w-[150px] uppercase px-3">Remarks</TableHead>
                                        <TableHead className="print:hidden sticky right-0 bg-background z-10 border-l"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={17} className="text-center py-20"><Loader2 className="mr-2 h-8 w-8 animate-spin inline-block opacity-20" /></TableCell></TableRow>
                                    ) : monthlyPayroll.length === 0 ? (
                                        <TableRow><TableCell colSpan={17} className="text-center py-20 text-muted-foreground italic font-medium">No payroll data found for the selected period.</TableCell></TableRow>
                                    ) : monthlyPayroll.map(p => (
                                        <TableRow key={p.id} className="hover:bg-muted/30 h-12 border-b transition-colors group">
                                            <TableCell className="font-black sticky left-0 bg-background z-10 border-r text-gray-900 group-hover:text-primary">{p.employeeName}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3">{p.regularHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-bold text-blue-700">+{p.otHours?.toFixed(1) || '0.0'}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-red-600 font-bold">{p.absentDays || 0}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-muted-foreground font-medium">{(p.rate || 0).toLocaleString()}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-bold text-gray-900 bg-blue-50/10">{(p.regularPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3">{(p.otPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3">{(p.allowance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-black bg-muted/10">{(p.totalPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-red-600 font-medium">{(p.tds || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-bold text-gray-900">{(p.salaryTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-orange-600 font-bold">{(p.advance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-bold">{(p.net || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-black bg-blue-50/20 text-blue-900">{(p.roundedNet || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 text-emerald-600 font-black">{(p.bonus || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right tabular-nums px-3 font-black text-emerald-700 bg-emerald-50/20">{(p.netPayment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-[10px] text-muted-foreground italic truncate max-w-[150px] px-3">{p.remark}</TableCell>
                                            <TableCell className="print:hidden sticky right-0 bg-background z-10 border-l px-2">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => router.push(`/hr/payslip?employeeId=${p.employeeId}&year=${selectedBsYear}&month=${selectedBsMonth}`)}>
                                                    <View className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                {totals && monthlyPayroll.length > 0 && (
                                <TableFooter className="bg-muted/50 font-black h-12 border-t-2">
                                    <TableRow>
                                        <TableCell className="sticky left-0 bg-background z-20 border-r text-gray-900 uppercase tracking-tighter">SUMMARY TOTALS</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.otHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell className="text-right"></TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.salaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.roundedNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.bonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 text-emerald-700">{totals.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell colSpan={2} className="print:hidden"></TableCell>
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
                  @page { size: A4 landscape; margin: 0.3in; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff; }
                  body * { visibility: hidden; }
                  .printable-area, .printable-area * { visibility: visible; }
                  .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 8px; }
                  .print\\:hidden { display: none !important; }
                  .rounded-xl { border-radius: 0 !important; }
                  .shadow-lg { shadow: none !important; }
                }
            `}</style>
        </div>
    );
}
