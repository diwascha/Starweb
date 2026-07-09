'use client';

import { useState, useEffect, useCallback } from 'react';
import type { 
    Employee, 
    AttendanceRecord, 
    BehaviorLedgerEntry,
    BehaviorAnalyticsEntry,
    AnalyticsData
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Activity, Clock, AlertTriangle, CheckCircle2, Calendar, Zap, RefreshCcw, ShieldCheck } from 'lucide-react';
import { generateAnalyticsForMonth } from '@/services/payroll-service';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface AnalyticsViewProps {
    selectedBsYear: string;
    selectedBsMonth: string;
    employees: Employee[];
    attendance: AttendanceRecord[];
}

export default function AnalyticsView({ selectedBsYear, selectedBsMonth, employees, attendance }: AnalyticsViewProps) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [behavioralPatterns, setBehavioralPatterns] = useState<BehaviorLedgerEntry[]>([]);
    const [behavioralInsights, setBehavioralAnalytics] = useState<BehaviorAnalyticsEntry[]>([]);

    const { toast } = useToast();

    const fetchImportedLedgerData = useCallback(async (year: number, month: number) => {
        const { db } = getFirebase();
        try {
            const [blSnap, baSnap] = await Promise.all([
                getDocs(query(collection(db, 'behavior_ledger'), where("bsYear", "==", year), where("bsMonth", "==", month))),
                getDocs(query(collection(db, 'behavior_analytics'), where("bsYear", "==", year), where("bsMonth", "==", month)))
            ]);
            
            setBehavioralPatterns(blSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorLedgerEntry)));
            setBehavioralAnalytics(baSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorAnalyticsEntry)));
        } catch (e) {
            console.error("Ledger Sync Failure", e);
        }
    }, []);

    const handleGenerateAnalytics = useCallback(async (isManual = false) => {
        if (!selectedBsYear || selectedBsMonth === '' || employees.length === 0) return;
        
        setIsProcessing(true);
        try {
            const year = parseInt(selectedBsYear, 10);
            const month = parseInt(selectedBsMonth, 10);
            
            await fetchImportedLedgerData(year, month);
            const data = generateAnalyticsForMonth(year, month, employees, attendance, null);
            setAnalyticsData(data);
            
            if (isManual) toast({ title: "Intelligence Engine Synchronized" });
        } catch (error) {
            if (isManual) toast({ title: "Computation Failed", variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    }, [selectedBsYear, selectedBsMonth, employees, attendance, fetchImportedLedgerData, toast]);

    useEffect(() => {
        handleGenerateAnalytics();
    }, [handleGenerateAnalytics]);
    
    return (
        <div className="space-y-6">
            <div className="flex justify-end print:hidden">
                <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => handleGenerateAnalytics(true)} 
                    disabled={isProcessing || !selectedBsYear} 
                    className="h-8 font-black uppercase text-[10px] tracking-widest px-4 text-muted-foreground hover:text-primary"
                >
                    {isProcessing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
                    Refresh Analytics
                </Button>
            </div>

            {analyticsData && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <InsightCard title="Peak Absenteeism" value={analyticsData.highestAbsenteeism.day} sub={`${analyticsData.highestAbsenteeism.count} instances`} icon={AlertTriangle} color="red" />
                        <InsightCard title="Peak Tardiness" value={analyticsData.highestLateArrivals.day} sub={`${analyticsData.highestLateArrivals.count} instances`} icon={Clock} color="amber" />
                        <InsightCard title="Punctuality Leader" value={analyticsData.mostPunctualWeekday.day} sub={`${analyticsData.mostPunctualWeekday.rate.toFixed(1)}%`} icon={CheckCircle2} color="emerald" />
                        <InsightCard title="Sat. Utilization" value={`${analyticsData.saturdayUtilization.toFixed(0)}%`} sub="Shift coverage" icon={Calendar} color="blue" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white overflow-hidden">
                            <CardHeader className="bg-muted/10 border-b py-4 px-6 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black uppercase tracking-tight">Behavioral Scoreboard</CardTitle>
                                    <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground">Pre-computed metrics from master ledger.</CardDescription>
                                </div>
                                <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">
                                    <ShieldCheck className="mr-1 h-3 w-3"/> Cloud Verified
                                </Badge>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="w-full">
                                    <Table className="text-[11px]">
                                        <TableHeader className="bg-muted/30">
                                            <TableRow className="h-10">
                                                <TableHead className="pl-6 font-black uppercase text-gray-900 border-r">Employee</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Days</TableHead>
                                                <TableHead className="text-center font-bold uppercase text-amber-600">Late</TableHead>
                                                <TableHead className="text-center font-bold uppercase text-red-600">Absent</TableHead>
                                                <TableHead className="text-center font-bold uppercase">Sat/PH</TableHead>
                                                <TableHead className="text-right pr-6 font-black uppercase text-primary">Efficiency %</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {behavioralPatterns.length > 0 ? behavioralPatterns.map((p) => (
                                                <TableRow key={`ledger-row-${p.id}`} className="hover:bg-muted/20 h-12 border-b">
                                                    <TableCell className="pl-6 font-black text-gray-900 border-r uppercase tracking-tighter">{p.employeeName}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.workdays}</TableCell>
                                                    <TableCell className="text-center tabular-nums font-bold text-amber-700">{p.lateDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums font-bold text-red-700">{p.absentDays}</TableCell>
                                                    <TableCell className="text-center tabular-nums">{p.satWorked}/{p.phWorked}</TableCell>
                                                    <TableCell className="text-right pr-6 font-black tabular-nums text-blue-700">{p.onTimePct?.toFixed(1)}%</TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">No behavioral data found for selected month.</TableCell></TableRow>
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
                                    <Zap className="h-3.5 w-3.5" /> Intelligence Insights
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[400px]">
                                    <div className="divide-y divide-indigo-100">
                                        {behavioralInsights.map(bi => (
                                            <div key={`insight-${bi.id}`} className="p-4 space-y-2 hover:bg-white transition-colors">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-black text-[11px] text-gray-900 uppercase tracking-tighter">{bi.employeeName}</span>
                                                    <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1">{bi.performanceInsight}</Badge>
                                                </div>
                                                <p className="text-[10px] text-gray-700 italic border-l-2 border-indigo-200 pl-2 mt-2 leading-relaxed">{bi.behaviorInsight}</p>
                                            </div>
                                        ))}
                                        {behavioralInsights.length === 0 && (
                                            <div className="text-center py-20 opacity-40 italic text-xs uppercase font-black">Waiting for data sync...</div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
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
