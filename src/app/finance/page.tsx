
'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Calculator, FileText, Receipt, PlusCircle, Search, ArrowUpDown, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { onTdsCalculationsUpdate, deleteTdsCalculation } from '@/services/tds-service';
import type { TdsCalculation } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

export default function FinanceDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Finance Dashboard</h1>
            <p className="text-muted-foreground">An overview of your financial tools and records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <Button asChild>
                <Link href="/finance/estimate-invoice">
                    <FileText className="mr-2 h-4 w-4" /> New Estimate
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/finance/tds-calculator">
                    <Calculator className="mr-2 h-4 w-4" /> New TDS Calculation
                </Link>
            </Button>
            <Button asChild variant="outline">
                <Link href="/finance/cheque-generator">
                    <Receipt className="mr-2 h-4 w-4" /> New Cheque
                </Link>
            </Button>
        </div>
      </header>
       <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>TDS Calculation History</CardTitle>
              <CardDescription>A log of all saved TDS calculations. You can now find this inside the TDS Calculator page.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground p-8">
                    <p className="font-semibold">Moved to TDS Calculator Page</p>
                    <p>The history of saved TDS calculations is now available in a tab on the TDS Calculator page for easier access.</p>
                    <Button asChild variant="secondary" className="mt-4">
                        <Link href="/finance/tds-calculator">Go to TDS Calculator</Link>
                    </Button>
                </div>
            </CardContent>
         </Card>
           <Card>
            <CardHeader>
              <CardTitle>Estimate Invoices</CardTitle>
              <CardDescription>Manage and track your estimates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground p-8">
                <p>Coming Soon</p>
                <p>Saved estimate invoices will appear here.</p>
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle>Cheques</CardTitle>
              <CardDescription>A log of all generated cheques.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-1 text-center text-sm text-muted-foreground p-8">
                <p>Coming Soon</p>
                 <p>Saved cheques will appear here.</p>
              </div>
            </CardContent>
          </Card>
       </div>
    </div>
  );
}
