
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Vehicle, Party, Trip, Destination, PartyType, TripDestination, ExtraExpense, FuelEntry, ReturnTrip } from '@/lib/types';
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
import { addTrip, updateTrip, onTripsUpdate } from '@/services/trip-service';
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

const returnTripSchema = z.object({
    date: z.date().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    partyId: z.string().optional(),
    freight: z.number().optional(),
    expenses: z.number().optional(),
});


const tripSchema = z.object({
  date: z.date(),
  vehicleId: z.string().min(1, 'Vehicle is required.'),
  partyId: z.string().min(1, 'Client is required.'),
  odometerStart: z.number().min(0, "Odometer value cannot be negative").optional(),
  odometerEnd: z.number().min(0, "Odometer value cannot be negative").optional(),
  destinations: z.array(destinationSchema),
  truckAdvance: z.number().min(0, "Advance cannot be negative").optional(),
  transport: z.number().min(0, "Transport charge cannot be negative"),
  fuelEntries: z.array(fuelEntrySchema),
  extraExpenses: z.array(extraExpenseSchema),
  returnTrips: z.array(returnTripSchema),
  detentionStartDate: z.date().optional(),
  detentionEndDate: z.date().optional(),
  numberOfParties: z.number().min(0, "Number of parties cannot be negative").optional(),
  dropOffChargeRate: z.number().min(0, "Drop-off rate cannot be negative").optional(),
  detentionChargeRate: z.number().min(0, "Detention rate cannot be negative").optional(),
}).refine(data => !data.odometerEnd || !data.odometerStart || data.odometerEnd >= data.odometerStart, {
    message: "End odometer must be greater than or equal to start odometer.",
    path: ["odometerEnd"],
}).refine(data => {
    return data.destinations.some(d => d && d.name && d.name.trim() !== '' && d.freight && Number(d.freight) > 0);
}, {
    message: "At least one destination with a valid freight amount is required.",
    path: ["destinations"],
});

type TripFormValues = z.infer<typeof tripSchema>;

interface TripSheetFormProps {
  tripToEdit?: Trip;
}

export function TripSheetForm({ tripToEdit }: TripSheetFormProps) {
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
    const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, address?: string, panNumber?: string}>({name: '', type: 'Client', address: '', panNumber: ''});
    const [editingParty, setEditingParty] = useState<Party | null>(null);
    const [partySearch, setPartySearch] = useState('');
    const [returnTripPartySearch, setReturnTripPartySearch] = useState<{ [key: number]: string }>({});

    
    const [isDestinationDialogOpen, setIsDestinationDialogOpen] = useState(false);
    const [destinationForm, setDestinationForm] = useState<{ name: string }>({ name: '' });
    const [editingDestination, setEditingDestination] = useState<Destination | null>(null);
    const [destinationSearch, setDestinationSearch] = useState('');


    const defaultValues = useMemo(() => {
        if (tripToEdit) {
            return {
                ...tripToEdit,
                date: new Date(tripToEdit.date),
                detentionStartDate: tripToEdit.detentionStartDate ? new Date(tripToEdit.detentionStartDate) : undefined,
                detentionEndDate: tripToEdit.detentionEndDate ? new Date(tripToEdit.detentionEndDate) : undefined,
                destinations: tripToEdit.destinations.map(d => ({ ...d, freight: Number(d.freight) })),
                fuelEntries: tripToEdit.fuelEntries.map(f => ({ ...f, amount: Number(f.amount), liters: f.liters ? Number(f.liters) : undefined })),
                extraExpenses: tripToEdit.extraExpenses.map(e => ({ ...e, amount: Number(e.amount) })),
                returnTrips: tripToEdit.returnTrips.map(rt => ({
                    ...rt,
                    date: rt.date ? new Date(rt.date) : undefined,
                    freight: rt.freight ? Number(rt.freight) : undefined,
                    expenses: rt.expenses ? Number(rt.expenses) : undefined
                }))
            };
        }
        return {
            date: new Date(),
            vehicleId: '',
            partyId: '',
            odometerStart: undefined,
            odometerEnd: undefined,
            destinations: [
                { name: '', freight: undefined },
            ],
            truckAdvance: undefined,
            transport: 0,
            fuelEntries: [],
            extraExpenses: [],
            returnTrips: [],
            detentionStartDate: undefined,
            detentionEndDate: undefined,
            numberOfParties: 0,
            dropOffChargeRate: 800,
            detentionChargeRate: 3000,
        };
    }, [tripToEdit]);

    const form = useForm<TripFormValues>({
        resolver: zodResolver(tripSchema),
        defaultValues,
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

    const { fields: returnTripFields, append: appendReturnTrip, remove: removeReturnTrip } = useFieldArray({
        control: form.control,
        name: "returnTrips",
    });

    useEffect(() => {
        const unsubVehicles = onVehiclesUpdate(setVehicles);
        const unsubParties = onPartiesUpdate(setParties);
        const unsubDestinations = onDestinationsUpdate(setDestinations);
        const unsubTrips = onTripsUpdate(setTrips);

        if (tripToEdit) {
            form.reset(defaultValues);
            if (tripToEdit.detentionStartDate) {
                setDetentionDateRange({ from: new Date(tripToEdit.detentionStartDate), to: tripToEdit.detentionEndDate ? new Date(tripToEdit.detentionEndDate) : undefined });
            }
        }

        return () => {
            unsubVehicles();
            unsubParties();
            unsubDestinations();
            unsubTrips();
        };
    }, [tripToEdit, form, defaultValues]);

    const vendors = useMemo(() => parties.filter(p => p.type === 'Vendor' || p.type === 'Both'), [parties]);
    const clients = useMemo(() => parties.filter(p => p.type === 'Client' || p.type === 'Both'), [parties]);
    
    const watchedFormValues = form.watch();
    const finalDestinationName = watchedFormValues.destinations?.[0]?.name;
    const selectedVehicleId = watchedFormValues.vehicleId;

    useEffect(() => {
        if (finalDestinationName && !tripToEdit) { // Only auto-fill on new trips
            const sortedTrips = trips.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastTripToDestination = sortedTrips.find(trip => 
                trip.destinations.length > 0 && trip.destinations[0].name.toLowerCase() === finalDestinationName.toLowerCase()
            );

            if (lastTripToDestination && lastTripToDestination.truckAdvance) {
                form.setValue('truckAdvance', lastTripToDestination.truckAdvance);
            }
        }
    }, [finalDestinationName, trips, form, tripToEdit]);
    
    useEffect(() => {
        if (selectedVehicleId && !tripToEdit) { // Only auto-fill on new trips
            const lastTripForVehicle = trips
                .filter(trip => trip.vehicleId === selectedVehicleId && trip.odometerEnd)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

            if (lastTripForVehicle) {
                form.setValue('odometerStart', lastTripForVehicle.odometerEnd);
            } else {
                 form.setValue('odometerStart', undefined);
            }
        }
    }, [selectedVehicleId, trips, form, tripToEdit]);

    const { 
        totalFreight, dropOffCharge, detentionCharge, totalTaxable, vatAmount, grossAmount, tdsAmount, netPay, 
        totalExpenses, totalReturnLoadIncome, netAmount, detentionDays,
        totalDistance, totalFuelLiters, fuelEfficiency 
    } = useMemo(() => {
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
        
        const totalFuelAmount = (values.fuelEntries || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
        const truckAdvance = Number(values.truckAdvance) || 0;
        const transport = Number(values.transport) || 0;
        
        const totalReturnLoadIncomeVal = (values.returnTrips || []).reduce((sum, trip) => {
            const freight = Number(trip.freight) || 0;
            const expenses = Number(trip.expenses) || 0;
            return sum + (freight - expenses);
        }, 0);

        const totalExtraExpenses = (values.extraExpenses || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

        const totalExpenses = truckAdvance + transport + totalFuelAmount + totalExtraExpenses;
        const netAmount = netPay - totalExpenses + totalReturnLoadIncomeVal;
        
        const odoStart = Number(values.odometerStart) || 0;
        const odoEnd = Number(values.odometerEnd) || 0;
        const totalDistance = odoEnd > odoStart ? odoEnd - odoStart : 0;
        const totalLiters = (values.fuelEntries || []).reduce((sum, entry) => sum + (Number(entry.liters) || 0), 0);
        const efficiency = totalLiters > 0 && totalDistance > 0 ? (totalDistance / totalLiters).toFixed(2) : 'N/A';
        
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
            totalReturnLoadIncome: totalReturnLoadIncomeVal, 
            netAmount, 
            detentionDays: days,
            totalDistance,
            totalFuelLiters: totalLiters,
            fuelEfficiency: efficiency
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

        const tripDataForDb: Omit<Trip, 'id' | 'createdAt' | 'lastModifiedAt' | 'salesTransactionId'> = {
            date: values.date.toISOString(),
            vehicleId: values.vehicleId,
            partyId: values.partyId,
            transport: Number(values.transport),
            destinations: (values.destinations || [])
                .filter(d => d && d.name && d.name.trim() !== '' && d.freight && Number(d.freight) > 0)
                .map(d => ({ name: d.name!, freight: Number(d.freight!) })),
            fuelEntries: (values.fuelEntries || [])
                .filter(f => f.partyId && f.amount && Number(f.amount) > 0)
                .map(f => {
                    const entry: FuelEntry = {
                        partyId: f.partyId,
                        amount: Number(f.amount)
                    };
                    if (f.liters !== undefined && f.liters !== null) entry.liters = Number(f.liters);
                    return entry;
                }),
            extraExpenses: (values.extraExpenses || [])
                .filter(e => e.description && e.description.trim() !== '' && e.amount && Number(e.amount) > 0)
                .map(e => {
                    const expense: ExtraExpense = { description: e.description, amount: Number(e.amount) };
                    if (e.partyId) expense.partyId = e.partyId;
                    return expense;
                }),
            returnTrips: (values.returnTrips || [])
                .filter(rt => rt.freight && Number(rt.freight) > 0)
                .map(rt => {
                    const returnTrip: Partial<ReturnTrip> = {};
                    if(rt.from) returnTrip.from = rt.from;
                    if(rt.to) returnTrip.to = rt.to;
                    if(rt.freight) returnTrip.freight = Number(rt.freight) || 0;
                    if(rt.expenses) returnTrip.expenses = Number(rt.expenses) || 0;
                    if (rt.partyId) returnTrip.partyId = rt.partyId;
                    if (rt.date) returnTrip.date = rt.date.toISOString();
                    
                    return returnTrip as ReturnTrip;
                }),
            createdBy: user.username,
        };

        if (values.odometerStart !== undefined && values.odometerStart !== null) tripDataForDb.odometerStart = values.odometerStart;
        if (values.odometerEnd !== undefined && values.odometerEnd !== null) tripDataForDb.odometerEnd = values.odometerEnd;
        if (values.truckAdvance !== undefined && values.truckAdvance !== null) tripDataForDb.truckAdvance = values.truckAdvance;
        if (values.detentionStartDate) tripDataForDb.detentionStartDate = values.detentionStartDate.toISOString();
        if (values.detentionEndDate) tripDataForDb.detentionEndDate = values.detentionEndDate.toISOString();
        if (values.numberOfParties !== undefined && values.numberOfParties !== null) tripDataForDb.numberOfParties = values.numberOfParties;
        if (values.dropOffChargeRate !== undefined && values.dropOffChargeRate !== null) tripDataForDb.dropOffChargeRate = values.dropOffChargeRate;
        if (values.detentionChargeRate !== undefined && values.detentionChargeRate !== null) tripDataForDb.detentionChargeRate = values.detentionChargeRate;

        try {
            if (tripToEdit) {
                await updateTrip(tripToEdit.id, {
                    ...tripDataForDb,
                    lastModifiedBy: user.username
                });
                toast({ title: 'Success', description: 'Trip sheet updated successfully.' });
                router.push('/fleet/trip-sheets');
            } else {
                await addTrip(tripDataForDb);
                toast({ title: 'Success', description: 'Trip sheet created and transaction recorded.' });
                router.push('/fleet/transactions');
            }

        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'Failed to save trip sheet.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSubmitParty = async () => {
        if(!user) return;
        if(!partyForm.name || !partyForm.type) {
            toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
            return;
        }
        try {
            if (editingParty) {
                await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
                toast({title: 'Success', description: 'Party updated.'});
            } else {
                await addParty({...partyForm, createdBy: user.username});
                toast({title: 'Success', description: 'New party added.'});
            }
            setIsPartyDialogOpen(false);
            setPartyForm({name: '', type: 'Client', address: '', panNumber: ''});
            setEditingParty(null);
        } catch {
             toast({title: 'Error', description: 'Failed to save party.', variant: 'destructive'});
        }
    };

    const handleOpenPartyDialog = (party: Party | null = null, type: PartyType, searchName: string = '') => {
        if (party) {
            setEditingParty(party);
            setPartyForm({ name: party.name, type: party.type, address: party.address || '', panNumber: party.panNumber || '' });
        } else {
            setEditingParty(null);
            setPartyForm({ name: searchName, type, address: '', panNumber: '' });
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
        let lastFreight: number | undefined;

        // Find the last trip where this destination was used in the same role (final vs. additional)
        for (const trip of sortedTrips) {
            if (index === 0) { // Looking for a final destination
                if (trip.destinations.length > 0 && trip.destinations[0].name.toLowerCase() === destinationName.toLowerCase()) {
                    lastFreight = trip.destinations[0].freight;
                    break;
                }
            } else { // Looking for an additional destination
                const additionalDest = trip.destinations.slice(1).find(d => d.name.toLowerCase() === destinationName.toLowerCase());
                if (additionalDest) {
                    lastFreight = additionalDest.freight;
                    break;
                }
            }
        }

        if (lastFreight) {
            form.setValue(`destinations.${index}.freight`, lastFreight);
        } else {
             form.setValue(`destinations.${index}.freight`, undefined);
        }
    };
    
    const watchedNumberOfParties = form.watch('numberOfParties');

    return (
        <div className="flex flex-col gap-8">
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
                                     <FormField control={form.control} name="partyId" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Client</FormLabel>
                                             <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                    <Button variant="outline" role="combobox" className="w-full justify-between">
                                                        {field.value ? clients.find((c) => c.id === field.value)?.name : "Select client"}
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="p-0">
                                                    <Command>
                                                    <CommandInput 
                                                        placeholder="Search client..."
                                                        value={partySearch}
                                                        onValueChange={setPartySearch}
                                                    />
                                                    <CommandList>
                                                        <CommandEmpty>
                                                            <CommandItem onSelect={() => handleOpenPartyDialog(null, 'Client', partySearch)}>
                                                                <PlusCircle className="mr-2 h-4 w-4"/> Add "{partySearch}"
                                                            </CommandItem>
                                                        </CommandEmpty>
                                                        <CommandGroup>
                                                        {clients.map((client) => (
                                                            <CommandItem
                                                            key={client.id}
                                                            value={client.name}
                                                            onSelect={() => field.onChange(client.id)}
                                                            className="flex justify-between items-center"
                                                            >
                                                            <div className="flex items-center">
                                                                <Check className={cn("mr-2 h-4 w-4", field.value === client.id ? "opacity-100" : "opacity-0")} />
                                                                {client.name}
                                                            </div>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenPartyDialog(client, 'Client'); }}>
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
                                    <div className="grid grid-cols-2 gap-4 md:col-span-1">
                                        <FormField control={form.control} name="odometerStart" render={({ field }) => (
                                            <FormItem><FormLabel>Odometer Start (KM)</FormLabel><FormControl><Input type="number" placeholder="e.g. 125000" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="odometerEnd" render={({ field }) => (
                                            <FormItem><FormLabel>Odometer End (KM)</FormLabel><FormControl><Input type="number" placeholder="e.g. 125500" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                    </div>
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
                                <CardHeader><CardTitle>Trip Expenses</CardTitle></CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField control={form.control} name="truckAdvance" render={({ field }) => <FormItem><FormLabel>Truck Advance</FormLabel><FormControl><Input type="number" placeholder="Peski Amount" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>} />
                                        <FormField control={form.control} name="transport" render={({ field }) => <FormItem><FormLabel>Transport</FormLabel><FormControl><Input type="number" placeholder="Billing charge" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>} />
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
                                                                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, 'Vendor')}>
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
                                                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenPartyDialog(vendor, 'Vendor'); }}>
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
                                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr] items-start gap-2">
                                                    <FormField
                                                        control={form.control}
                                                        name={`extraExpenses.${index}.partyId`}
                                                        render={({ field }) => (
                                                            <FormItem>
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
                                                                                    <Button variant="ghost" className="w-full justify-start" onClick={() => handleOpenPartyDialog(null, 'Vendor')}>
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
                                                                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenPartyDialog(vendor, 'Vendor'); }}>
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
                                                    <div className="flex items-center gap-2">
                                                        <FormField
                                                            control={form.control}
                                                            name={`extraExpenses.${index}.description`}
                                                            render={({ field }) => (
                                                                <FormItem className="flex-1">
                                                                    <FormControl><Input placeholder="Expense description" {...field} value={field.value ?? ''} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
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
                                        <Button type="button" size="sm" variant="outline" onClick={() => appendExpense({ description: '', amount: undefined, partyId: '' })} className="mt-4">
                                            <PlusCircle className="mr-2 h-4 w-4" /> Add Expense
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                             
                           <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>Return Trips</CardTitle>
                                        <CardDescription>Record details about return loads to calculate net income.</CardDescription>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => appendReturnTrip({ date: undefined, from: '', to: '', partyId: '', freight: undefined, expenses: undefined })}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" /> Add Return Trip
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {returnTripFields.map((item, index) => {
                                        const watchedTrip = watchedFormValues.returnTrips?.[index];
                                        const balance = (Number(watchedTrip?.freight) || 0) - (Number(watchedTrip?.expenses) || 0);
                                        const currentSearch = returnTripPartySearch[index] || '';

                                        return (
                                            <div key={item.id} className="p-4 border rounded-lg space-y-4 relative">
                                                <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={() => removeReturnTrip(index)}>
                                                    <X className="h-4 w-4 text-destructive" />
                                                </Button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    <FormField control={form.control} name={`returnTrips.${index}.date`} render={({ field }) => (
                                                        <FormItem className="flex flex-col"><FormLabel>Return Date (Optional)</FormLabel>
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
                                                     <FormField control={form.control} name={`returnTrips.${index}.partyId`} render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Client</FormLabel>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <FormControl>
                                                                    <Button variant="outline" role="combobox" className="w-full justify-between">
                                                                        {field.value ? clients.find((c) => c.id === field.value)?.name : "Select client"}
                                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                                    </Button>
                                                                    </FormControl>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="p-0">
                                                                    <Command>
                                                                    <CommandInput 
                                                                        placeholder="Search client..."
                                                                        value={currentSearch}
                                                                        onValueChange={(value) => setReturnTripPartySearch(prev => ({ ...prev, [index]: value }))}
                                                                    />
                                                                    <CommandList>
                                                                        <CommandEmpty>
                                                                            <CommandItem onSelect={() => handleOpenPartyDialog(null, 'Client', currentSearch)}>
                                                                                <PlusCircle className="mr-2 h-4 w-4"/> Add "{currentSearch}"
                                                                            </CommandItem>
                                                                        </CommandEmpty>
                                                                        <CommandGroup>
                                                                        {clients.map((client) => (
                                                                            <CommandItem key={client.id} value={client.name} onSelect={() => field.onChange(client.id)}>
                                                                                <Check className={cn("mr-2 h-4 w-4", field.value === client.id ? "opacity-100" : "opacity-0")} />
                                                                                {client.name}
                                                                            </CommandItem>
                                                                        ))}
                                                                    </CommandGroup></CommandList>
                                                                    </Command>
                                                                </PopoverContent>
                                                            </Popover>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>
                                                    <FormField control={form.control} name={`returnTrips.${index}.from`} render={({ field }) => (<FormItem><FormLabel>From</FormLabel><FormControl><Input placeholder="Starting point" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                                                    <FormField control={form.control} name={`returnTrips.${index}.to`} render={({ field }) => (<FormItem><FormLabel>To</FormLabel><FormControl><Input placeholder="Destination" {...field} value={field.value ?? ''} /></FormControl></FormItem>)} />
                                                    <FormField control={form.control} name={`returnTrips.${index}.freight`} render={({ field }) => (<FormItem><FormLabel>Freight</FormLabel><FormControl><Input type="number" placeholder="Income from load" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl></FormItem>)} />
                                                    <FormField control={form.control} name={`returnTrips.${index}.expenses`} render={({ field }) => (<FormItem><FormLabel>Expenses</FormLabel><FormControl><Input type="number" placeholder="Expenses during return" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl></FormItem>)} />
                                                    <div className="flex flex-col justify-end space-y-2">
                                                        <Label>Balance Income</Label>
                                                        <div className="p-2 border rounded-md h-10 flex items-center text-sm font-medium">
                                                             <span>{balance.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Return Load</span><span>+ {totalReturnLoadIncome.toLocaleString()}</span></div>
                                    <Separator />
                                    <div className="flex justify-between text-xl font-bold text-green-600"><span className="text-muted-foreground">Net Amount</span><span>{netAmount.toLocaleString()}</span></div>
                                    <Separator />
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Distance</span><span>{totalDistance.toLocaleString()} KM</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Fuel Efficiency</span><span>{fuelEfficiency} KM/L</span></div>

                                </CardContent>
                            </Card>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => router.push('/fleet/trip-sheets')}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : (tripToEdit ? 'Update Trip Sheet' : 'Save Trip Sheet')}
                        </Button>
                    </div>
                </form>
            </Form>

            <Dialog open={isPartyDialogOpen} onOpenChange={(isOpen) => {
                if (!isOpen) setEditingParty(null);
                setIsPartyDialogOpen(isOpen);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingParty ? 'Edit Party' : 'Add New Party'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                         <div className="space-y-2">
                            <Label htmlFor="party-type">Party Type</Label>
                             <Select value={partyForm.type} onValueChange={(v: PartyType) => setPartyForm(p => ({...p, type: v}))}>
                                <SelectTrigger id="party-type"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Client">Client</SelectItem>
                                    <SelectItem value="Vendor">Vendor</SelectItem>
                                    <SelectItem value="Both">Both</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="party-name">Party Name</Label>
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
                        <Button onClick={handleSubmitParty}>{editingParty ? 'Save Changes' : 'Add Party'}</Button>
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
