'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { 
  PlusCircle, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  View, 
  ArrowUpDown, 
  Search, 
  User, 
  X, 
  Download, 
  CalendarIcon, 
  FileSpreadsheet, 
  FileText,
  Printer,
  Loader2,
  Check,
  ChevronDown,
  FilterX
} from 'lucide-react';
import type { Trip, Vehicle, Party } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { toNepaliDate } from '@/lib/utils';
import { format, differenceInDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { onTripsUpdate, deleteTrip } from '@/services/trip-service';
import { onVehiclesUpdate } from '@/services/vehicle-service';
import { onPartiesUpdate } from '@/services/party-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Label } from '@/components/ui/label';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';

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

// Helper component for multi-select
const MultiSelect = ({ label, values, onSelect, items, placeholder, icon: Icon }: any) => {
    const isAll = values.length === 0;

    const toggleItem = (id: string) => {
        const next = values.includes(id)
            ? values.filter((v: string) => v !== id)
            : [...values, id];
        onSelect(next);
    };

    const displayText = isAll
        ? `All ${placeholder}s`
        : values.length === 1
            ? items.find((i: any) => String(i.id) === String(values[0]))?.name || values[0]
            : `${values.length} ${placeholder}s`;

    return (
        <div className="space-y-1.5 flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-9 bg-white border-gray-200 shadow-none font-normal text-xs px-3 text-left">
                        <div className="flex items-center gap-2 overflow-hidden">
                            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate">{displayText}</span>
                        </div>
                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[200px]" align="start">
                    <Command>
                        <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input 
                                placeholder={`Search ${placeholder.toLowerCase()}...`} 
                                className="flex h-9 w-full rounded-md bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                        <CommandList>
                            <CommandEmpty>No results found.</CommandEmpty>
                            <CommandGroup>
                                {items.map((item: any) => (
                                    <CommandItem key={item.id} value={item.name} onSelect={() => toggleItem(String(item.id))} className="text-xs">
                                        <Check className={cn("mr-2 h-3.5 w-3.5", values.includes(String(item.id)) ? "opacity-100" : "opacity-0")} />
                                        {item.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export default function TripSheetsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  
  // Filtering & Sorting State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterBsYears, setFilterBsYears] = useState<string[]>([]);
  const [filterBsMonths, setFilterBsMonths] = useState<string[]>([]);
  const [filterVehicleId, setFilterVehicleId] = useState<string>('All');
  const [filterPartyId, setFilterPartyId] = useState<string>('All');
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

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    trips.forEach(trip => {
        try {
            years.add(new NepaliDate(new Date(trip.date)).getYear());
        } catch {}
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [trips]);

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
              netAmount: netPay,
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
            (trip.finalDestination || '').toLowerCase().includes(lowercasedQuery) ||
            (trip.tripNumber || '').toLowerCase().includes(lowercasedQuery)
        );
    }

    if (dateRange?.from) {
        const interval = { 
            start: startOfDay(dateRange.from), 
            end: endOfDay(dateRange.to || dateRange.from) 
        };
        filtered = filtered.filter(trip => isWithinInterval(new Date(trip.date), interval));
    }

    if (filterBsYears.length > 0) {
        filtered = filtered.filter(trip => {
            try {
                const year = new NepaliDate(new Date(trip.date)).getYear();
                return filterBsYears.includes(String(year));
            } catch { return false; }
        });
    }

    if (filterBsMonths.length > 0) {
        filtered = filtered.filter(trip => {
            try {
                const month = new NepaliDate(new Date(trip.date)).getMonth();
                return filterBsMonths.includes(String(month));
            } catch { return false; }
        });
    }

    if (filterVehicleId !== 'All') {
        filtered = filtered.filter(trip => trip.vehicleId === filterVehicleId);
    }

    if (filterPartyId !== 'All') {
        filtered = filtered.filter(trip => trip.partyId === filterPartyId);
    }
    
    filtered.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
    
    return filtered;
  }, [augmentedTrips, sortConfig, searchQuery, dateRange, filterBsYears, filterBsMonths, filterVehicleId, filterPartyId]);

  const handleExportExcel = async () => {
    try {
        const XLSX = await import('xlsx');
        const data = filteredAndSortedTrips.map(trip => ({
            'Date (BS)': toNepaliDate(trip.date),
            'Date (AD)': format(new Date(trip.date), 'yyyy-MM-dd'),
            'Trip #': trip.tripNumber,
            'Vehicle': trip.vehicleName,
            'Customer': trip.customerName,
            'Destination': trip.finalDestination,
            'Net Bank Pay (NPR)': trip.netAmount.toFixed(2),
            'Posted By': trip.lastModifiedBy || trip.createdBy
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Trips");
        XLSX.writeFile(workbook, `Sales_Trips_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        toast({ title: 'Export Successful', description: 'Sales trip data exported to Excel.' });
    } catch (error) {
        toast({ title: 'Export Failed', description: 'Could not export to Excel.', variant: 'destructive' });
    }
  };

  const handleExportPdf = () => {
    try {
        const doc = new jsPDF();
        doc.text("Sales - Trip Sheets Report", 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${format(new Date(), 'PPP')}`, 14, 22);

        const tableData = filteredAndSortedTrips.map(trip => [
            toNepaliDate(trip.date),
            trip.tripNumber,
            trip.vehicleName,
            trip.customerName,
            trip.finalDestination,
            trip.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })
        ]);

        autoTable(doc, {
            startY: 30,
            head: [['Date (BS)', 'Trip #', 'Vehicle', 'Customer', 'Destination', 'Net Pay (NPR)']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [71, 85, 105] }
        });

        doc.save(`Sales_Trips_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        toast({ title: 'Export Successful', description: 'Sales trip report saved as PDF.' });
    } catch (error) {
        toast({ title: 'Export Failed', description: 'Could not generate PDF.', variant: 'destructive' });
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDateRange(undefined);
    setFilterBsYears([]);
    setFilterBsMonths([]);
    setFilterVehicleId('All');
    setFilterPartyId('All');
  };

  const isFiltered = useMemo(() => {
    return searchQuery !== '' || 
           !!dateRange || 
           filterBsYears.length > 0 || 
           filterBsMonths.length > 0 || 
           filterVehicleId !== 'All' || 
           filterPartyId !== 'All';
  }, [searchQuery, dateRange, filterBsYears, filterBsMonths, filterVehicleId, filterPartyId]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <h3 className="ml-2 text-xl font-bold tracking-tight">Loading...</h3>
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
        <Card className="border shadow-sm">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead><Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4 h-8 px-2 text-[11px]">Date <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('vehicleName')} className="-ml-4 h-8 px-2 text-[11px]">Vehicle <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('customerName')} className="-ml-4 h-8 px-2 text-[11px]">Customer <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('finalDestination')} className="-ml-4 h-8 px-2 text-[11px]">Destination <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                <TableHead><Button variant="ghost" onClick={() => requestSort('netAmount')} className="-ml-4 h-8 px-2 text-[11px]">Net Bank Pay <ArrowUpDown className="ml-2 h-3 w-3" /></Button></TableHead>
                <TableHead className="text-[11px]">Authorship</TableHead>
                <TableHead className="text-right text-[11px]">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
                {filteredAndSortedTrips.map(trip => (
                <TableRow key={trip.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-[11px] whitespace-nowrap">{toNepaliDate(trip.date)}</TableCell>
                    <TableCell className="font-semibold text-[11px]">{trip.vehicleName}</TableCell>
                    <TableCell className="text-[11px]">{trip.customerName}</TableCell>
                    <TableCell className="text-[11px] uppercase text-muted-foreground">{trip.finalDestination}</TableCell>
                    <TableCell>
                        <Button variant="link" className="p-0 h-auto font-bold text-[11px]" onClick={() => openCalcDialog(trip)}>
                            Rs. {trip.netAmount.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                        </Button>
                    </TableCell>
                    <TableCell>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-default uppercase font-bold">
                                    {trip.lastModifiedBy ? <Edit className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                    <span>{trip.lastModifiedBy || trip.createdBy}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">Created by: {trip.createdBy}{trip.createdAt ? ` on ${format(new Date(trip.createdAt), "PP")}` : ''}</p>
                                    {trip.lastModifiedBy && trip.lastModifiedAt && (
                                        <p className="text-xs">Modified by: {trip.lastModifiedBy}{trip.lastModifiedAt ? ` on ${format(new Date(trip.lastModifiedAt), "PP")}` : ''}</p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="ml-2 h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {hasPermission('fleet', 'view') && (
                                    <DropdownMenuItem onSelect={() => router.push(`/fleet/trip-sheets/${trip.id}`)}>
                                        <View className="mr-2 h-4 w-4" /> View
                                    </DropdownMenuItem>
                                )}
                                {hasPermission('fleet', 'edit') && (
                                    <DropdownMenuItem onClick={() => router.push(`/fleet/trip-sheets/edit?id=${trip.id}`)}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => window.open(`/fleet/trip-sheets/view?id=${trip.id}`, '_blank')}>
                                    <Printer className="mr-2 h-4 w-4" /> Print
                                </DropdownMenuItem>
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
                                                <AlertDialogDescription>
                                                    This action cannot be undone. This will permanently delete the trip sheet and associated transactions.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDeleteTrip(trip.id)}>Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            <TableFooter>
                <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={4} className="text-right text-[11px]">Total for Filtered Period ({filteredAndSortedTrips.length} Trips)</TableCell>
                    <TableCell className="text-[11px]">Rs. {filteredAndSortedTrips.reduce((sum, t) => sum + t.netAmount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                </TableRow>
            </TableFooter>
            </Table>
        </Card>
    );
  };
  
  return (
    <>
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
                <Button asChild>
                    <Link href="/fleet/trip-sheets/new">
                        <PlusCircle className="mr-2 h-4 w-4" /> New Sales - Trip Sheet
                    </Link>
                </Button>
            )}
        </div>
      </header>

      <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg border border-dashed">
            <div className="flex flex-wrap gap-4 items-end">
                <MultiSelect 
                    label="Year (BS)" 
                    values={filterBsYears} 
                    onSelect={setFilterBsYears} 
                    items={availableYears.map(y => ({ id: String(y), name: String(y) }))} 
                    placeholder="Year" 
                />
                <MultiSelect 
                    label="Month (BS)" 
                    values={filterBsMonths} 
                    onSelect={setFilterBsMonths} 
                    items={NEPALI_MONTHS.map(m => ({ id: String(m.value), name: m.name }))} 
                    placeholder="Month" 
                />
                <div className="space-y-1.5 w-full md:w-[200px]">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Custom AD Range</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`) : format(dateRange.from, "MMM d")) : (<span>Pick a date range</span>)}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-1.5 w-full md:w-[150px]">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Vehicle</Label>
                    <Select value={filterVehicleId} onValueChange={setFilterVehicleId}>
                        <SelectTrigger className="bg-white h-9 text-xs"><SelectValue placeholder="All Vehicles" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Vehicles</SelectItem>
                            {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 w-full md:w-[200px]">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Customer</Label>
                    <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                        <SelectTrigger className="bg-white h-9 text-xs">
                            <SelectValue placeholder="All Customers" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Customers</SelectItem>
                            {parties.filter(p => (p.type === 'Customer' || p.type === 'Both') && (p.ownership === 'Sijan' || p.ownership === 'Both')).map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto items-center pt-2 border-t border-dashed">
                {isFiltered && (
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground h-8 px-2 text-xs">
                        <FilterX className="mr-2 h-3.5 w-3.5" /> Clear All Filters
                    </Button>
                )}
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-8 text-xs">
                        <FileSpreadsheet className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportPdf} className="h-8 text-xs">
                        <FileText className="mr-2 h-3.5 w-3.5 text-red-600" /> PDF
                    </Button>
                </div>
            </div>
      </div>

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
