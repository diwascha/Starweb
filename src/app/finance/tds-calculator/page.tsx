
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
import { CalendarIcon, PlusCircle, Edit, Trash2, Printer, Save, Image as ImageIcon, Loader2, Search, ArrowUpDown, ChevronsUpDown, Check } from 'lucide-react';
import { toNepaliDate, toWords, generateNextVoucherNumber } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { onTdsCalculationsUpdate, addTdsCalculation, getTdsPrefix, deleteTdsCalculation } from '@/services/tds-service';
import type { TdsCalculation, TdsRate, Party } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { onPartiesUpdate } from '@/services/party-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';


const initialTdsRates: TdsRate[] = [
  { value: '1.5', label: 'Goods & Contracts', description: 'Supply of goods and contracts/sub-contracts (1.5%)' },
  { value: '15', label: 'Services (Individual)', description: 'Payment for services to natural persons (15%)' },
  { value: '10', label: 'Rent', description: 'Payment of rent (10%)' },
  { value: '2.5', label: 'Vehicle Hire', description: 'Payment for vehicle hire to VAT registered person (2.5%)' },
  { value: '5', label: 'Dividends', description: 'Payment of dividend (5%)' },
];

type SortKey = 'date' | 'voucherNo' | 'partyName' | 'taxableAmount' | 'netPayable';
type SortDirection = 'asc' | 'desc';


function SavedTdsRecords() {
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
    );
}


function CalculatorTab() {
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedRateValue, setSelectedRateValue] = useState<string>('1.5');
  const [date, setDate] = useState<Date>(new Date());
  const [partyName, setPartyName] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  
  const [parties, setParties] = useState<Party[]>([]);
  const [tdsRates, setTdsRates] = useState<TdsRate[]>(initialTdsRates);
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TdsRate | null>(null);
  const [rateForm, setRateForm] = useState({ value: '', label: '', description: '' });

  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  useEffect(() => {
    const setNextVoucher = async () => {
        const prefix = await getTdsPrefix();
        const unsub = onTdsCalculationsUpdate(async (calcs) => {
             if (!partyName && amount === '') {
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
  }, [partyName, amount]);


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
    const vat = taxableAmount * vatRate;
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

    const calculation: Omit<TdsCalculation, 'id' | 'createdAt'> = {
        voucherNo: voucherNo,
        date: date.toISOString(),
        partyName: partyName,
        taxableAmount: amount,
        tdsRate: parseFloat(selectedRateValue),
        tdsAmount: tds,
        vatAmount: vat,
        netPayable: netAmount,
        createdBy: user.username,
    };
    
    try {
        await addTdsCalculation(calculation);
        toast({ title: "Saved!", description: "TDS calculation has been saved." });
        resetForm();
    } catch (error) {
        toast({ title: "Error", description: "Failed to save calculation.", variant: "destructive" });
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
                        Save
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
                <div className="lg:col-span-2" ref={printRef}>
                    <Card className="printable-area">
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
                                    <Popover>
                                        <PopoverTrigger asChild>
                                           <Button variant="outline" role="combobox" className="w-full justify-between">
                                                {partyName || "Select a party..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                            <Command>
                                                <CommandInput placeholder="Search party..." />
                                                <CommandList>
                                                <CommandEmpty>No party found.</CommandEmpty>
                                                <CommandGroup>
                                                    {parties.map((p) => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => setPartyName(p.name)}>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">VAT (13%)</span>
                                <span className="font-medium">
                                    + {vat.toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    })}
                                </span>
                                </div>
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
                                        <p className="font-semibold">{rate.label} <Badge variant="outline">{rate.value}%</Badge></p>
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
    return (
        <Tabs defaultValue="calculator">
            <TabsList className="mb-4">
                <TabsTrigger value="calculator">TDS Calculator</TabsTrigger>
                <TabsTrigger value="history">Saved Records</TabsTrigger>
            </TabsList>
            <TabsContent value="calculator">
                <CalculatorTab />
            </TabsContent>
            <TabsContent value="history">
                <SavedTdsRecords />
            </TabsContent>
        </Tabs>
    );
}

