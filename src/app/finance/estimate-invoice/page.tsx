'use client';
import { Suspense, useState, useMemo, useEffect, useRef } from 'react';
import { InvoiceCalculator } from './_components/invoice-calculator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  ArrowUpDown, 
  MoreHorizontal, 
  View, 
  Edit, 
  Trash2, 
  History, 
  Printer, 
  Save, 
  Image as ImageIcon, 
  Loader2, 
  ChevronLeft, 
  ChevronRight,
  FilterX,
  Users,
  CalendarIcon
} from 'lucide-react';
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
import { toNepaliDate, cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InvoiceView } from './_components/invoice-view';
import { onPartiesUpdate } from '@/services/party-service';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


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
    const [filterParty, setFilterParty] = useState('All');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

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

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterParty, dateRange, itemsPerPage]);
    
    const partiesById = useMemo(() => new Map(parties.map(p => [p.name, p])), [parties]);

    const uniqueParties = useMemo(() => {
        const pNames = new Set(invoices.map(inv => inv.partyName));
        return Array.from(pNames).sort();
    }, [invoices]);

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

        if (filterParty !== 'All') {
            filtered = filtered.filter(inv => inv.partyName === filterParty);
        }

        if (dateRange?.from) {
            const start = startOfDay(dateRange.from);
            const end = endOfDay(dateRange.to || dateRange.from);
            filtered = filtered.filter(inv => {
                const invDate = new Date(inv.date);
                return isWithinInterval(invDate, { start, end });
            });
        }

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return filtered;
    }, [invoices, searchQuery, filterParty, dateRange, sortConfig]);

    const paginatedInvoices = useMemo(() => {
        if (itemsPerPage === -1) return sortedAndFilteredInvoices;
        const start = (currentPage - 1) * itemsPerPage;
        return sortedAndFilteredInvoices.slice(start, start + itemsPerPage);
    }, [sortedAndFilteredInvoices, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(sortedAndFilteredInvoices.length / itemsPerPage);
    }, [sortedAndFilteredInvoices, itemsPerPage]);

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
            
            // Header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('SHIVAM PACKAGING INDUSTRIES PVT LTD.', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(10);
            doc.text('HETAUDA 08, BAGMATI PROVIENCE, NEPAL', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(14);
            doc.text('ESTIMATE INVOICE', doc.internal.pageSize.getWidth() / 2, 32, { align: 'center' });

            // Info
            doc.setFontSize(10);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Invoice No: ${invoice.invoiceNumber}`, 14, 42);
            doc.text(`Party Name: ${invoice.partyName}`, 14, 47);
            if (party.address) doc.text(`Address: ${party.address}`, 14, 52);
            if (party.panNumber) doc.text(`PAN/VAT No: ${party.panNumber}`, 14, 57);

            const nepaliDate = toNepaliDate(invoice.date);
            const adDate = format(new Date(invoice.date), 'yyyy-MM-dd');
            doc.text(`Date: ${nepaliDate} BS (${adDate})`, doc.internal.pageSize.getWidth() - 14, 42, { align: 'right' });

            (doc as any).autoTable({
                startY: 65,
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
                     // Reset font for this section to avoid issues
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

    const isFiltered = filterParty !== 'All' || !!dateRange || searchQuery !== '';

    return (
        <>
        <Card>
           <CardHeader className="py-4">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-lg font-bold">Saved Estimate Invoices</CardTitle>
                    <CardDescription className="text-xs">Manufacturing estimates log.</CardDescription>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            className="pl-8 h-8 text-xs w-[180px] bg-white border-gray-200 shadow-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <Select value={filterParty} onValueChange={setFilterParty}>
                        <SelectTrigger className="h-8 w-[150px] bg-white text-xs border-gray-200 shadow-none">
                            <div className="flex items-center gap-2">
                                <Users className="h-3 w-3 text-muted-foreground" />
                                <SelectValue placeholder="All Parties" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Parties</SelectItem>
                            {uniqueParties.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("h-8 w-[180px] justify-start text-left font-normal bg-white text-xs px-2 border-gray-200", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-1.5 h-3 w-3" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}` : format(dateRange.from, "MMM d")
                                    ) : 'Date Range'}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>

                    {isFiltered && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { setFilterParty('All'); setDateRange(undefined); setSearchQuery(''); }} 
                            className="h-8 px-2 text-[10px] font-bold uppercase tracking-tight text-muted-foreground hover:text-foreground"
                        >
                            <FilterX className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
             </div>
           </CardHeader>
           <CardContent className="p-0">
             <Table>
               <TableHeader className="bg-muted/50">
                 <TableRow className="hover:bg-transparent">
                   <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="text-xs">Date (BS) <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('invoiceNumber')} className="text-xs">Invoice # <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="text-xs">Party Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('netTotal')} className="text-xs">Net Total <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead className="text-right pr-6 text-xs">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {paginatedInvoices.length > 0 ? (
                    paginatedInvoices.map(inv => (
                     <TableRow key={inv.id} className="h-14">
                       <TableCell>{toNepaliDate(inv.date)}</TableCell>
                       <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                       <TableCell>{inv.partyName}</TableCell>
                       <TableCell className="font-mono text-xs">Rs. {inv.netTotal.toLocaleString()}</TableCell>
                       <TableCell className="text-right pr-6">
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onSelect={() => handleViewInvoice(inv)}><View className="mr-2 h-4 w-4"/> View</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handlePrint(inv)}><Printer className="mr-2 h-4 w-4"/> Print</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleExportPdf(inv)} disabled={isExporting}><Save className="mr-2 h-4 w-4"/> Export as PDF</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => handleExportJpg(inv)} disabled={isExporting}><ImageIcon className="mr-2 h-4 w-4"/> Export as JPG</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onEdit(inv)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" /> <span>Delete</span></DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Delete this invoice?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteInvoice(inv.id)} className="bg-destructive text-white">Delete</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                           </DropdownMenuContent>
                         </DropdownMenu>
                       </TableCell>
                     </TableRow>
                   ))
                 ) : (
                   <TableRow>
                     <TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">No saved invoices yet.</TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </CardContent>
           {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{sortedAndFilteredInvoices.length}</span> invoices</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, sortedAndFilteredInvoices.length)}</span> of <span className="font-bold text-foreground">{sortedAndFilteredInvoices.length}</span> invoices
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="-1">All</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {itemsPerPage !== -1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardFooter>
            )}
         </Card>

         <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
            <DialogContent className="max-w-4xl h-[90vh] overflow-hidden flex flex-col p-0">
                 <DialogHeader className="p-6 border-b"><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 bg-muted/20 p-8">
                    <div className="mx-auto w-[210mm] shadow-2xl bg-white p-4">
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
                </ScrollArea>
                <DialogFooter className="p-6 border-t bg-white">
                    <Button variant="outline" onClick={() => setIsViewOpen(false)}>Close</Button>
                </DialogFooter>
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
    const [filterPartyId, setFilterPartyId] = useState('All');
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
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

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterPartyId, itemsPerPage]);

    const uniqueParties = useMemo(() => {
        const pIds = new Set(products.map(p => p.partyId).filter(Boolean));
        return products
            .filter(p => p.partyId && pIds.has(p.partyId))
            .map(p => ({ id: p.partyId!, name: p.partyName! }))
            .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [products]);

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
        let filtered = [...products];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.partyName || '').toLowerCase().includes(q));
        }

        if (filterPartyId !== 'All') {
            filtered = filtered.filter(p => p.partyId === filterPartyId);
        }

        return filtered;
    }, [products, searchQuery, filterPartyId]);

    const paginatedProducts = useMemo(() => {
        if (itemsPerPage === -1) return filteredProducts;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProducts.slice(start, start + itemsPerPage);
    }, [filteredProducts, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(filteredProducts.length / itemsPerPage);
    }, [filteredProducts, itemsPerPage]);

    const isFiltered = filterPartyId !== 'All' || searchQuery !== '';

    return (
        <>
        <Card>
           <CardHeader className="py-4">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <CardTitle>Product Rates</CardTitle>
                    <CardDescription>Manage the rates for each product.</CardDescription>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search products..."
                            className="pl-8 h-8 text-xs w-[180px] bg-white border-gray-200 shadow-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                        <SelectTrigger className="h-8 w-[150px] bg-white text-xs border-gray-200 shadow-none">
                            <div className="flex items-center gap-2">
                                <Users className="h-3 w-3 text-muted-foreground" />
                                <SelectValue placeholder="All Parties" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Parties</SelectItem>
                            {uniqueParties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    {isFiltered && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { setFilterPartyId('All'); setSearchQuery(''); }} 
                            className="h-8 px-2 text-[10px] font-bold uppercase tracking-tight text-muted-foreground hover:text-foreground"
                        >
                            <FilterX className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
             </div>
           </CardHeader>
           <CardContent className="p-0">
               <Table>
                   <TableHeader className="bg-muted/50">
                       <TableRow className="hover:bg-transparent">
                           <TableHead className="pl-6 font-bold">Product Name</TableHead>
                           <TableHead className="font-bold">Delivered To</TableHead>
                           <TableHead className="font-bold">Current Rate (NPR)</TableHead>
                           <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                       </TableRow>
                   </TableHeader>
                   <TableBody>
                       {paginatedProducts.length > 0 ? (
                           paginatedProducts.map(p => (
                               <TableRow key={p.id} className="h-14">
                                   <TableCell className="pl-6 font-bold">{p.name}</TableCell>
                                   <TableCell>{p.partyName}</TableCell>
                                   <TableCell className="font-mono text-xs">Rs. {p.rate ? p.rate.toLocaleString() : 'Not Set'}</TableCell>
                                   <TableCell className="text-right pr-6 space-x-1">
                                       <Button variant="ghost" size="sm" onClick={() => handleOpenHistoryDialog(p)} className="h-8 text-[10px] uppercase font-black">
                                           <History className="mr-1.5 h-3.5 w-3.5" /> History
                                       </Button>
                                       <Button variant="outline" size="sm" onClick={() => handleOpenRateDialog(p)} className="h-8 text-[10px] uppercase font-black border-primary/20 text-primary">
                                           <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Rate
                                       </Button>
                                   </TableCell>
                               </TableRow>
                           ))
                       ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground italic">No products found.</TableCell>
                            </TableRow>
                       )}
                   </TableBody>
               </Table>
           </CardContent>
           {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredProducts.length}</span> products</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of <span className="font-bold text-foreground">{filteredProducts.length}</span> products
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="-1">All</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {itemsPerPage !== -1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardFooter>
            )}
        </Card>
        <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase">Edit Rate: {editingProduct?.name}</DialogTitle>
                </DialogHeader>
                <div className="py-6 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="rate-input" className="text-[10px] uppercase font-bold text-muted-foreground">New Standard Rate (NPR)</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-blue-400">रु</span>
                            <Input
                                id="rate-input"
                                type="number"
                                value={newRate}
                                onChange={(e) => setNewRate(e.target.value)}
                                className="pl-10 h-12 text-lg font-black"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsRateDialogOpen(false)} className="h-10 font-bold uppercase text-[10px]">Cancel</Button>
                    <Button onClick={handleSaveRate} className="h-10 px-8 font-black uppercase text-[10px] shadow-lg shadow-primary/20">Commit Rate Update</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
            <DialogContent className="sm:max-w-lg h-[80vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                    <DialogTitle className="text-xl font-black uppercase">Rate History: {editingProduct?.name}</DialogTitle>
                    <DialogDescription className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Historical price log.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 p-0">
                    {selectedHistory.length > 0 ? (
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/30 sticky top-0 z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold">Date Effective (BS)</TableHead>
                                    <TableHead className="font-bold">Historical Rate</TableHead>
                                    <TableHead className="font-bold">Authorized By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="bg-white">
                                {[...selectedHistory].reverse().map((entry, index) => (
                                    <TableRow key={index} className="h-11 border-b transition-colors hover:bg-muted/10">
                                        <TableCell className="pl-6 text-gray-500 font-mono">{toNepaliDate(entry.date)}</TableCell>
                                        <TableCell className="font-black text-gray-900 tabular-nums">Rs. {entry.rate.toLocaleString(undefined, {minimumFractionDigits: 2})}</TableCell>
                                        <TableCell className="font-bold text-primary uppercase text-[10px]">{entry.setBy}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="flex h-60 items-center justify-center text-muted-foreground italic text-sm">
                            No historical rate changes logged.
                        </div>
                    )}
                </ScrollArea>
                <DialogFooter className="p-6 border-t bg-white shrink-0">
                    <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)} className="w-full font-bold uppercase text-[10px]">Close History</Button>
                </DialogFooter>
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
            <TabsList className="mb-4 bg-muted/50 p-1">
                <TabsTrigger value="calculator" className="gap-2 px-6 font-bold text-xs uppercase tracking-widest">Generator</TabsTrigger>
                <TabsTrigger value="history" className="gap-2 px-6 font-bold text-xs uppercase tracking-widest">History</TabsTrigger>
                <TabsTrigger value="rates" className="gap-2 px-6 font-bold text-xs uppercase tracking-widest">Rate Manager</TabsTrigger>
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
