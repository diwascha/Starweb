
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Edit, Trash2, Printer, Save, Image as ImageIcon, Loader2, Search, ArrowUpDown, ChevronsUpDown, Check, Plus, MoreHorizontal } from 'lucide-react';
import { toNepaliDate, toWords, generateNextVoucherNumber } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
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
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { onTdsCalculationsUpdate, addTdsCalculation, getTdsPrefix, deleteTdsCalculation, updateTdsCalculation } from '@/services/tds-service';
import type { TdsCalculation, TdsRate, Party, PartyType } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { onPartiesUpdate, addParty } from '@/services/party-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';


const initialTdsRates: TdsRate[] = [
  { value: '1.5', label: 'Goods & Contracts', description: 'Supply of goods and contracts/sub-contracts (1.5%)' },
  { value: '15', label: 'Services (Individual)', description: 'Payment for services to natural persons (15%)' },
  { value: '10', label: 'Rent', description: 'Payment of rent (10%)' },
  { value: '2.5', label: 'Vehicle Hire', description: 'Payment for vehicle hire to VAT registered person (2.5%)' },
  { value: '5', label: 'Dividends', description: 'Payment of dividend (5%)' },
];

type SortKey = 'date' | 'voucherNo' | 'partyName' | 'taxableAmount' | 'netPayable';
type SortDirection = 'asc' | 'desc';


function TdsVoucherView({ calculation }: { calculation: TdsCalculation }) {
    const totalWithVat = calculation.taxableAmount + calculation.vatAmount;
    return (
        <div className="printable-area space-y-4 p-4 border rounded-lg bg-white text-black">
            <header className="text-center space-y-1 mb-4">
              <h1 className="text-xl font-bold">SHIVAM PACKAGING INDUSTRIES PVT LTD.</h1>
              <p className="text-sm">HETAUDA 08, BAGMATI PROVIENCE, NEPAL</p>
              <h2 className="text-lg font-semibold underline mt-1">TDS VOUCHER</h2>
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
             <div className="mt-8 grid grid-cols-2 gap-8 pt-16 text-xs">
                <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Prepared By</p></div>
                <div className="text-center"><div className="border-t border-black w-36 mx-auto"></div><p className="font-semibold mt-1">Approved By</p></div>
            </div>
        </div>
    );
}


function SavedTdsRecords({ onEdit }: { onEdit: (calculation: TdsCalculation) => void }) {
    const [savedCalculations, setSavedCalculations] = useState<TdsCalculation[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();
    
    const [isVoucherViewOpen, setIsVoucherViewOpen] = useState(false);
    const [selectedRecordForView, setSelectedRecordForView] = useState<TdsCalculation | null>(null);

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
    
    const openVoucherView = (record: TdsCalculation) => {
        setSelectedRecordForView(record);
        setIsVoucherViewOpen(true);
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
           <CardContent>
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date (BS) <ArrowUpDown className="ml-2 h-4 w-4 inline-block" /></Button></TableHead>
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
                       <TableCell>{toNepaliDate(calc.date)}</TableCell>
                       <TableCell>{calc.voucherNo}</TableCell>
                       <TableCell>{calc.partyName}</TableCell>
                       <TableCell>{calc.taxableAmount.toLocaleString()}</TableCell>
                       <TableCell>{calc.tdsAmount.toLocaleString()}</TableCell>
                       <TableCell>{calc.netPayable.toLocaleString()}</TableCell>
                       <TableCell className="text-right">
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4"/></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onSelect={() => openVoucherView(calc)}>
                                    <Printer className="mr-2 h-4 w-4" /> Print / Export
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onEdit(calc)}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This will permanently delete the record.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteCalculation(calc.id)}>Delete</AlertDialogAction>
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
                     <TableCell colSpan={7} className="text-center">
                       No saved TDS calculations yet.
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </CardContent>
         </Card>
          <Dialog open={isVoucherViewOpen} onOpenChange={setIsVoucherViewOpen}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Voucher Preview</DialogTitle>
                    <DialogDescription>Review, print, or export the TDS voucher.</DialogDescription>
                </DialogHeader>
                {selectedRecordForView && <TdsVoucherView calculation={selectedRecordForView} />}
            </DialogContent>
         </Dialog>
        </>
    );
}


function CalculatorTab({ calculationToEdit, onSaveSuccess }: { calculationToEdit: TdsCalculation | null, onSaveSuccess: () => void }) {
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedRateValue, setSelectedRateValue] = useState<string>('1.5');
  const [date, setDate] = useState<Date>(new Date());
  const [partyName, setPartyName] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [includeVat, setIncludeVat] = useState(true);
  
  const [parties, setParties] = useState<Party[]>([]);
  const [tdsRates, setTdsRates] = useState<TdsRate[]>(initialTdsRates);
  
  // Dialog States
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ value: '', label: '', description: '' });
  const [editingRate, setEditingRate] = useState<TdsRate | null>(null);

  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [partyForm, setPartyForm] = useState<{ name: string, type: PartyType, address?: string; panNumber?: string; }>({ name: '', type: 'Vendor', address: '', panNumber: '' });
  const [partySearch, setPartySearch] = useState('');
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);


  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
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

  const calculateTDS = () => {
    if (amount === '' || amount <= 0) {
      return { tds: 0, netAmount: 0, vat: 0, totalWithVat: 0 };
    }
    const rate = parseFloat(selectedRateValue) / 100;
    const vatRate = 0.13;
    
    const taxableAmount = amount;
    const vat = includeVat ? taxableAmount * vatRate : 0;
    const totalWithVat = taxableAmount + vat;
    const tds = taxableAmount * rate;
    const netAmount = totalWithVat - tds;

    return { tds, netAmount, vat, totalWithVat };
  };

  const { tds, netAmount, vat, totalWithVat } = calculateTDS();
  
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
    window.print();
  };

  const handleExport = async (format: 'pdf' | 'jpg') => {
      if (!printRef.current) return;
      setIsExporting(true);

      const canvas = await html2canvas(printRef.current, { scale: 2 });
      
      if (format === 'pdf') {
          const pdf = new jsPDF('p', 'mm', 'a4');
          const imgData = canvas.toDataURL('image/png');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`TDS-Calculation-${voucherNo}.pdf`);
      } else {
          const link = document.createElement('a');
          link.download = `TDS-Calculation-${voucherNo}.jpg`;
          link.href = canvas.toDataURL('image/jpeg');
          link.click();
      }
      setIsExporting(false);
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
            await updateTdsCalculation(calculationToEdit.id, { ...calculation, lastModifiedBy: user.username });
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
    if(!partyForm.name || !partyForm.type) {
        toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
        return;
    }
    try {
        const newPartyId = await addParty({...partyForm, createdBy: user.username});
        setPartyName(partyForm.name);
        toast({title: 'Success', description: 'New party added.'});
        setIsPartyDialogOpen(false);
        setPartyForm({name: '', type: 'Vendor', address: '', panNumber: ''});
    } catch {
         toast({title: 'Error', description: 'Failed to add party.', variant: 'destructive'});
    }
  };
    return (
        <div className="flex flex-col gap-8">
            <header className="print:hidden flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                 <div>
                    <h1 className="text-3xl font-bold tracking-tight">Advanced TDS Calculator</h1>
                    <p className="text-muted-foreground">
                        Quickly calculate Tax Deducted at Source (TDS) for various payment types.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSave}>
                        <Save className="mr-2 h-4 w-4"/>
                        {calculationToEdit ? 'Update Record' : 'Save Record'}
                    </Button>
                    <Button variant="outline" onClick={() => handleExport('pdf')} disabled={isExporting}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Save as PDF
                    </Button>
                    <Button variant="outline" onClick={() => handleExport('jpg')} disabled={isExporting}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ImageIcon className="mr-2 h-4 w-4"/>}
                        Save as Image
                    </Button>
                    <Button onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4"/> Print
                    </Button>
                </div>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <Card className="printable-area" ref={printRef}>
                        <CardHeader>
                            <CardTitle>Calculate TDS</CardTitle>
                            <CardDescription>
                            Enter the payment amount and select the nature of payment to see the detailed calculation.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="voucher-no">Voucher No.</Label>
                                        <Input id="voucher-no" value={voucherNo} readOnly className="bg-muted/50" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="date">Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {date ? `${toNepaliDate(date.toISOString())} BS (${format(date, "PPP")})` : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <DualCalendar selected={date} onSelect={(d) => d && setDate(d)} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="party-name">Party Name</Label>
                                    <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                                        <PopoverTrigger asChild>
                                           <Button variant="outline" role="combobox" className="w-full justify-between">
                                                {partyName || "Select a party..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput 
                                                    placeholder="Search party..." 
                                                    value={partySearch}
                                                    onValueChange={setPartySearch}
                                                />
                                                <CommandList>
                                                <CommandEmpty>
                                                    <Button
                                                        variant="ghost"
                                                        className="w-full justify-start"
                                                        onClick={() => {
                                                            setPartyForm(prev => ({ ...prev, name: partySearch, type: 'Vendor' }));
                                                            setIsPartyPopoverOpen(false);
                                                            setIsPartyDialogOpen(true);
                                                        }}
                                                    >
                                                        <Plus className="mr-2 h-4 w-4" /> Add "{partySearch}"
                                                    </Button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {sortedParties.map((p) => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => {
                                                        setPartyName(p.name);
                                                        setIsPartyPopoverOpen(false);
                                                    }}>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Taxable Amount (NPR)</Label>
                                    <Input
                                    id="amount"
                                    type="number"
                                    placeholder="e.g., 50000"
                                    value={amount}
                                    onChange={handleAmountChange}
                                    className="text-base"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="payment-nature">Nature of Payment</Label>
                                    <Select value={selectedRateValue} onValueChange={setSelectedRateValue}>
                                        <SelectTrigger id="payment-nature">
                                        <SelectValue placeholder="Select payment type..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                        {tdsRates.map(rate => (
                                            <SelectItem key={rate.value} value={rate.value}>{rate.label} ({rate.value}%)</SelectItem>
                                        ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="include-vat" checked={includeVat} onCheckedChange={setIncludeVat} />
                                <Label htmlFor="include-vat">Include VAT (13%) in Calculation</Label>
                            </div>
                            
                            <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Taxable Amount</span>
                                <span className="font-medium">
                                    {Number(amount || 0).toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    })}
                                </span>
                                </div>
                                {includeVat && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">VAT (13%)</span>
                                        <span className="font-medium">
                                            + {vat.toLocaleString('en-IN', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                            })}
                                        </span>
                                    </div>
                                )}
                                <Separator />
                                <div className="flex justify-between items-center font-semibold">
                                <span className="text-muted-foreground">Total with VAT</span>
                                <span>
                                    {totalWithVat.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    })}
                                </span>
                                </div>
                                <div className="flex justify-between items-center text-destructive">
                                <span className="text-muted-foreground">TDS ({selectedRateValue}%)</span>
                                <span className="font-medium">
                                    - {tds.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    })}
                                </span>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center text-lg font-bold">
                                <span>Net Payable Amount</span>
                                <span>
                                    {netAmount.toLocaleString('en-IN', {
                                    style: 'currency',
                                    currency: 'NPR',
                                    minimumFractionDigits: 2,
                                    })}
                                </span>
                                </div>
                                <div className="text-sm text-muted-foreground pt-2">
                                <span className="font-semibold">In Words:</span> {toWords(netAmount)}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1 space-y-6 print:hidden">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Manage TDS Rates</CardTitle>
                            <Button size="icon" variant="outline" onClick={() => handleOpenRateDialog()}>
                                <PlusCircle className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {tdsRates.map(rate => (
                                <div key={rate.value} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                                    <div>
                                        <div className="font-semibold">{rate.label} <Badge variant="outline">{rate.value}%</Badge></div>
                                        <p className="text-xs text-muted-foreground">{rate.description}</p>
                                    </div>
                                    <div className="flex">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenRateDialog(rate)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>This will permanently delete the "{rate.label}" rate.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteRate(rate.value)}>Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <Dialog open={isRateDialogOpen} onOpenChange={setIsRateDialogOpen}>
                <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingRate ? 'Edit TDS Rate' : 'Add New TDS Rate'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                    <Label htmlFor="rate-label">Label</Label>
                    <Input id="rate-label" value={rateForm.label} onChange={(e) => setRateForm({...rateForm, label: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="rate-value">Rate (%)</Label>
                    <Input id="rate-value" type="number" value={rateForm.value} onChange={(e) => setRateForm({...rateForm, value: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="rate-desc">Description</Label>
                    <Input id="rate-desc" value={rateForm.description} onChange={(e) => setRateForm({...rateForm, description: e.target.value})} />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsRateDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSaveRate}>Save Rate</Button>
                </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New Party</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="party-name-dialog">Party Name</Label>
                            <Input id="party-name-dialog" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="party-type-dialog">Party Type</Label>
                            <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                                <SelectTrigger id="party-type-dialog"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vendor">Vendor</SelectItem>
                                    <SelectItem value="Customer">Customer</SelectItem>
                                    <SelectItem value="Both">Both</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-pan-dialog">PAN Number</Label>
                            <Input id="party-pan-dialog" value={partyForm.panNumber || ''} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-address-dialog">Address</Label>
                            <Textarea id="party-address-dialog" value={partyForm.address || ''} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitParty}>Add Party</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .printable-area, .printable-area * {
                        visibility: visible;
                    }
                    .printable-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .print\\:hidden {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
}

export default function TdsCalculatorPage() {
    const [activeTab, setActiveTab] = useState("calculator");
    const [calculationToEdit, setCalculationToEdit] = useState<TdsCalculation | null>(null);

    const handleEdit = (calculation: TdsCalculation) => {
        setCalculationToEdit(calculation);
        setActiveTab("calculator");
    };
    
    const handleSaveSuccess = () => {
        setCalculationToEdit(null);
        setActiveTab("history");
    };

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
                <TabsTrigger value="calculator">TDS Calculator</TabsTrigger>
                <TabsTrigger value="history">Saved Records</TabsTrigger>
            </TabsList>
            <TabsContent value="calculator">
                <CalculatorTab calculationToEdit={calculationToEdit} onSaveSuccess={handleSaveSuccess} />
            </TabsContent>
            <TabsContent value="history">
                <SavedTdsRecords onEdit={handleEdit} />
            </TabsContent>
        </Tabs>
    );
}

