
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

type SortKey = 'date' | 'voucherNo' | 'partyName' | 'taxableAmount' | 'netPayable';
type SortDirection = 'asc' | 'desc';


export default function FinanceDashboardPage() {
    const [savedCalculations, setSavedCalculations] = useState<TdsCalculation[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();

    useEffect(() => {
        const unsub = onTdsCalculationsUpdate(setSavedCalculations);
        return () => unsub();
    }, []);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredCalculations = useMemo(() => {
        let filtered = [...savedCalculations];
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(calc => 
                (calc.voucherNo || '').toLowerCase().includes(lowercasedQuery) ||
                (calc.partyName || '').toLowerCase().includes(lowercasedQuery)
            );
        }
        
        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [savedCalculations, searchQuery, sortConfig]);

    const handleDeleteCalculation = async (id: string) => {
        try {
            await deleteTdsCalculation(id);
            toast({ title: "Deleted", description: "TDS record has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete record.", variant: "destructive" });
        }
    };


  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Finance Dashboard</h1>
            <p className="text-muted-foreground">An overview of your financial tools and records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
            <Button asChild>
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
       <div className="grid gap-6">
          <Card>
           <CardHeader>
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <CardTitle>TDS Calculation History</CardTitle>
                    <CardDescription>A log of all saved TDS calculations.</CardDescription>
                </div>
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by voucher or party..."
                        className="pl-8 w-full sm:w-[250px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
             </div>
           </CardHeader>
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('voucherNo')}>Voucher # <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Party Name <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('taxableAmount')}>Taxable Amount <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead>TDS Amount</TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('netPayable')}>Net Payable <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {sortedAndFilteredCalculations.length > 0 ? (
                    sortedAndFilteredCalculations.map(calc => (
                     <TableRow key={calc.id}>
                       <TableCell>{format(new Date(calc.date), 'PPP')}</TableCell>
                       <TableCell>{calc.voucherNo}</TableCell>
                       <TableCell>{calc.partyName}</TableCell>
                       <TableCell>{calc.taxableAmount.toLocaleString()}</TableCell>
                       <TableCell>{calc.tdsAmount.toLocaleString()}</TableCell>
                       <TableCell>{calc.netPayable.toLocaleString()}</TableCell>
                       <TableCell className="text-right">
                         <AlertDialog>
                           <AlertDialogTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                               <Trash2 className="h-4 w-4" />
                             </Button>
                           </AlertDialogTrigger>
                           <AlertDialogContent>
                             <AlertDialogHeader>
                               <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                               <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                             </AlertDialogHeader>
                             <AlertDialogFooter>
                               <AlertDialogCancel>Cancel</AlertDialogCancel>
                               <AlertDialogAction onClick={() => handleDeleteCalculation(calc.id)}>Delete</AlertDialogAction>
                             </AlertDialogFooter>
                           </AlertDialogContent>
                         </AlertDialog>
                       </TableCell>
                     </TableRow>
                   ))
                 ) : (
                   <TableRow>
                     <TableCell colSpan={7} className="text-center">
                       No saved TDS calculations yet.
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
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

    