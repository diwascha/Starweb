
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  PlusCircle, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  View, 
  ArrowUpDown, 
  Search, 
  PackageCheck, 
  Ban, 
  User, 
  Printer, 
  CalendarIcon,
  Check,
  ChevronDown,
  FilterX
} from 'lucide-react';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/types';
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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn, toNepaliDate } from '@/lib/utils';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { onPurchaseOrdersUpdate, deletePurchaseOrder, updatePurchaseOrder } from '@/services/purchase-order-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';
import { Label } from '@/components/ui/label';

type SortKey = 'poNumber' | 'poDate' | 'companyName' | 'status' | 'authorship';
type SortDirection = 'asc' | 'desc';

const statuses: PurchaseOrderStatus[] = ['Draft', 'Ordered', 'Amended', 'Delivered', 'Canceled'];

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
                                className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
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

export default function PurchaseOrdersListPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'poDate',
    direction: 'desc',
  });

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { hasPermission, user } = useAuth();

  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [poToUpdate, setPoToUpdate] = useState<PurchaseOrder | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(new Date());
  
  // ERP Filter State (Multiple Selection)
  const [filterBsYears, setFilterBsYears] = useState<string[]>([]);
  const [filterBsMonths, setFilterBsMonths] = useState<string[]>([]);
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = onPurchaseOrdersUpdate((poData) => {
        setPurchaseOrders(poData);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const { availableYears, availableCompanies } = useMemo(() => {
    const years = new Set<number>();
    const companies = new Set<string>();
    purchaseOrders.forEach(po => {
        try {
            years.add(new NepaliDate(new Date(po.poDate)).getYear());
            companies.add(po.companyName);
        } catch {}
    });
    return {
        availableYears: Array.from(years).sort((a, b) => b - a),
        availableCompanies: Array.from(companies).sort().map(c => ({ id: c, name: c })),
    };
  }, [purchaseOrders]);

  useEffect(() => {
      // Set default year on initial load if no filters active
      if (availableYears.length > 0 && filterBsYears.length === 0 && !searchQuery) {
          const currentNepaliDate = new NepaliDate();
          const currentYear = currentNepaliDate.getYear();
          if(availableYears.includes(currentYear)) {
              setFilterBsYears([String(currentYear)]);
          } else {
              setFilterBsYears([String(availableYears[0])]);
          }
      }
  }, [availableYears, filterBsYears.length, searchQuery]);
  
  const handleDeletePurchaseOrder = async (id: string) => {
    try {
      await deletePurchaseOrder(id);
      toast({ title: 'Purchase Order Deleted', description: 'The purchase order has been successfully deleted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete purchase order.', variant: 'destructive' });
    }
  };
  
  const updatePoStatus = (id: string, status: PurchaseOrderStatus, deliveryDateISO?: string) => {
    try {
      const updateData: any = { 
        status, 
        lastModifiedBy: user?.username || 'Administrator'
      };
      
      if (deliveryDateISO) {
          updateData.deliveryDate = deliveryDateISO;
      }

      updatePurchaseOrder(id, updateData);
      toast({
        title: 'Status Updated',
        description: `Purchase Order status has been updated to ${status}.`,
      });
    } catch (error) {
       console.error("Failed to update status:", error);
       toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
    }
  };

  const handleOpenDeliveryDialog = (po: PurchaseOrder) => {
    setPoToUpdate(po);
    setDeliveryDate(po.deliveryDate ? new Date(po.deliveryDate) : new Date());
    setDeliveryDialogOpen(true);
  };
  
  const handleConfirmDelivery = () => {
    if (poToUpdate && deliveryDate) {
      updatePoStatus(poToUpdate.id, 'Delivered', deliveryDate.toISOString());
      setDeliveryDialogOpen(false);
      setPoToUpdate(null);
    }
  };
  
  const handlePrint = (poId: string) => {
    const printWindow = window.open(`/purchase-orders/view?id=${poId}`, '_blank');
    if (printWindow) {
        printWindow.onload = () => {
            setTimeout(() => printWindow.print(), 500);
        };
    }
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedPOs = useMemo(() => {
    let filtered = [...purchaseOrders];

    if (filterBsYears.length > 0) {
      filtered = filtered.filter(po => {
        try {
          const year = new NepaliDate(new Date(po.poDate)).getYear();
          return filterBsYears.includes(String(year));
        } catch { return false; }
      });
    }

    if (filterBsMonths.length > 0) {
      filtered = filtered.filter(po => {
        try {
          const month = new NepaliDate(new Date(po.poDate)).getMonth();
          return filterBsMonths.includes(String(month));
        } catch { return false; }
      });
    }
    
    if (filterCompanies.length > 0) {
        filtered = filtered.filter(po => filterCompanies.includes(po.companyName));
    }

    if (filterStatuses.length > 0) {
        filtered = filtered.filter(po => filterStatuses.includes(po.status));
    }

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(po =>
            (po.poNumber || '').toLowerCase().includes(lowercasedQuery) ||
            (po.companyName || '').toLowerCase().includes(lowercasedQuery) ||
            po.items.some(item => (item.rawMaterialName || '').toLowerCase().includes(lowercasedQuery))
        );
    }
    
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        if (sortConfig.key === 'authorship') {
             const aDate = a.updatedAt || a.createdAt;
             const bDate = b.updatedAt || b.createdAt;
             if (!aDate || !bDate) return 0;
             const res = aDate < bDate ? -1 : 1;
             return sortConfig.direction === 'asc' ? res : -res;
        }

        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
  
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [purchaseOrders, sortConfig, searchQuery, filterBsYears, filterBsMonths, filterCompanies, filterStatuses]);

  const isFiltered = useMemo(() => {
      return searchQuery !== '' || 
             filterBsYears.length > 0 || 
             filterBsMonths.length > 0 || 
             filterCompanies.length > 0 || 
             filterStatuses.length > 0;
  }, [searchQuery, filterBsYears, filterBsMonths, filterCompanies, filterStatuses]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterBsYears([]);
    setFilterBsMonths([]);
    setFilterCompanies([]);
    setFilterStatuses([]);
  };

  const renderStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'Ordered': return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Ordered</Badge>;
      case 'Amended': return <Badge variant="default" className="bg-amber-500 text-black hover:bg-amber-600">Amended</Badge>;
      case 'Delivered': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Delivered</Badge>;
      case 'Canceled': return <Badge variant="destructive">Canceled</Badge>;
      case 'Draft': return <Badge variant="secondary">Draft</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
          </div>
        </div>
      );
    }

    if (purchaseOrders.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">No purchase orders yet</h3>
              <p className="text-sm text-muted-foreground">Get started by creating a new purchase order.</p>
              {hasPermission('purchaseOrders', 'create') && (
                <Button className="mt-4" asChild>
                    <Link href="/purchase-orders/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> New Purchase Order
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
            <TableHeader>
                <TableRow>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('poNumber')}>
                    PO Number <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('poDate')}>
                    Date <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('companyName')}>
                    Company Name <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('status')} className="font-bold text-primary">
                    Status <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('authorship')}>
                        Authorship
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredAndSortedPOs.length > 0 ? (
                    filteredAndSortedPOs.map(po => (
                    <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                        <TableCell>{toNepaliDate(po.poDate)}</TableCell>
                        <TableCell>{po.companyName}</TableCell>
                        <TableCell>
                            {renderStatusBadge(po.status)}
                        </TableCell>
                        <TableCell>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                        {po.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                        <span>{po.lastModifiedBy || po.createdBy}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Created by: {po.createdBy}{po.createdAt ? ` on ${format(new Date(po.createdAt), "PP")}` : ''}</p>
                                        {po.lastModifiedBy && (
                                          <p>Modified by: {po.lastModifiedBy}{po.updatedAt ? ` on ${format(new Date(po.updatedAt), "PP")}` : ''}</p>
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            {hasPermission('purchaseOrders', 'view') && (
                                <DropdownMenuItem onSelect={() => router.push(`/purchase-orders/view?id=${po.id}`)}>
                                    <View className="mr-2 h-4 w-4" /> View
                                </DropdownMenuItem>
                            )}
                            {hasPermission('purchaseOrders', 'edit') && (
                                <DropdownMenuItem onClick={() => router.push(`/purchase-orders/edit?id=${po.id}`)} disabled={po.status === 'Delivered' || po.status === 'Canceled'}>
                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                            )}
                             {hasPermission('purchaseOrders', 'view') && (
                                <DropdownMenuItem onSelect={() => handlePrint(po.id)}>
                                    <Printer className="mr-2 h-4 w-4" /> Print
                                </DropdownMenuItem>
                            )}
                            
                            {(hasPermission('purchaseOrders', 'view') || hasPermission('purchaseOrders', 'edit')) &&
                             (hasPermission('purchaseOrders', 'delete') || hasPermission('purchaseOrders', 'edit')) &&
                             <DropdownMenuSeparator />
                            }

                            {hasPermission('purchaseOrders', 'edit') && (
                                <>
                                    {po.status !== 'Delivered' ? (
                                        <DropdownMenuItem onSelect={() => handleOpenDeliveryDialog(po)} disabled={po.status === 'Delivered' || po.status === 'Canceled'}>
                                            <PackageCheck className="mr-2 h-4 w-4" /> Mark as Delivered
                                        </DropdownMenuItem>
                                    ) : (
                                        <DropdownMenuItem onSelect={() => handleOpenDeliveryDialog(po)}>
                                            <CalendarIcon className="mr-2 h-4 w-4" /> Change Delivery Date
                                        </DropdownMenuItem>
                                    )}
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem onSelect={e => e.preventDefault()} disabled={po.status === 'Delivered' || po.status === 'Canceled'} className="text-destructive focus:text-destructive">
                                                <Ban className="mr-2 h-4 w-4" /> Cancel Order
                                            </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure you want to cancel this order?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This action will mark PO #{po.poNumber} as Canceled. This action cannot be reversed.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Go Back</AlertDialogCancel>
                                                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => updatePoStatus(po.id, 'Canceled')}>Confirm Cancellation</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </>
                            )}
                            
                            {hasPermission('purchaseOrders', 'delete') && hasPermission('purchaseOrders', 'edit') && <DropdownMenuSeparator />}
                            
                            {hasPermission('purchaseOrders', 'delete') && (
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
                                        This action cannot be undone. This will permanently delete the purchase order.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeletePurchaseOrder(po.id)}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    ))
                ) : (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                            No orders found for the selected period and filters.
                        </TableCell>
                    </TableRow>
                )}
            </TableBody>
            </Table>
        </Card>
    );
  };
  
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
            <p className="text-muted-foreground">View and manage your purchase orders.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search POs..."
                    className="pl-8 sm:w-[250px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          {hasPermission('purchaseOrders', 'create') && (
            <Button asChild>
                <Link href="/purchase-orders/new">
                <PlusCircle className="mr-2 h-4 w-4" /> New PO
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
                <MultiSelect 
                    label="Supplier" 
                    values={filterCompanies} 
                    onSelect={setFilterCompanies} 
                    items={availableCompanies} 
                    placeholder="Supplier" 
                />
                <MultiSelect 
                    label="Status" 
                    values={filterStatuses} 
                    onSelect={setFilterStatuses} 
                    items={statuses.map(s => ({ id: s, name: s }))} 
                    placeholder="Status" 
                />
            </div>
            
            {isFiltered && (
                <div className="flex items-center pt-2 border-t border-dashed">
                    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground h-8 px-2 text-xs">
                        <FilterX className="mr-2 h-3.5 w-3.5" /> Clear All Filters
                    </Button>
                </div>
            )}
      </div>

      {renderContent()}
       <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Confirm Delivery</DialogTitle>
                <DialogDescription>
                    Select the delivery date for PO #{poToUpdate?.poNumber}.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 flex justify-center">
                 <Popover>
                      <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !deliveryDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {deliveryDate ? `${toNepaliDate(deliveryDate.toISOString())} BS (${format(deliveryDate, "PPP")})` : <span>Pick a date</span>}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <DualCalendar
                          selected={deliveryDate}
                          onSelect={setDeliveryDate}
                        />
                      </PopoverContent>
                    </Popover>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setDeliveryDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleConfirmDelivery} disabled={!deliveryDate}>Confirm</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
