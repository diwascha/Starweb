'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Award, BarChart2, Upload, Loader2, Trash2, RefreshCcw } from 'lucide-react';
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
import { deletePayrollForMonth } from '@/services/payroll-service';
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
    const { user } = useAuth();
    const { toast } = useToast();

    // Global Selection State
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [bsYears, setBsYears] = useState<number[]>([]);
    
    // Global Dataset State
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isPurging, setIsPurging] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        setIsLoadingData(true);
        const unsubEmp = onEmployeesUpdate(setEmployees);
        const unsubAtt = onAttendanceUpdate(setAttendance);
        
        getAttendanceYears().then(years => {
            const current = new NepaliDate();
            const validYears = years.length > 0 ? years : [current.getYear()];
            setBsYears(validYears);
            
            if (!selectedBsYear) {
                setSelectedBsYear(String(validYears.includes(current.getYear()) ? current.getYear() : validYears[0]));
                setSelectedBsMonth(String(current.getMonth()));
            }
            setIsLoadingData(false);
        });

        return () => {
            unsubEmp();
            unsubAtt();
        };
    }, []);

    const periodName = useMemo(() => {
        const m = NEPALI_MONTHS.find(m => m.value === parseInt(selectedBsMonth));
        return `${m?.name || '...'}, ${selectedBsYear || '...'}`;
    }, [selectedBsMonth, selectedBsYear]);

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

    const handleGlobalRefresh = () => {
        setIsRefreshing(true);
        setRefreshTrigger(prev => prev + 1);
        setTimeout(() => {
            setIsRefreshing(false);
            toast({ 
                title: 'Data Synchronized', 
                description: `Workforce metrics updated for ${periodName}.` 
            });
        }, 800);
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Workforce Ledger</h1>
                    <p className="text-muted-foreground text-sm font-medium">Consolidated view for period: <span className="text-primary font-bold">{periodName}</span></p>
                </div>
            </header>

            {/* Global Controller Header */}
            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden print:hidden">
                <CardHeader className="py-4 px-6 bg-muted/5 border-b">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Year</Label>
                                <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoadingData}>
                                    <SelectTrigger className="w-[100px] h-9 bg-white"><SelectValue placeholder="Year" /></SelectTrigger>
                                    <SelectContent>
                                        {bsYears.map(y => <SelectItem key={`year-opt-${y}`} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Month</Label>
                                <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoadingData}>
                                    <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
                                    <SelectContent>
                                        {NEPALI_MONTHS.map(m => <SelectItem key={`month-opt-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive h-9 px-4 font-black text-[10px] uppercase tracking-widest hover:bg-red-50" disabled={isLoadingData || isPurging}>
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

                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handleGlobalRefresh} 
                                disabled={isLoadingData || isRefreshing} 
                                className="h-9 px-4 font-bold text-[10px] uppercase tracking-widest border-gray-200 text-muted-foreground hover:text-primary"
                            >
                                {isRefreshing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
                                Sync Metrics
                            </Button>

                            <Button variant="outline" onClick={() => router.push('/hr/payroll/import')} className="h-9 px-4 font-bold text-[10px] uppercase tracking-widest border-dashed border-primary/30 text-primary hover:bg-primary/5">
                                <Upload className="mr-2 h-3.5 w-3.5" /> Import Ledger
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
        </div>
    );
}
