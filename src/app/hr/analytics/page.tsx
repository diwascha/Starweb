
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Employee, AttendanceRecord, PunctualityInsight, BehaviorInsight, PatternInsight, WorkforceAnalytics } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BarChart2, Loader2, Download } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { generateAnalyticsForMonth, AnalyticsData } from '@/services/payroll-service';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

export default function AnalyticsPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubAttendance = onAttendanceUpdate(setAttendance);

        return () => {
            unsubEmployees();
            unsubAttendance();
        }
    }, []);
    
    useEffect(() => {
        let isMounted = true;
        getAttendanceYears().then(years => {
            if (isMounted) {
                setBsYears(years);
                if (years.length > 0) {
                     if (!selectedBsYear || !years.includes(parseInt(selectedBsYear, 10))) {
                        const currentYear = new NepaliDate().getYear();
                        const defaultYear = years.includes(currentYear) ? currentYear : years[0];
                        setSelectedBsYear(String(defaultYear));
                        
                        const currentMonth = new NepaliDate().getMonth();
                        setSelectedBsMonth(String(currentMonth));
                    }
                }
            }
        });
        return () => { isMounted = false; };
    }, [attendance, selectedBsYear]);


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
                toast({ title: "Analytics Generated", description: `Successfully processed data for ${data.punctuality.length} employees.` });
            } catch (error) {
                console.error("Analytics generation failed:", error);
                toast({ title: "Error", description: "Could not generate analytics.", variant: "destructive" });
                setAnalyticsData(null);
            } finally {
                setIsProcessing(false);
            }
        }
    };
    
    const handleExport = async () => {
        if (!analyticsData) return;
        const XLSX = await import('xlsx');
        
        const punctualitySheet = XLSX.utils.json_to_sheet(analyticsData.punctuality);
        const behaviorSheet = XLSX.utils.json_to_sheet(analyticsData.behavior);
        const workforceSheet = XLSX.utils.json_to_sheet(analyticsData.workforce);
        const patternSheet = XLSX.utils.json_to_sheet(analyticsData.patterns);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, punctualitySheet, "Punctuality");
        XLSX.utils.book_append_sheet(workbook, behaviorSheet, "Behavior");
        XLSX.utils.book_append_sheet(workbook, workforceSheet, "Workforce");
        XLSX.utils.book_append_sheet(workbook, patternSheet, "Patterns");
        
        XLSX.writeFile(workbook, `Analytics-${selectedBsYear}-${nepaliMonths.find(m => m.value.toString() === selectedBsMonth)?.name || selectedBsMonth}.xlsx`);
    };

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Generate Analytics</h1>
                <p className="text-muted-foreground">Analyze historical attendance data for insights.</p>
            </header>
            
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Select Period for Analysis</CardTitle>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={bsYears.length === 0}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={bsYears.length === 0}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                             <Button onClick={handleGenerateAnalytics} disabled={isProcessing || !selectedBsYear || selectedBsMonth === ''}>
                                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Generate
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {analyticsData && (
                 <Card>
                    <CardHeader className="flex justify-between items-center">
                        <div>
                            <CardTitle>Analytics Report</CardTitle>
                            <CardDescription>
                                For {nepaliMonths.find(m => m.value.toString() === selectedBsMonth)?.name || ''}, {selectedBsYear}
                            </CardDescription>
                        </div>
                        <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4"/> Export</Button>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="multiple" defaultValue={['punctuality', 'patterns']}>
                            <AccordionItem value="punctuality">
                                <AccordionTrigger>Punctuality & Attendance</AccordionTrigger>
                                <AccordionContent>
                                    <ScrollArea className="h-[400px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Employee</TableHead>
                                                    <TableHead>Attendance Rate</TableHead>
                                                    <TableHead>Late Arrivals</TableHead>
                                                    <TableHead>Early Departures</TableHead>
                                                    <TableHead>Punctuality Score</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {analyticsData.punctuality.map(p => (
                                                    <TableRow key={p.employeeId}>
                                                        <TableCell>{p.employeeName}</TableCell>
                                                        <TableCell>{(p.attendanceRate * 100).toFixed(1)}%</TableCell>
                                                        <TableCell>{p.lateArrivals}</TableCell>
                                                        <TableCell>{p.earlyDepartures}</TableCell>
                                                        <TableCell>{(p.punctualityScore * 100).toFixed(1)}%</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </ScrollArea>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="behavior">
                                <AccordionTrigger>Behavioral Insights</AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-4">
                                        {analyticsData.behavior.map(b => (
                                            <div key={b.employeeId} className="p-3 border rounded-md">
                                                <h4 className="font-semibold">{b.employeeName}</h4>
                                                <ul className="list-disc pl-5 mt-2 text-sm text-muted-foreground space-y-1">
                                                    <li><span className="font-medium">Punctuality:</span> {b.punctualityTrend}</li>
                                                    <li><span className="font-medium">Absence Pattern:</span> {b.absencePattern}</li>
                                                    <li><span className="font-medium">OT Impact:</span> {b.otImpact}</li>
                                                    <li><span className="font-medium">Performance:</span> {b.performanceInsight}</li>
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                             <AccordionItem value="patterns">
                                <AccordionTrigger>Workforce Patterns & Trends</AccordionTrigger>
                                <AccordionContent className="space-y-2">
                                    {analyticsData.patterns.map((p, i) => (
                                        <div key={i} className="p-3 bg-muted/50 rounded-md">
                                            <p className="font-semibold">{p.finding}</p>
                                            <p className="text-sm text-muted-foreground">{p.description}</p>
                                        </div>
                                    ))}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
