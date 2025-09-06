

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PlusCircle, MoreHorizontal, Edit, Trash2, View, ArrowUpDown, Search, User } from 'lucide-react';
import type { Trip, Vehicle } from '@/lib/types';
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
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { onTripsUpdate, deleteTrip } from '@/services/trip-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SortKey = 'date' | 'vehicleName' | 'finalDestination' | 'netAmount' | 'authorship';
type SortDirection = 'asc' | 'desc';

export default function TripSheetsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'date',
    direction: 'desc',
  });

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { hasPermission, user } = useAuth();
  
  const vehiclesById = useMemo(() => new Map(vehicles.map(v => [v.id, v.name])), [vehicles]);

  useEffect(() => {
    setIsLoading(true);
    const unsubTrips = onTripsUpdate(setTrips);
    const unsubVehicles = onVehiclesUpdate(setVehicles);
    setIsLoading(false);

    return () => {
        unsubTrips();
        unsubVehicles();
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
  
  const augmentedTrips = useMemo(() => {
      return trips.map(trip => {
          const totalTaxable = trip.destinations.reduce((sum, dest) => sum + dest.freight, 0);
          const vatAmount = totalTaxable * 0.13;
          const grossAmount = totalTaxable + vatAmount;
          const tdsAmount = grossAmount * 0.015;
          const netPay = grossAmount - tdsAmount;
          
          const totalFuel = trip.fuelEntries.reduce((sum, entry) => sum + entry.amount, 0);
          const totalExpenses = (trip.truckAdvance || 0) + (trip.transport || 0) + totalFuel;
          
          const netAmount = netPay - totalExpenses + (trip.returnLoadIncome || 0);
          
          const finalDestination = trip.destinations[0]?.name || 'N/A';

          return {
              ...trip,
              vehicleName: vehiclesById.get(trip.vehicleId) || 'N/A',
              finalDestination,
              netAmount,
          }
      });
  }, [trips, vehiclesById]);
  
  const filteredAndSortedTrips = useMemo(() => {
    let filtered = [...augmentedTrips];

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(trip =>
            (trip.vehicleName || '').toLowerCase().includes(lowercasedQuery) ||
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
              <h3 className="text-2xl font-bold tracking-tight">No trip sheets yet</h3>
              <p className="text-sm text-muted-foreground">Get started by creating a new trip sheet.</p>
              {hasPermission('fleet', 'create') && (
                <Button className="mt-4" asChild>
                    <Link href="/fleet/trip-sheets/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> New Trip Sheet
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
                <TableHead><Button variant="ghost" onClick={() => requestSort('finalDestination')}>Destination</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('netAmount')}>Net Amount</Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('authorship')}>Authorship</Button></TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
                {filteredAndSortedTrips.map(trip => (
                <TableRow key={trip.id}>
                    <TableCell className="font-medium">{toNepaliDate(trip.date)}</TableCell>
                    <TableCell>{trip.vehicleName}</TableCell>
                    <TableCell>{trip.finalDestination}</TableCell>
                    <TableCell>{trip.netAmount.toLocaleString()}</TableCell>
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
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        {hasPermission('fleet', 'view') && (<DropdownMenuItem onSelect={() => router.push(`/fleet/trip-sheets/${trip.id}`)}><View className="mr-2 h-4 w-4" /> View</DropdownMenuItem>)}
                        {hasPermission('fleet', 'edit') && (<DropdownMenuItem onClick={() => router.push(`/fleet/trip-sheets/edit/${trip.id}`)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>)}
                        {hasPermission('fleet', 'delete') && <DropdownMenuSeparator />}
                        {hasPermission('fleet', 'delete') && (<AlertDialog><AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /><span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete the trip sheet.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteTrip(trip.id)}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>)}
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
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Trip Sheets</h1>
            <p className="text-muted-foreground">Manage sales trips and track their profitability.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search trips..." className="pl-8 sm:w-[300px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {hasPermission('fleet', 'create') && (
                <Button asChild><Link href="/fleet/trip-sheets/new"><PlusCircle className="mr-2 h-4 w-4" /> New Trip Sheet</Link></Button>
            )}
        </div>
      </header>
      {renderContent()}
    </div>
  );
}

    