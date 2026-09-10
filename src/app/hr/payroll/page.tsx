'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Award, BarChart2, Upload, Loader2, Trash2, RefreshCcw, Calculator, Lock, LockOpen, History, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import PayrollClientPage from './_components/payroll-client-page';
import BonusView from './_components/bonus-view';
import AnalyticsView from './_components/analytics-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { getAttendanceYears, onAttendanceUpdate } from '@/services/attendance-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { deletePayrollForMonth, calculateAndSavePayrollForMonth, onPeriodLocksUpdate, setPeriodLock, hasBehaviorAnalyticsForMonth, generateBehaviorAnalyticsForMonth, type PayrollPeriodLock } from '@/services/payroll-service';
import { getFiscalYearStart, getFiscalYearMonths, getAvailableFiscalYears, formatFiscalYear, fiscalMonthName } from '@/lib/fiscal-year';
import { useAuth } from '@/hooks/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { Employee, AttendanceRecord } from '@/lib/types';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function UnifiedWorkforcePage() {
    const searchParams = useSearchParams();
    const activeTab = searchParams.get('tab') || "payroll";
    const router = useRouter();
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();

    // Global Selection State
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('');
    const [bsYears, setBsYears] = useState<number[]>([]);
    
    // Global Dataset State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isPurging, setIsPurging] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    const [isTogglingLock, setIsTogglingLock] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [periodLocks, setPeriodLocks] = useState<PayrollPeriodLock[]>([]);

    // Recalculate / Sync Metrics confirm -> run -> result flow
    const [pendingCalcAction, setPendingCalcAction] = useState<'recalculate' | 'sync' | null>(null);
    const [calcDialogStep, setCalcDialogStep] = useState<'confirm' | 'result'>('confirm');
    const [calcResultText, setCalcResultText] = useState<string>('');

    useEffect(() => {
        setIsLoadingData(true);
        const unsubEmp = onEmployeesUpdate(setEmployees);
        const unsubAtt = onAttendanceUpdate(setAttendance);
        const unsubLocks = onPeriodLocksUpdate(setPeriodLocks);

        getAttendanceYears().then(years => {
            const current = new NepaliDate();
            const validYears = years.length > 0 ? years : [current.getYear()];
            setBsYears(validYears);
            
            if (!selectedBsYear) {
                const defYear = validYears.includes(current.getYear()) ? current.getYear() : validYears[0];
                setSelectedBsYear(String(defYear));
                setSelectedBsMonth(String(current.getMonth()));
                setSelectedFiscalYear(String(getFiscalYearStart(defYear, current.getMonth())));
            }
            setIsLoadingData(false);
        });

        return () => {
            unsubEmp();
            unsubAtt();
            unsubLocks();
        };
    }, []);

    const availableFiscalYears = useMemo(() => {
        const years = getAvailableFiscalYears(attendance.map(a => ({ bsYear: a.bsYear, bsMonth: a.bsMonth })));
        const current = getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth());
        return years.includes(current) ? years : [current, ...years].sort((a, b) => b - a);
    }, [attendance]);

    const fyMonths = useMemo(() => {
        const fy = selectedFiscalYear || String(getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth()));
        return getFiscalYearMonths(parseInt(fy));
    }, [selectedFiscalYear]);

    const selectedFyMonthIndex = useMemo(() => {
        const idx = fyMonths.findIndex(m => String(m.bsYear) === selectedBsYear && String(m.bsMonth) === selectedBsMonth);
        return idx >= 0 ? String(idx) : '0';
    }, [fyMonths, selectedBsYear, selectedBsMonth]);

    const handleFiscalYearChange = (fy: string) => {
        setSelectedFiscalYear(fy);
        const target = getFiscalYearMonths(parseInt(fy))[0]; // default to Shrawan
        setSelectedBsYear(String(target.bsYear));
        setSelectedBsMonth(String(target.bsMonth));
    };

    const handleFyMonthChange = (idxStr: string) => {
        const target = fyMonths[parseInt(idxStr)];
        setSelectedBsYear(String(target.bsYear));
        setSelectedBsMonth(String(target.bsMonth));
    };

    const periodName = useMemo(() => {
        const m = NEPALI_MONTHS.find(m => m.value === parseInt(selectedBsMonth));
        return `${m?.name || '...'}, ${selectedBsYear || '...'}`;
    }, [selectedBsMonth, selectedBsYear]);

    // Recalculation only applies to the live system, starting FY 2083/84
    // (Shrawan 2083 onward). Everything before that is imported history from
    // the old Excel workbooks and is never recomputed.
    const RECALC_CUTOFF_YEAR = 2083;
    const RECALC_CUTOFF_MONTH = 3; // Shrawan
    const isHistoricalPeriod = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '') return true;
        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        return year < RECALC_CUTOFF_YEAR || (year === RECALC_CUTOFF_YEAR && month < RECALC_CUTOFF_MONTH);
    }, [selectedBsYear, selectedBsMonth]);

    const currentLock = useMemo(() => {
        if (!selectedBsYear || selectedBsMonth === '') return undefined;
        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        return periodLocks.find(l => l.bsYear === year && l.bsMonth === month);
    }, [periodLocks, selectedBsYear, selectedBsMonth]);
    // Calculation controls default to LOCKED: a period with no lock doc yet
    // (i.e. nobody has ever explicitly unlocked it) must still block Sync
    // Metrics / Recalculate / Purge until the user deliberately unlocks it.
    // Only an explicit locked:false doc counts as unlocked.
    const isLocked = currentLock ? currentLock.locked : true;

    const handlePurgePeriod = async () => {
        if (!selectedBsYear || selectedBsMonth === '') return;
        setIsPurging(true);
        try {
            const year = parseInt(selectedBsYear);
            const month = parseInt(selectedBsMonth);
            await deletePayrollForMonth(year, month);
            toast({
                title: 'Period Purged',
                description: `All associated records for ${periodName} have been removed from the system.`
            });
        } catch (error) {
            toast({ title: 'Purge Failed', description: 'Could not remove period data.', variant: 'destructive' });
        } finally {
            setIsPurging(false);
        }
    };

    const handleRecalculate = async () => {
        if (!selectedBsYear || selectedBsMonth === '' || !user || isLocked) return;
        setIsRecalculating(true);
        try {
            const year = parseInt(selectedBsYear);
            const month = parseInt(selectedBsMonth);
            const result = await calculateAndSavePayrollForMonth(year, month, employees, attendance, user.username);
            // Return to the locked state immediately after a successful
            // calculation, so finalized data can't be recalculated again
            // without another deliberate unlock.
            await setPeriodLock(year, month, true, user.username);
            setCalcResultText(`Recomputed pay (including bonus accrual) for ${result.employeeCount} employee(s) in ${periodName} from attendance. The period has been re-locked.`);
            setCalcDialogStep('result');
        } catch (error) {
            toast({ title: 'Recalculation Failed', description: 'Could not recompute payroll for this period.', variant: 'destructive' });
            setPendingCalcAction(null);
        } finally {
            setIsRecalculating(false);
        }
    };

    const handleToggleLock = async () => {
        if (!selectedBsYear || selectedBsMonth === '' || !user) return;
        setIsTogglingLock(true);
        try {
            const year = parseInt(selectedBsYear);
            const month = parseInt(selectedBsMonth);
            await setPeriodLock(year, month, !isLocked, user.username);
            toast({
                title: isLocked ? 'Calculation Unlocked' : 'Calculation Locked',
                description: isLocked
                    ? `${periodName} can now be recalculated or synced. It re-locks automatically once you do.`
                    : `${periodName} is protected again - Sync Metrics, Recalculate, and Purge are blocked until unlocked.`,
            });
        } catch (error) {
            toast({ title: 'Action Failed', description: 'Could not update the calculation lock.', variant: 'destructive' });
        } finally {
            setIsTogglingLock(false);
        }
    };

    // Unified Sync Metrics: for the selected month ONLY, show its existing
    // behavior analytics if any exist, or generate them once if they don't.
    // Never touches any other month's data. Re-locks the period afterward,
    // same as Recalculate, since this is a calculation action.
    const handleSyncMetrics = async () => {
        if (!selectedBsYear || selectedBsMonth === '' || !user || isLocked) return;
        setIsRefreshing(true);
        try {
            const year = parseInt(selectedBsYear);
            const month = parseInt(selectedBsMonth);
            const alreadyHasData = await hasBehaviorAnalyticsForMonth(year, month);
            if (alreadyHasData) {
                setCalcResultText(`${periodName} already has behavioral analytics on record - showing existing data. The period has been re-locked.`);
            } else {
                const result = await generateBehaviorAnalyticsForMonth(year, month, employees, attendance, user.username);
                setCalcResultText(
                    result.generated > 0
                        ? `Computed behavioral analytics for ${result.generated} employee(s) in ${periodName}. The period has been re-locked.`
                        : `No calculated attendance found for ${periodName} - nothing to analyze yet. The period has still been re-locked.`
                );
            }
            await setPeriodLock(year, month, true, user.username);
            setRefreshTrigger(prev => prev + 1);
            setCalcDialogStep('result');
        } catch (error) {
            toast({ title: 'Sync Failed', description: 'Could not sync metrics for this period.', variant: 'destructive' });
            setPendingCalcAction(null);
        } finally {
            setIsRefreshing(false);
        }
    };

    const openCalcDialog = (action: 'recalculate' | 'sync') => {
        setPendingCalcAction(action);
        setCalcDialogStep('confirm');
        setCalcResultText('');
    };

    const runPendingCalcAction = () => {
        if (pendingCalcAction === 'recalculate') handleRecalculate();
        else if (pendingCalcAction === 'sync') handleSyncMetrics();
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Payroll</h1>
                    <p className="text-muted-foreground text-sm font-medium">Consolidated view for period: <span className="text-primary font-bold">{periodName}</span></p>
                </div>
            </header>

            {/* Global Controller Header */}
            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden print:hidden">
                <CardHeader className="py-4 px-6 bg-muted/5 border-b">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Fiscal Year</Label>
                                <Select value={selectedFiscalYear} onValueChange={handleFiscalYearChange} disabled={isLoadingData}>
                                    <SelectTrigger className="w-[110px] h-9 bg-white"><SelectValue placeholder="FY" /></SelectTrigger>
                                    <SelectContent>
                                        {availableFiscalYears.map(y => <SelectItem key={`fy-opt-${y}`} value={String(y)}>{formatFiscalYear(y)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Month</Label>
                                <Select value={selectedFyMonthIndex} onValueChange={handleFyMonthChange} disabled={isLoadingData}>
                                    <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
                                    <SelectContent>
                                        {fyMonths.map((m, i) => <SelectItem key={`fy-month-opt-${i}`} value={String(i)}>{fiscalMonthName(i)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {isHistoricalPeriod ? (
                                <span className="flex items-center gap-1.5 h-9 px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/40 rounded-md">
                                    <History className="h-3.5 w-3.5" /> Historical (Imported)
                                </span>
                            ) : hasPermission('hr', 'edit') && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openCalcDialog('recalculate')}
                                    disabled={isLoadingData || isRecalculating || isLocked}
                                    title={isLocked ? 'Unlock Calculation first to recalculate.' : 'Recompute payroll from attendance for this period.'}
                                    className="h-9 px-4 font-black text-[10px] uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/5"
                                >
                                    {isRecalculating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-2 h-3.5 w-3.5" />}
                                    Recalculate
                                </Button>
                            )}

                            {hasPermission('hr', 'edit') && (
                                <Button
                                    variant={isLocked ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={handleToggleLock}
                                    disabled={isLoadingData || isTogglingLock}
                                    title="Sync Metrics and Recalculate are blocked until this period is unlocked. It re-locks automatically after either action completes."
                                    className={isLocked
                                        ? "h-9 px-4 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20"
                                        : "h-9 px-4 font-black text-[10px] uppercase tracking-widest border-amber-300 text-amber-700 hover:bg-amber-50"}
                                >
                                    {isTogglingLock ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : isLocked ? <Lock className="mr-2 h-3.5 w-3.5" /> : <LockOpen className="mr-2 h-3.5 w-3.5" />}
                                    {isLocked ? 'Unlock Calculation' : 'Lock Calculation'}
                                </Button>
                            )}

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive h-9 px-4 font-black text-[10px] uppercase tracking-widest hover:bg-red-50" disabled={isLoadingData || isPurging || isLocked}>
                                        {isPurging ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                                        Purge Period
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Purge Period Records?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete all **Payroll**, **Bonus Ledger**, **Behavioral Metrics**, and **Analytics Reports** for **{periodName}**.
                                            This action is irreversible.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handlePurgePeriod} className="bg-destructive text-white hover:bg-destructive/90">
                                            Confirm Data Purge
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            {hasPermission('hr', 'edit') && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openCalcDialog('sync')}
                                    disabled={isLoadingData || isRefreshing || isLocked}
                                    title={isLocked
                                        ? 'Unlock Calculation first to sync.'
                                        : "Shows this month's behavioral analytics if they already exist, or generates them once if they don't. Only affects the selected month."}
                                    className="h-9 px-4 font-bold text-[10px] uppercase tracking-widest border-gray-200 text-muted-foreground hover:text-primary"
                                >
                                    {isRefreshing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
                                    Sync Metrics
                                </Button>
                            )}

                            <Button variant="outline" onClick={() => router.push('/hr/attendance/raw')} className="h-9 px-4 font-bold text-[10px] uppercase tracking-widest border-dashed border-primary/30 text-primary hover:bg-primary/5">
                                <Upload className="mr-2 h-3.5 w-3.5" /> Import Data
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Tabs defaultValue={activeTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 h-12 w-full justify-start gap-4 mb-6 border overflow-x-auto no-scrollbar print:hidden">
                    <TabsTrigger value="payroll" className="gap-2 px-8 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <FileText className="h-4 w-4"/>
                        Financial Registry
                    </TabsTrigger>
                    <TabsTrigger value="bonus" className="gap-2 px-8 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Award className="h-4 w-4"/>
                        Bonus Evaluation
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="gap-2 px-8 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <BarChart2 className="h-4 w-4"/>
                        Behavioral Intelligence
                    </TabsTrigger>
                </TabsList>

                <div className="mt-0 animate-in fade-in zoom-in-95 duration-200">
                    <TabsContent value="payroll" className="m-0 border-none p-0">
                        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                            <PayrollClientPage 
                                selectedBsYear={selectedBsYear} 
                                selectedBsMonth={selectedBsMonth} 
                            />
                        </Suspense>
                    </TabsContent>
                    
                    <TabsContent value="bonus" className="m-0 border-none p-0">
                        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                            <BonusView 
                                selectedBsYear={selectedBsYear} 
                                selectedBsMonth={selectedBsMonth}
                            />
                        </Suspense>
                    </TabsContent>
                    
                    <TabsContent value="analytics" className="m-0 border-none p-0">
                        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                            <AnalyticsView 
                                selectedBsYear={selectedBsYear} 
                                selectedBsMonth={selectedBsMonth}
                                employees={employees}
                                attendance={attendance}
                                refreshTrigger={refreshTrigger}
                            />
                        </Suspense>
                    </TabsContent>
                </div>
            </Tabs>

            <Dialog open={pendingCalcAction !== null} onOpenChange={(open) => { if (!open) setPendingCalcAction(null); }}>
                <DialogContent className="sm:max-w-md">
                    {calcDialogStep === 'confirm' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black text-gray-900">
                                    {pendingCalcAction === 'recalculate' ? 'Recalculate Payroll' : 'Sync Metrics'}
                                </DialogTitle>
                                <DialogDescription>
                                    You are about to {pendingCalcAction === 'recalculate' ? 'recalculate payroll' : 'sync behavioral metrics'} for <span className="font-bold text-foreground">{periodName}</span> — the month currently shown on this page. No other month is affected.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-2">
                                <p className="text-[10px] font-black uppercase text-muted-foreground">This will:</p>
                                {pendingCalcAction === 'recalculate' ? (
                                    <ul className="text-[11px] text-gray-700 space-y-1.5 list-disc pl-4">
                                        <li>Recompute basic pay, overtime pay, and bonus accrual for every employee with attendance this month, from that attendance.</li>
                                        <li>Apply the wage, TDS, and bonus eligibility rules configured under HR Setting.</li>
                                        <li>Overwrite any existing Payroll and Bonus Ledger records for this month.</li>
                                        <li>Re-lock this period automatically once finished.</li>
                                    </ul>
                                ) : (
                                    <ul className="text-[11px] text-gray-700 space-y-1.5 list-disc pl-4">
                                        <li>Show this month's behavioral analytics if they already exist, or generate them once if they don't.</li>
                                        <li>Only ever touch this month - no other period's analytics are affected.</li>
                                        <li>Re-lock this period automatically once finished.</li>
                                    </ul>
                                )}
                            </div>
                            <DialogFooter>
                                <Button
                                    onClick={runPendingCalcAction}
                                    disabled={isRecalculating || isRefreshing}
                                    className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
                                >
                                    {(isRecalculating || isRefreshing) ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : pendingCalcAction === 'recalculate' ? <Calculator className="mr-2 h-4 w-4"/> : <RefreshCcw className="mr-2 h-4 w-4"/>}
                                    {(isRecalculating || isRefreshing) ? 'Processing...' : 'I Understand, Continue'}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black text-gray-900">
                                    {pendingCalcAction === 'recalculate' ? 'Recalculation Complete' : 'Sync Complete'}
                                </DialogTitle>
                                <DialogDescription>{periodName}</DialogDescription>
                            </DialogHeader>
                            <div className="p-4 rounded-lg bg-emerald-50 border-2 border-emerald-200 flex gap-3">
                                <UserCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                                <p className="text-sm font-medium text-emerald-900">{calcResultText}</p>
                            </div>
                            <DialogFooter>
                                <Button onClick={() => setPendingCalcAction(null)} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                                    Done
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
