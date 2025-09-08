
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, Save, Loader2, Edit } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const PR_TDS_RATE = 0.01;
const PR_MONTH_DAYS = 30;

export default function PayrollClientPage({ initialEmployees, initialAttendance }: { initialEmployees: Employee[], initialAttendance: AttendanceRecord[] }) {
    const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
    const [isClient, setIsClient] = useState(false);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [allowances, setAllowances] = useState<Record<string, number>>({});
    const [advances, setAdvances] = useState<Record<string, number>>({});
    const [isAdjustmentDialogOpen, setIsAdjustmentDialogOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [currentAllowance, setCurrentAllowance] = useState('');
    const [currentAdvance, setCurrentAdvance] = useState('');
    
    const { toast } = useToast();

    useEffect(() => {
        setIsClient(true);
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubAttendance = onAttendanceUpdate((records) => {
            setAttendance(records);
            if (records.length > 0) {
                const years = new Set(records.map(r => new NepaliDate(new Date(r.date)).getYear()));
                const sortedYears = Array.from(years).sort((a, b) => b - a);
                setBsYears(sortedYears);
                
                if (!selectedBsYear && !selectedBsMonth) {
                    const latestRecord = records.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                    const latestNepaliDate = new NepaliDate(new Date(latestRecord.date));
                    setSelectedBsYear(String(latestNepaliDate.getYear()));
                    setSelectedBsMonth(String(latestNepaliDate.getMonth()));
                }
            }
        });

        return () => {
            unsubEmployees();
            unsubAttendance();
        }
    }, [selectedBsYear, selectedBsMonth]);
    
    const openAdjustmentDialog = (employee: Employee) => {
        setEditingEmployee(employee);
        setCurrentAllowance(String(allowances[employee.id] || ''));
        setCurrentAdvance(String(advances[employee.id] || ''));
        setIsAdjustmentDialogOpen(true);
    };

    const handleSaveAdjustments = () => {
        if (!editingEmployee) return;
        setAllowances(prev => ({ ...prev, [editingEmployee.id]: parseFloat(currentAllowance) || 0 }));
        setAdvances(prev => ({ ...prev, [editingEmployee.id]: parseFloat(currentAdvance) || 0 }));
        setIsAdjustmentDialogOpen(false);
        toast({ title: 'Success', description: `Adjustments for ${editingEmployee.name} saved.` });
    };

    const payrollData = useMemo<Payroll[]>(() => {
        if (!selectedBsYear || !selectedBsMonth || employees.length === 0) {
            return [];
        }

        const filteredAttendance = attendance.filter(r => {
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === parseInt(selectedBsYear, 10) &&
                   nepaliDate.getMonth() === parseInt(selectedBsMonth, 10);
        });

        return employees.map(employee => {
            const empAttendance = filteredAttendance.filter(r => r.employeeName === employee.name);
            
            const totalRegularHours = empAttendance.reduce((sum, r) => sum + r.regularHours, 0);
            const totalOtHours = empAttendance.reduce((sum, r) => sum + r.overtimeHours, 0);
            const absentDays = empAttendance.filter(r => r.status === 'Absent').length;
            const missPunchDays = empAttendance.filter(r => r.status === 'C/I Miss' || r.status === 'C/O Miss').length;

            let basePay = 0;
            let otPay = 0;
            let baseText = '';

            if (employee.wageBasis === 'Monthly') {
                const dailyRate = employee.wageAmount / PR_MONTH_DAYS;
                basePay = Math.max(0, employee.wageAmount - (absentDays * dailyRate));
                otPay = (employee.wageAmount / PR_MONTH_DAYS / 8) * totalOtHours;
                baseText = `Monthly (${employee.wageAmount.toLocaleString()})`;
            } else { // Hourly
                basePay = totalRegularHours * employee.wageAmount;
                otPay = totalOtHours * employee.wageAmount;
                baseText = `Hourly (${employee.wageAmount.toLocaleString()}/hr)`;
            }

            const allowance = allowances[employee.id] || 0;
            const advance = advances[employee.id] || 0;
            const grossPay = basePay + otPay + allowance;
            const tds = grossPay * PR_TDS_RATE;
            const netPay = grossPay - tds - advance;

            return {
                employeeId: employee.id,
                employeeName: employee.name,
                regularHours: totalRegularHours,
                otHours: totalOtHours,
                absentDays,
                missPunchDays,
                baseText,
                basePay,
                otPay,
                allowance,
                grossPay,
                tds,
                advance,
                netPay,
            };
        });
    }, [selectedBsYear, selectedBsMonth, employees, attendance, allowances, advances]);
    
    const totals = useMemo(() => {
        return payrollData.reduce((acc, curr) => ({
            basePay: acc.basePay + curr.basePay,
            otPay: acc.otPay + curr.otPay,
            allowance: acc.allowance + curr.allowance,
            grossPay: acc.grossPay + curr.grossPay,
            tds: acc.tds + curr.tds,
            advance: acc.advance + curr.advance,
            netPay: acc.netPay + curr.netPay,
        }), { basePay: 0, otPay: 0, allowance: 0, grossPay: 0, tds: 0, advance: 0, netPay: 0 });
    }, [payrollData]);

    const handlePrint = () => {
        window.print();
    };

    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const dataToExport = payrollData.map(p => ({
            'Employee': p.employeeName,
            'Regular Hours': p.regularHours,
            'OT Hours': p.otHours,
            'Absent Days': p.absentDays,
            'Base': p.baseText,
            'Basic Pay': p.basePay,
            'OT Pay': p.otPay,
            'Allowance': p.allowance,
            'Gross Pay': p.grossPay,
            'TDS': p.tds,
            'Advance': p.advance,
            'Net Pay': p.netPay,
        }));
        
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
        XLSX.writeFile(workbook, `Payroll-${selectedBsYear}-${nepaliMonths[parseInt(selectedBsMonth)].name}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Payroll Generation</h1>
                <p className="text-muted-foreground">Calculate and view payroll reports for your employees.</p>
            </header>
            
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Payroll for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}</CardTitle>
                            <CardDescription>Select a Nepali month and year to generate the payroll report.</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                             <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={handleExport} disabled={payrollData.length === 0}><Download className="mr-2 h-4 w-4" /> Export</Button>
                        <Button onClick={handlePrint} disabled={payrollData.length === 0}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </div>
                    <div className="printable-area">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[200px]">Employee</TableHead>
                                    <TableHead>Regular</TableHead>
                                    <TableHead>OT</TableHead>
                                    <TableHead>Absent</TableHead>
                                    <TableHead>Basic Pay</TableHead>
                                    <TableHead>OT Pay</TableHead>
                                    <TableHead>Allowance</TableHead>
                                    <TableHead>Gross</TableHead>
                                    <TableHead>TDS</TableHead>
                                    <TableHead>Advance</TableHead>
                                    <TableHead>Net Pay</TableHead>
                                    <TableHead className="print:hidden">Adjust</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payrollData.map(p => {
                                    const employee = employees.find(e => e.id === p.employeeId);
                                    return (
                                        <TableRow key={p.employeeId}>
                                            <TableCell className="font-medium">{p.employeeName}</TableCell>
                                            <TableCell>{p.regularHours.toFixed(1)}</TableCell>
                                            <TableCell>{p.otHours.toFixed(1)}</TableCell>
                                            <TableCell>{p.absentDays}</TableCell>
                                            <TableCell>{p.basePay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.grossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="font-bold">{p.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="print:hidden">
                                                {employee && <Button variant="ghost" size="icon" onClick={() => openAdjustmentDialog(employee)}><Edit className="h-4 w-4"/></Button>}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                             <TableFooter>
                                <TableRow className="font-bold">
                                    <TableCell colSpan={4}>Totals</TableCell>
                                    <TableCell>{totals.basePay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>{totals.grossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>{totals.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="print:hidden"></TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isAdjustmentDialogOpen} onOpenChange={setIsAdjustmentDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Adjustments for {editingEmployee?.name}</DialogTitle>
                        <DialogDescription>
                            Enter any allowances or advances for this payroll period.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="allowance">Allowance</Label>
                            <Input id="allowance" type="number" value={currentAllowance} onChange={(e) => setCurrentAllowance(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="advance">Advance</Label>
                            <Input id="advance" type="number" value={currentAdvance} onChange={(e) => setCurrentAdvance(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAdjustmentDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveAdjustments}>Save Adjustments</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <style jsx global>{`
                @media print {
                  @page { size: A4 landscape; margin: 0.5in; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff; }
                  body * { visibility: hidden; }
                  .printable-area, .printable-area * { visibility: visible; }
                  .printable-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; border: none; font-size: 10px; }
                  .print\\:hidden { display: none; }
                }
            `}</style>
        </div>
    );
}
