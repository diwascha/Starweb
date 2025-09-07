
import { Suspense } from 'react';
import Link from 'next/link';
import { PlusCircle, ShoppingCart } from 'lucide-react';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import RecentActivities from './_components/recent-activities';

function RecentActivitiesSkeleton() {
  return (
    <div class="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <Skeleton class="h-12 w-12 rounded-full" />
            <div class="space-y-2">
              <Skeleton class="h-4 w-[250px]" />
              <Skeleton class="h-4 w-[200px]" />
            </div>
          </div>
          <div class="space-y-2">
            <Skeleton class="h-4 w-[100px]" />
            <Skeleton class="h-4 w-[80px]" />
          </div>
        </div>
      ))}
    </div>
  );
}


export default function DashboardPage() {
  return (
    <div class="flex flex-col flex-1 h-full">
      <header class="flex items-start justify-between gap-4">
        <div>
            <h1 class="text-xl font-bold tracking-tight">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
            <h2 class="text-lg font-semibold">शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.</h2>
            <p class="text-sm text-muted-foreground mt-1">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
        </div>
        <div class="flex flex-col items-end gap-2">
            {/* LiveDateTime can be its own client component if needed, but for now we remove it to simplify and boost performance */}
            <div class="flex items-center justify-end gap-2 mt-2">
                <Button asChild>
                    <Link href="/report/new">
                    <PlusCircle class="mr-2 h-4 w-4" /> New QT Reports
                    </Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href="/purchase-orders/new">
                    <ShoppingCart class="mr-2 h-4 w-4" /> New Purchase Order
                    </Link>
                </Button>
            </div>
        </div>
      </header>

      <div class="flex-grow pt-8" />

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
  );
}
