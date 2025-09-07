
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Report, PurchaseOrder } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Package, ShoppingCart, AlertTriangle, User } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeVariant } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


async function getRecentActivities() {
    const reportsQuery = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(5));
    const purchaseOrdersQuery = query(collection(db, 'purchaseOrders'), orderBy('updatedAt', 'desc'), limit(5));

    const [reportsSnapshot, purchaseOrdersSnapshot] = await Promise.all([
        getDocs(reportsQuery),
        getDocs(purchaseOrdersQuery)
    ]);

    const reports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'Report' })) as (Report & { type: 'Report' })[];
    const purchaseOrders = purchaseOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'PO' })) as (PurchaseOrder & { type: 'PO' })[];

    const activities = [
        ...purchaseOrders.map(po => ({ ...po, date: po.updatedAt || po.createdAt })),
        ...reports.map(r => ({ ...r, date: r.createdAt, lastModifiedBy: r.lastModifiedBy, createdBy: r.createdBy }))
    ];
    
    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
}


export default async function RecentActivities() {
    const recentActivities = await getRecentActivities();

    return (
        <ScrollArea className="h-[calc(100vh-32rem)]">
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
                            <div className="text-right flex items-center gap-2">
                                 <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                <User className="h-3 w-3" />
                                                <span>{activity.lastModifiedBy || activity.createdBy}</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {activity.createdBy && <p>Created by: {activity.createdBy}</p>}
                                            {activity.lastModifiedBy && activity.lastModifiedBy !== activity.createdBy && (
                                              <p>Last modified by: {activity.lastModifiedBy}</p>
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <div>
                                    <p className="text-sm text-muted-foreground">{new Date(activity.date).toLocaleDateString()}</p>
                                    <p className="text-sm text-muted-foreground">{new Date(activity.date).toLocaleTimeString()}</p>
                                </div>
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
    );
}
