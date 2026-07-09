'use client';

import { useState, useEffect, useCallback } from 'react';
import type { 
    Employee, 
    AttendanceRecord, 
    BehaviorLedgerEntry,
    BehaviorAnalyticsEntry
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BarChart2, Loader2, Activity, Clock, AlertTriangle, CheckCircle2, Calendar, Zap, RefreshCcw, ShieldCheck } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { generateAnalyticsForMonth, type AnalyticsData } from '@/services/payroll-service';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { NEPALI_MONTHS } from '@/lib/constants';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function AnalyticsView() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Core data states from Consolidated Ledger
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [behavioralPatterns, setBehavioralPatterns] = useState<BehaviorLedgerEntry[]>([]);
    const [behavioralInsights, setBehavioralAnalytics] = useState<BehaviorAnalyticsEntry[]>([]);

    const { toast } = useToast();

    useEffect(() => {
        onEmployeesUpdate(setEmployees);
        onAttendanceUpdate(setAttendance);
    }, []);
    
    useEffect(() => {
        let isMounted = true;
        getAttendanceYears().then(years => {
            if (isMounted) {
                const validYears = Array.from(new Set(years.filter(y => typeof y === 'number'))).sort((a, b) => b - a);
                setBsYears(validYears);
                const current = new NepaliDate();
                const year = validYears.includes(current.getYear()) ? current.getYear() : validYears[0];
                if (year) {
                    setSelectedBsYear(String(year));
                    setSelectedBsMonth(String(current.getMonth()));
                }
            }
        });
        return () => { isMounted = false; };
    }, [attendance]);

    const fetchImportedLedgerData = useCallback(async (year: number, month: number) => {
        const { db } = getFirebase();
        
        try {
            // 1. Fetch Behavior Ledger (Metrics)
            const blQuery = query(
                collection(db, 'behavior_ledger'), 
                where("bsYear", "==", year), 
                where("bsMonth", "==", month)
            );
            const blSnap = await getDocs(blQuery);
            const metrics = blSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorLedgerEntry));
            setBehavioralPatterns(metrics);

            // 2. Fetch Behavior Analytics (Qualitative)
            const baQuery = query(
                collection(db, 'behavior_analytics'), 
                where("bsYear", "==", year), 
                where("bsMonth", "==", month)
            );
            const baSnap = await getDocs(baQuery);
            const insights = baSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorAnalyticsEntry));
            setBehavioralAnalytics(insights);

        } catch (e) {
            console.error("Failed to fetch ledger data", e);
        }
    }, []);

    const handleGenerateAnalytics = useCallback(async (isManual = false) => {
        if (selectedBsYear && selectedBsMonth && employees.length > 0) {
            setIsProcessing(true);
            try {
                const year = parseInt(selectedBsYear, 10);
                const month = parseInt(selectedBsMonth, 10);
                
                await fetchImportedLedgerData(year, month);
                const data = generateAnalyticsForMonth(year, month, employees, attendance, null);
                setAnalyticsData(data);
                
                if (isManual) {
                    toast({ title: "Intelligence Engine Refreshed" });
                }
            } catch (error) {
                console.error("Computation Failed", error);
                if (isManual) toast({ title: "Computation Failed", variant: "destructive" });
            } finally {
                setIsProcessing(false);
            }
        }
    }, [selectedBsYear, selectedBsMonth, employees, attendance, toast, fetchImportedLedgerData]);

    useEffect(() => {
        handleGenerateAnalytics();
    }, [handleGenerateAnalytics]);
    
    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black tracking-tight text-gray-900 uppercase">Workforce Intelligence</h2>
                    <p className="text-muted-foreground text-xs font-medium italic">High-density behavioral mapping derived from the Consolidated Ledger.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 bg-muted/20 p-2 rounded-xl border border-dashed">
                    <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                        <SelectTrigger className="w-[100px] h-9 bg-white"><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>
                            {bsYears.map(y => (
                                <SelectItem key={`year-${y}`} value={String(y)}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                        <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
                        <SelectContent>
                            {NEPALI_MONTHS.map(m => (
                                <SelectItem key={`month-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleGenerateAnalytics(true)} 
                        disabled={isProcessing || !selectedBsYear} 
                        className="h-9 font-black uppercase text-[10px] tracking-widest px-4 text-muted-foreground hover:text-primary"
                    >
                        {isProcessing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
                        Sync
                    </Button>
                </div>
            </header>

            {analyticsData ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <InsightCard title="Peak Absenteeism" value={analyticsData.highestAbsenteeism.day} sub={`${analyticsData.highestAbsenteeism.count} instances`} icon={AlertTriangle} color="red" />
                        <InsightCard title="Peak Tardiness" value={analyticsData.highestLateArrivals.day} sub={`${analyticsData.highestLateArrivals.count} instances`} icon={Clock} color="amber" />
                        <InsightCard title="Punctuality Leader" value={analyticsData.mostPunctualWeekday.day} sub={`${analyticsData.mostPunctualWeekday.rate.toFixed(1)}%`} icon={CheckCircle2} color="emerald" />
                        <InsightCard title="Sat. Utilization" value={`${analyticsData.saturdayUtilization.toFixed(0)}%`} sub="Weekend workload" icon={Calendar} color="blue" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black uppercase">Behavioral Scoreboard</CardTitle>
                                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Pre-computed metrics from Consolidated Ledger Section 3.</CardDescription>
                                </div>
                                <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">
                                    <ShieldCheck className="mr-1 h-3 w-3"/> Verified
                                </Badge>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="text-[11px]">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="h-10">
                                                <TableHead className="pl-6 font-black uppercase text-gray-900 border-r">Employee</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Workdays</TableHead>
                                                <TableHead className="text-center font-bold uppercase text-amber-600">Late</TableHead>
                                                <TableHead className="text-center font-bold uppercase text-red-600">Absent</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Sat/PH</TableHead>
                                                <TableHead className="text-right pr-6 font-black uppercase text-primary">On-Time %</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {behavioralPatterns.length > 0 ? behavioralPatterns.map((p) => (
                                                <TableRow key={`ledger-row-${p.id}`} className="hover:bg-muted/20 h-12 border-b">
                                                    <TableCell className="pl-6 font-bold text-gray-900 border-r">{p.employeeName}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.workdays}</TableCell>
                                                    <TableCell className="text-center tabular-nums font-bold">{p.lateDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums font-bold">{p.absentDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.satWorked}/{p.phWorked}</TableCell>
                                                    <TableCell className="text-right pr-6 font-black tabular-nums text-blue-700">{p.onTimePct?.toFixed(1)}%</TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">No metrics records found.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-indigo-200 bg-indigo-50/10 h-fit">
                            <CardHeader className="py-4 border-b border-indigo-100">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                                    <Zap className="h-3.5 w-3.5" />
                                    Insights
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px]">
                                    <div className="divide-y divide-indigo-100">
                                        {behavioralInsights.map(bi => (
                                            <div key={`insight-${bi.id}`} className="p-4 space-y-2 hover:bg-white transition-colors">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-black text-[11px] text-gray-900 uppercase">{bi.employeeName}</span>
                                                    <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1">{bi.performanceInsight}</Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-muted-foreground">
                                                    <div className="flex flex-col"><span className="uppercase text-[8px] opacity-50">Trend</span><span className="text-indigo-600">{bi.punctualityTrend}</span></div>
                                                    <div className="flex flex-col"><span className="uppercase text-[8px] opacity-50">Absence</span><span className="text-indigo-600">{bi.absencePattern}</span></div>
                                                </div>
                                                <p className="text-[10px] text-gray-700 italic border-l-2 border-indigo-200 pl-2 mt-2">{bi.behaviorInsight}</p>
                                            </div>
                                        ))}
                                        {behavioralInsights.length === 0 && (
                                            <div className="text-center py-20 opacity-40 italic text-xs uppercase font-black">No insights.</div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : (
                <div className="h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center p-8 bg-muted/5">
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-4">
                             <Loader2 className="h-8 w-8 text-primary animate-spin"/>
                             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Hydrating Intelligence</h3>
                        </div>
                    ) : (
                        <>
                            <Activity className="h-12 w-12 text-muted-foreground/10 mb-4 animate-pulse"/>
                            <h3 className="text-sm font-black text-gray-300 uppercase tracking-widest">Computation Ready</h3>
                        </>
                    )}
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
        <Card className={cn("shadow-none border-none ring-1 ring-black/5 overflow-hidden", colors[color])}>
            <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{title}</p>
                    <p className="text-lg font-black leading-none">{value}</p>
                    <p className="text-[8px] font-bold uppercase opacity-60">{sub}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-white/50 shadow-inner">
                    <Icon className="h-4 w-4 opacity-80" />
                </div>
            </CardContent>
        </Card>
    );
}
