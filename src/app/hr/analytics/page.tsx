'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BarChart2, Loader2, Activity, Clock, AlertTriangle, CheckCircle2, Calendar, Zap, Timer, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { generateAnalyticsForMonth, AnalyticsData } from '@/services/payroll-service';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { NEPALI_MONTHS } from '@/lib/constants';
import { Separator } from '@/components/ui/separator';

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
        onEmployeesUpdate(setEmployees);
        onAttendanceUpdate(setAttendance);
    }, []);
    
    useEffect(() => {
        let isMounted = true;
        getAttendanceYears().then(years => {
            if (isMounted) {
                setBsYears(years);
                const current = new NepaliDate();
                const year = years.includes(current.getYear()) ? current.getYear() : years[0];
                if (year) {
                    setSelectedBsYear(String(year));
                    setSelectedBsMonth(String(current.getMonth()));
                }
            }
        });
        return () => { isMounted = false; };
    }, [attendance]);

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
                toast({ title: "Intelligence Engine Complete" });
            } catch (error) {
                toast({ title: "Computation Failed", variant: "destructive" });
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
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Workforce Intelligence</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Attendance-based behavioral mapping and operational insights.</p>
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
                    <Button size="sm" onClick={handleGenerateAnalytics} disabled={isProcessing || !selectedBsYear} className="h-9 font-black uppercase text-[10px] tracking-widest px-6 shadow-lg shadow-primary/20">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
                        Run Analytics
                    </Button>
                </div>
            </header>

            {analyticsData ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    {/* 1. Patterns & Comparison Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <InsightCard title="Peak Absenteeism" value={analyticsData.highestAbsenteeism.day} sub={`${analyticsData.highestAbsenteeism.count} instances`} icon={AlertTriangle} color="red" />
                        <InsightCard title="Peak Tardiness" value={analyticsData.highestLateArrivals.day} sub={`${analyticsData.highestLateArrivals.count} late arrivals`} icon={Clock} color="amber" />
                        <InsightCard title="Punctual Leader" value={analyticsData.mostPunctualWeekday.day} sub={`${analyticsData.mostPunctualWeekday.rate.toFixed(1)}% on-time`} icon={CheckCircle2} color="emerald" />
                        <InsightCard title="Sat. Utilization" value={`${analyticsData.saturdayUtilization.toFixed(0)}%`} sub="Saturday workload" icon={Calendar} color="blue" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* 2. Behavioral Patterns Scoring */}
                        <Card className="lg:col-span-2 shadow-lg border-gray-100 bg-white overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black uppercase">Behavioral PatternsScoreboard</CardTitle>
                                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Comparative punctuality metrics from machine data.</CardDescription>
                                </div>
                                <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter">Month: {NEPALI_MONTHS[parseInt(selectedBsMonth)].name}</Badge>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="text-[11px]">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="h-10">
                                                <TableHead className="pl-6 font-black uppercase text-gray-900 border-r">Employee</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Present</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Late</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Early Exit</TableHead>
                                                <TableHead className="text-right pr-6 font-black uppercase text-primary">Score</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {analyticsData.punctuality.map((p) => (
                                                <TableRow key={p.employeeId} className="hover:bg-muted/20 h-12 border-b">
                                                    <TableCell className="pl-6 font-bold text-gray-900 border-r">{p.employeeName}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.presentDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums text-amber-600 font-bold">{p.lateArrivals}</TableCell>
                                                    <TableCell className="text-center tabular-nums text-orange-600">{p.earlyDepartures}</TableCell>
                                                    <TableCell className="text-right pr-6 font-black tabular-nums text-blue-700">{(p.punctualityScore * 100).toFixed(1)}%</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        {/* 3. Enhanced Employee Insights */}
                        <div className="space-y-6">
                            <Card className="shadow-lg border-primary/20 bg-primary/[0.02]">
                                <CardHeader className="py-4 border-b">
                                    <CardTitle className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <Zap className="h-3.5 w-3.5" />
                                        Performance Snapshots
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <ScrollArea className="h-[400px] pr-4">
                                        <div className="space-y-4">
                                            {analyticsData.behavior.map(b => (
                                                <div key={b.employeeId} className="p-3 rounded-xl border bg-white space-y-2">
                                                    <div className="flex justify-between items-center border-b pb-1">
                                                        <span className="font-black text-[11px] text-gray-900 uppercase">{b.employeeName}</span>
                                                        <Badge variant="outline" className="text-[8px] font-black h-4 px-1">{b.performanceInsight}</Badge>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-muted-foreground uppercase">
                                                        <div className="flex items-center gap-1.5"><Timer className="h-2.5 w-2.5" /> {b.punctualityTrend}</div>
                                                        <div className="flex items-center gap-1.5"><Activity className="h-2.5 w-2.5" /> {b.otImpact} OT</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>

                            {/* 4. Pattern Insights (Hotspots) */}
                            <Card className="shadow-lg border-amber-200 bg-amber-50/20">
                                <CardHeader className="py-3 border-b border-amber-100">
                                    <CardTitle className="text-[10px] font-black uppercase text-amber-700">Operational Hotspots</CardTitle>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3">
                                    {analyticsData.lateHotspots.map(h => (
                                        <div key={h.date} className="flex items-center justify-between text-xs">
                                            <span className="font-mono text-amber-900">{h.date}</span>
                                            <Badge className="bg-amber-600 text-white font-black">{h.count} Late</Badge>
                                        </div>
                                    ))}
                                    {analyticsData.lateHotspots.length === 0 && <p className="text-[10px] text-muted-foreground italic">No clusters detected.</p>}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-96 border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center text-center p-12 bg-muted/5">
                    <Activity className="h-20 w-20 text-muted-foreground/10 mb-6 animate-pulse"/>
                    <h3 className="text-xl font-black text-gray-300 uppercase tracking-[0.2em]">Computation Ready</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-sm">Select a month and click "Run Analytics" to generate machine-log driven intelligence reports.</p>
                </div>
            )}
        </div>
    );
}

function InsightCard({ title, value, sub, icon: Icon, color }: any) {
    const colors: any = {
        red: "bg-red-50 border-red-100 text-red-600",
        amber: "bg-amber-50 border-amber-100 text-amber-600",
        emerald: "bg-emerald-50 border-emerald-100 text-emerald-600",
        blue: "bg-blue-50 border-blue-100 text-blue-600"
    };
    return (
        <Card className={cn("shadow-sm border-none ring-1 ring-black/5 overflow-hidden", colors[color])}>
            <CardContent className="p-5 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{title}</p>
                    <p className="text-xl font-black leading-none">{value}</p>
                    <p className="text-[9px] font-bold uppercase opacity-60">{sub}</p>
                </div>
                <div className="p-3 rounded-2xl bg-white/50 shadow-inner">
                    <Icon className="h-5 w-5 opacity-80" />
                </div>
            </CardContent>
        </Card>
    );
}
