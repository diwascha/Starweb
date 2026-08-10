
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calculator, FileText, Receipt, Scale, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FinanceDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Finance Dashboard</h1>
            <p className="text-muted-foreground text-sm font-medium">An overview of your financial tools and records.</p>
        </div>
      </header>
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover:shadow-md transition-shadow border-emerald-200 bg-emerald-50/5">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-emerald-700">
                    <Wallet className="h-5 w-5" />
                    Payment Tracker
                </CardTitle>
                <CardDescription>Monitor daily received and outflow payments.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700">
                    <Link href="/finance/payment-tracker">
                        Launch Tracker
                    </Link>
                </Button>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Estimate Invoice
                </CardTitle>
                <CardDescription>Create and manage pro-forma invoices.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full">
                    <Link href="/finance/estimate-invoice">
                        Go to Invoices
                    </Link>
                </Button>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                TDS Calculator
              </CardTitle>
              <CardDescription>Calculate TDS and view historical records.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild variant="outline" className="w-full">
                    <Link href="/finance/tds-calculator">
                        Launch Calculator
                    </Link>
                </Button>
            </CardContent>
         </Card>
           <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Cheque Generator
              </CardTitle>
              <CardDescription>Generate and print cheques for your parties.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                    <Link href="/finance/cheque-generator">
                        Go to Generator
                    </Link>
              </Button>
            </CardContent>
          </Card>
       </div>
    </div>
  );
}
