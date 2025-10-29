
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calculator, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CrmDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">CRM Dashboard</h1>
            <p className="text-muted-foreground">Customer Relationship Management tools.</p>
        </div>
      </header>
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
                <CardTitle>Cost Report</CardTitle>
                <CardDescription>Analyze and manage cost reports.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild>
                    <Link href="/crm/cost-report">
                        <Calculator className="mr-2 h-4 w-4" /> Go to Cost Report
                    </Link>
                </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>PackSpec</CardTitle>
              <CardDescription>Manage packaging specifications.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild>
                    <Link href="/crm/pack-spec">
                        <FileText className="mr-2 h-4 w-4" /> Go to PackSpec
                    </Link>
                </Button>
            </CardContent>
         </Card>
       </div>
    </div>
  );
}
