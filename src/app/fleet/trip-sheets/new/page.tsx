
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Vehicle, Party, Trip, Destination, PartyType, TripDestination, ExtraExpense } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Trash2, ChevronsUpDown, Check, Plus, X } from 'lucide-react';
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
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { addTrip, onTripsUpdate } from '@/services/trip-service';
import { Loader2, Edit } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { DateRange } from 'react-day-picker';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import { onDestinationsUpdate, addDestination, updateDestination } from '@/services/destination-service';

const destinationSchema = z.object({
  name: z.string().optional(),
  freight: z.number().optional(),
});

const fuelEntrySchema = z.object({
  partyId: z.string().min(1, 'Fuel vendor is required.'),
  liters: z.number().optional(),
  amount: z.number().min(1, 'Fuel amount is required.'),
});

const extraExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required.'),
  amount: z.number().min(1, 'Amount is required.'),
  partyId: z.string().optional(),
});

const tripSchema = z.object({
  date: z.date(),
  vehicleId: z.string().min(1, 'Vehicle is required.'),
  destinations: z.array(destinationSchema),
  truckAdvance: z.number().min(0).optional(),
  transport: z.number().min(0).optional(),
  fuelEntries: z.array(fuelEntrySchema),
  extraExpenses: z.array(extraExpenseSchema),
  returnLoadIncome: z.number().min(0).optional(),
  detentionStartDate: z.date().optional(),
  detentionEndDate: z.date().optional(),
  numberOfParties: z.number().min(0).optional(),
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
    const [destinations, setDestinations] = useState<Destination[]>([]);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Dialog States
    const [isDetentionDialogOpen, setIsDetentionDialogOpen] = useState(false);
    const [detentionDateRange, setDetentionDateRange] = useState<DateRange | undefined>(undefined);
    const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, address?: string, panNumber?: string}>({name: '', type: 'Vendor', address: '', panNumber: ''});
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [partySearch, setPartySearch] = useState('');
    
    const [isDestinationDialogOpen, setIsDestinationDialogOpen] = useState(false);
    const [destinationForm, setDestinationForm] = useState<{ name: string }>({ name: '' });
    const [editingDestination, setEditingDestination] = useState<Destination | null>(null);
    const [destinationSearch, setDestinationSearch] = useState('');


    const form = useForm<TripFormValues>({
        resolver: zodResolver(tripSchema),
        defaultValues: {
            date: new Date(),
            vehicleId: '',
            destinations: [
                { name: '', freight: 0 },
            ],
            truckAdvance: 0,
            transport: 0,
            fuelEntries: [],
            extraExpenses: [],
            returnLoadIncome: 0,
            detentionStartDate: undefined,
            detentionEndDate: undefined,
            numberOfParties: 0,
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

    const { fields: expenseFields, append: appendExpense, remove: removeExpense } = useFieldArray({
        control: form.control,
        name: "extraExpenses",
    });

    useEffect(() => {
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubDestinations = onDestinationsUpdate(setDestinations);
        const unsubTrips = onTripsUpdate(setTrips);
        return () => {
            unsubVehicles();
            unsubParties();
            unsubDestinations();
            unsubTrips();
        };
    }, []);

    const vendors = useMemo(() => parties.filter(p => p.type === 'Vendor'), [parties]);
    
    const watchedFormValues = form.watch();

    const { totalFreight, dropOffCharge, detentionCharge, totalTaxable, vatAmount, grossAmount, tdsAmount, netPay, totalExpenses, returnLoadIncome, netAmount, detentionDays } = useMemo(() => {
        const values = watchedFormValues;
        
        const days = values.detentionStartDate && values.detentionEndDate ? differenceInDays(values.detentionEndDate, values.detentionStartDate) + 1 : 0;
        
        const totalFreight = (values.destinations || [])
            .filter(d => d && d.name && d.name.trim() !== '' && d.freight && Number(d.freight) > 0)
            .reduce((sum, dest) => sum + (Number(dest.freight) || 0), 0);
        
        const numberOfParties = Number(values.numberOfParties) || 0;
        const dropOffChargeRate = Number(values.dropOffChargeRate) || 800;
        const dropOffCharge = numberOfParties > 3 ? (numberOfParties - 3) * dropOffChargeRate : 0;
        
        const detentionChargeRate = Number(values.detentionChargeRate) || 3000;
        const detentionCharge = days * detentionChargeRate;

        const totalTaxable = totalFreight + dropOffCharge + detentionCharge;
        const vatAmount = totalTaxable * 0.13;
        const grossAmount = totalTaxable + vatAmount;
        const tdsAmount = grossAmount * 0.015;
        const netPay = grossAmount - tdsAmount;
        
        const totalFuel = (values.fuelEntries || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        const truckAdvance = Number(values.truckAdvance) || 0;
        const transport = Number(values.transport) || 0;
        const returnLoadIncomeVal = Number(values.returnLoadIncome) || 0;
        const totalExtraExpenses = (values.extraExpenses || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

        const totalExpenses = truckAdvance + transport + totalFuel + totalExtraExpenses;
        const netAmount = netPay - totalExpenses + returnLoadIncomeVal;
        
        return { 
            totalFreight, 
            dropOffCharge, 
            detentionCharge, 
            totalTaxable, 
            vatAmount, 
            grossAmount, 
            tdsAmount, 
            netPay, 
            totalExpenses, 
            returnLoadIncome: returnLoadIncomeVal, 
            netAmount, 
            detentionDays: days 
        };
    }, [watchedFormValues]);
    
    const handleConfirmDetention = () => {
        form.setValue('detentionStartDate', detentionDateRange?.from);
        form.setValue('detentionEndDate', detentionDateRange?.to);
        setIsDetentionDialogOpen(false);
    };
    
    const handleClearDetention = () => {
        form.setValue('detentionStartDate', undefined);
        form.setValue('detentionEndDate', undefined);
        setDetentionDateRange(undefined);
    };

    async function onSubmit(values: TripFormValues) {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const filteredDestinations: TripDestination[] = values.destinations
              .filter(d => d && d.name && d.name.trim() !== '' && d.freight && Number(d.freight) > 0)
              .map(d => ({ name: d.name!, freight: Number(d.freight!) }));
              
            if (filteredDestinations.length === 0) {
                form.setError('destinations', { type: 'manual', message: 'At least one valid destination with freight is required.' });
                setIsSubmitting(false);
                return;
            }
            
            const filteredExtraExpenses: ExtraExpense[] = (values.extraExpenses || [])
                .filter(e => e.description && e.description.trim() !== '' && e.amount && Number(e.amount) > 0)
                .map(e => ({ description: e.description, amount: Number(e.amount), partyId: e.partyId }));

            const newTripData: Omit<Trip, 'id'> = {
                ...values,
                destinations: filteredDestinations,
                extraExpenses: filteredExtraExpenses,
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

    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type) {
            toast({title: 'Error', description: 'Vendor name is required.', variant: 'destructive'});
            return;
        }
        try {
            if (editingParty) {
                await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
                toast({title: 'Success', description: 'Vendor updated.'});
            } else {
                await addParty({...partyForm, createdBy: user.username});
                toast({title: 'Success', description: 'New vendor added.'});
            }
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Vendor', address: '', panNumber: ''});
            setEditingParty(null);
        } catch {
             toast({title: 'Error', description: 'Failed to save vendor.', variant: 'destructive'});
        }
    };

    const handleOpenPartyDialog = (party: Party | null = null) => {
        if (party) {
            setEditingParty(party);
            setPartyForm({ name: party.name, type: party.type, address: party.address || '', panNumber: party.panNumber || '' });
        } else {
            setEditingParty(null);
            setPartyForm({ name: partySearch, type: 'Vendor', address: '', panNumber: '' });
        }
        setIsPartyDialogOpen(true);
    };

    const handleSubmitDestination = async () => {
        if (!user) return;
        if (!destinationForm.name.trim()) {
            toast({ title: 'Error', description: 'Destination name is required.', variant: 'destructive' });
            return;
        }
        try {
            if (editingDestination) {
                await updateDestination(editingDestination.id, { ...destinationForm, lastModifiedBy: user.username });
                toast({ title: 'Success', description: 'Destination updated.' });
            } else {
                await addDestination({ ...destinationForm, createdBy: user.username });
                toast({ title: 'Success', description: 'New destination added.' });
            }
            setIsDestinationDialogOpen(false);
            setDestinationForm({ name: '' });
            setEditingDestination(null);
        } catch {
            toast({ title: 'Error', description: 'Failed to save destination.', variant: 'destructive' });
        }
    };
    
    const handleOpenDestinationDialog = (destination: Destination | null = null) => {
        if (destination) {
            setEditingDestination(destination);
            setDestinationForm({ name: destination.name });
        } else {
            setEditingDestination(null);
            setDestinationForm({ name: destinationSearch });
        }
        setIsDestinationDialogOpen(true);
    };

    const handleDestinationSelect = (index: number, destinationName: string) => {
        form.setValue(`destinations.${index}.name`, destinationName);
        
        const sortedTrips = trips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        let lastTripWithDestination: Trip | undefined;
        let lastFreight: number | undefined;

        if (index === 0) { // Final Destination
            lastTripWithDestination = sortedTrips.find(trip => 
                trip.destinations.length > 0 && trip.destinations[0].name.toLowerCase() === destinationName.toLowerCase()
            );
            if (lastTripWithDestination) {
                lastFreight = lastTripWithDestination.destinations[0].freight;
            }
        } else { // Additional Destination
            lastTripWithDestination = sortedTrips.find(trip => {
                const additionalDest = trip.destinations.slice(1).find(d => d.name.toLowerCase() === destinationName.toLowerCase());
                if (additionalDest) {
                    lastFreight = additionalDest.freight;
                    return true;
                }
                return false;
            });
        }

        // Fallback: If no role-specific match found, find any match
        if (!lastTripWithDestination) {
            lastTripWithDestination = sortedTrips.find(trip => 
                trip.destinations.some(d => d.name.toLowerCase() === destinationName.toLowerCase())
            );
             if (lastTripWithDestination) {
                lastFreight = lastTripWithDestination.destinations.find(d => d.name.toLowerCase() === destinationName.toLowerCase())?.freight;
            }
        }

        if (lastFreight) {
            form.setValue(`destinations.${index}.freight`, lastFreight);
        } else {
             form.setValue(`destinations.${index}.freight`, 0);
        }
    };
    
    const watchedNumberOfParties = form.watch('numberOfParties');

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
                                                     <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                            <Button variant="outline" role="combobox" className="w-full justify-between">
                                                                {field.value || (index === 0 ? "Final Destination" : "Additional Destination")}
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                            </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="p-0">
                                                            <Command>
                                                            <CommandInput 
                                                                placeholder="Search destination..."
                                                                value={destinationSearch}
                                                                onValueChange={setDestinationSearch}
                                                            />
                                                            <CommandList>
                                                                <CommandEmpty>
                                                                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenDestinationDialog()}>
                                                                        <PlusCircle className="mr-2 h-4 w-4"/> Add Destination
                                                                    </Button>
                                                                </CommandEmpty>
                                                                <CommandGroup>
                                                                {destinations.map((dest) => (
                                                                    <CommandItem
                                                                    key={dest.id}
                                                                    value={dest.name}
                                                                    onSelect={() => handleDestinationSelect(index, dest.name)}
                                                                    className="flex justify-between items-center"
                                                                    >
                                                                    <div className="flex items-center">
                                                                        <Check className={cn("mr-2 h-4 w-4", field.value === dest.name ? "opacity-100" : "opacity-0")} />
                                                                        {dest.name}
                                                                    </div>
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenDestinationDialog(dest); }}>
                                                                        <Edit className="h-4 w-4" />
                                                                    </Button>
                                                                    </CommandItem>
                                                                ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                            </Command>
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage/>
                                                </FormItem>
                                            }/>
                                        </TableCell>
                                        <TableCell>
                                            <FormField control={form.control} name={`destinations.${index}.freight`} render={({ field }) => 
                                                <FormItem>
                                                    <FormControl>
                                                        <Input type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                                                    </FormControl>
                                                    <FormMessage/>
                                                </FormItem>
                                            }/>
                                        </TableCell>
                                        <TableCell>
                                            {index > 0 && 
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeDestination(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            }
                                        </TableCell>
                                    </TableRow>))}
                                </TableBody></Table>
                                {form.formState.errors.destinations && <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.destinations.root?.message}</p>}
                                
                                <div className="flex justify-between items-center mt-4">
                                    <Button type="button" size="sm" variant="outline" onClick={() => appendDestination({ name: '', freight: 0 })}>
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Destination
                                    </Button>
                                    <div className="flex items-center gap-4">
                                        <FormField control={form.control} name="numberOfParties" render={({ field }) => (
                                            <FormItem className="flex items-center gap-2 space-y-0">
                                                <FormLabel>Number of Parties</FormLabel>
                                                <FormControl>
                                                    <Input type="number" className="w-24" {...field} 
                                                        value={field.value ?? ''}
                                                        onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))} />
                                                </FormControl>
                                            </FormItem>
                                        )} />
                                        {(watchedNumberOfParties ?? 0) > 3 && (
                                            <FormField control={form.control} name="dropOffChargeRate" render={({ field }) => (
                                                <FormItem className="flex items-center gap-2 space-y-0">
                                                    <FormLabel>Extra Drop-off Rate</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" className="w-24" {...field} 
                                                            value={field.value ?? ''}
                                                            onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                                                    </FormControl>
                                                </FormItem>
                                            )} />
                                        )}
                                    </div>
                                </div>
                                
                                <div className="mt-6 pt-6 border-t">
                                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                         <div className="space-y-2">
                                            <Label>Detention</Label>
                                             <div className="flex items-center gap-2">
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
                                                {watchedFormValues.detentionStartDate && (
                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleClearDetention}>
                                                        <X className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                )}
                                             </div>
                                             {watchedFormValues.detentionStartDate && (
                                                <p className="text-xs text-muted-foreground">
                                                    {format(watchedFormValues.detentionStartDate, "PPP")} - {watchedFormValues.detentionEndDate ? format(watchedFormValues.detentionEndDate, "PPP") : ''}
                                                </p>
                                            )}
                                        </div>
                                        {watchedFormValues.detentionStartDate && (
                                        <FormField control={form.control} name="detentionChargeRate" render={({ field }) => 
                                            <FormItem>
                                                <FormLabel>Detention Rate/Day</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} 
                                                        value={field.value ?? ''} 
                                                        onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                                                </FormControl>
                                            </FormItem>} />
                                        )}
                                     </div>
                                </div>
                                </CardContent>
                            </Card>
                             <Card>
                                <CardHeader><CardTitle>Trip Expenses & Income</CardTitle></CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="truckAdvance" render={({ field }) => <FormItem><FormLabel>Truck Advance</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl></FormItem>} />
                                        <FormField control={form.control} name="transport" render={({ field }) => <FormItem><FormLabel>Transport</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl></FormItem>} />
                                    </div>
                                    <div>
                                        <Label className="text-base font-medium">Fuel</Label>
                                        <div className="mt-2 space-y-4">
                                            {fuelFields.map((item, index) => (<div key={item.id} className="grid grid-cols-1 md:grid-cols-3 items-start gap-2">
                                                <FormField control={form.control} name={`fuelEntries.${index}.partyId`} render={({ field }) => (
                                                    <FormItem className="md:col-span-1">
                                                        <Popover>
                                                          <PopoverTrigger asChild>
                                                            <FormControl>
                                                              <Button variant="outline" role="combobox" className="w-full justify-between">
                                                                {field.value ? vendors.find((v) => v.id === field.value)?.name : "Select fuel vendor"}
                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                              </Button>
                                                            </FormControl>
                                                          </PopoverTrigger>
                                                          <PopoverContent className="p-0">
                                                            <Command>
                                                              <CommandInput 
                                                                  placeholder="Search vendor..."
                                                                  value={partySearch}
                                                                  onValueChange={setPartySearch}
                                                              />
                                                              <CommandList>
                                                                <CommandEmpty>
                                                                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog()}>
                                                                        <PlusCircle className="mr-2 h-4 w-4"/> Add Vendor
                                                                    </Button>
                                                                </CommandEmpty>
                                                                <CommandGroup>
                                                                  {vendors.map((vendor) => (
                                                                    <CommandItem
                                                                      key={vendor.id}
                                                                      value={vendor.name}
                                                                      onSelect={() => field.onChange(vendor.id)}
                                                                      className="flex justify-between items-center"
                                                                    >
                                                                      <div className="flex items-center">
                                                                        <Check className={cn("mr-2 h-4 w-4", field.value === vendor.id ? "opacity-100" : "opacity-0")} />
                                                                        {vendor.name}
                                                                      </div>
                                                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenPartyDialog(vendor); }}>
                                                                        <Edit className="h-4 w-4" />
                                                                      </Button>
                                                                    </CommandItem>
                                                                  ))}
                                                                </CommandGroup>
                                                              </CommandList>
                                                            </Command>
                                                          </PopoverContent>
                                                        </Popover>
                                                        <FormMessage />
                                                      </FormItem>
                                                )}/>
                                                <div className="flex items-center gap-2 md:col-span-2">
                                                    <FormField control={form.control} name={`fuelEntries.${index}.liters`} render={({ field }) => <FormItem className="flex-1"><FormControl><Input type="number" placeholder="Enter Liter" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl><FormMessage/></FormItem>} />
                                                    <FormField control={form.control} name={`fuelEntries.${index}.amount`} render={({ field }) => <FormItem className="flex-1"><FormControl><Input type="number" placeholder="Enter fuel amount" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl><FormMessage/></FormItem>} />
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFuel(index)} className="mt-2"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </div>
                                            </div>))}
                                        </div>
                                        <Button type="button" size="sm" variant="outline" onClick={() => appendFuel({ partyId: '', amount: undefined, liters: undefined })} className="mt-4"><PlusCircle className="mr-2 h-4 w-4" /> Add Fuel Entry</Button>
                                    </div>
                                    <div>
                                        <Label className="text-base font-medium">Extra Expenses</Label>
                                        <div className="mt-2 space-y-4">
                                            {expenseFields.map((item, index) => (
                                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-3 items-start gap-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`extraExpenses.${index}.partyId`}
                                                        render={({ field }) => (
                                                            <FormItem className="md:col-span-1">
                                                                <Popover>
                                                                    <PopoverTrigger asChild>
                                                                        <FormControl>
                                                                            <Button variant="outline" role="combobox" className="w-full justify-between">
                                                                                {field.value ? vendors.find((v) => v.id === field.value)?.name : "Select vendor (optional)"}
                                                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                                            </Button>
                                                                        </FormControl>
                                                                    </PopoverTrigger>
                                                                    <PopoverContent className="p-0">
                                                                        <Command>
                                                                            <CommandInput
                                                                                placeholder="Search vendor..."
                                                                                value={partySearch}
                                                                                onValueChange={setPartySearch}
                                                                            />
                                                                            <CommandList>
                                                                                <CommandEmpty>
                                                                                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog()}>
                                                                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Vendor
                                                                                    </Button>
                                                                                </CommandEmpty>
                                                                                <CommandGroup>
                                                                                    {vendors.map((vendor) => (
                                                                                        <CommandItem
                                                                                            key={vendor.id}
                                                                                            value={vendor.name}
                                                                                            onSelect={() => field.onChange(vendor.id)}
                                                                                            className="flex justify-between items-center"
                                                                                        >
                                                                                            <div className="flex items-center">
                                                                                                <Check className={cn("mr-2 h-4 w-4", field.value === vendor.id ? "opacity-100" : "opacity-0")} />
                                                                                                {vendor.name}
                                                                                            </div>
                                                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenPartyDialog(vendor); }}>
                                                                                                <Edit className="h-4 w-4" />
                                                                                            </Button>
                                                                                        </CommandItem>
                                                                                    ))}
                                                                                </CommandGroup>
                                                                            </CommandList>
                                                                        </Command>
                                                                    </PopoverContent>
                                                                </Popover>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name={`extraExpenses.${index}.description`}
                                                        render={({ field }) => (
                                                            <FormItem className="md:col-span-1">
                                                                <FormControl><Input placeholder="Expense description" {...field} value={field.value ?? ''} /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <div className="flex items-center gap-2 md:col-span-1">
                                                        <FormField
                                                            control={form.control}
                                                            name={`extraExpenses.${index}.amount`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex-1">
                                                                    <FormControl><Input type="number" placeholder="Amount" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeExpense(index)} className="mt-2">
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <Button type="button" size="sm" variant="outline" onClick={() => appendExpense({ description: '', amount: 0, partyId: '' })} className="mt-4">
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
                                        </Button>
                                    </div>
                                    <FormField control={form.control} name="returnLoadIncome" render={({ field }) => <FormItem><FormLabel>Additional Income (Return Load)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl></FormItem>} />
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

            <Dialog open={isPartyDialogOpen} onOpenChange={(isOpen) => {
                if (!isOpen) setEditingParty(null);
                setIsPartyDialogOpen(isOpen);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingParty ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="party-name">Vendor Name</Label>
                            <Input id="party-name" value={partyForm.name} onChange={e => setPartyForm(p => ({...p, name: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-address">Address</Label>
                            <Textarea id="party-address" value={partyForm.address} onChange={e => setPartyForm(p => ({...p, address: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-pan">PAN Number</Label>
                            <Input id="party-pan" value={partyForm.panNumber} onChange={e => setPartyForm(p => ({...p, panNumber: e.target.value}))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitParty}>{editingParty ? 'Save Changes' : 'Add Vendor'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={isDestinationDialogOpen} onOpenChange={(isOpen) => {
                if (!isOpen) setEditingDestination(null);
                setIsDestinationDialogOpen(isOpen);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingDestination ? 'Edit Destination' : 'Add New Destination'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="destination-name">Destination Name</Label>
                            <Input id="destination-name" value={destinationForm.name} onChange={e => setDestinationForm({ name: e.target.value })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDestinationDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitDestination}>{editingDestination ? 'Save Changes' : 'Add Destination'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
