

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Vehicle, Party, Trip, Destination, FuelEntry } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Trash2, ChevronsUpDown, Check, Plus } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format, differenceInDays } from 'date-fns';
import { cn, toNepaliDate } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { addTrip } from '@/services/trip-service';
import { Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';

const destinationSchema = z.object({
  name: z.string().optional(),
  freight: z.number().optional(),
});

const fuelEntrySchema = z.object({
  partyId: z.string().min(1, 'Fuel vendor is required.'),
  amount: z.number().min(1, 'Fuel amount is required.'),
});

const tripSchema = z.object({
  date: z.date(),
  vehicleId: z.string().min(1, 'Vehicle is required.'),
  destinations: z.array(destinationSchema)
    .refine(destinations => destinations.filter(d => d.name && d.freight).length > 0, {
      message: 'At least one destination with a name and freight is required.',
    }),
  truckAdvance: z.number().min(0).optional(),
  transport: z.number().min(0).optional(),
  fuelEntries: z.array(fuelEntrySchema),
  extraExpenses: z.string().optional(),
  returnLoadIncome: z.number().min(0).optional(),
  detentionStartDate: z.date().optional(),
  detentionEndDate: z.date().optional(),
  dropOffChargeRate: z.number().min(0).optional(),
  detentionChargeRate: z.number().min(0).optional(),
});

type TripFormValues = z.infer<typeof tripSchema>;

export default function NewTripSheetPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDetentionDialogOpen, setIsDetentionDialogOpen] = useState(false);
    const [detentionDateRange, setDetentionDateRange] = useState<DateRange | undefined>(undefined);

    const form = useForm<TripFormValues>({
        resolver: zodResolver(tripSchema),
        defaultValues: {
            date: new Date(),
            vehicleId: '',
            destinations: [
                { name: '', freight: 0 },
                { name: '', freight: 0 } 
            ],
            truckAdvance: 0,
            transport: 0,
            fuelEntries: [],
            extraExpenses: '',
            returnLoadIncome: 0,
            detentionStartDate: undefined,
            detentionEndDate: undefined,
            dropOffChargeRate: 800,
            detentionChargeRate: 3000,
        },
    });
    
    const { fields: destinationFields, append: appendDestination, remove: removeDestination } = useFieldArray({
        control: form.control,
        name: "destinations",
    });

    const { fields: fuelFields, append: appendFuel, remove: removeFuel } = useFieldArray({
        control: form.control,
        name: "fuelEntries",
    });

    useEffect(() => {
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        return () => {
            unsubVehicles();
            unsubParties();
        };
    }, []);

    const fuelVendors = useMemo(() => parties.filter(p => p.type === 'Vendor'), [parties]);
    
    const detentionDays = useMemo(() => {
        const { detentionStartDate, detentionEndDate } = form.watch();
        if (detentionStartDate && detentionEndDate) {
            return differenceInDays(detentionEndDate, detentionStartDate) + 1;
        }
        return 0;
    }, [form.watch('detentionStartDate'), form.watch('detentionEndDate')]);

    const { totalFreight, dropOffCharge, detentionCharge, totalTaxable, vatAmount, grossAmount, tdsAmount, netPay, totalExpenses, returnLoadIncome, netAmount } = useMemo(() => {
        const destinations = form.watch('destinations');
        const truckAdvance = form.watch('truckAdvance') || 0;
        const transport = form.watch('transport') || 0;
        const fuelEntries = form.watch('fuelEntries');
        const returnIncome = form.watch('returnLoadIncome') || 0;
        const dropOffChargeRate = form.watch('dropOffChargeRate') || 0;
        const detentionChargeRate = form.watch('detentionChargeRate') || 0;

        const validDestinations = destinations.filter(d => d.name && d.freight && d.freight > 0);
        
        const totalFreight = validDestinations.reduce((sum, dest) => sum + (dest.freight || 0), 0);
        
        const dropOffCharge = validDestinations.length > 3 ? (validDestinations.length - 3) * dropOffChargeRate : 0;
        
        const detentionCharge = detentionDays * detentionChargeRate;

        const totalTaxable = totalFreight + dropOffCharge + detentionCharge;
        const vatAmount = totalTaxable * 0.13;
        const grossAmount = totalTaxable + vatAmount;
        const tdsAmount = grossAmount * 0.015;
        const netPay = grossAmount - tdsAmount;
        
        const totalFuel = fuelEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
        const totalExpenses = truckAdvance + transport + totalFuel;
        const netAmount = netPay - totalExpenses + returnIncome;
        
        return { totalFreight, dropOffCharge, detentionCharge, totalTaxable, vatAmount, grossAmount, tdsAmount, netPay, totalExpenses, returnLoadIncome: returnIncome, netAmount };
    }, [form.watch(), detentionDays]);
    
    const handleConfirmDetention = () => {
        form.setValue('detentionStartDate', detentionDateRange?.from);
        form.setValue('detentionEndDate', detentionDateRange?.to);
        setIsDetentionDialogOpen(false);
    };

    async function onSubmit(values: TripFormValues) {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const filteredDestinations = values.destinations
              .filter(d => d.name && d.name.trim() !== '' && d.freight && d.freight > 0)
              .map(d => ({ name: d.name!, freight: d.freight! }));
              
            if (filteredDestinations.length === 0) {
                form.setError('destinations', { message: 'At least one valid destination is required.' });
                setIsSubmitting(false);
                return;
            }

            const newTripData: Omit<Trip, 'id'> = {
                ...values,
                destinations: filteredDestinations,
                date: values.date.toISOString(),
                detentionStartDate: values.detentionStartDate?.toISOString(),
                detentionEndDate: values.detentionEndDate?.toISOString(),
                createdAt: new Date().toISOString(),
                createdBy: user.username,
            };
            await addTrip(newTripData);
            toast({ title: 'Success', description: 'Trip sheet created successfully.' });
            router.push('/fleet/transactions');
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to create trip sheet.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">New Trip Sheet</h1>
                <p className="text-muted-foreground">Record a new sales trip and its associated expenses.</p>
            </div>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-8">
                            <Card>
                                <CardHeader><CardTitle>Trip Details</CardTitle></CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField control={form.control} name="date" render={({ field }) => (
                                        <FormItem className="flex flex-col"><FormLabel>Date</FormLabel>
                                            <Popover><PopoverTrigger asChild><FormControl>
                                                <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                    {field.value ? `${toNepaliDate(field.value.toISOString())} BS (${format(field.value, "PPP")})` : <span>Pick a date</span>}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start">
                                                <DualCalendar selected={field.value} onSelect={field.onChange} />
                                            </PopoverContent></Popover><FormMessage />
                                        </FormItem>
                                    )}/>
                                    <FormField control={form.control} name="vehicleId" render={({ field }) => (
                                        <FormItem><FormLabel>Vehicle</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger></FormControl><SelectContent>
                                            {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                        </SelectContent></Select><FormMessage /></FormItem>
                                    )}/>
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader><CardTitle>Freight Details</CardTitle></CardHeader>
                                <CardContent>
                                <Table><TableHeader><TableRow>
                                  <TableHead>Destination</TableHead>
                                  <TableHead>Freight (NPR)</TableHead>
                                  <TableHead className="w-[50px]"></TableHead>
                                </TableRow></TableHeader><TableBody>
                                    {destinationFields.map((item, index) => (<TableRow key={item.id}>
                                        <TableCell>
                                            <FormField control={form.control} name={`destinations.${index}.name`} render={({ field }) => 
                                                <FormItem>
                                                    {index === 0 && <FormLabel>Final Destination</FormLabel>}
                                                    <Input {...field} placeholder={index === 0 ? "e.g. Kathmandu" : "Additional drop-off"}/>
                                                    <FormMessage/>
                                                </FormItem>
                                            }/>
                                        </TableCell>
                                        <TableCell>
                                            <FormField control={form.control} name={`destinations.${index}.freight`} render={({ field }) => 
                                                <FormItem>
                                                    {index === 0 && <FormLabel>Freight</FormLabel>}
                                                    <Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                                                    <FormMessage/>
                                                </FormItem>
                                            }/>
                                        </TableCell>
                                        <TableCell className="pt-8">
                                            {index > 0 && 
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeDestination(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            }
                                        </TableCell>
                                    </TableRow>))}
                                </TableBody></Table>
                                {form.formState.errors.destinations && <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.destinations.message}</p>}
                                <Button type="button" size="sm" variant="outline" onClick={() => appendDestination({ name: '', freight: 0 })} className="mt-4"><PlusCircle className="mr-2 h-4 w-4" /> Add Destination</Button>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t">
                                     <div className="space-y-2">
                                        <Label>Detention</Label>
                                        <Dialog open={isDetentionDialogOpen} onOpenChange={setIsDetentionDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button type="button" variant="outline" className="w-full justify-start font-normal">
                                                    <Plus className="mr-2 h-4 w-4"/>
                                                    {detentionDays > 0 ? `${detentionDays} day(s)` : 'Add Detention'}
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader><DialogTitle>Select Detention Period</DialogTitle></DialogHeader>
                                                <div className="py-4 flex justify-center">
                                                    <DualDateRangePicker selected={detentionDateRange} onSelect={setDetentionDateRange} />
                                                </div>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => setIsDetentionDialogOpen(false)}>Cancel</Button>
                                                    <Button onClick={handleConfirmDetention}>Confirm</Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                         {form.watch('detentionStartDate') && (
                                            <p className="text-xs text-muted-foreground">
                                                {format(form.watch('detentionStartDate')!, "PPP")} - {form.watch('detentionEndDate') ? format(form.watch('detentionEndDate')!, "PPP") : ''}
                                            </p>
                                        )}
                                    </div>
                                    <FormField control={form.control} name="detentionChargeRate" render={({ field }) => <FormItem><FormLabel>Detention Rate/Day</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl></FormItem>} />
                                    <FormField control={form.control} name="dropOffChargeRate" render={({ field }) => <FormItem><FormLabel>Extra Drop-off Rate</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl></FormItem>} />
                                </div>
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader><CardTitle>Trip Expenses & Income</CardTitle></CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="truckAdvance" render={({ field }) => <FormItem><FormLabel>Truck Advance</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl></FormItem>} />
                                        <FormField control={form.control} name="transport" render={({ field }) => <FormItem><FormLabel>Transport</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl></FormItem>} />
                                    </div>
                                    <div>
                                        <Label className="text-base font-medium">Fuel</Label>
                                        <div className="mt-2 space-y-4">
                                            {fuelFields.map((item, index) => (<div key={item.id} className="flex items-center gap-2">
                                                <FormField control={form.control} name={`fuelEntries.${index}.partyId`} render={({ field }) => (
                                                    <FormItem className="flex-1"><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" role="combobox" className="w-full justify-between">
                                                        {field.value ? fuelVendors.find(v => v.id === field.value)?.name : "Select fuel vendor"}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button></FormControl></PopoverTrigger><PopoverContent className="p-0"><Command><CommandInput placeholder="Search vendor..."/><CommandList><CommandEmpty>No vendor found.</CommandEmpty><CommandGroup>
                                                        {fuelVendors.map(vendor => (<CommandItem key={vendor.id} value={vendor.name} onSelect={() => field.onChange(vendor.id)}><Check className={cn("mr-2 h-4 w-4", field.value === vendor.id ? "opacity-100" : "opacity-0")} />{vendor.name}</CommandItem>))}
                                                    </CommandGroup></CommandList></Command></PopoverContent></Popover></FormItem>
                                                )}/>
                                                <FormField control={form.control} name={`fuelEntries.${index}.amount`} render={({ field }) => <FormItem><FormControl><Input type="number" placeholder="Amount" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl></FormItem>} />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeFuel(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </div>))}
                                        </div>
                                        <Button type="button" size="sm" variant="outline" onClick={() => appendFuel({ partyId: '', amount: 0 })} className="mt-4"><PlusCircle className="mr-2 h-4 w-4" /> Add Fuel Entry</Button>
                                    </div>
                                    <FormField control={form.control} name="extraExpenses" render={({ field }) => <FormItem><FormLabel>Extra Expenses (Details)</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>} />
                                    <FormField control={form.control} name="returnLoadIncome" render={({ field }) => <FormItem><FormLabel>Additional Income (Return Load)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} /></FormControl></FormItem>} />
                                </CardContent>
                            </Card>
                        </div>
                        <div className="lg:col-span-1">
                            <Card className="sticky top-8">
                                <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Freight</span><span>{totalFreight.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Drop-off Charge</span><span>+ {dropOffCharge.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Detention Charge</span><span>+ {detentionCharge.toLocaleString()}</span></div>
                                    <Separator />
                                    <div className="flex justify-between text-sm font-medium"><span className="text-muted-foreground">Total Taxable</span><span>{totalTaxable.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT (13%)</span><span>{vatAmount.toLocaleString()}</span></div>
                                    <div className="flex justify-between font-medium"><span className="text-muted-foreground">Gross Amount</span><span>{grossAmount.toLocaleString()}</span></div>
                                    <Separator />
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">TDS (1.5%)</span><span>- {tdsAmount.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-lg font-bold"><span className="text-muted-foreground">Net Bank Pay</span><span>{netPay.toLocaleString()}</span></div>
                                    <Separator />
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Expenses</span><span>- {totalExpenses.toLocaleString()}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Return Load</span><span>+ {returnLoadIncome.toLocaleString()}</span></div>
                                    <Separator />
                                    <div className="flex justify-between text-xl font-bold text-green-600"><span className="text-muted-foreground">Net Amount</span><span>{netAmount.toLocaleString()}</span></div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Trip Sheet'}
                    </Button>
                </form>
            </Form>
        </div>
    );
}
