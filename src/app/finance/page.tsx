
'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calculator, FileText, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FinanceDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Finance Dashboard</h1>
            <p className="text-muted-foreground">An overview of your financial tools and records.</p>
        </div>
      </header>
       <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Estimate Invoices</CardTitle>
              <CardDescription>Create and manage customer estimates.</CardDescription>
            </CardHeader>
             <CardContent>
                <Button asChild>
                    <Link href="/finance/estimate-invoice">
                        <FileText className="mr-2 h-4 w-4" /> Go to Estimate Invoices
                    </Link>
                </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>TDS Calculator</CardTitle>
              <CardDescription>Calculate TDS and view historical records.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild>
                    <Link href="/finance/tds-calculator">
                        <Calculator className="mr-2 h-4 w-4" /> Go to TDS Calculator
                    </Link>
                </Button>
            </CardContent>
         </Card>
           <Card>
            <CardHeader>
              <CardTitle>Cheque Generator</CardTitle>
              <CardDescription>Generate and print cheques for your parties.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                    <Link href="/finance/cheque-generator">
                        <Receipt className="mr-2 h-4 w-4" /> Go to Cheque Generator
                    </Link>
              </Button>
            </CardContent>
          </Card>
       </div>
    </div>
  );
}

    