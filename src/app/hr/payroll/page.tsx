'use client';

import { useState, useEffect, useMemo, Suspense, use, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Award, BarChart2, Upload, Calculator, Loader2, CalendarDays } from 'lucide-react';
import PayrollClientPage from './_components/payroll-client-page';
import BonusView from './_components/bonus-view';
import AnalyticsView from './_components/analytics-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { getAttendanceYears, onAttendanceUpdate } from '@/services/attendance-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { calculateAndSavePayrollForMonth } from '@/services/payroll-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import type { Employee, AttendanceRecord } from '@/lib/types';

function UnifiedPayrollSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-4 w-96" />
                </div>
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[500px] w-full" />
        </div>
    );
}

export default function UnifiedWorkforcePage(props: { params: Promise<any>, searchParams: Promise<any> }) {
    const searchParams = use(props.searchParams);
    const activeTab = searchParams.tab || "payroll";
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();

    // Global Selection State
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [bsYears, setBsYears] = useState<number[]>([]);
    
    // Global Dataset State (Lifted for consistency)
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);

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

    const handleCalculatePayroll = async () => {
        if (!selectedBsYear || selectedBsMonth === '' || !user) {
            toast({ title: 'Error', description: 'Please select a valid period.', variant: 'destructive' });
            return;
        }
        setIsCalculating(true);
        try {
            const year = parseInt(selectedBsYear, 10);
            const month = parseInt(selectedBsMonth, 10);
            
            const result = await calculateAndSavePayrollForMonth(
                year,
                month,
                employees,
                attendance,
                user.username
            );
            
            toast({
                title: 'Calculation Complete',
                description: `Generated payroll for ${result.employeeCount} employees.`
            });
        } catch (error: any) {
            toast({ title: 'Calculation Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsCalculating(false);
        }
    };

    const periodName = useMemo(() => {
        const m = NEPALI_MONTHS.find(m => m.value === parseInt(selectedBsMonth));
        return `${m?.name || '...'}, ${selectedBsYear || '...'}`;
    }, [selectedBsMonth, selectedBsYear]);

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
                                        {bsYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Month</Label>
                                <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoadingData}>
                                    <SelectTrigger className="w-[140px] h-9 bg-white"><SelectValue placeholder="Month" /></SelectTrigger>
                                    <SelectContent>
                                        {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" onClick={() => router.push('/hr/payroll/import')} className="h-9 px-4 font-bold text-[10px] uppercase tracking-widest border-dashed border-primary/30 text-primary hover:bg-primary/5">
                                <Upload className="mr-2 h-3.5 w-3.5" /> Import Ledger
                            </Button>
                            
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button disabled={isCalculating || isLoadingData} className="h-9 px-6 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">
                                        {isCalculating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-2 h-3.5 w-3.5" />}
                                        Re-Run Logic
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Recalculate Entire Period?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will overwrite existing payroll records for <b>{periodName}</b> using current HR Office rules and Attendance machine logs.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleCalculatePayroll} className="bg-primary text-primary-foreground font-bold">Confirm Commit</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
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
                                employees={employees}
                                attendance={attendance}
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
                            />
                        </Suspense>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
