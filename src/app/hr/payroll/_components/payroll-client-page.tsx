'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Payroll, Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, Loader2, View, Trash2 } from 'lucide-react';
import { onPayrollUpdate, deletePayrollForMonth } from '@/services/payroll-service';
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { NEPALI_MONTHS } from '@/lib/constants';

const customEmployeeOrder = [
    "Tika Gurung", "Anju Bista", "Madhu Bhandari", "Amrita Lama", "sunil chaudhary",
    "KUMAR SHRESTHA", "Niroj Koirala", "Binod Magar", "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL", "Sunita Gurung"
];

interface PayrollClientPageProps {
    selectedBsYear: string;
    selectedBsMonth: string;
}

export default function PayrollClientPage({ selectedBsYear, selectedBsMonth }: PayrollClientPageProps) {
    const [allPayroll, setAllPayroll] = useState<Payroll[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        const unsubPayroll = onPayrollUpdate((payrolls) => {
            setAllPayroll(payrolls);
            setIsLoading(false);
        });
        return () => unsubPayroll();
    }, []);

    const handleDeletePayrollForMonth = async () => {
        if (!selectedBsYear || selectedBsMonth === '') return;
        try {
            const year = parseInt(selectedBsYear);
            const month = parseInt(selectedBsMonth);
            await deletePayrollForMonth(year, month);
            toast({ title: 'Deletion Successful', description: `Payroll data for ${NEPALI_MONTHS[month].name} ${year} has been removed.` });
        } catch (error) {
            toast({ title: 'Deletion Failed', variant: 'destructive' });
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
            return a.employeeName.localeCompare(b.employeeName);
        });
        
        return filtered;
    }, [allPayroll, selectedBsYear, selectedBsMonth, isLoading]);

    const totals = useMemo(() => {
        if (!monthlyPayroll || monthlyPayroll.length === 0) return null;
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
            netPayment: acc.netPayment + (curr.netPayment || 0),
            bonus: acc.bonus + (curr.bonus || 0),
        }), { 
            regularHours: 0, otHours: 0, absentDays: 0, regularPay: 0, otPay: 0, allowance: 0, 
            totalPay: 0, tds: 0, salaryTotal: 0, advance: 0, netPayment: 0, bonus: 0
        });
    }, [monthlyPayroll]);

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
        <Card className="shadow-lg border-gray-100 bg-white overflow-hidden">
            <CardContent className="pt-6">
                <div className="mb-6 flex justify-end gap-2 print:hidden">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive h-8 font-black text-[10px] uppercase tracking-widest" disabled={monthlyPayroll.length === 0}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Purge Month</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Period Records?</AlertDialogTitle>
                                <AlertDialogDescription>Permanently remove all payroll data for {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeletePayrollForMonth} className="bg-destructive text-white">Purge Everything</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={monthlyPayroll.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest border-gray-300">
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Export XLSX
                    </Button>
                    <Button size="sm" onClick={() => window.print()} disabled={monthlyPayroll.length === 0} className="h-8 font-black text-[10px] uppercase tracking-widest">
                        <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Sheet
                    </Button>
                </div>
                
                <div className="printable-area">
                    <header className="hidden print:block text-center space-y-1 mb-8">
                        <h1 className="text-2xl font-black uppercase">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                        <p className="text-sm font-bold text-muted-foreground uppercase">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
                        <h2 className="text-lg font-black underline mt-2 uppercase tracking-tighter">
                            Workforce Financial Registry: {NEPALI_MONTHS[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                        </h2>
                    </header>

                    <ScrollArea className="w-full whitespace-nowrap border rounded-xl overflow-hidden shadow-inner bg-gray-50/20">
                        <Table className="text-[11px] border-collapse">
                            <TableHeader>
                                <TableRow className="bg-muted/50 font-black h-11 border-b-2">
                                    <TableHead className="sticky left-0 bg-background z-20 border-r min-w-[160px] text-gray-900 uppercase tracking-tighter">Employee Name</TableHead>
                                    <TableHead className="text-right uppercase px-3">Reg. Hrs</TableHead>
                                    <TableHead className="text-right uppercase px-3">OT Hrs</TableHead>
                                    <TableHead className="text-right uppercase px-3 text-red-600">Absent</TableHead>
                                    <TableHead className="text-right uppercase px-3 text-muted-foreground">Base</TableHead>
                                    <TableHead className="text-right uppercase px-3 font-bold text-blue-900">Basic Pay</TableHead>
                                    <TableHead className="text-right uppercase px-3">OT Pay</TableHead>
                                    <TableHead className="text-right uppercase px-3">Extra</TableHead>
                                    <TableHead className="text-right uppercase px-3 font-black bg-muted/20">Gross</TableHead>
                                    <TableHead className="text-right uppercase px-3 text-red-600">TDS</TableHead>
                                    <TableHead className="text-right uppercase px-3 font-black text-orange-600">Advance</TableHead>
                                    <TableHead className="text-right uppercase px-3 text-emerald-600">Bonus</TableHead>
                                    <TableHead className="text-right uppercase px-3 font-black text-emerald-700 bg-emerald-50/30">Final Net</TableHead>
                                    <TableHead className="min-w-[150px] uppercase px-3">Remark</TableHead>
                                    <TableHead className="print:hidden sticky right-0 bg-background z-10 border-l"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={15} className="text-center py-20"><Loader2 className="mr-2 h-8 w-8 animate-spin inline-block opacity-20" /></TableCell></TableRow>
                                ) : monthlyPayroll.length === 0 ? (
                                    <TableRow><TableCell colSpan={15} className="text-center py-20 text-muted-foreground italic">No financial records for this period.</TableCell></TableRow>
                                ) : monthlyPayroll.map(p => (
                                    <TableRow key={p.id} className="hover:bg-muted/30 h-12 border-b transition-colors group">
                                        <TableCell className="font-black sticky left-0 bg-background z-10 border-r text-gray-900 group-hover:text-primary">{p.employeeName}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{p.regularHours?.toFixed(1) || '0.0'}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-bold text-blue-700">+{p.otHours?.toFixed(1) || '0.0'}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 text-red-600 font-bold">{p.absentDays || 0}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 text-muted-foreground font-medium">{(p.rate || 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-bold text-gray-900">{(p.regularPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{(p.otPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{(p.allowance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 font-black bg-muted/10">{(p.totalPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 text-red-600 font-medium">{(p.tds || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3 text-orange-600 font-bold">{(p.advance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
                                        <TableCell className="sticky left-0 bg-background z-20 border-r text-gray-900 uppercase tracking-tighter">TOTALS</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.otHours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.absentDays}</TableCell>
                                        <TableCell className="text-right"></TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right tabular-nums px-3">{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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

            <style jsx global>{`
                @media print {
                  @page { size: A4 landscape; margin: 0.3in; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff; }
                  body * { visibility: hidden; }
                  .printable-area, .printable-area * { visibility: visible; }
                  .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 8px; }
                  .print\\:hidden { display: none !important; }
                }
            `}</style>
        </Card>
    );
}
