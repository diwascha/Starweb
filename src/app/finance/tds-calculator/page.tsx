'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Edit, Trash2, Printer, Save, Image as ImageIcon, Loader2, Search, ArrowUpDown, ChevronsUpDown, Check, Plus, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { toNepaliDate, toWords, generateNextVoucherNumber, cn } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format as formatDate, format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader as AlertDialogHead,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onTdsCalculationsUpdate, addTdsCalculation, getTdsPrefix, deleteTdsCalculation, updateTdsCalculation } from '@/services/tds-service';
import type { TdsCalculation, TdsRate, Party, PartyType, CompanyProfile, AccountOwnership } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { onSettingUpdate } from '@/services/settings-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const DEFAULT_COMPANY_PROFILE_LOCAL: CompanyProfile = {
  nameEn: "GENERIC ENTERPRISE PVT LTD.",
  nameNp: "जेनेरिक इन्टरप्राइज प्रा.लि.",
  address: "ADDRESS NOT CONFIGURED",
  phone: "N/A",
  email: "N/A",
  pan: "N/A"
};

const INITIAL_TDS_RATES: TdsRate[] = [
  { value: '1.5', label: 'Goods & Contracts', description: 'Supply of goods and contracts/sub-contracts (1.5%)' },
  { value: '15', label: 'Services (Individual)', description: 'Payment for services to natural persons (15%)' },
  { value: '10', label: 'Rent', description: 'Payment of rent (10%)' },
  { value: '2.5', label: 'Vehicle Hire', description: 'Payment for vehicle hire to VAT registered person (2.5%)' },
  { value: '5', label: 'Dividends', description: 'Payment of dividend (5%)' },
];

type SortKey = 'date' | 'voucherNo' | 'partyName' | 'taxableAmount' | 'netPayable';
type SortDirection = 'asc' | 'desc';


function TdsVoucherView({ calculation, companyProfile }: { calculation: TdsCalculation, companyProfile: CompanyProfile }) {
    const totalWithVat = calculation.taxableAmount + calculation.vatAmount;
    return (
        <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
            <header className="text-center space-y-1 mb-4">
              <h1 className="text-xl font-bold uppercase">{companyProfile.nameEn}</h1>
              <p className="text-sm">{companyProfile.address}</p>
              <h2 className="text-lg font-semibold underline mt-1">TDS ESTIMATE VOUCHER</h2>
            </header>
            <div className="grid grid-cols-2 text-xs mb-2 gap-x-4">
                <div><span className="font-semibold">Voucher No:</span> {calculation.voucherNo}</div>
                <div className="text-right"><span className="font-semibold">Date:</span> {toNepaliDate(calculation.date)} ({format(new Date(calculation.date), 'yyyy-MM-dd')})</div>
                <div><span className="font-semibold">Party Name:</span> {calculation.partyName}</div>
            </div>
            <Separator className="my-2 bg-gray-300"/>
            <div className="space-y-2 text-sm p-4">
                <div className="flex justify-between items-center text-sm">
                    <span>Taxable Amount</span><span className="font-medium">{calculation.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {calculation.vatAmount > 0 && (
                    <div className="flex justify-between items-center text-sm"><span>VAT (13%)</span><span>+ {calculation.vatAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                )}
                <Separator />
                <div className="flex justify-between items-center font-semibold"><span>Total with VAT</span><span>{totalWithVat.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between items-center text-destructive"><span>TDS ({calculation.tdsRate}%)</span><span>- {calculation.tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <Separator />
                <div className="flex justify-between items-center text-lg font-bold"><span>Net Payable Amount</span><span>{calculation.netPayable.toLocaleString('en-IN', { style: 'currency', currency: 'NPR' })}</span></div>
            </div>
             <div className="text-sm">
                <span className="font-semibold">In Words:</span> {toWords(calculation.netPayable)}
            </div>
             <div className="mt-16 text-center text-xs text-gray-500">
                <p className="font-bold">Disclaimer:</p>
                <p>This is a computer-generated voucher and does not require a signature.</p>
            </div>
        </div>
    );
}


function SavedTdsRecords({ onEdit, companyProfile }: { onEdit: (calculation: TdsCalculation) => void, companyProfile: CompanyProfile }) {
    const [savedCalculations, setSavedCalculations] = useState<TdsCalculation[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    const [isVoucherViewOpen, setIsVoucherViewOpen] = useState(false);
    const [selectedRecordForView, setSelectedRecordForView] = useState<TdsCalculation | null>(null);

    const [isExporting, setIsExporting] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const unsub = onTdsCalculationsUpdate(setSavedCalculations);
        return () => unsub();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, itemsPerPage]);

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
            const aVal = a[sortConfig.key] ?? '';
            const bVal = b[sortConfig.key] ?? '';

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [savedCalculations, searchQuery, sortConfig]);

    const paginatedCalculations = useMemo(() => {
        if (itemsPerPage === -1) return sortedAndFilteredCalculations;
        const start = (currentPage - 1) * itemsPerPage;
        return sortedAndFilteredCalculations.slice(start, start + itemsPerPage);
    }, [sortedAndFilteredCalculations, currentPage, itemsPerPage]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === -1) return 1;
        return Math.ceil(sortedAndFilteredCalculations.length / itemsPerPage);
    }, [sortedAndFilteredCalculations, itemsPerPage]);

    const handleDeleteCalculation = async (id: string) => {
        try {
            await deleteTdsCalculation(id);
            toast({ title: "Deleted", description: "TDS record has been deleted." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete record.", variant: "destructive" });
        }
    };
    
    const openVoucherView = (record: TdsCalculation) => {
        setSelectedRecordForView(record);
        setIsVoucherViewOpen(true);
    };

    const handlePrint = () => {
        if (!printRef.current) return;
        
        const printWindow = window.open('', '', 'height=800,width=800');
        printWindow?.document.write('<html><head><title>Print Voucher</title>');
        printWindow?.document.write('<style>@media print{@page{size: A5;margin:0;}body{margin: 1cm;}}</style>');
        printWindow?.document.write('</head><body>');
        printWindow?.document.write(printRef.current.innerHTML);
        printWindow?.document.write('</body></html>');
        printWindow?.document.close();
        printWindow?.focus();
        setTimeout(() => {
            printWindow?.print();
            printWindow?.close();
        }, 250);
    };

    const handleExportPdf = async () => {
        if (!selectedRecordForView) return;
        setIsExporting(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a5');
            const { voucherNo, date, partyName, taxableAmount, vatAmount, tdsRate, tdsAmount, netPayable } = selectedRecordForView;
            
            // Header
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(companyProfile.nameEn, doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });
            
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(companyProfile.address, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(10);
            doc.text('TDS ESTIMATE VOUCHER', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
            
            // Info
            doc.setFontSize(8);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Voucher No: ${voucherNo || 'N/A'}`, 10, 30);
            doc.text(`Date: ${toNepaliDate(date)} (${format(new Date(date), 'yyyy-MM-dd')})`, doc.internal.pageSize.getWidth() - 10, 30, { align: 'right' });
            doc.text(`Party Name: ${partyName || 'N/A'}`, 10, 35);
            doc.line(10, 38, doc.internal.pageSize.getWidth() - 10, 38);

            // Body
            let y = 45;
            const line = (label: string, value: string, style: 'normal' | 'bold' | 'destructive' = 'normal') => {
                if (style === 'bold') doc.setFont('Helvetica', 'bold');
                if (style === 'destructive') doc.setTextColor(220, 53, 69);
                
                doc.text(label, 15, y);
                doc.text(value, doc.internal.pageSize.getWidth() - 15, y, { align: 'right' });
                y += 7;

                // Reset styles
                doc.setFont('Helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
            };
            
            line('Taxable Amount', taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
            if (vatAmount > 0) line('VAT (13%)', `+ ${vatAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
            
            doc.line(15, y - 4, doc.internal.pageSize.getWidth() - 15, y - 4);
            
            line('Total with VAT', (taxableAmount + vatAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 'bold');
            line(`TDS (${tdsRate}%)`, `- ${tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'destructive');
            
            doc.line(15, y - 4, doc.internal.pageSize.getWidth() - 15, y - 4);
            y += 2;
            doc.setFontSize(10);
            line('Net Payable Amount', `NPR ${netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'bold');
            doc.setFontSize(8);
            y += 5;
            doc.text(`In Words: ${toWords(netPayable)}`, 10, y);
            
            // Footer
            y = doc.internal.pageSize.getHeight() - 20;
            doc.setFontSize(7);
            doc.setFont('Helvetica', 'bold');
            doc.text('Disclaimer:', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
            doc.setFont('Helvetica', 'normal');
            y += 4;
            doc.text('This is a computer-generated voucher and does not require a signature.', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

            doc.save(`TDS-Voucher-${selectedRecordForView.voucherNo}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
            toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportJpg = async () => {
        if (!printRef.current || !selectedRecordForView) return;
        setIsExporting(true);

        try {
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `TDS-Voucher-${selectedRecordForView.voucherNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            console.error(`Failed to export as JPG`, error);
            toast({ title: 'Export Failed', description: `Could not export voucher as JPG.`, variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };


    return (
        <>
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
           <CardContent className="p-0">
             <Table>
               <TableHeader className="bg-muted/50">
                 <TableRow className="hover:bg-transparent">
                   <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="text-xs">Date (BS) <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('voucherNo')} className="text-xs">Voucher # <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="text-xs">Party Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('taxableAmount')} className="text-xs">Taxable Amount <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead className="text-xs">TDS Amount</TableHead>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('netPayable')} className="text-xs">Net Payable <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                   <TableHead className="text-right pr-6 text-xs">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {paginatedCalculations.length > 0 ? (
                    paginatedCalculations.map(calc => (
                     <TableRow key={calc.id} className="h-14">
                       <TableCell>{toNepaliDate(calc.date)}</TableCell>
                       <TableCell className="font-mono text-xs">{calc.voucherNo}</TableCell>
                       <TableCell>{calc.partyName}</TableCell>
                       <TableCell className="font-mono text-xs">{calc.taxableAmount.toLocaleString()}</TableCell>
                       <TableCell className="font-mono text-xs text-red-600">{calc.tdsAmount.toLocaleString()}</TableCell>
                       <TableCell className="font-mono text-xs font-black">Rs. {calc.netPayable.toLocaleString()}</TableCell>
                       <TableCell className="text-right pr-6">
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onSelect={() => openVoucherView(calc)}>
                                    <Printer className="mr-2 h-4 w-4" /> Print / Export
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onEdit(calc)}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Record
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete this TDS calculation record. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteCalculation(calc.id)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                                </AlertDialog>
                            </DropdownMenuContent>
                         </DropdownMenu>
                       </TableCell>
                     </TableRow>
                   ))
                 ) : (
                   <TableRow>
                     <TableCell colSpan={7} className="text-center py-10 text-muted-foreground italic">
                       No saved TDS calculations matching your search.
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </CardContent>
           {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{sortedAndFilteredCalculations.length}</span> records</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, sortedAndFilteredCalculations.length)}</span> of <span className="font-bold text-foreground">{sortedAndFilteredCalculations.length}</span> records
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
          <Dialog open={isVoucherViewOpen} onOpenChange={setIsVoucherViewOpen}>
            <DialogContent className="max-w-xl h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                    <DialogTitle>Voucher Preview</DialogTitle>
                    <DialogDescription>Review, print, or export the TDS voucher.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="flex-1 bg-gray-100 p-8">
                    <div ref={printRef} className="mx-auto w-[148mm] shadow-2xl bg-white">
                      {selectedRecordForView && <TdsVoucherView calculation={selectedRecordForView} companyProfile={companyProfile} />}
                    </div>
                    <ScrollBar orientation="vertical" />
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
                 <DialogFooter className="p-6 border-t bg-white shrink-0">
                    <div className="flex w-full justify-between items-center">
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleExportJpg()} disabled={isExporting} className="h-9 px-4">
                                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                                Image
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleExportPdf()} disabled={isExporting} className="h-9 px-4">
                                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                PDF
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setIsVoucherViewOpen(false)} className="h-9 px-4 uppercase font-bold text-[10px]">Close</Button>
                            <Button onClick={handlePrint} className="h-9 px-8 font-black uppercase text-[10px]"><Printer className="mr-2 h-4 w-4" /> Print</Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
         </Dialog>
        </>
    );
}


function CalculatorTab({ calculationToEdit, onSaveSuccess, onCancelEdit, companyProfile }: { calculationToEdit: TdsCalculation | null, onSaveSuccess: () => void, onCancelEdit: () => void, companyProfile: CompanyProfile }) {
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedRateValue, setSelectedRateValue] = useState<string>('1.5');
  const [date, setDate] = useState<Date>(new Date());
  const [partyName, setPartyName] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [includeVat, setIncludeVat] = useState(true);
  
  const [parties, setParties] = useState<Party[]>([]);
  const [tdsRates, setTdsRates] = useState<TdsRate[]>(INITIAL_TDS_RATES);
  
  // Dialog States
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ value: '', label: '', description: '' });
  const [editingRate, setEditingRate] = useState<TdsRate | null>(null);

  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, ownership: AccountOwnership, address?: string; panNumber?: string; }>({ name: '', type: 'Vendor', ownership: 'Both', address: '', panNumber: '' });
  const [partySearch, setPartySearch] = useState('');
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  useEffect(() => {
    const setNextVoucher = async () => {
        const prefix = await getTdsPrefix();
        const unsub = onTdsCalculationsUpdate(async (calcs) => {
             if (!calculationToEdit) {
                const nextNumber = await generateNextVoucherNumber(calcs, prefix);
                setVoucherNo(nextNumber);
             }
        });
        
        const unsubParties = onPartiesUpdate(setParties);

        return () => {
            unsub();
            unsubParties();
        };
    };
    setNextVoucher();
  }, [calculationToEdit]);

  useEffect(() => {
    if (calculationToEdit) {
        setVoucherNo(calculationToEdit.voucherNo);
        setDate(new Date(calculationToEdit.date));
        setPartyName(calculationToEdit.partyName || '');
        setAmount(calculationToEdit.taxableAmount);
        setSelectedRateValue(String(calculationToEdit.tdsRate));
        setIncludeVat(calculationToEdit.vatAmount > 0);
    }
  }, [calculationToEdit]);

  const sortedParties = useMemo(() => parties.sort((a, b) => a.name.localeCompare(b.name)), [parties]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value === '' ? '' : parseFloat(e.target.value));
  };
  
  const selectedRateInfo = tdsRates.find(r => r.value === selectedRateValue);

  const { tds, netAmount, vat, totalWithVat, calculationData } = useMemo(() => {
    if (amount === '' || amount <= 0) {
      return { tds: 0, netAmount: 0, vat: 0, totalWithVat: 0, calculationData: null };
    }
    const rate = parseFloat(selectedRateValue) / 100;
    const vatRate = 0.13;
    
    const taxableAmount = amount;
    const vatCalc = includeVat ? taxableAmount * vatRate : 0;
    const totalWithVatCalc = taxableAmount + vatCalc;
    const tdsCalc = taxableAmount * rate;
    const netAmountCalc = totalWithVatCalc - tdsCalc;
    
    const data: TdsCalculation = {
        id: calculationToEdit?.id || '',
        voucherNo: voucherNo,
        date: date.toISOString(),
        partyName: partyName,
        taxableAmount: taxableAmount,
        tdsRate: parseFloat(selectedRateValue),
        tdsAmount: tdsCalc,
        vatAmount: vatCalc,
        netPayable: netAmountCalc,
        createdBy: user?.username || '',
        createdAt: calculationToEdit?.createdAt || new Date().toISOString(),
    }

    return { tds: tdsCalc, netAmount: netAmountCalc, vat: vatCalc, totalWithVat: totalWithVatCalc, calculationData: data };
  }, [amount, selectedRateValue, includeVat, voucherNo, date, partyName, calculationToEdit, user]);

  
  const handleOpenRateDialog = (rate: TdsRate | null = null) => {
    if (rate) {
        setEditingRate(rate);
        setRateForm(rate);
    } else {
        setEditingRate(null);
        setRateForm({ value: '', label: '', description: '' });
    }
    setIsRateDialogOpen(true);
  };
  
  const handleSaveRate = () => {
      if (!rateForm.value || !rateForm.label) {
          return;
      }
      if (editingRate) {
          setTdsRates(rates => rates.map(r => r.value === editingRate.value ? rateForm : r));
      } else {
          setTdsRates(rates => [...rates, rateForm]);
      }
      setIsRateDialogOpen(false);
  };
  
  const handleDeleteRate = (value: string) => {
      setTdsRates(rates => rates.filter(r => r.value !== value));
      if (selectedRateValue === value) {
          setSelectedRateValue(tdsRates[0]?.value || '');
      }
  };

  const handlePrint = () => {
    if (calculationData) {
      setIsPreviewOpen(true);
    }
  };

  const handleExport = async (formatType: 'pdf' | 'jpg') => {
      if (!calculationData) return;
      setIsExporting(true);

      if (formatType === 'pdf') {
          try {
            const doc = new jsPDF('p', 'mm', 'a5');
            const { voucherNo, date, partyName, taxableAmount, vatAmount, tdsRate, tdsAmount, netPayable } = calculationData;
            
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(12);
            doc.text(companyProfile.nameEn, doc.internal.pageSize.getWidth() / 2, 10, { align: 'center' });
            doc.setFont('Helvetica', 'normal'); doc.setFontSize(8);
            doc.text(companyProfile.address, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            doc.setFont('Helvetica', 'bold'); doc.setFontSize(10);
            doc.text('TDS ESTIMATE VOUCHER', doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
            doc.setFontSize(8); doc.setFont('Helvetica', 'normal');
            doc.text(`Voucher No: ${voucherNo || 'N/A'}`, 10, 30);
            doc.text(`Date: ${toNepaliDate(date)} (${format(new Date(date), 'yyyy-MM-dd')})`, doc.internal.pageSize.getWidth() - 10, 30, { align: 'right' });
            doc.text(`Party Name: ${partyName || 'N/A'}`, 10, 35);
            doc.line(10, 38, doc.internal.pageSize.getWidth() - 10, 38);

            let y = 45;
            const line = (label: string, value: string, style: 'normal' | 'bold' | 'destructive' = 'normal') => {
                if (style === 'bold') doc.setFont('Helvetica', 'bold');
                if (style === 'destructive') doc.setTextColor(220, 53, 69);
                doc.text(label, 15, y); doc.text(value, doc.internal.pageSize.getWidth() - 15, y, { align: 'right' });
                y += 7;
                doc.setFont('Helvetica', 'normal'); doc.setTextColor(0, 0, 0);
            };
            line('Taxable Amount', taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
            if (vatAmount > 0) line('VAT (13%)', `+ ${vatAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
            doc.line(15, y - 4, doc.internal.pageSize.getWidth() - 15, y - 4);
            line('Total with VAT', (taxableAmount + vatAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 'bold');
            line(`TDS (${tdsRate}%)`, `- ${tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'destructive');
            doc.line(15, y - 4, doc.internal.pageSize.getWidth() - 15, y - 4); y += 2;
            doc.setFontSize(10);
            line('Net Payable Amount', `NPR ${netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'bold');
            doc.setFontSize(8); y += 5;
            doc.text(`In Words: ${toWords(netPayable)}`, 10, y);
            y = doc.internal.pageSize.getHeight() - 20;
            doc.setFontSize(7); doc.setFont('Helvetica', 'bold');
            doc.text('Disclaimer:', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
            doc.setFont('Helvetica', 'normal'); y += 4;
            doc.text('This is a computer-generated voucher and does not require a signature.', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
            doc.save(`TDS-Voucher-${voucherNo}.pdf`);
          } catch (error) { console.error('PDF export failed:', error); toast({ title: 'Error', description: 'Failed to export PDF.', variant: 'destructive' }); } 
          finally { setIsExporting(false); }
      } else { // JPG
          if (!printRef.current) { setIsExporting(false); return; }
           try {
            const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `TDS-Voucher-${calculationData.voucherNo}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) { console.error('JPG export failed:', error); toast({ title: 'Export Failed', description: `Could not export voucher as JPG.`, variant: 'destructive' }); }
        finally { setIsExporting(false); }
      }
  };
  
  const resetForm = async () => {
    setAmount('');
    setPartyName('');
    setDate(new Date());
    setSelectedRateValue('1.5');
    const prefix = await getTdsPrefix();
    onTdsCalculationsUpdate(async (calcs) => {
        const nextNumber = await generateNextVoucherNumber(calcs, prefix);
        setVoucherNo(nextNumber);
    })();
  };

  const handleSave = async () => {
    if (!user) {
        toast({ title: "Authentication Error", description: "You must be logged in to save.", variant: "destructive" });
        return;
    }
    if (!amount || amount <= 0) {
        toast({ title: "Invalid Amount", description: "Please enter a valid taxable amount.", variant: "destructive" });
        return;
    }

    const calculation = {
        voucherNo: voucherNo,
        date: date.toISOString(),
        partyName: partyName,
        taxableAmount: amount,
        tdsRate: parseFloat(selectedRateValue),
        tdsAmount: tds,
        vatAmount: vat,
        netPayable: netAmount,
    };
    
    try {
        if (calculationToEdit) {
            await updateTdsCalculation(calculationToEdit.id, { ...calculation });
            toast({ title: "Updated!", description: "TDS calculation has been updated." });
        } else {
            await addTdsCalculation({ ...calculation, createdBy: user.username });
            toast({ title: "Saved!", description: "TDS calculation has been saved." });
        }
        resetForm();
        onSaveSuccess();
    } catch (error) {
        toast({ title: "Error", description: "Failed to save calculation.", variant: "destructive" });
    }
  };

  const handleSubmitParty = async () => {
    if(!user) return;
    if(!partyForm.name || !partyForm.type || !partyForm.ownership) {
        toast({title: 'Error', description: 'Name, Type, and Ownership are mandatory.', variant: 'destructive'});
        return;
    }
    try {
        await addParty({...partyForm, createdBy: user.username });
        setPartyName(partyForm.name);
        toast({title: 'Success', description: 'New party added.'});
        setIsPartyDialogOpen(false);
        setPartyForm({name: '', type: 'Vendor', ownership: 'Both', address: '', panNumber: ''});
    } catch {
         toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
    }
  };

  const doActualPrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow?.document.write('<html><head><title>Print Voucher</title>');
    printWindow?.document.write('<style>@media print{@page{size: A5;margin:0;}body{margin: 1cm;}}</style>');
    printWindow?.document.write('</head><body>');
    printWindow?.document.write(printRef.current.innerHTML);
    printWindow?.document.write('</body></html>');
    printWindow?.document.close();
    printWindow?.focus();
    setTimeout(() => {
        printWindow?.print();
        printWindow?.close();
    }, 250);
  };

    return (
        <div className="flex flex-col gap-8">
            <header className="print:hidden flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                 <div>
                    <h1 className="text-3xl font-bold tracking-tight">Advanced TDS Calculator</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Quickly calculate Tax Deducted at Source (TDS) for various payment types.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSave} className="h-10 px-6 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                        <Save className="mr-2 h-4 w-4"/>
                        {calculationToEdit ? 'Update Record' : 'Commit Entry'}
                    </Button>
                    <Button onClick={handlePrint} disabled={!calculationData} variant="outline" className="h-10 px-6 font-bold text-xs uppercase tracking-widest border-gray-300">
                        <Printer className="mr-2 h-4 w-4" /> Preview
                    </Button>
                    {calculationToEdit && (
                        <Button variant="ghost" onClick={onCancelEdit} className="h-10 text-xs font-bold uppercase tracking-widest text-muted-foreground">Cancel</Button>
                    )}
                </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <Card className="shadow-sm border-gray-100">
                        <CardHeader className="bg-muted/30 border-b">
                            <CardTitle className="text-sm font-black uppercase text-gray-900">Computation Input</CardTitle>
                            <CardDescription className="text-xs uppercase font-bold text-muted-foreground tracking-tight">Enter details to see the detailed breakdown.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8 p-6">
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Voucher No.</Label>
                                        <Input id="voucher-no" value={voucherNo} readOnly className="bg-muted/50 h-10 font-mono text-sm border-none shadow-inner" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Posting Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className="w-full justify-start text-left font-normal h-10 bg-white border-gray-300 shadow-sm">
                                                <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                                                {date ? `${toNepaliDate(date.toISOString())} BS (${format(date, "PP")})` : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <DualCalendar selected={date} onSelect={(d) => d && setDate(d)} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Beneficiary Name</Label>
                                    <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                           <Button variant="outline" role="combobox" className="w-full justify-between h-10 bg-white border-gray-300 shadow-sm">
                                                {partyName || "Select or type beneficiary..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-30" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput 
                                                    placeholder="Search beneficiary registry..." 
                                                    value={partySearch}
                                                    onValueChange={setPartySearch}
                                                />
                                                <CommandList>
                                                <CommandEmpty>
                                                    <Button
                                                        variant="ghost"
                                                        className="w-full justify-start text-xs text-primary font-bold"
                                                        onClick={() => {
                                                            setPartyForm(prev => ({ ...prev, name: partySearch, type: 'Vendor', ownership: 'Both' }));
                                                            setIsPartyPopoverOpen(false);
                                                            setIsPartyDialogOpen(true);
                                                        }}
                                                    >
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                                    </Button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {sortedParties.map((p) => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => {
                                                        setPartyName(p.name);
                                                        setIsPartyPopoverOpen(false);
                                                    }} className="text-xs">
                                                        <Check className={cn("mr-2 h-4 w-4", partyName === p.name ? "opacity-100" : "opacity-0")}/>
                                                        {p.name}
                                                    </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end border-t pt-6">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Taxable Base Amount (NPR)</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-blue-400">रु</span>
                                        <Input
                                            id="amount"
                                            type="number"
                                            placeholder="0.00"
                                            value={amount}
                                            onChange={handleAmountChange}
                                            className="pl-10 h-11 text-lg font-black border-gray-300 focus-visible:ring-primary shadow-sm"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Nature of Payment / Rate</Label>
                                    <Select value={selectedRateValue} onValueChange={setSelectedRateValue}>
                                        <SelectTrigger id="payment-nature" className="h-11 bg-white border-gray-300 font-bold shadow-sm">
                                            <SelectValue placeholder="Select classification..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                        {tdsRates.map(rate => (
                                            <SelectItem key={rate.value} value={rate.value} className="text-xs">{rate.label} ({rate.value}%)</SelectItem>
                                        ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3 p-4 rounded-xl bg-muted/20 border border-gray-200">
                                <Switch id="include-vat" checked={includeVat} onCheckedChange={setIncludeVat} />
                                <Label htmlFor="include-vat" className="text-xs font-bold uppercase text-gray-700 cursor-pointer">Include Standard VAT (13%) in Estimate</Label>
                            </div>
                            
                            <div className="space-y-4 rounded-2xl border-2 border-primary/20 bg-primary/[0.02] p-6 shadow-inner animate-in fade-in zoom-in-95">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-muted-foreground uppercase font-black tracking-widest">Base Taxable</span>
                                    <span className="font-bold tabular-nums">
                                        {Number(amount || 0).toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                {includeVat && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground uppercase font-black tracking-widest">Estimated VAT (13%)</span>
                                        <span className="font-bold tabular-nums text-blue-600">
                                            + {vat.toLocaleString('en-IN', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                            })}
                                        </span>
                                    </div>
                                )}
                                <Separator className="bg-primary/10" />
                                <div className="flex justify-between items-center font-bold text-xs">
                                    <span className="text-muted-foreground uppercase font-black tracking-widest">Gross Calculation</span>
                                    <span className="tabular-nums">
                                        {totalWithVat.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-destructive uppercase font-black tracking-widest">TDS WITHHOLDING ({selectedRateValue}%)</span>
                                    <span className="font-black tabular-nums text-red-600">
                                        - {tds.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <Separator className="h-0.5 bg-primary/20" />
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-black uppercase tracking-[0.2em] text-gray-900">Net Payable Amount</span>
                                    <span className="text-2xl font-black text-gray-900 tabular-nums">
                                        {netAmount.toLocaleString('en-IN', {
                                        style: 'currency',
                                        currency: 'NPR',
                                        minimumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground pt-2 italic font-medium border-t border-dashed border-primary/10">
                                    <span className="font-black uppercase not-italic mr-2">In Words:</span> {toWords(netAmount)}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1 space-y-6 print:hidden">
                    <Card className="shadow-sm border-gray-100 h-fit">
                        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/10">
                            <CardTitle className="text-xs uppercase font-black">Standard Rates</CardTitle>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => handleOpenRateDialog()}>
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[400px]">
                                <div className="divide-y">
                                    {tdsRates.map(rate => (
                                        <div key={rate.value} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                            <div className="space-y-0.5">
                                                <div className="font-black text-xs text-gray-900 flex items-center gap-2">
                                                    {rate.label} 
                                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-black uppercase text-blue-700 bg-blue-50 border-blue-100">{rate.value}%</Badge>
                                                </div>
                                                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">{rate.description}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleOpenRateDialog(rate)}>
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete Rate Definition?</AlertDialogTitle>
                                                            <AlertDialogDescription>Remove "{rate.label}" from standard rate picklist?</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteRate(rate.value)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase">{editingRate ? 'Modify Rate' : 'New Rate Definition'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-5 py-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Rate Label</Label>
                        <Input value={rateForm.label} onChange={(e) => setRateForm({...rateForm, label: e.target.value})} placeholder="e.g. Rent" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Percentage (%)</Label>
                            <Input type="number" step="0.1" value={rateForm.value} onChange={(e) => setRateForm({...rateForm, value: e.target.value})} placeholder="1.5" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Description</Label>
                        <Input value={rateForm.description} onChange={(e) => setRateForm({...rateForm, description: e.target.value})} placeholder="Short policy description" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsRateDialogOpen(false)} className="h-10 uppercase font-bold text-xs">Cancel</Button>
                    <Button onClick={handleSaveRate} className="h-10 px-8 font-black uppercase text-xs">Commit Rate</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">New Beneficiary</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-5 py-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Entity Name</Label>
                            <Input value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} className="h-10 font-bold" />
                        </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Beneficiary Type</Label>
                                <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                                    <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Vendor">Vendor / Agency</SelectItem>
                                        <SelectItem value="Customer">Customer</SelectItem>
                                        <SelectItem value="Both">Both</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Module Ownership</Label>
                                <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm(p => ({...p, ownership: v}))}>
                                    <SelectTrigger className="h-10"><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Sijan">Sijan Dhuwani</SelectItem>
                                        <SelectItem value="Shivam">Shivam Packaging</SelectItem>
                                        <SelectItem value="Both">General Ledger</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">PAN/VAT Number</Label>
                            <Input value={partyForm.panNumber || ''} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} className="h-10 font-mono" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)} className="h-11 px-8 font-bold uppercase text-[10px]">Cancel</Button>
                        <Button onClick={handleSubmitParty} className="h-11 px-8 font-black uppercase text-[10px] shadow-lg shadow-primary/20">Onboard Partner</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-xl h-[95vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
                    <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
                        <DialogTitle className="text-xl font-black uppercase">Document Preview</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="flex-1 bg-gray-100 p-8">
                        <div ref={printRef} className="mx-auto w-[148mm] shadow-2xl bg-white">
                            {calculationData && <TdsVoucherView calculation={calculationData} companyProfile={companyProfile} />}
                        </div>
                        <ScrollBar orientation="vertical" />
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-white shrink-0">
                        <div className="flex w-full justify-between items-center">
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleExport('jpg')} disabled={isExporting} className="h-10 px-4">
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                                    Export Image
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={isExporting} className="h-10 px-4">
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                    Save PDF
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="h-10 px-6 uppercase font-bold text-[10px]">Close</Button>
                                <Button onClick={doActualPrint} className="h-10 px-10 font-black uppercase text-[10px] shadow-lg shadow-primary/20"><Printer className="mr-2 h-4 w-4" /> Print Voucher</Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function TdsCalculatorPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [calculationToEdit, setCalculationToEdit] = useState<TdsCalculation | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE_LOCAL);

    useEffect(() => {
        const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE_LOCAL));
        return () => unsub();
    }, []);

    const handleEdit = (calculation: TdsCalculation) => {
        setCalculationToEdit(calculation);
        setActiveTab("calculator");
    };
    
    const handleSaveSuccess = () => {
        setCalculationToEdit(null);
        setActiveTab("history");
    };
    
    const handleCancelEdit = () => {
        setCalculationToEdit(null);
    };

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 bg-muted/50 p-1">
                <TabsTrigger value="calculator" className="gap-2 px-8 font-bold text-xs uppercase tracking-widest">Calculator</TabsTrigger>
                <TabsTrigger value="history" className="gap-2 px-8 font-bold text-xs uppercase tracking-widest">Registry Log</TabsTrigger>
            </TabsList>
            <TabsContent value="calculator" className="mt-6">
                <CalculatorTab 
                    calculationToEdit={calculationToEdit} 
                    onSaveSuccess={handleSaveSuccess}
                    onCancelEdit={handleCancelEdit}
                    companyProfile={companyProfile}
                />
            </TabsContent>
            <TabsContent value="history" className="mt-6">
                <SavedTdsRecords onEdit={handleEdit} companyProfile={companyProfile} />
            </TabsContent>
        </Tabs>
    );
}
