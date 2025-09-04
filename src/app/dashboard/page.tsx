
'use client';

import { useEffect, useState } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, PurchaseOrder } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Package, ShoppingCart } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeVariant } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';

export default function DashboardPage() {
  const [reports] = useLocalStorage<Report[]>('reports', []);
  const [purchaseOrders] = useLocalStorage<PurchaseOrder[]>('purchaseOrders', []);
  const [isClient, setIsClient] = useState(false);
  const { hasPermission } = useAuth();

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const canViewPOs = hasPermission('purchaseOrders', 'view');
  const canViewReports = hasPermission('reports', 'view');
  
  const poStatusData = isClient && canViewPOs ? 
    Object.entries(
      purchaseOrders.reduce((acc, po) => {
        acc[po.status] = (acc[po.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([name, count]) => ({ name, count }))
    : [];
    
  const productTestData = isClient && canViewReports ?
    Object.entries(
        reports.reduce((acc, report) => {
            const productName = report.product.name;
            acc[productName] = (acc[productName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    ).map(([name, count]) => ({ name, count }))
    : [];
    
   const recentActivities = isClient ? 
    [
        ...(canViewPOs ? purchaseOrders.map(po => ({ type: 'PO', ...po, date: po.createdAt })) : []),
        ...(canViewReports ? reports.map(r => ({ type: 'Report', ...r })) : [])
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)
    : [];

   const { avgLeadTime, companyLeadTimeData } = isClient && canViewPOs ? (() => {
    const deliveredPOs = purchaseOrders.filter(po => po.status === 'Delivered' && po.deliveryDate);
    
    if (deliveredPOs.length === 0) {
      return { avgLeadTime: 0, companyLeadTimeData: [] };
    }

    const totalLeadTime = deliveredPOs.reduce((sum, po) => {
        return sum + differenceInDays(new Date(po.deliveryDate!), new Date(po.poDate));
    }, 0);
    
    const companyData = deliveredPOs.reduce((acc, po) => {
        const leadTime = differenceInDays(new Date(po.deliveryDate!), new Date(po.poDate));
        if (!acc[po.companyName]) {
            acc[po.companyName] = { total: 0, count: 0 };
        }
        acc[po.companyName].total += leadTime;
        acc[po.companyName].count += 1;
        return acc;
    }, {} as Record<string, {total: number, count: number}>);
    
    const companyLeadTimeData = Object.entries(companyData).map(([name, data]) => ({
        name,
        avgLeadTime: Math.round(data.total / data.count)
    }));

    return { 
      avgLeadTime: Math.round(totalLeadTime / deliveredPOs.length),
      companyLeadTimeData,
    };
   })() : { avgLeadTime: 0, companyLeadTimeData: [] };


  const chartConfig: ChartConfig = {
    count: {
      label: 'Count',
      color: 'hsl(var(--chart-1))',
    },
     avgLeadTime: {
      label: 'Avg. Lead Time (Days)',
      color: 'hsl(var(--chart-2))',
    },
  };

  if (!isClient) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">Loading Dashboard...</h3>
          </div>
        </div>
      );
  }

  // Check if user has any permissions at all.
  const hasAnyPermission = [
    'dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings'
  ].some(module => hasPermission(module as any, 'view'));


  if (!hasAnyPermission) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-2xl font-bold tracking-tight">Access Denied</h3>
          <p className="text-sm text-muted-foreground">You do not have permissions to view any modules. Please contact an administrator.</p>
        </div>
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">An overview of your test reports and product data.</p>
        </div>
        <div className="flex items-center gap-2">
            {hasPermission('reports', 'create') && (
              <Button asChild>
                <Link href="/report/new">
                  <PlusCircle className="mr-2 h-4 w-4" /> New QT Reports
                </Link>
              </Button>
            )}
            {hasPermission('purchaseOrders', 'create') && (
              <Button asChild variant="outline">
                <Link href="/purchase-orders/new">
                  <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase Order
                </Link>
              </Button>
            )}
        </div>
      </header>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canViewPOs && (
            <Card>
                <CardHeader>
                    <CardTitle>Total Purchase Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">{purchaseOrders.length}</p>
                </CardContent>
            </Card>
        )}
        {canViewReports && (
            <Card>
                <CardHeader>
                    <CardTitle>Total Test Reports</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">{reports.length}</p>
                </CardContent>
            </Card>
        )}
        {canViewPOs && (
            <Card>
                <CardHeader>
                    <CardTitle>Average PO Lead Time</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-4xl font-bold">{avgLeadTime} <span className="text-lg font-medium text-muted-foreground">days</span></p>
                </CardContent>
            </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {canViewPOs && (
            <Card>
            <CardHeader>
                <CardTitle>Purchase Order Status</CardTitle>
                <CardDescription>A breakdown of all purchase orders by their current status.</CardDescription>
            </CardHeader>
            <CardContent>
                {poStatusData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <ResponsiveContainer>
                        <BarChart data={poStatusData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                        </BarChart>
                    </ResponsiveContainer>
                    </ChartContainer>
                ) : (
                    <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                        No purchase order data available.
                    </div>
                )}
            </CardContent>
            </Card>
        )}
        {canViewReports && (
            <Card>
            <CardHeader>
                <CardTitle>Product Test Frequency</CardTitle>
                <CardDescription>Number of test reports generated per product.</CardDescription>
            </CardHeader>
            <CardContent>
                {productTestData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
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
                    <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                        No test report data available.
                    </div>
                )}
            </CardContent>
            </Card>
        )}
      </div>

       {canViewPOs && (
        <Card>
            <CardHeader>
                <CardTitle>Average Lead Time by Supplier</CardTitle>
                <CardDescription>Average number of days between order and delivery for each supplier.</CardDescription>
            </CardHeader>
            <CardContent>
                {companyLeadTimeData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <ResponsiveContainer>
                        <BarChart data={companyLeadTimeData} layout="vertical" margin={{ top: 20, right: 20, left: 30, bottom: 5 }}>
                            <CartesianGrid horizontal={false} />
                            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={150} className="text-xs truncate"/>
                            <XAxis type="number" dataKey="avgLeadTime" />
                            <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                            <Bar dataKey="avgLeadTime" fill="var(--color-avgLeadTime)" radius={4} layout="vertical" />
                        </BarChart>
                    </ResponsiveContainer>
                    </ChartContainer>
                ) : (
                    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                        No delivered purchase order data available.
                    </div>
                )}
            </CardContent>
            </Card>
       )}

      <Card>
        <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>A log of the most recent purchase orders and test reports created.</CardDescription>
        </CardHeader>
        <CardContent>
             <ScrollArea className="h-[300px]">
                {recentActivities.length > 0 ? (
                    <div className="space-y-4">
                        {recentActivities.map((activity) => (
                            <div key={`${activity.type}-${activity.id}`} className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-muted rounded-full">
                                        {activity.type === 'PO' ? <Package className="h-5 w-5"/> : <FileText className="h-5 w-5"/>}
                                    </div>
                                    <div>
                                        {activity.type === 'PO' ? (
                                            <>
                                                <p className="font-medium">
                                                    PO #{activity.poNumber}
                                                    <Badge variant={getStatusBadgeVariant(activity.status)} className="ml-2">{activity.status}</Badge>
                                                </p>
                                                <p className="text-sm text-muted-foreground">For {activity.companyName}</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-medium">Report #{activity.serialNumber}</p>
                                                <p className="text-sm text-muted-foreground">For {activity.product.name}</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-muted-foreground">{new Date(activity.date).toLocaleDateString()}</p>
                                    <p className="text-sm text-muted-foreground">{new Date(activity.date).toLocaleTimeString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        No recent activities found.
                    </div>
                )}
             </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

    
