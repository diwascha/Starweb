'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
    FileText, 
    FileSpreadsheet, 
    PlusCircle, 
    Package, 
    TrendingUp, 
    CheckCircle2, 
    Clock, 
    AlertCircle,
    ChevronRight,
    Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { onReportsUpdate } from '@/services/report-service';
import { onProductsUpdate } from '@/services/product-service';
import type { Report, Product } from '@/lib/types';
import { cn, toNepaliDate } from '@/lib/utils';
import { format, subDays, startOfMonth } from 'date-fns';

export default function ReportsDashboardPage() {
    const [reports, setReports] = useState<Report[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        const unsubs = [
            onReportsUpdate(setReports),
            onProductsUpdate(setProducts)
        ];
        const timer = setTimeout(() => setIsLoading(false), 800);
        return () => {
            unsubs.forEach(u => u());
            clearTimeout(timer);
        };
    }, []);

    const stats = useMemo(() => {
        const now = new Date();
        const startOfCurMonth = startOfMonth(now);
        
        const thisMonthReports = reports.filter(r => new Date(r.date) >= startOfCurMonth);
        const totalPrinted = reports.reduce((sum, r) => sum + (r.printLog?.length || 0), 0);

        return {
            totalReports: reports.length,
            reportsThisMonth: thisMonthReports.length,
            totalProducts: products.length,
            totalPrinted
        };
    }, [reports, products]);

    const recentReports = useMemo(() => {
        return [...reports]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
    }, [reports]);

    if (isLoading) return <div className="p-12 text-center h-[70vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></div>;

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">QT Intelligence</h1>
                    <p className="text-muted-foreground text-sm font-medium italic mt-1">Quality Test monitoring and technical data logs.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-9 font-bold text-[10px] uppercase tracking-widest" asChild>
                        <Link href="/reports/list">Browse Database</Link>
                    </Button>
                    <Button size="sm" className="h-9 font-black text-[10px] uppercase tracking-widest shadow-lg" asChild>
                        <Link href="/report/new">Create New Report</Link>
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Reports" value={stats.totalReports} icon={FileText} color="blue" desc="All-time entries" />
                <StatCard title="Monthly Volume" value={stats.reportsThisMonth} icon={TrendingUp} color="emerald" desc="Created this month" />
                <StatCard title="Product Variants" value={stats.totalProducts} icon={Package} color="purple" desc="In technical catalog" />
                <StatCard title="Print Count" value={stats.totalPrinted} icon={CheckCircle2} color="amber" desc="Total exports" />
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                <Card className="lg:col-span-2 shadow-sm border-gray-100">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Recent Test Logs</CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold">Latest quality verifications committed to cloud.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {recentReports.map(report => (
                                <Link 
                                    href={`/report/${report.id}`} 
                                    key={report.id} 
                                    className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-primary/5 rounded-lg group-hover:bg-primary/10 transition-colors">
                                            <FileText className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-black text-gray-900 uppercase tracking-tight">{report.product?.name || 'Custom Product'}</p>
                                            <p className="text-[10px] text-muted-foreground font-bold">Ref: {report.serialNumber} &bull; {toNepaliDate(report.date)} BS</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right hidden sm:block">
                                            <p className="text-[10px] font-black text-gray-700">QTY: {report.quantity}</p>
                                            <p className="text-[8px] text-muted-foreground uppercase">By {report.createdBy}</p>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-30 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
                                    </div>
                                </Link>
                            ))}
                            {recentReports.length === 0 && (
                                <div className="py-20 text-center text-muted-foreground italic text-sm">No reports found in registry.</div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="p-3 border-t bg-muted/5">
                        <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest h-8" asChild>
                            <Link href="/reports/list">View Full Database <ChevronRight className="ml-1 h-3 w-3"/></Link>
                        </Button>
                    </CardFooter>
                </Card>

                <div className="space-y-6">
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Quick Actions</h2>
                    <div className="grid gap-3">
                        <ModuleCard href="/report/new" title="New Report" desc="Initialize quality test sequence." icon={PlusCircle} />
                        <ModuleCard href="/products" title="Manage Catalog" desc="Update technical specifications." icon={Package} />
                        <ModuleCard href="/reports/list" title="Archive Logs" desc="Search historical verifications." icon={FileSpreadsheet} />
                    </div>

                    <Card className="bg-amber-50 border-amber-200 shadow-none">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-700 flex items-center gap-2">
                                <AlertCircle className="h-3.5 w-3.5" /> Compliance Alert
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                                Ensure all Test Reports are cross-referenced with Tax Invoice numbers for auditing compliance.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color, desc }: any) {
    const colors: any = {
        blue: "bg-blue-50 text-blue-600 border-blue-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        red: "bg-red-50 text-red-600 border-red-100",
        purple: "bg-purple-50 text-purple-600 border-purple-100",
        amber: "bg-amber-50 text-amber-600 border-amber-100"
    };
    return (
        <Card className={cn("shadow-none border-none ring-1 ring-black/5 overflow-hidden", colors[color])}>
            <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60">{title}</p>
                    <p className="text-xl font-black leading-none tracking-tight">{value}</p>
                    <p className="text-[8px] font-bold uppercase opacity-50">{desc}</p>
                </div>
                <div className="p-2 rounded-xl bg-white shadow-inner shrink-0">
                    <Icon className="h-4 w-4 opacity-80" />
                </div>
            </CardContent>
        </Card>
    );
}

function ModuleCard({ href, title, desc, icon: Icon }: any) {
    return (
        <Link href={href}>
            <Card className="hover:shadow-lg transition-all border-none ring-1 ring-black/5 bg-white group hover:-translate-y-0.5">
                <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted/50 group-hover:bg-primary/10 transition-colors">
                            <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-900">{title}</p>
                            <p className="text-[9px] text-muted-foreground uppercase font-medium leading-tight line-clamp-1">{desc}</p>
                        </div>
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
                </CardContent>
            </Card>
        </Link>
    );
}
