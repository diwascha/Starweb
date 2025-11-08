
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PlusCircle, MoreHorizontal, Edit, Trash2, View, ArrowUpDown, Search, User, X } from 'lucide-react';
import type { Trip, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { toNepaliDate } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { onTripsUpdate, deleteTrip } from '@/services/trip-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

type SortKey = 'date' | 'vehicleName' | 'customerName' | 'finalDestination' | 'netAmount' | 'authorship';
type SortDirection = 'asc' | 'desc';

interface CalculationDetails {
    totalFreight: number;
    dropOffCharge: number;
    detentionCharge: number;
    totalTaxable: number;
    vatAmount: number;
    grossAmount: number;
    tdsAmount: number;
    netPay: number;
}

export default function TripSheetsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc',
  });
  
  const [isCalcDialogOpen, setIsCalcDialogOpen] = useState(false);
  const [selectedTripDetails, setSelectedTripDetails] = useState<CalculationDetails | null>(null);

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { hasPermission, user } = useAuth();
  
  const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);
  const partiesById = useMemo(() => new Map(parties.map(p => [p.id, p.name])), [parties]);

  useEffect(() => {
    setIsLoading(true);
    const unsubTrips = onTripsUpdate(setTrips);
    const unsubVehicles = onVehiclesUpdate(setVehicles);
    const unsubParties = onPartiesUpdate(setParties);
    setIsLoading(false);

    return () => {
        unsubTrips();
        unsubVehicles();
        unsubParties();
    };
  }, []);
  
  const handleDeleteTrip = async (id: string) => {
    try {
      await deleteTrip(id);
      toast({ title: 'Trip Sheet Deleted', description: 'The trip sheet has been successfully deleted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete trip sheet.', variant: 'destructive' });
    }
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const calculateTripFinances = (trip: Trip): CalculationDetails => {
    const days = trip.detentionStartDate && trip.detentionEndDate ? differenceInDays(new Date(trip.detentionEndDate), new Date(trip.detentionStartDate)) + 1 : 0;
    
    const totalFreight = (trip.destinations || []).reduce((sum, dest) => sum + (Number(dest.freight) || 0), 0);
    const numberOfParties = Number(trip.numberOfParties) || 0;
    const dropOffChargeRate = Number(trip.dropOffChargeRate) || 800;
    const dropOffCharge = numberOfParties > 3 ? (numberOfParties - 3) * dropOffChargeRate : 0;
    
    const detentionChargeRate = Number(trip.detentionChargeRate) || 3000;
    const detentionCharge = days * detentionChargeRate;

    const totalTaxable = totalFreight + dropOffCharge + detentionCharge;
    const vatAmount = totalTaxable * 0.13;
    const grossAmount = totalTaxable + vatAmount;
    const tdsAmount = grossAmount * 0.015;
    const netPay = grossAmount - tdsAmount;

    return { totalFreight, dropOffCharge, detentionCharge, totalTaxable, vatAmount, grossAmount, tdsAmount, netPay };
  };
  
  const openCalcDialog = (trip: Trip) => {
      setSelectedTripDetails(calculateTripFinances(trip));
      setIsCalcDialogOpen(true);
  };


  const augmentedTrips = useMemo(() => {
      return trips.map(trip => {
          const { netPay } = calculateTripFinances(trip);
          const finalDestination = trip.destinations[0]?.name || 'N/A';

          return {
              ...trip,
              vehicleName: vehiclesById.get(trip.vehicleId) || 'N/A',
              customerName: partiesById.get(trip.partyId) || 'N/A',
              finalDestination,
              netAmount: netPay, // This is the customer payable amount
          }
      });
  }, [trips, vehiclesById, partiesById]);
  
  const filteredAndSortedTrips = useMemo(() => {
    let filtered = [...augmentedTrips];

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(trip =>
            (trip.vehicleName || '').toLowerCase().includes(lowercasedQuery) ||
            (trip.customerName || '').toLowerCase().includes(lowercasedQuery) ||
            (trip.finalDestination || '').toLowerCase().includes(lowercasedQuery)
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
  }, [augmentedTrips, sortConfig, searchQuery]);


  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
        </div>
      );
    }

    if (trips.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">No sales - trip sheets yet</h3>
              <p className="text-sm text-muted-foreground">Get started by creating a new sales - trip sheet.</p>
              {hasPermission('fleet', 'create') && (
                <Button className="mt-4" asChild>
                    <Link href="/fleet/trip-sheets/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> New Sales - Trip Sheet
                    </Link>
                </Button>
              )}
            </div>
          </div>
        );
      }

    return (
        <Card>
            <Table>
            <TableHeader><TableRow>
                <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')}>Vehicle</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('customerName')}>Customer</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('finalDestination')}>Destination</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('netAmount')}>Net Bank Pay</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')}>Authorship</Button></TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
                {filteredAndSortedTrips.map(trip => (
                <TableRow key={trip.id}>
                    <TableCell className="font-medium">{toNepaliDate(trip.date)}</TableCell>
                    <TableCell>{trip.vehicleName}</TableCell>
                    <TableCell>{trip.customerName}</TableCell>
                    <TableCell>{trip.finalDestination}</TableCell>
                    <TableCell>
                        <Button variant="link" className="p-0 h-auto" onClick={() => openCalcDialog(trip)}>
                            {trip.netAmount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                        </Button>
                    </TableCell>
                    <TableCell>
                        <TooltipProvider><Tooltip><TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                            {trip.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                            <span>{trip.lastModifiedBy || trip.createdBy}</span>
                        </TooltipTrigger><TooltipContent>
                            <p>Created by: {trip.createdBy}{trip.createdAt ? ` on ${format(new Date(trip.createdAt), "PP")}` : ''}</p>
                            {trip.lastModifiedBy && trip.lastModifiedAt && (<p>Modified by: {trip.lastModifiedBy}{trip.lastModifiedAt ? ` on ${format(new Date(trip.lastModifiedAt), "PP")}` : ''}</p>)}
                        </TooltipContent></Tooltip></TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right"><DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        {hasPermission('fleet', 'view') && (<DropdownMenuItem onSelect={() => router.push(`/fleet/trip-sheets/${trip.id}`)}><View className="mr-2 h-4 w-4" /> View</DropdownMenuItem>)}
                        {hasPermission('fleet', 'edit') && (<DropdownMenuItem onClick={() => router.push(`/fleet/trip-sheets/edit?id=${trip.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>)}
                        {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                        {hasPermission('fleet', 'delete') && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                        <span className="text-destructive">Delete</span>
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                        <AlertDialogDescription>This action cannot be undone. This will permanently delete the trip sheet.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteTrip(trip.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                        </DropdownMenuContent>
                    </DropdownMenu></TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </Card>
    );
  };
  
  return (
    <>
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Sales - Trip Sheets</h1>
            <p className="text-muted-foreground">Manage sales trips and track their profitability.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search trips..." className="pl-8 sm:w-[300px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {hasPermission('fleet', 'create') && (
                <Button asChild><Link href="/fleet/trip-sheets/new"><PlusCircle className="mr-2 h-4 w-4" /> New Sales - Trip Sheet</Link></Button>
            )}
        </div>
      </header>
      {renderContent()}
    </div>
     <Dialog open={isCalcDialogOpen} onOpenChange={setIsCalcDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Net Bank Pay Calculation</DialogTitle>
                <DialogDescription>
                    Here is the step-by-step breakdown of the customer's payable amount.
                </DialogDescription>
            </DialogHeader>
            {selectedTripDetails && (
                <div className="space-y-4 py-4 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Freight</span>
                        <span>{selectedTripDetails.totalFreight.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Drop-off Charge</span>
                        <span>+ {selectedTripDetails.dropOffCharge.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Detention Charge</span>
                        <span>+ {selectedTripDetails.detentionCharge.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center font-medium">
                        <span className="text-muted-foreground">Total Taxable Amount</span>
                        <span>{selectedTripDetails.totalTaxable.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">VAT (13%)</span>
                        <span>+ {selectedTripDetails.vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center font-medium">
                        <span className="text-muted-foreground">Gross Amount</span>
                        <span>{selectedTripDetails.grossAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <Separator />
                     <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">TDS (1.5%)</span>
                        <span>- {selectedTripDetails.tdsAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                     <Separator />
                    <div className="flex justify-between items-center text-lg font-bold">
                        <span>Net Bank Pay</span>
                        <span>{selectedTripDetails.netPay.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            )}
            <Button variant="outline" onClick={() => setIsCalcDialogOpen(false)}>Close</Button>
        </DialogContent>
    </Dialog>
    </>
  );
}
