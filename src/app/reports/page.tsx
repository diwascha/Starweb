
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileText, FileSpreadsheet, Package, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import type { Report, Product } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { onReportsUpdate } from '@/services/report-service';
import { onProductsUpdate } from '@/services/product-service';

const reportModules = [
    {
        name: 'New QT Reports',
        description: 'Generate a new quality test report for a product.',
        href: '/report/new',
        icon: PlusCircle,
        permission: 'reports',
        action: 'create'
    },
    {
        name: 'QT Reports Database',
        description: 'View, manage, and print all existing test reports.',
        href: '/reports/list',
        icon: FileSpreadsheet,
        permission: 'reports',
        action: 'view'
    },
    {
        name: 'QT Products',
        description: 'Manage the products and their specifications for testing.',
        href: '/products',
        icon: Package,
        permission: 'products',
        action: 'view'
    },
];

export default function ReportDashboardPage() {
   const { hasPermission } = useAuth();
   const [isClient, setIsClient] = useState(false);

   const [reports, setReports] = useState<Report[]>([]);
   const [products, setProducts] = useState<Product[]>([]);

   useEffect(() => { 
        setIsClient(true);
        const unsubReports = onReportsUpdate(setReports);
        const unsubProducts = onProductsUpdate(setProducts);

        return () => {
            unsubReports();
            unsubProducts();
        };
    }, []);

   const { totalReports, totalProducts, productTestData, recentReports } = useMemo(() => {
        if (!isClient) return { totalReports: 0, totalProducts: 0, productTestData: [], recentReports: [] };

        const testCounts = reports.reduce((acc, report) => {
            const productName = report.product.name;
            acc[productName] = (acc[productName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const testData = Object.entries(testCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
            
        const recent = [...reports]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);

        return {
            totalReports: reports.length,
            totalProducts: products.length,
            productTestData: testData,
            recentReports: recent,
        };
   }, [isClient, reports, products]);

   const chartConfig: ChartConfig = {
        count: { label: 'Reports', color: 'hsl(var(--chart-1))' },
   };

   if (!isClient) {
      return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
              <h3 className="text-2xl font-bold tracking-tight">Loading Report Dashboard...</h3>
          </div>
      );
    }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Test Report Management</h1>
        <p className="text-muted-foreground">Create reports, manage products, and view the report database.</p>
      </header>

       <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Reports Generated</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalReports}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Products Managed</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalProducts}</div>
                </CardContent>
            </Card>
       </div>

       <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Test Frequency by Product</CardTitle>
                    <CardDescription>Number of test reports generated per product.</CardDescription>
                </CardHeader>
                <CardContent>
                    {productTestData.length > 0 ? (
                        <ChartContainer config={chartConfig} className="h-[300px] w-full">
                        <ResponsiveContainer>
                            <BarChart data={productTestData} layout="vertical" margin={{ top: 20, right: 20, left: 30, bottom: 5 }}>
                                <CartesianGrid horizontal={false} />
                                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={100} className="text-xs truncate"/>
                                <XAxis type="number" />
                                <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                                <Bar dataKey="count" fill="var(--color-count)" radius={4} layout="vertical" />
                            </BarChart>
                        </ResponsiveContainer>
                        </ChartContainer>
                    ) : (
                        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                            No test report data available.
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Recent Reports</CardTitle>
                    <CardDescription>The 5 most recently created test reports.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[300px]">
                        {recentReports.length > 0 ? (
                            <div className="space-y-4">
                                {recentReports.map(report => (
                                    <Link href={`/report/${report.id}`} key={report.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                                        <div>
                                            <p className="font-medium">Report #{report.serialNumber}</p>
                                            <p className="text-sm text-muted-foreground">For {report.product.name}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">{new Date(report.date).toLocaleDateString()}</p>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                No recent reports found.
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
       </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick Access</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {reportModules.filter(module => hasPermission(module.permission as any, module.action as any)).map((module) => (
            <Link href={module.href} key={module.name}>
                <Card className="h-full transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium">{module.name}</CardTitle>
                    <module.icon className="h-6 w-6 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                </CardContent>
                </Card>
            </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
