'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Scale, Ruler, Calculator, Save, Loader2, CalendarIcon, User, Hash, ChevronsUpDown, Check, PlusCircle, History } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onPartiesUpdate } from '@/services/party-service';
import { onGsmReportsUpdate, addGsmReport } from '@/services/gsm-service';
import { generateNextGsmNumber, toNepaliDate, cn } from '@/lib/utils';
import type { Party, GsmReport } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';

const numFieldProps = {
    type: 'number' as const,
    inputMode: 'decimal' as const,
    onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
};

export function GsmGeneratorForm({ onSaveSuccess }: { onSaveSuccess: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // Master Data
    const [parties, setParties] = useState<Party[]>([]);
    const [allReports, setAllReports] = useState<GsmReport[]>([]);

    // Form State
    const [voucherNo, setVoucherNo] = useState('');
    const [date, setDate] = useState<Date>(new Date());
    const [vendor, setVendor] = useState<Party | null>(null);
    const [reelNumber, setReelNumber] = useState('');
    
    const [unit, setUnit] = useState<'cm' | 'in'>('cm');
    const [weight, setWeight] = useState<number | ''>('');
    const [length, setLength] = useState<number | ''>('');
    const [width, setWidth] = useState<number | ''>('');

    // Select UI state
    const [isVendorPopoverOpen, setIsVendorPopoverOpen] = useState(false);
    const [vendorSearch, setVendorSearch] = useState('');

    useEffect(() => {
        const unsubParties = onPartiesUpdate(setParties);
        const unsubReports = onGsmReportsUpdate(setAllReports);
        return () => { unsubParties(); unsubReports(); };
    }, []);

    useEffect(() => {
        if (allReports.length >= 0) {
            generateNextGsmNumber(allReports, date.toISOString()).then(setVoucherNo);
        }
    }, [allReports, date]);

    const filteredVendors = useMemo(() => {
        return parties.filter(p => p.type === 'Vendor' || p.type === 'Both')
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [parties]);

    const gsmResult = useMemo(() => {
        if (!weight || !length || !width) return null;
        const w = Number(weight);
        const l = Number(length);
        const wd = Number(width);
        if (l <= 0 || wd <= 0) return 0;
        return unit === 'cm' ? (w * 10000) / (l * wd) : (w * 1550) / (l * wd);
    }, [unit, weight, length, width]);

    const handleSave = async () => {
        if (!user || !vendor || !gsmResult) {
            toast({ title: 'Validation Error', description: 'Vendor and valid measurements are required.', variant: 'destructive' });
            return;
        }

        setIsSaving(true);
        try {
            await addGsmReport({
                voucherNo,
                date: date.toISOString(),
                vendorId: vendor.id,
                vendorName: vendor.name,
                reelNumber,
                weight: Number(weight),
                length: Number(length),
                width: Number(width),
                unit,
                gsm: parseFloat(gsmResult.toFixed(2)),
                createdBy: user.username,
                ownership: 'Both'
            });
            toast({ title: 'Report Saved', description: `Saved as ${voucherNo}` });
            setWeight('');
            setLength('');
            setWidth('');
            setReelNumber('');
            onSaveSuccess();
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-sm border-gray-100">
                    <CardHeader className="bg-muted/10 border-b py-4 px-6">
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                            <History className="h-4 w-4 text-primary" />
                            Report Identity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                                        {vendor ? vendor.name : "Select vendor..."}
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
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Reel / Batch Number</Label>
                            <Input value={reelNumber} onChange={e => setReelNumber(e.target.value)} placeholder="e.g. 5422-A" className="h-10" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="shadow-lg border-primary/20">
                    <CardHeader className="bg-primary/5 border-b py-4 px-6">
                        <CardTitle className="text-sm font-black uppercase flex items-center gap-2 text-primary">
                            <Calculator className="h-4 w-4" />
                            Measurement Analysis
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Dimension System</Label>
                            <RadioGroup value={unit} onValueChange={(v: any) => setUnit(v)} className="flex gap-4 p-2 bg-muted/30 rounded-lg border border-dashed">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="cm" id="unit-cm" /><Label htmlFor="unit-cm" className="text-xs font-bold cursor-pointer">Metric (cm)</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="in" id="unit-in" /><Label htmlFor="unit-in" className="text-xs font-bold cursor-pointer">Imperial (in)</Label></div>
                            </RadioGroup>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Sample Weight (g)</Label>
                                <div className="relative">
                                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                                    <Input {...numFieldProps} value={weight} onChange={e => setWeight(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" className="pl-10 h-11 font-black text-lg" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Length ({unit})</Label>
                                <div className="relative">
                                    <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                                    <Input {...numFieldProps} value={length} onChange={e => setLength(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.0" className="pl-10 h-11 font-bold" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground">Width ({unit})</Label>
                                <div className="relative">
                                    <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50 rotate-90" />
                                    <Input {...numFieldProps} value={width} onChange={e => setWidth(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.0" className="pl-10 h-11 font-bold" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <Card className="bg-primary/5 border-primary/20 shadow-none border-l-4 border-l-primary overflow-hidden h-fit sticky top-24">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary">Calculation Result</CardTitle>
                    </CardHeader>
                    <CardContent className="py-8 text-center space-y-6">
                        {gsmResult !== null ? (
                            <>
                                <div className="space-y-1">
                                    <div className="text-6xl font-black text-gray-900 tracking-tighter tabular-nums">{gsmResult.toFixed(2)}</div>
                                    <p className="text-xs font-black uppercase text-muted-foreground tracking-[0.3em]">Grams Per Square Meter</p>
                                </div>
                                <Button onClick={handleSave} disabled={isSaving || !vendor} size="lg" className="w-full h-12 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                    Archive Result
                                </Button>
                            </>
                        ) : (
                            <div className="py-4"><p className="text-muted-foreground italic text-sm">Enter measurements to calculate GSM.</p></div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
