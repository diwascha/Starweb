'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
    Employee, 
    AttendanceRecord, 
    AnalyticsReport,
    BehavioralPatternRecord,
    EnhancedInsightRecord,
    PatternInsightParsed,
    DowPatternItem,
    BehaviorComparisonRecord
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BarChart2, Loader2, Activity, Clock, AlertTriangle, CheckCircle2, Calendar, Zap, Timer, RefreshCcw, TrendingUp, TrendingDown, Info, ShieldCheck, PieChart as PieChartIcon } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { generateAnalyticsForMonth, AnalyticsData, getAnalyticsReport } from '@/services/payroll-service';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { NEPALI_MONTHS } from '@/lib/constants';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function AnalyticsPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Core data states
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [behavioralPatterns, setBehavioralPatterns] = useState<BehavioralPatternRecord[]>([]);
    const [enhancedInsights, setEnhancedInsights] = useState<EnhancedInsightRecord[]>([]);
    const [patternInsights, setPatternInsights] = useState<PatternInsightParsed | null>(null);
    const [dowPatterns, setDowPatterns] = useState<DowPatternItem[]>([]);
    const [comparisons, setComparisons] = useState<BehaviorComparisonRecord[]>([]);

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

    const fetchImportedBlocks = useCallback(async (year: number, month: number) => {
        const { db } = getFirebase();
        const periodKey = `${year}_${month}`;
        
        try {
            // 1. Company Level Blocks
            const piSnap = await getDoc(doc(db, 'pattern_insights', periodKey));
            setPatternInsights(piSnap.exists() ? piSnap.data() as PatternInsightParsed : null);

            const dowSnap = await getDoc(doc(db, 'dow_patterns', periodKey));
            setDowPatterns(dowSnap.exists() ? (dowSnap.data() as any).patterns : []);

            // 2. Per-Employee Blocks
            const bpSnap = await getDocs(query(collection(db, 'behavior_patterns'), where("__name__", ">=", ""), where("__name__", "<=", "\uf8ff")));
            setBehavioralPatterns(bpSnap.docs.filter(d => d.id.endsWith(`_${periodKey}`)).map(d => d.data() as BehavioralPatternRecord));

            const eiSnap = await getDocs(query(collection(db, 'enhanced_insights'), where("__name__", ">=", ""), where("__name__", "<=", "\uf8ff")));
            setEnhancedInsights(eiSnap.docs.filter(d => d.id.endsWith(`_${periodKey}`)).map(d => d.data() as EnhancedInsightRecord));

            const bcSnap = await getDocs(query(collection(db, 'behavior_comparison'), where("__name__", ">=", ""), where("__name__", "<=", "\uf8ff")));
            setComparisons(bcSnap.docs.filter(d => d.id.endsWith(`_${periodKey}`)).map(d => d.data() as BehaviorComparisonRecord));

        } catch (e) {
            console.error("Failed to fetch imported blocks", e);
        }
    }, []);

    const handleGenerateAnalytics = useCallback(async (isManual = false) => {
        if (selectedBsYear && selectedBsMonth && employees.length > 0) {
            setIsProcessing(true);
            try {
                const year = parseInt(selectedBsYear, 10);
                const month = parseInt(selectedBsMonth, 10);
                
                // Fetch pre-computed VBA blocks first
                await fetchImportedBlocks(year, month);

                // Fallback / Hybrid calculation
                const data = generateAnalyticsForMonth(year, month, employees, attendance, null);
                setAnalyticsData(data);
                
                if (isManual) {
                    toast({ title: "Behavioral Engine Refreshed" });
                }
            } catch (error) {
                console.error("Computation Failed", error);
                if (isManual) toast({ title: "Computation Failed", variant: "destructive" });
            } finally {
                setIsProcessing(false);
            }
        }
    }, [selectedBsYear, selectedBsMonth, employees, attendance, toast, fetchImportedBlocks]);

    useEffect(() => {
        handleGenerateAnalytics();
    }, [handleGenerateAnalytics]);
    
    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><BarChart2 className="h-6 w-6 text-primary"/></div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Workforce Intelligence</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Behavioral mapping from validated machine logs & VBA system reports.</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 bg-muted/20 p-2 rounded-xl border border-dashed">
                    <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                        <SelectTrigger className="w-[100px] h-9 bg-white"><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>
                            {bsYears.map(y => (
                                <SelectItem key={`year-select-${y}`} value={String(y)}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                        <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
                        <SelectContent>
                            {NEPALI_MONTHS.map(m => (
                                <SelectItem key={`month-select-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>
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
                        Refresh Sync
                    </Button>
                </div>
            </header>

            {analyticsData ? (
                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
                    {/* 1. Peak Metric Summary (VBA Derived if available) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <InsightCard 
                            title="Peak Absenteeism" 
                            value={patternInsights?.highestAbsentWeekday || analyticsData.highestAbsenteeism.day} 
                            sub={`${patternInsights?.highestAbsentCount || analyticsData.highestAbsenteeism.count} instances`} 
                            icon={AlertTriangle} color="red" 
                        />
                        <InsightCard 
                            title="Peak Tardiness" 
                            value={patternInsights?.highestLateWeekday || analyticsData.highestLateArrivals.day} 
                            sub={`${patternInsights?.highestLateCount || analyticsData.highestLateArrivals.count} instances`} 
                            icon={Clock} color="amber" 
                        />
                        <InsightCard 
                            title="Punctuality Leader" 
                            value={patternInsights?.mostPunctualWeekday || analyticsData.mostPunctualWeekday.day} 
                            sub={`${(patternInsights?.mostPunctualRate || analyticsData.mostPunctualWeekday.rate).toFixed(1)}%`} 
                            icon={CheckCircle2} color="emerald" 
                        />
                        <InsightCard 
                            title="Sat. Utilization" 
                            value={`${(patternInsights?.saturdayUtilPct || analyticsData.saturdayUtilization).toFixed(0)}%`} 
                            sub="Weekend workload" icon={Calendar} color="blue" 
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* 2. Main Behavioral Table (VBA Sync) */}
                        <Card className="lg:col-span-2 shadow-lg border-gray-100 bg-white overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black uppercase">Behavioral Scoreboard</CardTitle>
                                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Pre-computed patterns from VBA system report.</CardDescription>
                                </div>
                                <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">
                                    <ShieldCheck className="mr-1 h-3 w-3"/> VBA Synchronized
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
                                                <TableRow key={`bp-row-${p.employeeId}`} className="hover:bg-muted/20 h-12 border-b">
                                                    <TableCell className="pl-6 font-bold text-gray-900 border-r">{p.employeeName}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.workdays}</TableCell>
                                                    <TableCell className="text-center tabular-nums font-bold">{p.lateDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums font-bold">{p.absentDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.satWorked}/{p.phWorked}</TableCell>
                                                    <TableCell className="text-right pr-6 font-black tabular-nums text-blue-700">{p.onTimePct.toFixed(1)}%</TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">No imported behavioral patterns found for this period.</TableCell></TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                    <ScrollBar orientation="horizontal" />
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            {/* 3. Qualitative Insights */}
                            <Card className="shadow-lg border-indigo-200 bg-indigo-50/10 h-fit">
                                <CardHeader className="py-4 border-b border-indigo-100">
                                    <CardTitle className="text-xs font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                                        <Zap className="h-3.5 w-3.5" />
                                        Pattern Insights
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <div className="space-y-3">
                                        {patternInsights?.rawLines.map((line, i) => (
                                            <div key={`pl-line-${i}`} className="flex gap-3 text-[11px] leading-relaxed text-gray-700 p-2 bg-white rounded-lg border border-indigo-100/50 shadow-sm">
                                                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                                                {line}
                                            </div>
                                        ))}
                                        {(!patternInsights || patternInsights.rawLines.length === 0) && (
                                            <div className="text-center py-8 opacity-40 italic text-xs">No qualitative insights detected.</div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* 4. DOW Heatmap */}
                            <Card className="shadow-lg border-gray-100 bg-white overflow-hidden">
                                <CardHeader className="bg-muted/10 border-b py-3 px-4">
                                    <CardTitle className="text-[10px] font-black uppercase text-gray-900 tracking-[0.2em] flex items-center gap-2">
                                        <PieChartIcon className="h-3 w-3" /> Day of Week Patterns
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table className="text-[9px]">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="h-8">
                                                <TableHead className="pl-4 font-black">DAY</TableHead>
                                                <TableHead className="text-center">ON-TIME</TableHead>
                                                <TableHead className="text-center">LATE</TableHead>
                                                <TableHead className="text-right pr-4">ABSENT</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dowPatterns.map(d => (
                                                <TableRow key={`dow-${d.day}`} className="h-8 border-b-gray-50">
                                                    <TableCell className="pl-4 font-bold uppercase">{d.day}</TableCell>
                                                    <TableCell className="text-center font-bold text-emerald-600">{d.punctualityPct.toFixed(1)}%</TableCell>
                                                    <TableCell className="text-center text-amber-600">{d.lateArrivalsPct.toFixed(1)}%</TableCell>
                                                    <TableCell className="text-right pr-4 text-red-600">{d.absenteeismPct.toFixed(1)}%</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* 5. Month-to-Month High Density Table */}
                    <Card className="shadow-lg border-gray-100 bg-white overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-4 px-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black uppercase tracking-widest">Behavioral Delta Comparison</CardTitle>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">
                                        {comparisons[0]?.currentPeriodLabel || 'Current'} vs {comparisons[0]?.prevPeriodLabel || 'Previous'}
                                    </p>
                                </div>
                                <div className="p-2 bg-blue-50 rounded-lg"><Activity className="h-4 w-4 text-blue-600"/></div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="w-full">
                                <Table className="text-[10px]">
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="h-10 hover:bg-transparent">
                                            <TableHead rowSpan={2} className="pl-6 font-black uppercase text-gray-900 border-r min-w-[150px]">Employee</TableHead>
                                            <TableHead colSpan={3} className="text-center font-black uppercase text-amber-700 bg-amber-50/30 border-r">Late Arrivals</TableHead>
                                            <TableHead colSpan={3} className="text-center font-black uppercase text-red-700 bg-red-50/30 border-r">Absent Days</TableHead>
                                            <TableHead colSpan={3} className="text-center font-black uppercase text-emerald-700 bg-emerald-50/30 border-r">On-Time %</TableHead>
                                            <TableHead colSpan={3} className="text-center font-black uppercase text-blue-700 bg-blue-50/30 border-r">ExtraOK Hrs</TableHead>
                                            <TableHead rowSpan={2} className="text-center font-black uppercase pr-6 min-w-[100px]">Flag</TableHead>
                                        </TableRow>
                                        <TableRow className="h-8 hover:bg-transparent text-[9px] font-bold uppercase text-muted-foreground">
                                            {/* Subheaders for Deltas */}
                                            {[1,2,3,4].map(i => (
                                                <React.Fragment key={`subh-${i}`}>
                                                    <TableHead className="text-center">This</TableHead>
                                                    <TableHead className="text-center">Prev</TableHead>
                                                    <TableHead className="text-center border-r">+/-</TableHead>
                                                </React.Fragment>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {comparisons.map(c => (
                                            <TableRow key={`comp-row-${c.employeeId}`} className="h-11 border-b hover:bg-muted/10 transition-colors">
                                                <TableCell className="pl-6 font-bold text-gray-900 border-r bg-muted/5">{c.employeeName}</TableCell>
                                                
                                                {/* Late Arrivals Delta */}
                                                <TableCell className="text-center tabular-nums">{c.metrics.lateArrivals.thisMonth}</TableCell>
                                                <TableCell className="text-center tabular-nums opacity-60">{c.metrics.lateArrivals.prevMonth}</TableCell>
                                                <TableCell className={cn("text-center font-black border-r tabular-nums", c.metrics.lateArrivals.delta > 0 ? "text-red-600" : "text-emerald-600")}>
                                                    {c.metrics.lateArrivals.delta > 0 ? `+${c.metrics.lateArrivals.delta}` : c.metrics.lateArrivals.delta}
                                                </TableCell>

                                                {/* Absent Days Delta */}
                                                <TableCell className="text-center tabular-nums">{c.metrics.absentDays.thisMonth}</TableCell>
                                                <TableCell className="text-center tabular-nums opacity-60">{c.metrics.absentDays.prevMonth}</TableCell>
                                                <TableCell className={cn("text-center font-black border-r tabular-nums", c.metrics.absentDays.delta > 0 ? "text-red-600" : "text-emerald-600")}>
                                                    {c.metrics.absentDays.delta > 0 ? `+${c.metrics.absentDays.delta}` : c.metrics.absentDays.delta}
                                                </TableCell>

                                                {/* On-Time % Delta */}
                                                <TableCell className="text-center tabular-nums">{c.metrics.onTimePct.thisMonth}%</TableCell>
                                                <TableCell className="text-center tabular-nums opacity-60">{c.metrics.onTimePct.prevMonth}%</TableCell>
                                                <TableCell className={cn("text-center font-black border-r tabular-nums", c.metrics.onTimePct.delta >= 0 ? "text-emerald-600" : "text-red-600")}>
                                                    {c.metrics.onTimePct.delta > 0 ? `+${c.metrics.onTimePct.delta}` : c.metrics.onTimePct.delta}%
                                                </TableCell>

                                                {/* ExtraOK Hrs Delta */}
                                                <TableCell className="text-center tabular-nums">{c.metrics.extraOkHrs.thisMonth}</TableCell>
                                                <TableCell className="text-center tabular-nums opacity-60">{c.metrics.extraOkHrs.prevMonth}</TableCell>
                                                <TableCell className={cn("text-center font-black border-r tabular-nums", c.metrics.extraOkHrs.delta >= 0 ? "text-blue-600" : "text-amber-600")}>
                                                    {c.metrics.extraOkHrs.delta > 0 ? `+${c.metrics.extraOkHrs.delta}` : c.metrics.extraOkHrs.delta}
                                                </TableCell>

                                                <TableCell className="text-center pr-6">
                                                    {c.remarksFlag && <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1 border-amber-200 text-amber-700 bg-amber-50">{c.remarksFlag}</Badge>}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="h-96 border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center text-center p-12 bg-muted/5">
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-4">
                             <Loader2 className="h-12 w-12 text-primary animate-spin"/>
                             <h3 className="text-lg font-black text-gray-400 uppercase tracking-widest">Hydrating Intelligence</h3>
                        </div>
                    ) : (
                        <>
                            <Activity className="h-20 w-20 text-muted-foreground/10 mb-6 animate-pulse"/>
                            <h3 className="text-xl font-black text-gray-300 uppercase tracking-[0.2em]">Computation Ready</h3>
                            <p className="text-sm text-muted-foreground mt-2 max-w-sm">Behavioral insights from VBA reports and machine logs will display here.</p>
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
