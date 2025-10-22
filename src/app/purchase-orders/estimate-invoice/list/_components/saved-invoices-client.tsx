
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { onEstimatedInvoicesUpdate, deleteEstimatedInvoice } from '@/services/estimate-invoice-service';
import type { EstimatedInvoice } from '@/lib/types';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Trash2, Edit, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';


export function SavedInvoicesClient() {
    const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onEstimatedInvoicesUpdate((data) => {
            setInvoices(data);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    const handleDelete = async (id: string) => {
        try {
            await deleteEstimatedInvoice(id);
            toast({ title: 'Success', description: 'Invoice deleted successfully.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete invoice.', variant: 'destructive' });
        }
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter(invoice => 
            invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            invoice.partyName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [invoices, searchQuery]);

    if (isLoading) {
        return <div>Loading invoices...</div>;
    }

    if (invoices.length === 0) {
        return (
             <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No Saved Invoices</h3>
                    <p className="text-sm text-muted-foreground">You haven't saved any estimate invoices yet.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by invoice number or party name..."
                    className="pl-8 w-full md:w-1/3"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Party Name</TableHead>
                            <TableHead>Net Total</TableHead>
                            <TableHead>Created By</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredInvoices.map(invoice => (
                            <TableRow key={invoice.id}>
                                <TableCell>{invoice.invoiceNumber}</TableCell>
                                <TableCell>{format(new Date(invoice.date), 'PPP')}</TableCell>
                                <TableCell>{invoice.partyName}</TableCell>
                                <TableCell>{invoice.netTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                <TableCell>{invoice.createdBy}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem disabled>
                                                <Edit className="mr-2 h-4 w-4"/> Load / Edit
                                            </DropdownMenuItem>
                                             <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                                        <Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span>
                                                    </DropdownMenuItem>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                        <AlertDialogDescription>This will permanently delete the invoice #{invoice.invoiceNumber}.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(invoice.id)}>Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
