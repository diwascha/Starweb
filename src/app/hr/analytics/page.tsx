'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord, Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BarChart2, Loader2, Download, Table as TableIcon, Activity, Star } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { onPayrollUpdate } from '@/services/payroll-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { generateAnalyticsForMonth, AnalyticsData } from '@/services/payroll-service';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { NEPALI_MONTHS } from '@/lib/constants';

// Specific headers from the user's Excel analytics sections
const BEHAVIORAL_HEADERS = ['Workdays', 'OnTime Day', 'OnTime %', 'Late Days', 'Early Days', 'Missing', 'Absent Days', 'Sat Worked', 'PH Worked', 'ExtraOK Hours', 'Insight'];
const ENHANCED_HEADERS = ['Punctuality Tr', 'Absence Pattern', 'OT Impact', 'Shift-End Behavior', 'Performance Insight'];

export default function AnalyticsPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [payroll, setPayroll] = useState<Payroll[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        onEmployeesUpdate(setEmployees);
        onAttendanceUpdate(setAttendance);
        onPayrollUpdate(setPayroll);
    }, []);
    
    useEffect(() => {
        let isMounted = true;
        getAttendanceYears().then(years => {
            if (isMounted) {
                setBsYears(years);
                if (years.length > 0) {
                    const currentYear = new NepaliDate().getYear();
                    const defaultYear = years.includes(currentYear) ? currentYear : years[0];
                    setSelectedBsYear(String(defaultYear));
                    setSelectedBsMonth(String(new NepaliDate().getMonth()));
                }
            }
        });
        return () => { isMounted = false; };
    }, [attendance]);

    const importedAnalytics = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '') return null;
        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        
        const monthlyPayroll = payroll.filter(p => p.bsYear === year && p.bsMonth === month);
        if (monthlyPayroll.length === 0) return null;

        // Extract behavioral and enhanced data
        const behavioralData = monthlyPayroll.map(p => {
            const data: any = { employee: p.employeeName };
            BEHAVIORAL_HEADERS.forEach(h => {
                data[h] = p.rawImportData?.[h] || '—';
            });
            return data;
        }).filter(d => Object.values(d).some(v => v !== '—'));

        const enhancedData = monthlyPayroll.map(p => {
            const data: any = { employee: p.employeeName };
            ENHANCED_HEADERS.forEach(h => {
                data[h] = p.rawImportData?.[h] || '—';
            });
            return data;
        }).filter(d => Object.values(d).some(v => v !== '—'));

        if (behavioralData.length === 0 && enhancedData.length === 0) return null;

        return { behavioral: behavioralData, enhanced: enhancedData };
    }, [payroll, selectedBsYear, selectedBsMonth]);

    const handleGenerateAnalytics = () => {
        if (selectedBsYear && selectedBsMonth && employees.length > 0) {
            setIsProcessing(true);
            try {
                const data = generateAnalyticsForMonth(
                    parseInt(selectedBsYear, 10),
                    parseInt(selectedBsMonth, 10),
                    employees,
                    attendance
                );
                setAnalyticsData(data);
                toast({ title: "System Analytics Computed" });
            } catch (error) {
                toast({ title: "Calculation Failed", variant: "destructive" });
            } finally {
                setIsProcessing(false);
            }
        }
    };
    
    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><BarChart2 className="h-6 w-6 text-primary"/></div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Workforce Analytics</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Behavioral patterns and performance insights derived from records.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 bg-muted/20 p-2 rounded-xl border border-dashed">
                    <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                        <SelectTrigger className="w-[100px] h-9 bg-white"><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>{bsYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                        <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
                        <SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleGenerateAnalytics} disabled={isProcessing || !selectedBsYear} className="h-9 font-bold px-6">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                        Compute Analytics
                    </Button>
                </div>
            </header>

            {importedAnalytics ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <Card className="shadow-lg border-primary/20 overflow-hidden ring-4 ring-primary/5">
                        <CardHeader className="bg-primary/5 border-b py-6 px-8 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                                    <TableIcon className="h-5 w-5 text-primary"/>
                                    Imported Behavioral Patterns
                                </CardTitle>
                                <CardDescription className="text-xs uppercase font-bold text-muted-foreground">Detailed metrics harvested from the monthly Excel ledger.</CardDescription>
                            </div>
                            <Badge variant="outline" className="bg-white px-3 font-black text-[10px] uppercase">Source: Spreadsheet After Column Q</Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="w-full">
                                <Table className="text-[11px]">
                                    <TableHeader className="bg-muted/50">
                                        <TableRow className="h-10">
                                            <TableHead className="pl-8 font-black uppercase sticky left-0 bg-background z-10 border-r min-w-[150px]">Employee</TableHead>
                                            {BEHAVIORAL_HEADERS.map(h => (
                                                <TableHead key={h} className="font-bold text-center px-4 uppercase tracking-tighter whitespace-nowrap">{h}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importedAnalytics.behavioral.map((row, i) => (
                                            <TableRow key={i} className="hover:bg-muted/30 h-11 border-b transition-colors group">
                                                <TableCell className="pl-8 font-black text-gray-900 sticky left-0 bg-background z-10 border-r group-hover:text-primary">{row.employee}</TableCell>
                                                {BEHAVIORAL_HEADERS.map(h => (
                                                    <TableCell key={h} className={cn(
                                                        "text-center font-medium px-4",
                                                        h.includes('%') && "font-black text-blue-700 bg-blue-50/20",
                                                        h === 'Insight' && "text-left italic text-muted-foreground min-w-[200px]"
                                                    )}>
                                                        {row[h]}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border-amber-200 overflow-hidden ring-4 ring-amber-50">
                        <CardHeader className="bg-amber-50/30 border-b py-6 px-8">
                            <CardTitle className="text-lg font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                                <Star className="h-5 w-5 text-amber-500"/>
                                Enhanced Employee Insights
                            </CardTitle>
                            <CardDescription className="text-xs uppercase font-bold text-muted-foreground">Qualitative performance assessment imported from master data.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="w-full">
                                <Table className="text-[11px]">
                                    <TableHeader className="bg-amber-50/10">
                                        <TableRow className="h-10 border-b-amber-100">
                                            <TableHead className="pl-8 font-black uppercase sticky left-0 bg-background z-10 border-r min-w-[150px]">Employee</TableHead>
                                            {ENHANCED_HEADERS.map(h => (
                                                <TableHead key={h} className="font-bold px-6 uppercase tracking-tighter whitespace-nowrap">{h}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importedAnalytics.enhanced.map((row, i) => (
                                            <TableRow key={i} className="hover:bg-amber-50/10 h-11 border-b border-gray-100 transition-colors">
                                                <TableCell className="pl-8 font-black text-gray-900 sticky left-0 bg-background z-10 border-r">{row.employee}</TableCell>
                                                {ENHANCED_HEADERS.map(h => (
                                                    <TableCell key={h} className="px-6 font-medium text-gray-700">
                                                        <Badge variant="outline" className={cn(
                                                            "font-bold uppercase text-[9px] h-5 border-none",
                                                            row[h].toLowerCase().includes('good') || row[h].toLowerCase().includes('v. good') || row[h].toLowerCase().includes('punc') ? "bg-emerald-50 text-emerald-700" :
                                                            row[h].toLowerCase().includes('improvement') || row[h].toLowerCase().includes('late') ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"
                                                        )}>
                                                            {row[h]}
                                                        </Badge>
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            ) : null}

            {analyticsData && (
                 <Card className="animate-in fade-in slide-in-from-top-4">
                    <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/10 py-4 px-6">
                        <div className="space-y-1">
                            <CardTitle className="text-base font-black uppercase flex items-center gap-2">
                                <Activity className="h-4 w-4 text-primary"/>
                                System-Generated Workforce Report
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <Accordion type="multiple" defaultValue={['punctuality']} className="space-y-4">
                            <AccordionItem value="punctuality" className="border rounded-xl px-4">
                                <AccordionTrigger className="font-bold uppercase text-xs hover:no-underline">Computed Punctuality Scoring</AccordionTrigger>
                                <AccordionContent>
                                    <Table className="text-[11px]">
                                        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Attend. Rate</TableHead><TableHead>Late</TableHead><TableHead>Early Out</TableHead><TableHead className="text-right">Score</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {analyticsData.punctuality.map(p => (
                                                <TableRow key={p.employeeId} className="h-10">
                                                    <TableCell className="font-bold">{p.employeeName}</TableCell>
                                                    <TableCell>{(p.attendanceRate * 100).toFixed(1)}%</TableCell>
                                                    <TableCell className="text-amber-600">{p.lateArrivals}</TableCell>
                                                    <TableCell className="text-amber-600">{p.earlyDepartures}</TableCell>
                                                    <TableCell className="text-right font-black">{(p.punctualityScore * 100).toFixed(1)}%</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                </Card>
            )}

            {!importedAnalytics && !analyticsData && (
                <div className="h-80 border-4 border-dashed rounded-[2rem] flex flex-col items-center justify-center text-center p-12 bg-muted/5">
                    <Activity className="h-16 w-16 text-muted-foreground/20 mb-4 animate-pulse"/>
                    <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest">No Intelligence Data Loaded</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-sm">Select a period and click "Compute Analytics" or import a master payroll spreadsheet to unlock organizational insights.</p>
                </div>
            )}
        </div>
    );
}
