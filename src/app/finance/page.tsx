
import { Suspense } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calculator, FileText, Receipt, PlusCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function FinanceDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Finance Dashboard</h1>
            <p className="text-muted-foreground">An overview of your financial tools and records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
                <Link href="/finance/tds-calculator">
                    <Calculator className="mr-2 h-4 w-4" /> New TDS Calculation
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/finance/estimate-invoice">
                    <FileText className="mr-2 h-4 w-4" /> New Estimate
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/finance/cheque-generator">
                    <Receipt className="mr-2 h-4 w-4" /> New Cheque
                </Link>
            </Button>
        </div>
      </header>
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>TDS Calculations</CardTitle>
              <CardDescription>Records of all generated TDS vouchers.</CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-20 w-full" />}>
                <p className="text-sm text-muted-foreground">View and manage on the <Link href="/finance/tds-calculator" className="underline">TDS Calculator page</Link>.</p>
              </Suspense>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle>Estimate Invoices</CardTitle>
              <CardDescription>Manage and track your estimates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground">
                <p>Coming Soon</p>
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle>Cheques</CardTitle>
              <CardDescription>A log of all generated cheques.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground">
                <p>Coming Soon</p>
              </div>
            </CardContent>
          </Card>
       </div>
    </div>
  );
}
