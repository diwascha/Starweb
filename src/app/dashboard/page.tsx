
'use client';

import { useEffect, useState } from 'react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, PurchaseOrder } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PlusCircle, FileText, Package, ShoppingCart, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getStatusBadgeVariant, toNepaliDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import Image from 'next/image';
import { format, differenceInDays } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function LiveDateTime() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-sm text-muted-foreground text-right">
      <p>{format(now, 'EEEE, MMMM d, yyyy')}</p>
      <p>{toNepaliDate(now.toISOString())} B.S.</p>
      <p>{format(now, 'h:mm:ss a')}</p>
    </div>
  );
}

function PasswordExpiryReminder() {
    const { user } = useAuth();

    if (!user || !user.passwordLastUpdated) {
        return null;
    }
    
    const daysSinceUpdate = differenceInDays(new Date(), new Date(user.passwordLastUpdated));
    
    if (daysSinceUpdate > 30) {
        return (
            <Alert variant="destructive" className="mb-8">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Password Expired</AlertTitle>
                <AlertDescription>
                    Your password is more than 30 days old. For security, please {' '}
                    <Link href="/settings" className="font-bold underline">
                        change your password
                    </Link>.
                </AlertDescription>
            </Alert>
        );
    }
    
    return null;
}

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
    
   const recentActivities = isClient ? 
    [
        ...(canViewPOs ? purchaseOrders.map(po => ({ type: 'PO', ...po, date: po.createdAt })) : []),
        ...(canViewReports ? reports.map(r => ({ type: 'Report', ...r })) : [])
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)
    : [];

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
    'dashboard', 'reports', 'products', 'purchaseOrders', 'rawMaterials', 'settings', 'hr', 'fleet'
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
    <div className="flex flex-col flex-1 h-full">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="Company Logo" width={80} height={80} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <h2 className="text-lg font-semibold">शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
            <p className="text-sm text-muted-foreground mt-1">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
            {isClient && <LiveDateTime />}
            <div className="flex items-center justify-end gap-2 mt-2">
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
        </div>
      </header>

      <div className="flex-grow" />
      
      {isClient && <PasswordExpiryReminder />}

      <Card>
        <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>A log of the most recent purchase orders and test reports created.</CardDescription>
        </CardHeader>
        <CardContent>
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
