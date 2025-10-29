
'use client';
import { Suspense, useState, useMemo, useEffect } from 'react';
import { InvoiceCalculator } from './_components/invoice-calculator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, View, Edit, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onEstimatedInvoicesUpdate, deleteEstimatedInvoice } from '@/services/estimate-invoice-service';
import type { EstimatedInvoice } from '@/lib/types';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

function FormSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
            </div>
             <div className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between">
                    <Skeleton className="h-8 w-1/4" />
                    <Skeleton className="h-8 w-1/4" />
                </div>
                 <Skeleton className="h-10 w-full" />
                 <Skeleton className="h-10 w-full" />
             </div>
             <div className="flex justify-end">
                <Skeleton className="h-10 w-32" />
             </div>
        </div>
    );
}

type SortKey = 'invoiceNumber' | 'date' | 'partyName' | 'netTotal';
type SortDirection = 'asc' | 'desc';

function SavedInvoicesList() {
    const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const unsub = onEstimatedInvoicesUpdate(setInvoices);
        return () => unsub();
    }, []);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredInvoices = useMemo(() => {
        let filtered = [...invoices];
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            filtered = filtered.filter(inv =>
                inv.invoiceNumber.toLowerCase().includes(lowercasedQuery) ||
                inv.partyName.toLowerCase().includes(lowercasedQuery)
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
    }, [invoices, searchQuery, sortConfig]);

    const handleDeleteInvoice = async (id: string) => {
        try {
            await deleteEstimatedInvoice(id);
            toast({ title: "Deleted", description: "Estimate invoice has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete invoice.", variant: "destructive" });
        }
    };

    return (
        <Card>
           <CardHeader>
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <CardTitle>Saved Estimate Invoices</CardTitle>
                    <CardDescription>A log of all saved estimate and pro-forma invoices.</CardDescription>
                </div>
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by invoice # or party..."
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
                   <TableHead><Button variant="ghost" onClick={() => requestSort('invoiceNumber')}>Invoice # <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')}>Party Name <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('netTotal')}>Net Total <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                   <TableHead className="text-right">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {sortedAndFilteredInvoices.length > 0 ? (
                    sortedAndFilteredInvoices.map(inv => (
                     <TableRow key={inv.id}>
                       <TableCell>{format(new Date(inv.date), 'PPP')}</TableCell>
                       <TableCell>{inv.invoiceNumber}</TableCell>
                       <TableCell>{inv.partyName}</TableCell>
                       <TableCell>{inv.netTotal.toLocaleString()}</TableCell>
                       <TableCell className="text-right">
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                                <DropdownMenuItem disabled><View className="mr-2 h-4 w-4"/> View</DropdownMenuItem>
                                <DropdownMenuItem disabled><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Delete this invoice?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteInvoice(inv.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                           </DropdownMenuContent>
                         </DropdownMenu>
                       </TableCell>
                     </TableRow>
                   ))
                 ) : (
                   <TableRow>
                     <TableCell colSpan={5} className="text-center">No saved invoices yet.</TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
    );
}

export default function EstimateInvoicePage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Estimate / Pro-Forma Invoice</h1>
        <p className="text-muted-foreground">Create and manage estimate or pro-forma invoices for clients.</p>
      </header>
       <Tabs defaultValue="calculator">
            <TabsList className="mb-4">
                <TabsTrigger value="calculator">Invoice Calculator</TabsTrigger>
                <TabsTrigger value="history">Saved Invoices</TabsTrigger>
            </TabsList>
            <TabsContent value="calculator">
                <Suspense fallback={<FormSkeleton />}>
                    <InvoiceCalculator />
                </Suspense>
            </TabsContent>
            <TabsContent value="history">
                <SavedInvoicesList />
            </TabsContent>
        </Tabs>
    </div>
  );
}
