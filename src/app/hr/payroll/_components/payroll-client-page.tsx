
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, Payroll, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, Save, Loader2, Edit, AlertCircle, Info, ChevronsUpDown, Check, PlusCircle } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { generatePayrollAndAnalytics, PayrollAndAnalyticsData } from '@/services/payroll-service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];


export default function PayrollClientPage({ initialEmployees, initialAttendance }: { initialEmployees: Employee[], initialAttendance: AttendanceRecord[] }) {
    const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance);
    const [isClient, setIsClient] = useState(false);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [payrollData, setPayrollData] = useState<PayrollAndAnalyticsData | null>(null);
    
    const [adjustmentForm, setAdjustmentForm] = useState({ employeeId: '', allowance: '', advance: '' });

    const { toast } = useToast();
    const { user } = useAuth();


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
    }, []);

    useEffect(() => {
        if (selectedBsYear && selectedBsMonth && employees.length > 0) {
            setIsProcessing(true);
            const data = generatePayrollAndAnalytics(
                parseInt(selectedBsYear, 10),
                parseInt(selectedBsMonth, 10),
                employees,
                attendance
            );
            setPayrollData(data);
            setIsProcessing(false);
        }
    }, [selectedBsYear, selectedBsMonth, employees, attendance]);
    
    
    const handlePostAdjustment = () => {
        const { employeeId, allowance, advance } = adjustmentForm;
        if (!employeeId || !payrollData) {
            toast({ title: 'Error', description: 'Please select an employee.', variant: 'destructive' });
            return;
        }

        const allowanceNum = parseFloat(allowance) || 0;
        const advanceNum = parseFloat(advance) || 0;

        const updatedPayroll = payrollData.payroll.map(p => {
            if (p.employeeId === employeeId) {
                const regularPay = p.regularPay;
                const otPay = p.otPay;
                const totalPay = regularPay + otPay;
                const deduction = p.deduction;
                const salaryTotal = totalPay + allowanceNum - deduction;
                const tds = salaryTotal * 0.01;
                const gross = salaryTotal - tds;
                const netPay = gross - advanceNum;

                return { ...p, allowance: allowanceNum, advance: advanceNum, totalPay, salaryTotal, tds, gross, netPayment: netPay };
            }
            return p;
        });
        
        setPayrollData(prev => prev ? { ...prev, payroll: updatedPayroll } : null);
        toast({ title: 'Success', description: `Adjustments for ${employees.find(e => e.id === employeeId)?.name} applied.` });
        setAdjustmentForm({ employeeId: '', allowance: '', advance: '' }); // Reset form
    };

    const totals = useMemo(() => {
        if (!payrollData) return null;
        return payrollData.payroll.reduce((acc, curr) => ({
            totalHours: acc.totalHours + curr.totalHours,
            otHours: acc.otHours + curr.otHours,
            regularHours: acc.regularHours + curr.regularHours,
            regularPay: acc.regularPay + curr.regularPay,
            otPay: acc.otPay + curr.otPay,
            totalPay: acc.totalPay + curr.totalPay,
            deduction: acc.deduction + curr.deduction,
            allowance: acc.allowance + curr.allowance,
            salaryTotal: acc.salaryTotal + curr.salaryTotal,
            tds: acc.tds + curr.tds,
            gross: acc.gross + curr.gross,
            advance: acc.advance + curr.advance,
            netPayment: acc.netPayment + curr.netPayment,
        }), { 
            totalHours: 0, otHours: 0, regularHours: 0, regularPay: 0, otPay: 0, totalPay: 0,
            deduction: 0, allowance: 0, salaryTotal: 0, tds: 0, gross: 0, advance: 0, netPayment: 0
        });
    }, [payrollData]);


    const handlePrint = () => {
        window.print();
    };

    const handleExport = async () => {
        const XLSX = (await import('xlsx'));
        const payrollExport = payrollData?.payroll.map(p => ({
            'Name': p.employeeName,
            'Total Hours': p.totalHours, 'OT Hours': p.otHours, 'Normal Hours': p.regularHours,
            'Rate': p.rate, 'Regular Pay': p.regularPay, 'OT Pay': p.otPay, 'Total Pay': p.totalPay,
            'Absent Days': p.absentDays, 'Deduction': p.deduction, 'Allowance': p.allowance,
            'Salary Total': p.salaryTotal, 'TDS (%)': p.tds, 'Gross': p.gross, 'Advance': p.advance,
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
                <h1 className="text-3xl font-bold tracking-tight">Payroll Generation</h1>
                <p className="text-muted-foreground">Calculate and view payroll reports for your employees.</p>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
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
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Adjustments</CardTitle>
                        <CardDescription>Add allowance or advance for an employee in this period.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label>Employee</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="w-full justify-between">
                                            {adjustmentForm.employeeId ? employees.find(e => e.id === adjustmentForm.employeeId)?.name : "Select employee..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]"><Command>
                                        <CommandInput placeholder="Search employee..." />
                                        <CommandList><CommandEmpty>No employee found.</CommandEmpty><CommandGroup>
                                            {employees.map(emp => <CommandItem key={emp.id} value={emp.name} onSelect={() => setAdjustmentForm(prev => ({...prev, employeeId: emp.id}))}>
                                                <Check className={cn("mr-2 h-4 w-4", adjustmentForm.employeeId === emp.id ? "opacity-100" : "opacity-0")} />{emp.name}
                                            </CommandItem>)}
                                        </CommandGroup></CommandList>
                                    </Command></PopoverContent>
                                </Popover>
                             </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="quick-allowance">Allowance</Label>
                                <Input id="quick-allowance" type="number" placeholder="0.00" value={adjustmentForm.allowance} onChange={e => setAdjustmentForm(prev => ({...prev, allowance: e.target.value}))}/>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="quick-advance">Advance</Label>
                                <Input id="quick-advance" type="number" placeholder="0.00" value={adjustmentForm.advance} onChange={e => setAdjustmentForm(prev => ({...prev, advance: e.target.value}))}/>
                            </div>
                        </div>
                         <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setAdjustmentForm({ employeeId: '', allowance: '', advance: '' })}>Cancel</Button>
                            <Button onClick={handlePostAdjustment}><PlusCircle className="mr-2 h-4 w-4" /> Post Adjustment</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="mb-4 flex justify-end gap-2">
                        <Button variant="outline" onClick={handleExport} disabled={!payrollData}><Download className="mr-2 h-4 w-4" /> Export</Button>
                        <Button onClick={handlePrint} disabled={!payrollData}><Printer className="mr-2 h-4 w-4" /> Print</Button>
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
                                        <TableHead className="w-[150px] sticky left-0 bg-background z-10">Name</TableHead>
                                        <TableHead>Total Hours</TableHead>
                                        <TableHead>OT Hours</TableHead>
                                        <TableHead>Normal Hours</TableHead>
                                        <TableHead className="print:hidden">Rate</TableHead>
                                        <TableHead>Regular Pay</TableHead>
                                        <TableHead>OT Pay</TableHead>
                                        <TableHead>Total Pay</TableHead>
                                        <TableHead>Absent Days</TableHead>
                                        <TableHead>Deduction</TableHead>
                                        <TableHead>Allowance</TableHead>
                                        <TableHead>Salary Total</TableHead>
                                        <TableHead>TDS (1%)</TableHead>
                                        <TableHead>Gross</TableHead>
                                        <TableHead>Advance</TableHead>
                                        <TableHead>Net Payment</TableHead>
                                        <TableHead>Remark</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isProcessing && <TableRow><TableCell colSpan={17} className="text-center">Processing payroll...</TableCell></TableRow>}
                                    {!isProcessing && payrollData?.payroll.map(p => {
                                        const employee = employees.find(e => e.id === p.employeeId);
                                        return (
                                        <TableRow key={p.employeeId}>
                                            <TableCell className="font-medium sticky left-0 bg-background z-10">{p.employeeName}</TableCell>
                                            <TableCell>{p.totalHours.toFixed(1)}</TableCell>
                                            <TableCell>{p.otHours.toFixed(1)}</TableCell>
                                            <TableCell>{p.regularHours.toFixed(1)}</TableCell>
                                            <TableCell className="print:hidden">{p.rate.toFixed(2)}</TableCell>
                                            <TableCell>{p.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.absentDays}</TableCell>
                                            <TableCell>{p.deduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.salaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="font-bold">{p.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell>{p.remark}</TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                                {totals && (
                                <TableFooter>
                                    <TableRow className="font-bold">
                                        <TableCell className="sticky left-0 bg-background z-10">Totals</TableCell>
                                        <TableCell>{totals.totalHours.toFixed(1)}</TableCell>
                                        <TableCell>{totals.otHours.toFixed(1)}</TableCell>
                                        <TableCell>{totals.regularHours.toFixed(1)}</TableCell>
                                        <TableCell className="print:hidden"></TableCell>
                                        <TableCell>{totals.regularPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell></TableCell>
                                        <TableCell>{totals.deduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.allowance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.salaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.tds.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.advance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell>{totals.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                </TableFooter>
                                )}
                            </Table>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Analytics Dashboard</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="punctuality">
                        <TabsList className="w-auto">
                            <TabsTrigger value="punctuality">Punctuality</TabsTrigger>
                            <TabsTrigger value="workforce">Workforce Analytics</TabsTrigger>
                            <TabsTrigger value="behavior">Behavior &amp; Performance Insights</TabsTrigger>
                        </TabsList>
                        <TabsContent value="punctuality" className="pt-4">
                            <ScrollArea className="w-full whitespace-nowrap">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[150px] sticky left-0 bg-background z-10">Employee</TableHead>
                                            <TableHead>Scheduled</TableHead>
                                            <TableHead>Present</TableHead>
                                            <TableHead>Absent</TableHead>
                                            <TableHead>Attendance Rate</TableHead>
                                            <TableHead>Late Arrivals</TableHead>
                                            <TableHead>Early Departures</TableHead>
                                            <TableHead>On Time Days</TableHead>
                                            <TableHead>Punctuality Score</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payrollData?.punctuality.map(p => (
                                            <TableRow key={p.employeeId}>
                                                <TableCell className="font-medium sticky left-0 bg-background z-10">{p.employeeName}</TableCell>
                                                <TableCell>{p.scheduledDays}</TableCell>
                                                <TableCell>{p.presentDays}</TableCell>
                                                <TableCell>{p.absentDays}</TableCell>
                                                <TableCell>{p.attendanceRate.toFixed(1)}%</TableCell>
                                                <TableCell>{p.lateArrivals}</TableCell>
                                                <TableCell>{p.earlyDepartures}</TableCell>
                                                <TableCell>{p.onTimeDays}</TableCell>
                                                <TableCell>{p.punctualityScore.toFixed(1)}%</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </TabsContent>
                         <TabsContent value="workforce" className="pt-4">
                            <ScrollArea className="w-full whitespace-nowrap">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[150px] sticky left-0 bg-background z-10">Employee</TableHead>
                                            <TableHead>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1">OT Ratio <Info className="h-3 w-3" /></TooltipTrigger>
                                                        <TooltipContent>Overtime hours as a percentage of regular hours. High values may indicate burnout risk.</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1">On-Time Streak <Info className="h-3 w-3" /></TooltipTrigger>
                                                        <TooltipContent>Longest streak of consecutive on-time (no lates/early departures) days this month.</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                            <TableHead>
                                                 <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="flex items-center gap-1">Saturdays Worked <Info className="h-3 w-3" /></TooltipTrigger>
                                                        <TooltipContent>Total number of Saturdays worked this month. A measure of work-life balance.</TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payrollData?.workforce.map(w => (
                                            <TableRow key={w.employeeId}>
                                                <TableCell className="font-medium sticky left-0 bg-background z-10">{w.employeeName}</TableCell>
                                                <TableCell>{w.overtimeRatio.toFixed(1)}%</TableCell>
                                                <TableCell>{w.onTimeStreak}</TableCell>
                                                <TableCell>{w.saturdaysWorked}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </TabsContent>
                        <TabsContent value="behavior" className="pt-4 space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card className="lg:col-span-2">
                                    <CardHeader><CardTitle>Enhanced Employee Insights</CardTitle></CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader><TableRow>
                                                <TableHead>Employee</TableHead><TableHead>Punctuality Trend</TableHead>
                                                <TableHead>Absence Pattern</TableHead><TableHead>OT Impact</TableHead>
                                                <TableHead>Shift-End Behavior</TableHead><TableHead>Performance Insight</TableHead>
                                            </TableRow></TableHeader>
                                            <TableBody>
                                                {payrollData?.behavior.map(b => (
                                                    <TableRow key={b.employeeId}>
                                                        <TableCell className="font-medium">{b.employeeName}</TableCell>
                                                        <TableCell>{b.punctualityTrend}</TableCell><TableCell>{b.absencePattern}</TableCell>
                                                        <TableCell>{b.otImpact}</TableCell><TableCell>{b.shiftEndBehavior}</TableCell>
                                                        <TableCell>{b.performanceInsight}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                                <div className="space-y-6">
                                    <Card>
                                        <CardHeader><CardTitle>Day of Week Patterns</CardTitle></CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader><TableRow>
                                                    <TableHead>Day</TableHead><TableHead>Late Arrivals</TableHead><TableHead>Absenteeism</TableHead>
                                                </TableRow></TableHeader>
                                                <TableBody>
                                                    {payrollData?.dayOfWeek.map(d => (
                                                        <TableRow key={d.day}>
                                                            <TableCell>{d.day}</TableCell><TableCell>{d.lateArrivals}</TableCell><TableCell>{d.absenteeism}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader><CardTitle>Pattern Insights</CardTitle></CardHeader>
                                        <CardContent>
                                            <ul className="space-y-2 text-sm">
                                                {payrollData?.patternInsights.map((insight, index) => (
                                                    <li key={index} className="flex items-start gap-2">
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipContent>{insight.description}</TooltipContent>
                                                                <TooltipTrigger asChild>
                                                                     <span className="flex-shrink-0 mt-1"><AlertCircle className="h-4 w-4 text-muted-foreground" /></span>
                                                                </TooltipTrigger>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                        <span>{insight.finding}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
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
