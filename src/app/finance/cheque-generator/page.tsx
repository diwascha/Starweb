
'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { ChequeGeneratorForm } from './_components/cheque-generator-form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, Printer, Trash2, Edit, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onChequesUpdate, deleteCheque } from '@/services/cheque-service';
import type { Cheque, ChequeSplit, ChequeStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format, differenceInDays, startOfToday } from 'date-fns';
import { ChequeView } from './_components/cheque-view';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


function FormSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10 lg:col-span-2" />
                <Skeleton className="h-10 lg:col-span-2" />
            </div>
             <div className="border rounded-lg p-4 space-y-4">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
             <div className="flex justify-end gap-2">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-32" />
             </div>
        </div>
    );
}

type SortKey = 'chequeDate' | 'payeeName' | 'amount' | 'chequeNumber' | 'status' | 'dueStatus';
type SortDirection = 'asc' | 'desc';

interface AugmentedChequeSplit extends ChequeSplit {
    daysRemaining: number;
    isOverdue: boolean;
    parentCheque: Cheque;
}

function SavedChequesList({ onEdit }: { onEdit: (cheque: Cheque) => void }) {
    const [cheques, setCheques] = useState<Cheque[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'chequeDate', direction: 'asc' });
    const { toast } = useToast();
    
    const [chequeToPrint, setChequeToPrint] = useState<Cheque | null>(null);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsub = onChequesUpdate(setCheques);
        return () => unsub();
    }, []);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredSplits = useMemo(() => {
        const today = startOfToday();
        
        let allSplits: AugmentedChequeSplit[] = cheques.flatMap(c => 
            c.splits.map(s => {
                const chequeDate = new Date(s.chequeDate);
                return {
                    ...s,
                    id: `${c.id}-${s.chequeNumber}-${s.chequeDate}`,
                    chequeDate: chequeDate,
                    daysRemaining: differenceInDays(chequeDate, today),
                    isOverdue: differenceInDays(chequeDate, today) < 0,
                    parentCheque: c,
                    amount: s.amount,
                    status: s.status || 'Due'
                };
            })
        );


        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            allSplits = allSplits.filter(s =>
                s.parentCheque.payeeName.toLowerCase().includes(lowercasedQuery) ||
                (s.chequeNumber || '').toLowerCase().includes(lowercasedQuery) ||
                (s.parentCheque.invoiceNumber || '').toLowerCase().includes(lowercasedQuery) ||
                (s.parentCheque.voucherNo || '').toLowerCase().includes(lowercasedQuery)
            );
        }
        
        allSplits.sort((a, b) => {
            let aVal, bVal;

            if (sortConfig.key === 'chequeDate') {
                aVal = new Date(a.chequeDate).getTime();
                bVal = new Date(b.chequeDate).getTime();
            } else if (sortConfig.key === 'payeeName') {
                aVal = a.parentCheque.payeeName;
                bVal = b.parentCheque.payeeName;
            } else if (sortConfig.key === 'dueStatus') {
                aVal = a.daysRemaining;
                bVal = b.daysRemaining;
            } else {
                 aVal = a[sortConfig.key as keyof ChequeSplit];
                 bVal = b[sortConfig.key as keyof ChequeSplit];
            }
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return allSplits;
    }, [cheques, searchQuery, sortConfig]);

    const handleDelete = async (id: string) => {
        try {
            await deleteCheque(id);
            toast({ title: "Deleted", description: "Cheque record has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete cheque record.", variant: "destructive" });
        }
    };
    
    const handlePrint = (cheque: Cheque) => {
        setChequeToPrint(cheque);
        setIsPrintPreviewOpen(true);
    };

    const doActualPrint = () => {
        const printableArea = printRef.current;
        if (!printableArea) return;
        
        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow?.document.write('<html><head><title>Print Cheques</title>');
        printWindow?.document.write('<style>@media print{@page{size: auto;margin: 5mm;}body{margin: 0;}.cheque-container{border:1px solid #ccc; padding: 10px; margin-bottom: 20px; page-break-inside: avoid;}}</style>');
        printWindow?.document.write('</head><body>');
        printWindow?.document.write(printableArea.innerHTML);
        printWindow?.document.write('</body></html>');
        printWindow?.document.close();
        printWindow?.focus();
        setTimeout(() => {
            printWindow?.print();
            printWindow?.close();
        }, 250);
    };
    
    const getDueStatusBadge = (split: AugmentedChequeSplit) => {
        const { status, daysRemaining, isOverdue } = split;

        if (status !== 'Due') {
            return null; // Don't show due status for Paid or Canceled
        }

        if (isOverdue) {
            return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> Overdue by {-daysRemaining} day(s)</Badge>;
        }
        if (daysRemaining <= 7) {
            return <Badge variant="default" className="bg-yellow-500 text-black hover:bg-yellow-600"><AlertTriangle className="mr-1 h-3 w-3" /> Due in {daysRemaining} day(s)</Badge>;
        }
        return <Badge variant="outline" className="text-blue-600 border-blue-600">Due in {daysRemaining} day(s)</Badge>;
    };

    const getStatusBadge = (status: ChequeStatus) => {
        switch (status) {
            case 'Paid':
                return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Paid</Badge>;
            case 'Canceled':
                return <Badge variant="destructive">Canceled</Badge>;
            case 'Due':
            default:
                return <Badge variant="outline">Due</Badge>;
        }
    }

    
    return (
        <>
            <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <CardTitle>Saved Cheques</CardTitle>
                        <CardDescription>A log of all saved cheque records.</CardDescription>
                    </div>
                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by payee, cheque #..."
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
                    <TableHead><Button variant="ghost" onClick={() => requestSort('chequeDate')}>Cheque Date <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('payeeName')}>Payee Name <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('chequeNumber')}>Cheque # <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('amount')}>Amount <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
                    <TableHead><Button variant="ghost" onClick={() => requestSort('dueStatus')}>Due Status</Button></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredSplits.length > 0 ? (
                        sortedAndFilteredSplits.map(split => (
                        <TableRow key={split.id}>
                        <TableCell>{format(new Date(split.chequeDate), 'PPP')}</TableCell>
                        <TableCell>{split.parentCheque.payeeName}</TableCell>
                        <TableCell>{split.chequeNumber}</TableCell>
                        <TableCell>{Number(split.amount).toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(split.status)}</TableCell>
                        <TableCell>{getDueStatusBadge(split)}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Voucher #{split.parentCheque.voucherNo}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => onEdit(split.parentCheque)}><Edit className="mr-2 h-4 w-4" /> Edit Voucher</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handlePrint(split.parentCheque)}><Printer className="mr-2 h-4 w-4"/> Print Voucher</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete Voucher</span></DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>This action will delete the entire voucher and all its associated cheques. It cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(split.parentCheque.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                    </AlertDialog>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        </TableRow>
                    ))
                    ) : (
                    <TableRow>
                        <TableCell colSpan={7} className="text-center">No saved cheques yet.</TableCell>
                    </TableRow>
                    )}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
             <Dialog open={isPrintPreviewOpen} onOpenChange={setIsPrintPreviewOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Cheque Preview</DialogTitle>
                        <DialogDescription>Review the cheques before printing.</DialogDescription>
                    </DialogHeader>
                     <div className="max-h-[70vh] overflow-auto p-4 bg-gray-100">
                         <div ref={printRef}>
                            {chequeToPrint && (
                                <ChequeView
                                    voucherDate={new Date(chequeToPrint.createdAt)}
                                    payeeName={chequeToPrint.payeeName}
                                    splits={chequeToPrint.splits.map(s => ({
                                        ...s,
                                        chequeDate: new Date(s.chequeDate)
                                    }))}
                                />
                            )}
                         </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPrintPreviewOpen(false)}>Cancel</Button>
                        <Button onClick={doActualPrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default function ChequeGeneratorPage() {
    const [activeTab, setActiveTab] = useState('generator');
    const [chequeToEdit, setChequeToEdit] = useState<Cheque | null>(null);

    const handleEditCheque = (cheque: Cheque) => {
        setChequeToEdit(cheque);
        setActiveTab('generator');
    };

    const handleFinishEditing = () => {
        setChequeToEdit(null);
        setActiveTab('history');
    };


  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Cheque Generator</h1>
        <p className="text-muted-foreground">Generate and print cheques for your parties.</p>
      </header>
       <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
                <TabsTrigger value="generator">Cheque Generator</TabsTrigger>
                <TabsTrigger value="history">Saved Cheques</TabsTrigger>
            </TabsList>
            <TabsContent value="generator">
                 <Suspense fallback={<FormSkeleton />}>
                    <ChequeGeneratorForm 
                        key={chequeToEdit?.id || 'new'}
                        chequeToEdit={chequeToEdit}
                        onSaveSuccess={handleFinishEditing}
                    />
                 </Suspense>
            </TabsContent>
            <TabsContent value="history">
                <SavedChequesList onEdit={handleEditCheque} />
            </TabsContent>
        </Tabs>
    </div>
  );
}
