
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShoppingCart, Wrench, Package, Clock } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import type { PurchaseOrder, RawMaterial } from '@/lib/types';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeVariant } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { onPurchaseOrdersUpdate } from '@/services/purchase-order-service';
import { onRawMaterialsUpdate } from '@/services/raw-material-service';


const poModules = [
    {
        name: 'Purchase Orders',
        description: 'Create, view, and manage all purchase orders.',
        href: '/purchase-orders/list',
        icon: ShoppingCart,
        permission: 'purchaseOrders',
        action: 'view'
    },
    {
        name: 'Raw Materials',
        description: 'Manage the raw materials used in purchase orders.',
        href: '/raw-materials',
        icon: Wrench,
        permission: 'rawMaterials',
        action: 'view'
    },
];

export default function PurchaseOrderDashboardPage() {
   const { hasPermission } = useAuth();
   const [isClient, setIsClient] = useState(false);
   
   const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
   const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
   
   useEffect(() => {
     setIsClient(true);
     const unsubPOs = onPurchaseOrdersUpdate(setPurchaseOrders);
     const unsubRMs = onRawMaterialsUpdate(setRawMaterials);

     return () => {
         unsubPOs();
         unsubRMs();
     };
   }, []);
   
   const { totalPOs, totalRawMaterials, avgLeadTime, poStatusData, companyLeadTimeData } = useMemo(() => {
        if (!isClient) return { totalPOs: 0, totalRawMaterials: 0, avgLeadTime: 0, poStatusData: [], companyLeadTimeData: [] };
        
        const deliveredPOs = purchaseOrders.filter(po => po.status === 'Delivered' && po.deliveryDate);
        
        const totalLeadTime = deliveredPOs.reduce((sum, po) => {
            return sum + differenceInDays(new Date(po.deliveryDate!), new Date(po.poDate));
        }, 0);
        
        const statusCounts = purchaseOrders.reduce((acc, po) => {
            acc[po.status] = (acc[po.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const statusData = Object.entries(statusCounts).map(([name, count]) => ({ name, count }));
        
        const companyData = deliveredPOs.reduce((acc, po) => {
            const leadTime = differenceInDays(new Date(po.deliveryDate!), new Date(po.poDate));
            if (!acc[po.companyName]) {
                acc[po.companyName] = { total: 0, count: 0 };
            }
            acc[po.companyName].total += leadTime;
            acc[po.companyName].count += 1;
            return acc;
        }, {} as Record<string, {total: number, count: number}>);
        
        const leadTimeData = Object.entries(companyData).map(([name, data]) => ({
            name,
            avgLeadTime: Math.round(data.total / data.count)
        }));

        return {
            totalPOs: purchaseOrders.length,
            totalRawMaterials: rawMaterials.length,
            avgLeadTime: deliveredPOs.length > 0 ? Math.round(totalLeadTime / deliveredPOs.length) : 0,
            poStatusData: statusData,
            companyLeadTimeData: leadTimeData,
        };
   }, [isClient, purchaseOrders, rawMaterials]);
   
   const recentPOs = useMemo(() => {
        if (!isClient) return [];
        return [...purchaseOrders]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5);
   }, [isClient, purchaseOrders]);
   
   const chartConfig: ChartConfig = {
        count: { label: 'Count', color: 'hsl(var(--chart-1))' },
        avgLeadTime: { label: 'Avg. Lead Time (Days)', color: 'hsl(var(--chart-2))' },
   };

  if (!isClient) {
      return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
              <h3 className="text-2xl font-bold tracking-tight">Loading PO Dashboard...</h3>
          </div>
      );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Purchase Order Management</h1>
        <p className="text-muted-foreground">An overview of your procurement activities and raw materials.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Purchase Orders</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalPOs}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Managed Raw Materials</CardTitle>
                    <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalRawMaterials}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg. Delivery Lead Time</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{avgLeadTime} <span className="text-base font-normal text-muted-foreground">days</span></div>
                </CardContent>
            </Card>
       </div>

       <div className="grid gap-6 md:grid-cols-2">
           <Card>
                <CardHeader>
                    <CardTitle>Purchase Order Status</CardTitle>
                    <CardDescription>A breakdown of all purchase orders by their current status.</CardDescription>
                </CardHeader>
                <CardContent>
                    {poStatusData.length > 0 ? (
                        <ChartContainer config={chartConfig} className="h-[300px] w-full">
                            <BarChart data={poStatusData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                                <YAxis />
                                <Tooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                    ) : (
                        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                            No purchase order data available.
                        </div>
                    )}
                </CardContent>
           </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Recent Purchase Orders</CardTitle>
                    <CardDescription>The 5 most recently created purchase orders.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[300px]">
                        {recentPOs.length > 0 ? (
                             <div className="space-y-4">
                                {recentPOs.map(po => (
                                    <Link href={`/purchase-orders/${po.id}`} key={po.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                                        <div>
                                            <p className="font-medium">PO #{po.poNumber}</p>
                                            <p className="text-sm text-muted-foreground">{po.companyName}</p>
                                        </div>
                                        <div className="text-right">
                                             <Badge variant={getStatusBadgeVariant(po.status)}>{po.status}</Badge>
                                             <p className="text-xs text-muted-foreground mt-1">{new Date(po.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                             <div className="flex h-full items-center justify-center text-muted-foreground">
                                No purchase orders found.
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
       </div>
       
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

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick Access</h2>
        <div className="grid gap-6 md:grid-cols-2">
            {poModules.filter(module => hasPermission(module.permission as any, module.action as any)).map((module) => (
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
