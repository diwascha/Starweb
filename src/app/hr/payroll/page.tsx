'use client';

import { Suspense, use } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Award, BarChart2, Briefcase } from 'lucide-react';
import PayrollClientPage from './_components/payroll-client-page';
import BonusView from './_components/bonus-view';
import AnalyticsView from './_components/analytics-view';

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

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Workforce & Compensation</h1>
                    <p className="text-muted-foreground text-sm font-medium">Unified management of payroll, bonuses, and behavioral intelligence.</p>
                </div>
            </header>

            <Tabs defaultValue={activeTab} className="w-full">
                <TabsList className="bg-muted/50 p-1 h-12 w-full justify-start gap-4 mb-6 border overflow-x-auto no-scrollbar">
                    <TabsTrigger value="payroll" className="gap-2 px-8 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <FileText className="h-4 w-4"/>
                        Payroll Registry
                    </TabsTrigger>
                    <TabsTrigger value="bonus" className="gap-2 px-8 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Award className="h-4 w-4"/>
                        Bonus Calculation
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="gap-2 px-8 py-2 font-black text-[10px] uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <BarChart2 className="h-4 w-4"/>
                        Behavioral Intelligence
                    </TabsTrigger>
                </TabsList>

                <div className="mt-0 animate-in fade-in zoom-in-95 duration-200">
                    <TabsContent value="payroll" className="m-0 border-none p-0">
                        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                            <PayrollClientPage />
                        </Suspense>
                    </TabsContent>
                    
                    <TabsContent value="bonus" className="m-0 border-none p-0">
                        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                            <BonusView />
                        </Suspense>
                    </TabsContent>
                    
                    <TabsContent value="analytics" className="m-0 border-none p-0">
                        <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
                            <AnalyticsView />
                        </Suspense>
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
