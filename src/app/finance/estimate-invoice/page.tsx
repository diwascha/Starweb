'use client';
import { Suspense, useState, useMemo, useEffect, useRef } from 'react';
import { InvoiceCalculator } from './_components/invoice-calculator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, MoreHorizontal, View, Edit, Trash2, History, Printer, Save, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { onEstimatedInvoicesUpdate, deleteEstimatedInvoice } from '@/services/estimate-invoice-service';
import type { EstimatedInvoice, Product, RateHistoryEntry, Party } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogHeader, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { onProductsUpdate, updateProduct } from '@/services/product-service';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { toNepaliDate } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InvoiceView } from './_components/invoice-view';
import { onPartiesUpdate } from '@/services/party-service';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { AnnapurnaSIL } from '@/lib/fonts/AnnapurnaSIL-Regular-base64';


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

function SavedInvoicesList({ onEdit }: { onEdit: (invoice: EstimatedInvoice) => void }) {
    const [invoices, setInvoices] = useState<EstimatedInvoice[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();
    const router = useRouter();

    const [isViewOpen, setIsViewOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<EstimatedInvoice | null>(null);
    const [parties, setParties] = useState<Party[]>([]);
    
    const [isExporting, setIsExporting] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubInvoices = onEstimatedInvoicesUpdate(setInvoices);
        const unsubParties = onPartiesUpdate(setParties);
        return () => {
            unsubInvoices();
            unsubParties();
        }
    }, []);
    
    const partiesById = useMemo(() => new Map(parties.map(p => [p.name, p])), [parties]);

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
    
    const handleViewInvoice = (invoice: EstimatedInvoice) => {
        setSelectedInvoice(invoice);
        setIsViewOpen(true);
    };
    
    const handlePrint = (invoice: EstimatedInvoice) => {
        setSelectedInvoice(invoice);
        setTimeout(() => {
            const printableArea = printRef.current;
            if (!printableArea) return;
            
            const printWindow = window.open('', '', 'height=800,width=800');
            printWindow?.document.write('<html><head><title>Print Invoice</title>');
            printWindow?.document.write('<style>@media print{@page{size: A4;margin: 0;}body{margin: 1.6cm;}}body{font-family:sans-serif;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;}.text-right{text-align:right;}.font-bold{font-weight:bold;}</style>');
            printWindow?.document.write('</head><body>');
            printWindow?.document.write(printableArea.innerHTML);
            printWindow?.document.write('</body></html>');
            printWindow?.document.close();
            printWindow?.focus();
            setTimeout(() => {
                printWindow?.print();
                printWindow?.close();
                setSelectedInvoice(null);
            }, 250);
        }, 100);
    };

    const handleExportPdf = async (invoice: EstimatedInvoice) => {
        if (!invoice) return;
        setIsExporting(true);

        const party = partiesById.get(invoice.partyName);
        if (!party) {
            toast({ title: 'Error', description: 'Could not find party details for this invoice.', variant: 'destructive'});
            setIsExporting(false);
            return;
        }

        try {
            const doc = new jsPDF();
            
            // Add font to VFS
            doc.addFileToVFS("AnnapurnaSIL.ttf", AnnapurnaSIL);
            doc.addFont("AnnapurnaSIL.ttf", "AnnapurnaSIL", "normal");
            
            // Header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

            doc.setFont('AnnapurnaSIL', 'normal');
            doc.setFontSize(14);
            doc.text('शिवम प्याकेजिङ्ग इन्डस्ट्रिज प्रा.लि.', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 28, { align: 'center' });

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('ESTIMATE INVOICE', doc.internal.pageSize.getWidth() / 2, 36, { align: 'center' });

            // Info
            doc.setFontSize(10);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Invoice No: ${invoice.invoiceNumber}`, 14, 48);
            doc.text(`Party Name: ${invoice.partyName}`, 14, 53);
            if (party.address) doc.text(`Address: ${party.address}`, 14, 58);
            if (party.panNumber) doc.text(`PAN/VAT No: ${party.panNumber}`, 14, 63);

            const nepaliDate = toNepaliDate(invoice.date);
            const adDate = format(new Date(invoice.date), 'yyyy-MM-dd');
            doc.text(`Date: ${nepaliDate} BS (${adDate})`, doc.internal.pageSize.getWidth() - 14, 48, { align: 'right' });

            (doc as any).autoTable({
                startY: 70,
                head: [['S.N.', 'Particulars', 'Quantity', 'Rate', 'Amount']],
                body: invoice.items.map((item, index) => [
                    index + 1,
                    item.productName,
                    item.quantity,
                    item.rate.toLocaleString(undefined, {minimumFractionDigits: 2}),
                    item.gross.toLocaleString(undefined, {minimumFractionDigits: 2})
                ]),
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold' },
                didDrawPage: (data: any) => {
                    let finalY = data.cursor.y;
                    doc.setFont('Helvetica', 'normal');
                    doc.setFontSize(10);
                    
                    doc.text('Gross Total', 140, finalY + 8, { align: 'right' });
                    doc.text(invoice.grossTotal.toLocaleString(undefined, {minimumFractionDigits: 2}), 200, finalY + 8, { align: 'right' });
                    doc.text('VAT (13%)', 140, finalY + 15, { align: 'right' });
                    doc.text(invoice.vatTotal.toLocaleString(undefined, {minimumFractionDigits: 2}), 200, finalY + 15, { align: 'right' });
                    
                    doc.setFont('Helvetica', 'bold');
                    doc.text('Net Total', 140, finalY + 22, { align: 'right' });
                    doc.text(invoice.netTotal.toLocaleString(undefined, {minimumFractionDigits: 2}), 200, finalY + 22, { align: 'right' });
                    
                    doc.setFont('Helvetica', 'normal');
                    doc.text(`In Words: ${invoice.amountInWords}`, 14, finalY + 30);
                    
                    doc.setFontSize(8);
                    doc.setFont('Helvetica', 'bold');
                    doc.text('Disclaimer:', doc.internal.pageSize.getWidth() / 2, finalY + 40, { align: 'center' });
                    doc.setFont('Helvetica', 'normal');
                    doc.text('This is an estimate for discussion purposes and not a substitute for a formal VAT invoice.', doc.internal.pageSize.getWidth() / 2, finalY + 44, { align: 'center' });
                }
            });
            
            doc.save(`Estimate-${invoice.invoiceNumber}.pdf`);

        } catch (error) {
            console.error('PDF export failed:', error);
            toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };


    const handleExportJpg = async (invoice: EstimatedInvoice) => {
        if (!invoice) return;
        setIsExporting(true);

        setSelectedInvoice(invoice);

        // Wait for the DOM to update with the correct invoice data
        setTimeout(async () => {
            if (!printRef.current) {
                setIsExporting(false);
                setSelectedInvoice(null);
                return;
            }
            try {
                const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `Estimate-${invoice.invoiceNumber}.jpg`;
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
            } catch (error) {
                console.error(`Failed to export as JPG`, error);
                toast({ title: 'Export Failed', description: `Could not export invoice as JPG.`, variant: 'destructive' });
            } finally {
                setIsExporting(false);
                setSelectedInvoice(null);
            }
        }, 100);
    };

    return (
        <>
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
                                <DropdownMenuItem onSelect={() => handleViewInvoice(inv)}><View className="mr-2 h-4 w-4"/> View</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handlePrint(inv)}><Printer className="mr-2 h-4 w-4"/> Print</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleExportPdf(inv)} disabled={isExporting}><Save className="mr-2 h-4 w-4"/> Export as PDF</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleExportJpg(inv)} disabled={isExporting}><ImageIcon className="mr-2 h-4 w-4"/> Export as JPG</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onEdit(inv)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
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

         <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
            <DialogContent className="max-w-4xl">
                 <DialogHeader>
                    <DialogTitle>Invoice Preview</DialogTitle>
                </DialogHeader>
                <div className="max-h-[80vh] overflow-auto p-4">
                    {selectedInvoice && (
                        <InvoiceView 
                            invoiceNumber={selectedInvoice.invoiceNumber}
                            date={selectedInvoice.date}
                            party={partiesById.get(selectedInvoice.partyName) || null}
                            items={selectedInvoice.items}
                            grossTotal={selectedInvoice.grossTotal}
                            vatTotal={selectedInvoice.vatTotal}
                            netTotal={selectedInvoice.netTotal}
                            amountInWords={selectedInvoice.amountInWords}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
        
        {/* Hidden div for printing/exporting */}
        <div className="absolute -left-[9999px] top-0 w-[210mm]">
            <div ref={printRef}>
              {selectedInvoice && (
                  <InvoiceView
                    invoiceNumber={selectedInvoice.invoiceNumber}
                    date={selectedInvoice.date}
                    party={partiesById.get(selectedInvoice.partyName) || null}
                    items={selectedInvoice.items}
                    grossTotal={selectedInvoice.grossTotal}
                    vatTotal={selectedInvoice.vatTotal}
                    netTotal={selectedInvoice.netTotal}
                    amountInWords={selectedInvoice.amountInWords}
                  />
              )}
            </div>
        </div>
        </>
    );
}

function SavedRatesList() {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
    const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [selectedHistory, setSelectedHistory] = useState<RateHistoryEntry[]>([]);
    const [newRate, setNewRate] = useState<string>('');
    const { toast } = useToast();
    const { user } = useAuth();

    useEffect(() => {
        const unsub = onProductsUpdate(setProducts);
        return () => unsub();
    }, []);

    const handleOpenRateDialog = (product: Product) => {
        setEditingProduct(product);
        setNewRate(String(product.rate || ''));
        setIsRateDialogOpen(true);
    };

    const handleSaveRate = async () => {
        if (!editingProduct || !user) return;
        const rateValue = parseFloat(newRate);
        if (isNaN(rateValue) || rateValue < 0) {
            toast({ title: 'Error', description: 'Please enter a valid rate.', variant: 'destructive' });
            return;
        }
        try {
            await updateProduct(editingProduct.id, { rate: rateValue, lastModifiedBy: user.username });
            toast({ title: 'Success', description: `Rate for ${editingProduct.name} updated.` });
            setIsRateDialogOpen(false);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to update rate.', variant: 'destructive' });
        }
    };
    
    const handleOpenHistoryDialog = (product: Product) => {
        setSelectedHistory(product.rateHistory || []);
        setEditingProduct(product);
        setIsHistoryDialogOpen(true);
    };

    const filteredProducts = useMemo(() => {
        return products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.partyName.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [products, searchQuery]);

    return (
        <>
        <Card>
           <CardHeader>
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <CardTitle>Product Rates</CardTitle>
                    <CardDescription>Manage the rates for each product.</CardDescription>
                </div>
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search products..."
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
                           <TableHead>Product Name</TableHead>
                           <TableHead>Delivered To</TableHead>
                           <TableHead>Current Rate (NPR)</TableHead>
                           <TableHead className="text-right">Actions</TableHead>
                       </TableRow>
                   </TableHeader>
                   <TableBody>
                       {filteredProducts.length > 0 ? (
                           filteredProducts.map(p => (
                               <TableRow key={p.id}>
                                   <TableCell>{p.name}</TableCell>
                                   <TableCell>{p.partyName}</TableCell>
                                   <TableCell>{p.rate ? p.rate.toLocaleString() : 'Not Set'}</TableCell>
                                   <TableCell className="text-right space-x-2">
                                       <Button variant="ghost" size="sm" onClick={() => handleOpenHistoryDialog(p)}>
                                           <History className="mr-2 h-4 w-4" /> History
                                       </Button>
                                       <Button variant="outline" size="sm" onClick={() => handleOpenRateDialog(p)}>
                                           <Edit className="mr-2 h-4 w-4" /> Edit Rate
                                       </Button>
                                   </TableCell>
                               </TableRow>
                           ))
                       ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center">No products found.</TableCell>
                            </TableRow>
                       )}
                   </TableBody>
               </Table>
           </CardContent>
        </Card>
        <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Rate for {editingProduct?.name}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="rate-input">New Rate</Label>
                    <Input
                        id="rate-input"
                        type="number"
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        placeholder="e.g. 150.50"
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveRate}>Save Rate</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Rate History for {editingProduct?.name}</DialogTitle>
                    <DialogDescription>A log of all past rates for this product.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-72 my-4">
                    {selectedHistory.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date Set (BS)</TableHead>
                                    <TableHead>Rate</TableHead>
                                    <TableHead>Set By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...selectedHistory].reverse().map((entry, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{toNepaliDate(entry.date)}</TableCell>
                                        <TableCell>{entry.rate.toLocaleString()}</TableCell>
                                        <TableCell>{entry.setBy}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                            No rate history available for this product.
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
        </>
    );
}

export default function EstimateInvoicePage() {
  const [activeTab, setActiveTab] = useState('calculator');
  const [invoiceToEdit, setInvoiceToEdit] = useState<EstimatedInvoice | null>(null);

  const handleEditInvoice = (invoice: EstimatedInvoice) => {
    setInvoiceToEdit(invoice);
    setActiveTab('calculator');
  };

  const handleFinishEditing = () => {
    setInvoiceToEdit(null);
    setActiveTab('history');
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Estimate / Pro-Forma Invoice</h1>
        <p className="text-muted-foreground">Create and manage estimate or pro-forma invoices for clients.</p>
      </header>
       <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
                <TabsTrigger value="calculator">Invoice Calculator</TabsTrigger>
                <TabsTrigger value="history">Saved Invoices</TabsTrigger>
                <TabsTrigger value="rates">Saved Rates</TabsTrigger>
            </TabsList>
            <TabsContent value="calculator">
                <Suspense fallback={<FormSkeleton />}>
                    <InvoiceCalculator 
                        key={invoiceToEdit?.id || 'new'}
                        invoiceToEdit={invoiceToEdit || undefined} 
                        onSaveSuccess={handleFinishEditing} 
                    />
                </Suspense>
            </TabsContent>
            <TabsContent value="history">
                <SavedInvoicesList onEdit={handleEditInvoice} />
            </TabsContent>
            <TabsContent value="rates">
                <SavedRatesList />
            </TabsContent>
        </Tabs>
    </div>
  );
}
