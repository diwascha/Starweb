
import { Suspense } from 'react';
import Link from 'next/link';
import { PlusCircle, ShoppingCart } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import RecentActivities from './_components/recent-activities';

function RecentActivitiesSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-[100px]" />
            <Skeleton className="h-4 w-[80px]" />
          </div>
        </div>
      ))}
    </div>
  );
}


export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 flex flex-col gap-8">
         <header className="flex items-start justify-between gap-4">
            <div>
                <h1 className="text-xl font-bold tracking-tight">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
                <h2 className="text-lg font-semibold">शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
                <p className="text-sm text-muted-foreground mt-1">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
            </div>
            <div className="flex items-center justify-end gap-2 mt-2">
                <Button asChild>
                    <Link href="/report/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> New QT Reports
                    </Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href="/purchase-orders/new">
                    <ShoppingCart className="mr-2 h-4 w-4" /> New Purchase Order
                    </Link>
                </Button>
            </div>
        </header>
        <Card>
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>A log of the most recent purchase orders and test reports created or modified.</CardDescription>
            </CardHeader>
            <CardContent>
                <Suspense fallback={<RecentActivitiesSkeleton />}>
                    <RecentActivities />
                </Suspense>
            </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-1">
        <Card className="overflow-hidden">
            <CardHeader>
                <CardTitle>Nepali Calendar</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                 <iframe 
                    src="https://www.hamropatro.com/widgets/calender-small.php" 
                    frameBorder="0" 
                    scrolling="no" 
                    marginWidth="0" 
                    marginHeight="0" 
                    style={{ border: 'none', overflow: 'hidden', width: '100%', height: '290px' }} 
                    allowtransparency="true">
                 </iframe>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
