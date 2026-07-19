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
import { 
    CalendarIcon, 
    Edit, 
    Trash2, 
    Printer, 
    Save, 
    Loader2, 
    Search, 
    ArrowUpDown, 
    ChevronsUpDown, 
    Check, 
    Plus, 
    MoreHorizontal, 
    ChevronLeft, 
    ChevronRight,
    PlusCircle
} from 'lucide-react';
import { toNepaliDate, toWords, generateNextVoucherNumber, cn } from '@/lib/utils';
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
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { 
    onTdsCalculationsUpdate, 
    addTdsCalculation, 
    getTdsPrefix, 
    deleteTdsCalculation, 
    updateTdsCalculation 
} from '@/services/tds-service';
import type { TdsCalculation, TdsRate, Party, PartyType, CompanyProfile, AccountOwnership } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { onSettingUpdate } from '@/services/settings-service';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DEFAULT_COMPANY_PROFILE, NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';

const INITIAL_TDS_RATES: TdsRate[] = [
  { value: '1.5', label: 'Goods & Contracts', description: 'Supply of goods and contracts (1.5%)' },
  { value: '15', label: 'Services (Individual)', description: 'Payment for services (15%)' },
  { value: '10', label: 'Rent', description: 'Payment of rent (10%)' },
  { value: '2.5', label: 'Vehicle Hire', description: 'Payment for vehicle hire (2.5%)' },
  { value: '5', label: 'Dividends', description: 'Payment of dividend (5%)' },
];

function TdsVoucherView({ calculation, companyProfile }: { calculation: TdsCalculation, companyProfile: CompanyProfile }) {
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
                <div className="flex justify-between items-center font-semibold"><span>Total with VAT</span><span>{(calculation.taxableAmount + calculation.vatAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between items-center text-destructive"><span>TDS ({calculation.tdsRate}%)</span><span>- {calculation.tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <Separator />
                <div className="flex justify-between items-center text-lg font-bold"><span>Net Payable Amount</span><span>{calculation.netPayable.toLocaleString('en-IN', { style: 'currency', currency: 'NPR' })}</span></div>
            </div>
             <div className="text-sm">
                <span className="font-semibold">In Words:</span> {toWords(calculation.netPayable)}
            </div>
        </div>
    );
}

function SavedTdsRecords({ onEdit, companyProfile }: { onEdit: (calculation: TdsCalculation) => void, companyProfile: CompanyProfile }) {
    const [savedCalculations, setSavedCalculations] = useState<TdsCalculation[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    const { toast } = useToast();
    const { getAllowedOwnerships } = useAuth();
    const allowedOwnerships = useMemo(() => getAllowedOwnerships('finance'), [getAllowedOwnerships]);
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

    const requestSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const filtered = useMemo(() => {
        let res = savedCalculations.filter(calc => calc.ownership === 'Both' || allowedOwnerships.includes(calc.ownership));
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(calc => (calc.voucherNo || '').toLowerCase().includes(q) || (calc.partyName || '').toLowerCase().includes(q));
        }
        res.sort((a: any, b: any) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return res;
    }, [savedCalculations, searchQuery, sortConfig, allowedOwnerships]);

    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, itemsPerPage === -1 ? undefined : currentPage * itemsPerPage);
    const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(filtered.length / itemsPerPage);

    const handlePrint = () => {
        if (!printRef.current) return;
        const win = window.open('', '', 'height=800,width=800');
        win?.document.write('<html><head><title>Print Voucher</title></head><body>');
        win?.document.write(printRef.current.innerHTML);
        win?.document.write('</body></html>');
        win?.document.close();
        win?.focus();
        setTimeout(() => { win?.print(); win?.close(); }, 250);
    };

    const handleExportPdf = async () => {
        if (!selectedRecordForView) return;
        setIsExporting(true);
        try {
            const jsPDF = (await import('jspdf')).default;
            const autoTable = (await import('jspdf-autotable')).default;
            const doc = new jsPDF('p', 'mm', 'a5');
            autoTable(doc, {
                startY: 50,
                head: [['Label', 'Value']],
                body: [
                    ['Voucher No', selectedRecordForView.voucherNo],
                    ['Party', selectedRecordForView.partyName || 'N/A'],
                    ['Base Amount', selectedRecordForView.taxableAmount.toLocaleString()],
                    ['TDS Amount', selectedRecordForView.tdsAmount.toLocaleString()],
                    ['Net Payable', selectedRecordForView.netPayable.toLocaleString()]
                ],
                theme: 'grid'
            });
            doc.save(`TDS-Voucher-${selectedRecordForView.voucherNo}.pdf`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div><CardTitle>TDS History</CardTitle><CardDescription>A log of all saved TDS calculations.</CardDescription></div>
                        <div className="relative w-full sm:w-auto">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search..." className="pl-8 w-full sm:w-[250px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="text-xs">Date (BS) <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('voucherNo')} className="text-xs">Voucher # <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('partyName')} className="text-xs">Party Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead className="text-right pr-6 text-xs">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginated.map(calc => (
                                <TableRow key={calc.id} className="h-14">
                                    <TableCell>{toNepaliDate(calc.date)}</TableCell>
                                    <TableCell className="font-mono text-xs">{calc.voucherNo}</TableCell>
                                    <TableCell>{calc.partyName}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => { setSelectedRecordForView(calc); setIsVoucherViewOpen(true); }}><Printer className="mr-2 h-4 w-4" /> View/Print</DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => onEdit(calc)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive" onSelect={() => deleteTdsCalculation(calc.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                {totalPages > 1 && (
                    <CardFooter className="flex justify-between py-4 border-t">
                        <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4"/></Button>
                        <span className="text-xs font-medium">Page {currentPage} of {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4"/></Button>
                    </CardFooter>
                )}
            </Card>
            <Dialog open={isVoucherViewOpen} onOpenChange={setIsVoucherViewOpen}>
                <DialogContent className="max-w-xl h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="p-6 border-b"><DialogTitle>Voucher Preview</DialogTitle></DialogHeader>
                    <ScrollArea className="flex-1 bg-gray-100 p-8">
                        <div ref={printRef} className="mx-auto w-[148mm] shadow-2xl bg-white">
                        {selectedRecordForView && <TdsVoucherView calculation={selectedRecordForView} companyProfile={companyProfile} />}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-white">
                        <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>Save PDF</Button>
                        <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
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
  const [partyOwnership, setPartyOwnership] = useState<string>('Both');
  const [voucherNo, setVoucherNo] = useState('');
  const [includeVat, setIncludeVat] = useState(true);
  const [parties, setParties] = useState<Party[]>([]);
  const [tdsRates, setTdsRates] = useState<TdsRate[]>(INITIAL_TDS_RATES);
  const [isRateDialogOpen, setIsRateDialogOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ value: '', label: '', description: '' });
  const [editingRate, setEditingRate] = useState<TdsRate | null>(null);
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState({ name: '', type: 'Vendor' as PartyType, ownership: '' as AccountOwnership, address: '', panNumber: '' });
  const [partySearch, setPartySearch] = useState('');
  const [isPartyPopoverOpen, setIsPartyPopoverOpen] = useState(false);
  const { toast } = useToast();
  const { user, getAllowedOwnerships } = useAuth();
  const allowedOwnerships = useMemo(() => getAllowedOwnerships('finance'), [getAllowedOwnerships]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const unsubParties = onPartiesUpdate(setParties);
    return () => unsubParties();
  }, []);

  useEffect(() => {
    if (calculationToEdit) {
        setVoucherNo(calculationToEdit.voucherNo);
        setDate(new Date(calculationToEdit.date));
        setPartyName(calculationToEdit.partyName || '');
        setPartyOwnership(calculationToEdit.ownership || 'Both');
        setAmount(calculationToEdit.taxableAmount);
        setSelectedRateValue(String(calculationToEdit.tdsRate));
        setIncludeVat(calculationToEdit.vatAmount > 0);
    } else {
        onTdsCalculationsUpdate(async (calcs) => {
            const prefix = await getTdsPrefix();
            const next = await generateNextVoucherNumber(calcs, prefix);
            setVoucherNo(next);
        });
    }
  }, [calculationToEdit]);

  const filteredParties = useMemo(() => {
    return parties.filter(p => p.ownership === 'Both' || allowedOwnerships.includes(p.ownership)).sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, allowedOwnerships]);

  const { tds, netAmount, vat, totalWithVat, calculationData } = useMemo(() => {
    const base = Number(amount) || 0;
    const rate = parseFloat(selectedRateValue) / 100;
    const v = includeVat ? base * 0.13 : 0;
    const gross = base + v;
    const t = base * rate;
    const net = gross - t;
    const data = { id: calculationToEdit?.id || '', voucherNo, date: date.toISOString(), partyName, taxableAmount: base, tdsRate: parseFloat(selectedRateValue), tdsAmount: t, vatAmount: v, netPayable: net, createdBy: user?.username || '', createdAt: calculationToEdit?.createdAt || new Date().toISOString(), ownership: partyOwnership };
    return { tds: t, netAmount: net, vat: v, totalWithVat: gross, calculationData: data };
  }, [amount, selectedRateValue, includeVat, voucherNo, date, partyName, partyOwnership, calculationToEdit, user]);

  const handleSave = async () => {
    if (!user || !amount || amount <= 0) return;
    try {
        if (calculationToEdit) await updateTdsCalculation(calculationToEdit.id, calculationData);
        else await addTdsCalculation(calculationData);
        toast({ title: "Saved Successfully" });
        onSaveSuccess();
    } catch {
        toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleOpenPartyDialog = (party: Party | null = null, type: PartyType, search: string = '') => {
    if (party) {
        setEditingParty(party);
        setPartyForm({ name: party.name, type: party.type, ownership: party.ownership, address: party.address || '', panNumber: party.panNumber || '' });
    } else {
        setEditingParty(null);
        setPartyForm({ name: search, type, ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'), address: '', panNumber: '' });
    }
    setIsPartyPopoverOpen(false);
    setIsPartyDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
        <header className="flex justify-between items-start gap-4">
            <div><h1 className="text-3xl font-bold tracking-tight">TDS Calculator</h1><p className="text-muted-foreground text-sm italic">Compute and record tax withholdings.</p></div>
            <div className="flex gap-2">
                <Button onClick={handleSave} className="h-10 px-6 font-black text-xs uppercase shadow-lg"><Save className="mr-2 h-4 w-4"/> {calculationToEdit ? 'Update' : 'Save'}</Button>
                <Button onClick={() => setIsPreviewOpen(true)} variant="outline" className="h-10 px-6 font-bold text-xs uppercase border-gray-300"><Printer className="mr-2 h-4 w-4" /> Preview</Button>
            </div>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 shadow-sm">
                <CardHeader className="bg-muted/30 border-b"><CardTitle className="text-sm font-black uppercase">Input</CardTitle></CardHeader>
                <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Voucher No.</Label><Input value={voucherNo} readOnly className="bg-muted/50 h-10 font-mono text-sm" /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start h-10 font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{toNepaliDate(date.toISOString())}</Button></PopoverTrigger>
                            <PopoverContent className="w-auto p-0"><DualCalendar selected={date} onSelect={d => d && setDate(d)} /></PopoverContent></Popover>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground">Beneficiary</Label>
                        <Popover open={isPartyPopoverOpen} onOpenChange={setIsPartyPopoverOpen}>
                            <PopoverTrigger asChild><Button variant="outline" className="w-full justify-between h-10">{partyName || "Select beneficiary..."}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-30" /></Button></PopoverTrigger>
                            <PopoverContent className="p-0"><Command><CommandInput placeholder="Search..." onValueChange={setPartySearch} /><CommandList><CommandEmpty><Button variant="ghost" className="w-full justify-start text-xs" onClick={() => handleOpenPartyDialog(null, 'Vendor', partySearch)}><PlusCircle className="mr-2 h-4 w-4" /> Add "{partySearch}"</Button></CommandEmpty><CommandGroup>
                                {filteredParties.map(p => <CommandItem key={p.id} onSelect={() => { setPartyName(p.name); setPartyOwnership(p.ownership); setIsPartyPopoverOpen(false); }}>{p.name}</CommandItem>)}
                            </CommandGroup></CommandList></Command></PopoverContent>
                        </Popover>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">Taxable Base</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} className="h-11 font-black text-lg" /></div>
                        <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground">TDS Rate</Label>
                            <Select value={selectedRateValue} onValueChange={setSelectedRateValue}>
                                <SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent>{tdsRates.map(r => <SelectItem key={r.value} value={r.value}>{r.label} ({r.value}%)</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 p-4 rounded-xl bg-muted/20 border"><Switch id="include-vat" checked={includeVat} onCheckedChange={setIncludeVat} /><Label htmlFor="include-vat" className="text-xs font-bold uppercase cursor-pointer">Include VAT (13%)</Label></div>
                    <div className="rounded-2xl border-2 border-primary/20 bg-primary/[0.02] p-6 space-y-4">
                        <div className="flex justify-between text-xs font-black uppercase"><span className="opacity-70">Total with VAT</span><span>Rs. {totalWithVat.toLocaleString()}</span></div>
                        <div className="flex justify-between text-xs font-black uppercase text-red-600"><span>TDS Withholding</span><span>- Rs. {tds.toLocaleString()}</span></div>
                        <Separator className="h-0.5 bg-primary/20" />
                        <div className="flex justify-between items-center"><span className="text-xs font-black uppercase tracking-widest">Net Payable</span><span className="text-2xl font-black tabular-nums">Rs. {netAmount.toLocaleString()}</span></div>
                    </div>
                </CardContent>
            </Card>
            <div className="space-y-6">
                <Card className="shadow-sm">
                    <CardHeader className="py-4 border-b bg-muted/10 flex flex-row items-center justify-between"><CardTitle className="text-xs uppercase font-black">Rates</CardTitle><Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => setIsRateDialogOpen(true)}><PlusCircle className="h-4 w-4" /></Button></CardHeader>
                    <CardContent className="p-0"><ScrollArea className="h-[400px]">
                        {tdsRates.map(r => (
                            <div key={r.value} className="flex items-center justify-between p-4 border-b hover:bg-muted/30">
                                <div className="space-y-0.5"><div className="font-black text-xs">{r.label} <Badge variant="outline" className="text-[9px] h-4 bg-blue-50">{r.value}%</Badge></div><p className="text-[9px] text-muted-foreground uppercase">{r.description}</p></div>
                                <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingRate(r); setRateForm(r); setIsRateDialogOpen(true); }}><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTdsRates(rates => rates.filter(x => x.value !== r.value))}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                            </div>
                        ))}
                    </ScrollArea></CardContent>
                </Card>
            </div>
        </div>
        <Dialog open={isPartyDialogOpen} onOpenChange={setIsPartyDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle className="text-xl font-black uppercase">{editingParty ? 'Edit Beneficiary' : 'New Beneficiary'}</DialogTitle></DialogHeader>
                <div className="grid gap-5 py-4">
                    <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Entity Name</Label><Input value={partyForm.name} onChange={e => setPartyForm({...partyForm, name: e.target.value})} className="h-10 font-bold" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Type</Label><Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm({...partyForm, type: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Vendor">Vendor</SelectItem><SelectItem value="Customer">Customer</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent></Select></div>
                        <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Ownership</Label><Select value={partyForm.ownership} onValueChange={(v: any) => setPartyForm({...partyForm, ownership: v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{allowedOwnerships.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                </div>
                <DialogFooter><Button onClick={async () => {
                    if (!user || !partyForm.name) return;
                    try {
                        if (editingParty) await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
                        else await addParty({ ...partyForm, createdBy: user.username });
                        setPartyName(partyForm.name); setPartyOwnership(partyForm.ownership); setIsPartyDialogOpen(false);
                    } catch { toast({ title: "Error", variant: "destructive" }); }
                }} className="w-full h-11 font-black text-xs uppercase shadow-lg shadow-primary/20">Save Beneficiary</Button></DialogFooter>
            </DialogContent>
        </Dialog>
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogContent className="max-w-xl h-[95vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
                <DialogHeader className="p-6 border-b bg-muted/5 shrink-0"><DialogTitle className="text-xl font-black uppercase">Document Preview</DialogTitle></DialogHeader>
                <ScrollArea className="flex-1 bg-gray-100 p-8"><div ref={printRef} className="mx-auto w-[148mm] shadow-2xl bg-white">{calculationData && <TdsVoucherView calculation={calculationData as any} companyProfile={companyProfile} />}</div></ScrollArea>
                <DialogFooter className="p-6 border-t bg-white shrink-0"><Button variant="outline" onClick={async () => {
                    const jsPDF = (await import('jspdf')).default;
                    const autoTable = (await import('jspdf-autotable')).default;
                    const doc = new jsPDF('p', 'mm', 'a5');
                    autoTable(doc, { head: [['Label', 'Value']], body: [['Voucher', voucherNo], ['Net', netAmount.toLocaleString()]] });
                    doc.save(`TDS-${voucherNo}.pdf`);
                }} className="h-10 px-6 uppercase font-bold text-[10px]">Save PDF</Button><Button onClick={() => {
                    if (!printRef.current) return;
                    const win = window.open('', '', 'height=800,width=800');
                    win?.document.write('<html><body>' + printRef.current.innerHTML + '</body></html>');
                    win?.document.close(); win?.focus(); setTimeout(() => { win?.print(); win?.close(); }, 250);
                }} className="h-10 px-10 font-black uppercase text-[10px] shadow-lg shadow-primary/20"><Printer className="mr-2 h-4 w-4" /> Print Voucher</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}

export default function TdsCalculatorPage() {
    const [activeTab, setActiveTab] = useState('calculator');
    const [calculationToEdit, setCalculationToEdit] = useState<TdsCalculation | null>(null);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

    useEffect(() => {
        const unsub = onSettingUpdate('companyProfile', (s) => setCompanyProfile(s?.value || DEFAULT_COMPANY_PROFILE));
        return () => unsub();
    }, []);

    return (
        <div className="flex flex-col gap-8">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4 bg-muted/50 p-1">
                    <TabsTrigger value="calculator" className="gap-2 px-6 font-bold text-xs uppercase tracking-widest">Calculator</TabsTrigger>
                    <TabsTrigger value="history" className="gap-2 px-6 font-bold text-xs uppercase tracking-widest">History Logs</TabsTrigger>
                </TabsList>
                <TabsContent value="calculator"><CalculatorTab calculationToEdit={calculationToEdit} onSaveSuccess={() => setActiveTab('history')} onCancelEdit={() => setCalculationToEdit(null)} companyProfile={companyProfile} /></TabsContent>
                <TabsContent value="history"><SavedTdsRecords onEdit={(calc) => { setCalculationToEdit(calc); setActiveTab('calculator'); }} companyProfile={companyProfile} /></TabsContent>
            </Tabs>
        </div>
    );
}