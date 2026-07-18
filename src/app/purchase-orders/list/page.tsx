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
  FilterX,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';
import { Label } from '@/components/ui/label';

type SortKey = 'poNumber' | 'poDate' | 'companyName' | 'status' | 'authorship';
type SortDirection = 'asc' | 'desc';

const statuses: PurchaseOrderStatus[] = ['Draft', 'Ordered', 'Amended', 'Delivered', 'Canceled'];

// Helper component for multi-select with "All" support
const MultiSelect = ({ label, values, onSelect, items, placeholder, icon: Icon }: any) => {
    const isAll = values.length === 0;

    const toggleItem = (id: string) => {
        if (id === 'All') {
            onSelect([]);
            return;
        }
        const next = values.includes(id)
            ? values.filter((v: string) => v !== id)
            : [...values, id];
        onSelect(next);
    };

    const displayText = isAll
        ? `All ${placeholder}s`
        : values.length === 1
            ? items.find((i: any) => String(i.id) === String(values[0]))?.name || values[0]
            : `${values.length} ${placeholder}s Selected`;

    return (
        <div className="space-y-1.5 flex-1 min-w-[140px]">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">{label}</Label>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-9 bg-white border-gray-200 shadow-none font-normal text-xs px-3 text-left">
                        <div className="flex items-center gap-2 overflow-hidden text-left">
                            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate text-left">{displayText}</span>
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
                                <CommandItem value="All" onSelect={() => toggleItem('All')} className="text-xs">
                                    <Check className={cn("mr-2 h-3.5 w-3.5", isAll ? "opacity-100" : "opacity-0")} />
                                    All {placeholder}s
                                </CommandItem>
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
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'poDate',
    direction: 'desc',
  });

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { hasPermission, user, getAllowedOwnerships } = useAuth();
  const allowedOwnerships = useMemo(() => getAllowedOwnerships('purchaseOrders'), [getAllowedOwnerships]);

  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [purchaseOrderToUpdate, setPurchaseOrderToUpdate] = useState<PurchaseOrder | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(new Date());
  
  // ERP Filter State (Multiple Selection)
  const [filterBsYears, setFilterBsYears] = useState<string[]>([]);
  const [filterBsMonths, setFilterBsMonths] = useState<string[]>([]);
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = onPurchaseOrdersUpdate((purchaseOrderData) => {
        setPurchaseOrders(purchaseOrderData);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const { availableYears, availableCompanies } = useMemo(() => {
    const years = new Set<number>();
    const companiesSet = new Set<string>();
    purchaseOrders.forEach(purchaseOrder => {
        try {
            years.add(new NepaliDate(new Date(purchaseOrder.poDate)).getYear());
            companiesSet.add(purchaseOrder.companyName);
        } catch {}
    });
    return {
        availableYears: Array.from(years).sort((a, b) => b - a),
        availableCompanies: Array.from(companiesSet).sort().map(c => ({ id: c, name: c })),
    };
  }, [purchaseOrders]);

  const handleDeletePurchaseOrder = async (id: string) => {
    try {
      await deletePurchaseOrder(id);
      toast({ title: 'Purchase Order Deleted', description: 'The purchase order has been successfully deleted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete purchase order.', variant: 'destructive' });
    }
  };
  
  const updatePurchaseOrderStatus = (id: string, status: PurchaseOrderStatus, deliveryDateISO?: string) => {
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

  const handleOpenDeliveryDialog = (purchaseOrder: PurchaseOrder) => {
    setPurchaseOrderToUpdate(purchaseOrder);
    setDeliveryDate(purchaseOrder.deliveryDate ? new Date(purchaseOrder.deliveryDate) : new Date());
    setDeliveryDialogOpen(true);
  };
  
  const handleConfirmDelivery = () => {
    if (purchaseOrderToUpdate && deliveryDate) {
      updatePurchaseOrderStatus(purchaseOrderToUpdate.id, 'Delivered', deliveryDate.toISOString());
      setDeliveryDialogOpen(false);
      setPurchaseOrderToUpdate(null);
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
    let filtered = purchaseOrders.filter(po => po.ownership === 'Both' || allowedOwnerships.includes(po.ownership));

    if (filterBsYears.length > 0) {
      filtered = filtered.filter(purchaseOrder => {
        try {
          const year = new NepaliDate(new Date(purchaseOrder.poDate)).getYear();
          return filterBsYears.includes(String(year));
        } catch { return false; }
      });
    }

    if (filterBsMonths.length > 0) {
      filtered = filtered.filter(purchaseOrder => {
        try {
          const month = new NepaliDate(new Date(purchaseOrder.poDate)).getMonth();
          return filterBsMonths.includes(String(month));
        } catch { return false; }
      });
    }
    
    if (filterCompanies.length > 0) {
        filtered = filtered.filter(purchaseOrder => filterCompanies.includes(purchaseOrder.companyName));
    }

    if (filterStatuses.length > 0) {
        filtered = filtered.filter(purchaseOrder => filterStatuses.includes(purchaseOrder.status));
    }

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(purchaseOrder =>
            (purchaseOrder.poNumber || '').toLowerCase().includes(lowercasedQuery) ||
            (purchaseOrder.companyName || '').toLowerCase().includes(lowercasedQuery) ||
            purchaseOrder.items.some(item => (item.rawMaterialName || '').toLowerCase().includes(lowercasedQuery))
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
  }, [purchaseOrders, sortConfig, searchQuery, filterBsYears, filterBsMonths, filterCompanies, filterStatuses, allowedOwnerships]);

  const paginatedPOs = useMemo(() => {
    if (itemsPerPage === -1) return filteredAndSortedPOs;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedPOs.slice(start, start + itemsPerPage);
  }, [filteredAndSortedPOs, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredAndSortedPOs.length / itemsPerPage);
  }, [filteredAndSortedPOs, itemsPerPage]);

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
                    <PlusCircle className="mr-2 h-4 w-4" /> New PO
                    </Link>
                </Button>
              )}
            </div>
          </div>
        );
      }

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('poNumber')} className="text-xs">
                        PO Number <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('poDate')} className="text-xs">
                        Date <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('companyName')} className="text-xs">
                        Company Name <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('status')} className="font-bold text-primary text-xs">
                        Status <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('authorship')} className="text-xs">
                            Authorship
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead className="text-right text-xs">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedPOs.length > 0 ? (
                        paginatedPOs.map(purchaseOrder => (
                        <TableRow key={purchaseOrder.id}>
                            <TableCell className="font-medium text-xs">{purchaseOrder.poNumber}</TableCell>
                            <TableCell className="text-xs">{toNepaliDate(purchaseOrder.poDate)}</TableCell>
                            <TableCell className="text-xs">{purchaseOrder.companyName}</TableCell>
                            <TableCell>
                                {renderStatusBadge(purchaseOrder.status)}
                            </TableCell>
                            <TableCell>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default uppercase font-bold">
                                                {purchaseOrder.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                                <span>{purchaseOrder.lastModifiedBy || purchaseOrder.createdBy}</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="text-xs">Created by: {purchaseOrder.createdBy}{purchaseOrder.createdAt ? ` on ${format(new Date(purchaseOrder.createdAt), "PP")}` : ''}</p>
                                            {purchaseOrder.lastModifiedBy && (
                                              <p className="text-xs">Modified by: {purchaseOrder.lastModifiedBy}{purchaseOrder.updatedAt ? ` on ${format(new Date(purchaseOrder.updatedAt), "PP")}` : ''}</p>
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                {hasPermission('purchaseOrders', 'view') && (
                                    <DropdownMenuItem onSelect={() => router.push(`/purchase-orders/view?id=${purchaseOrder.id}`)}>
                                        <View className="mr-2 h-4 w-4" /> View
                                    </DropdownMenuItem>
                                )}
                                {hasPermission('purchaseOrders', 'edit') && (
                                    <DropdownMenuItem onClick={() => router.push(`/purchase-orders/edit?id=${purchaseOrder.id}`)} disabled={purchaseOrder.status === 'Delivered' || purchaseOrder.status === 'Canceled'}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                )}
                                 {hasPermission('purchaseOrders', 'view') && (
                                    <DropdownMenuItem onSelect={() => handlePrint(purchaseOrder.id)}>
                                        <Printer className="mr-2 h-4 w-4" /> Print
                                    </DropdownMenuItem>
                                )}
                                
                                {(hasPermission('purchaseOrders', 'view') || hasPermission('purchaseOrders', 'edit')) &&
                                 (hasPermission('purchaseOrders', 'delete') || hasPermission('purchaseOrders', 'edit')) &&
                                 <DropdownMenuSeparator />
                                }

                                {hasPermission('purchaseOrders', 'edit') && (
                                    <>
                                        {purchaseOrder.status !== 'Delivered' ? (
                                            <DropdownMenuItem onSelect={() => handleOpenDeliveryDialog(purchaseOrder)} disabled={purchaseOrder.status === 'Canceled'}>
                                                <PackageCheck className="mr-2 h-4 w-4" /> Mark as Delivered
                                            </DropdownMenuItem>
                                        ) : (
                                            <DropdownMenuItem onSelect={() => handleOpenDeliveryDialog(purchaseOrder)}>
                                                <CalendarIcon className="mr-2 h-4 w-4" /> Change Delivery Date
                                            </DropdownMenuItem>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <DropdownMenuItem onSelect={e => e.preventDefault()} disabled={purchaseOrder.status === 'Delivered' || purchaseOrder.status === 'Canceled'} className="text-destructive focus:text-destructive">
                                                    <Ban className="mr-2 h-4 w-4" /> Cancel Order
                                                </DropdownMenuItem>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure you want to cancel this order?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This action will mark PO #{purchaseOrder.poNumber} as Canceled. This action cannot be reversed.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Go Back</AlertDialogCancel>
                                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => updatePurchaseOrderStatus(purchaseOrder.id, 'Canceled')}>Confirm Cancellation</AlertDialogAction>
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
                                            <AlertDialogAction onClick={() => handleDeletePurchaseOrder(purchaseOrder.id)}>Delete</AlertDialogAction>
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
            </CardContent>
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredAndSortedPOs.length}</span> orders</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredAndSortedPOs.length)}</span> of <span className="font-bold text-foreground">{filteredAndSortedPOs.length}</span> orders
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="-1">All</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {itemsPerPage !== -1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardFooter>
            )}
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
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search POs..."
                    className="pl-8 sm:w-[300px]"
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
                    Select the delivery date for PO #{purchaseOrderToUpdate?.poNumber}.
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
