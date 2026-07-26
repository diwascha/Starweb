'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { 
    Scale, 
    Ruler, 
    Calculator, 
    Save, 
    Loader2, 
    CalendarIcon, 
    History as HistoryIcon, 
    Plus, 
    Trash2, 
    ChevronsUpDown, 
    Check 
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate } from '@/services/party-service';
import { onGsmReportsUpdate, addGsmReport, updateGsmReport } from '@/services/gsm-service';
import { generateNextGsmNumber, toNepaliDate, cn, generateId } from '@/lib/utils';
import type { Party, GsmReport, GsmEntry } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const numFieldProps = {
    type: 'number' as const,
    inputMode: 'decimal' as const,
    onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
};

interface GsmGeneratorFormProps {
    reportToEdit?: GsmReport | null;
    onSaveSuccess: () => void;
}

export function GsmGeneratorForm({ reportToEdit, onSaveSuccess }: GsmGeneratorFormProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // Master Data
    const [parties, setParties] = useState<Party[]>([]);
    const [allReports, setAllReports] = useState<GsmReport[]>([]);

    // Global Form State
    const [voucherNo, setVoucherNo] = useState('');
    const [date, setDate] = useState<Date>(new Date());
    const [vendor, setVendor] = useState<Party | null>(null);
    const [unit, setUnit] = useState<'cm' | 'in' | 'mm'>('cm');

    // Dynamic Entries State
    const [entries, setEntries] = useState<any[]>([
        { id: generateId(), reelNumber: '', weight: '', length: '', width: '', gsm: 0 }
    ]);

    // Select UI state
    const [isVendorPopoverOpen, setIsVendorPopoverOpen] = useState(false);
    const [vendorSearch, setVendorSearch] = useState('');

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubReports = onGsmReportsUpdate(setAllReports);
        return () => { unsubParties(); unsubReports(); };
    }, []);

    // 1. Initial/Edit population: Run ONLY when reportToEdit changes
    useEffect(() => {
        if (reportToEdit) {
            setVoucherNo(reportToEdit.voucherNo);
            setDate(new Date(reportToEdit.date));
            const firstEntryUnit = reportToEdit.entries?.[0]?.unit || 'cm';
            setUnit(firstEntryUnit);
            setEntries(reportToEdit.entries.map(e => ({
                ...e,
                weight: String(e.weight),
                length: String(e.length),
                width: String(e.width),
            })));
        }
    }, [reportToEdit]);

    // 2. Resolve vendor separately to avoid loop
    useEffect(() => {
        if (reportToEdit && parties.length > 0 && !vendor) {
            const matchedVendor = parties.find(p => p.id === reportToEdit.vendorId);
            if (matchedVendor) setVendor(matchedVendor);
        }
    }, [reportToEdit, parties, vendor]);

    // 3. Voucher number generation for NEW reports
    useEffect(() => {
        if (!reportToEdit && allReports.length >= 0) {
            generateNextGsmNumber(allReports, date.toISOString()).then(setVoucherNo);
        }
    }, [reportToEdit, allReports, date]);

    const calculateGsm = useCallback((weight: any, length: any, width: any, unitType: 'cm' | 'in' | 'mm') => {
        const w = parseFloat(weight);
        const l = parseFloat(length);
        const wd = parseFloat(width);
        if (!w || !l || !wd || l <= 0 || wd <= 0) return 0;
        
        let res = 0;
        if (unitType === 'cm') {
            res = (w * 10000) / (l * wd);
        } else if (unitType === 'mm') {
            res = (w * 1000000) / (l * wd);
        } else {
            res = (w * 1550) / (l * wd);
        }
        
        // Scaled by 100 per requirement
        return parseFloat((res * 100).toFixed(2));
    }, []);

    const handleEntryChange = (id: string, field: string, value: any) => {
        setEntries(prev => prev.map(entry => {
            if (entry.id === id) {
                const next = { ...entry, [field]: value };
                next.gsm = calculateGsm(next.weight, next.length, next.width, unit);
                return next;
            }
            return entry;
        }));
    };

    // Update GSM if unit changes
    useEffect(() => {
        setEntries(prev => prev.map(entry => ({
            ...entry,
            gsm: calculateGsm(entry.weight, entry.length, entry.width, unit)
        })));
    }, [unit, calculateGsm]);

    const handleAddRow = () => {
        setEntries([...entries, { id: generateId(), reelNumber: '', weight: '', length: '', width: '', gsm: 0 }]);
    };

    const handleRemoveRow = (id: string) => {
        if (entries.length === 1) return;
        setEntries(entries.filter(e => e.id !== id));
    };

    const filteredVendors = useMemo(() => {
        return parties.filter(p => p.type === 'Vendor' || p.type === 'Both')
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [parties]);

    const avgGsm = useMemo(() => {
        const validEntries = entries.filter(e => e.gsm > 0);
        if (validEntries.length === 0) return 0;
        const sum = validEntries.reduce((s, e) => s + e.gsm, 0);
        return parseFloat((sum / validEntries.length).toFixed(2));
    }, [entries]);

    const handleSave = async () => {
        if (!user || !vendor || avgGsm <= 0) {
            toast({ title: 'Validation Error', description: 'Vendor and at least one valid measurement are required.', variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            const reportEntries: GsmEntry[] = entries
                .filter(e => e.gsm > 0)
                .map(e => ({
                    id: e.id,
                    reelNumber: e.reelNumber,
                    weight: Number(e.weight),
                    length: Number(e.length),
                    width: Number(e.width),
                    unit,
                    gsm: e.gsm
                }));

            const reportData: Omit<GsmReport, 'id' | 'createdAt'> = {
                voucherNo,
                date: date.toISOString(),
                vendorId: vendor.id,
                vendorName: vendor.name,
                entries: reportEntries,
                avgGsm,
                createdBy: reportToEdit?.createdBy || user.username,
                ownership: 'Both'
            };

            if (reportToEdit) {
                await updateGsmReport(reportToEdit.id, { ...reportData, lastModifiedBy: user.username });
                toast({ title: 'Report Updated', description: `Voucher ${voucherNo} modified.` });
            } else {
                await addGsmReport(reportData);
                toast({ title: 'Report Saved', description: `Voucher ${voucherNo} archived.` });
            }
            
            setEntries([{ id: generateId(), reelNumber: '', weight: '', length: '', width: '', gsm: 0 }]);
            onSaveSuccess();
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-gray-100">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6">
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                            <HistoryIcon className="h-4 w-4 text-primary" />
                            Report Identity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Report No.</Label>
                            <Input value={voucherNo} readOnly className="bg-muted/50 font-mono text-sm h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Verification Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start h-10 font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {toNepaliDate(date.toISOString())}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DualCalendar selected={date} onSelect={d => d && setDate(d)} />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Supplier / Vendor</Label>
                            <Popover open={isVendorPopoverOpen} onOpenChange={setIsVendorPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-10">
                                        <span className="truncate">{vendor ? vendor.name : "Select vendor..."}</span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput placeholder="Search vendor..." onValueChange={setVendorSearch} />
                                        <CommandList>
                                            <CommandEmpty>No vendor found.</CommandEmpty>
                                            <CommandGroup>
                                                {filteredVendors.map(p => (
                                                    <CommandItem key={p.id} value={p.name} onSelect={() => { setVendor(p); setIsVendorPopoverOpen(false); }}>
                                                        <Check className={cn("mr-2 h-4 w-4", vendor?.id === p.id ? "opacity-100" : "opacity-0")} />
                                                        {p.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-gray-100 h-fit">
                    <CardHeader className="py-4 border-b bg-muted/5"><CardTitle className="text-xs uppercase font-black">Dimension System</CardTitle></CardHeader>
                    <CardContent className="p-4">
                        <RadioGroup value={unit} onValueChange={(v: any) => setUnit(v)} className="flex flex-col gap-2 p-2 bg-muted/30 rounded-lg border border-dashed">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="cm" id="unit-cm" /><Label htmlFor="unit-cm" className="text-xs font-bold cursor-pointer">Metric (cm)</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="mm" id="unit-mm" /><Label htmlFor="unit-mm" className="text-xs font-bold cursor-pointer">Millimeter (mm)</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="in" id="unit-in" /><Label htmlFor="unit-in" className="text-xs font-bold cursor-pointer">Imperial (in)</Label></div>
                        </RadioGroup>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-lg border-primary/20 overflow-hidden">
                <CardHeader className="bg-primary/5 border-b py-4 px-6 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-black uppercase text-primary flex items-center gap-2">
                            <Calculator className="h-4 w-4" />
                            Measurement Analysis
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase font-bold text-muted-foreground mt-1">Multi-reel grammage verification grid.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleAddRow} className="h-8 font-black text-[10px] uppercase tracking-widest bg-white border-primary/20 text-primary hover:bg-primary/5">
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Reel Row
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50 border-b">
                            <TableRow className="hover:bg-transparent h-10">
                                <TableHead className="pl-6 font-bold uppercase text-[9px]">Reel / Batch #</TableHead>
                                <TableHead className="font-bold uppercase text-[9px] text-center">Weight (g)</TableHead>
                                <TableHead className="font-bold uppercase text-[9px] text-center">Length ({unit})</TableHead>
                                <TableHead className="font-bold uppercase text-[9px] text-center">Width ({unit})</TableHead>
                                <TableHead className="font-black uppercase text-[10px] text-primary text-center bg-primary/5 border-x">Result (GSM)</TableHead>
                                <TableHead className="w-10 pr-6"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="bg-white">
                            {entries.map((entry) => (
                                <TableRow key={entry.id} className="h-14 border-b group hover:bg-muted/5 transition-colors">
                                    <TableCell className="pl-6 py-2">
                                        <Input 
                                            value={entry.reelNumber} 
                                            onChange={e => handleEntryChange(entry.id, 'reelNumber', e.target.value)} 
                                            placeholder="Batch ID" 
                                            className="h-9 font-bold text-xs uppercase" 
                                        />
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <div className="relative max-w-[120px] mx-auto">
                                            <Scale className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground opacity-40" />
                                            <Input 
                                                {...numFieldProps} 
                                                value={entry.weight} 
                                                onChange={e => handleEntryChange(entry.id, 'weight', e.target.value)} 
                                                className="pl-7 h-9 text-center font-black" 
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <div className="relative max-w-[120px] mx-auto">
                                            <Ruler className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground opacity-40" />
                                            <Input 
                                                {...numFieldProps} 
                                                value={entry.length} 
                                                onChange={e => handleEntryChange(entry.id, 'length', e.target.value)} 
                                                className="pl-7 h-9 text-center font-bold" 
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <div className="relative max-w-[120px] mx-auto">
                                            <Ruler className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground opacity-40 rotate-90" />
                                            <Input 
                                                {...numFieldProps} 
                                                value={entry.width} 
                                                onChange={e => handleEntryChange(entry.id, 'width', e.target.value)} 
                                                className="pl-7 h-9 text-center font-bold" 
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell className="bg-primary/5 text-center font-black text-blue-900 border-x py-2">
                                        <div className="text-base tabular-nums">
                                            {entry.gsm > 0 ? entry.gsm.toFixed(2) : '—'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="pr-6 py-2 text-right">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" 
                                            onClick={() => handleRemoveRow(entry.id)} 
                                            disabled={entries.length === 1}
                                        >
                                            <Trash2 className="h-4 w-4"/>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter className="bg-muted/10 border-t py-6 px-8 flex justify-end items-center">
                    <Button onClick={handleSave} disabled={isSaving || !vendor || avgGsm <= 0} size="lg" className="h-12 px-12 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        {reportToEdit ? 'Update Batch Report' : 'Archive Batch Report'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
