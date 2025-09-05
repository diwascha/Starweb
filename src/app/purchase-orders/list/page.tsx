
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PlusCircle, MoreHorizontal, Edit, Trash2, View, ArrowUpDown, Search, PackageCheck, Ban, User, Printer } from 'lucide-react';
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
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { onPurchaseOrdersUpdate, deletePurchaseOrder, updatePurchaseOrder } from '@/services/purchase-order-service';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


type SortKey = 'poNumber' | 'poDate' | 'companyName' | 'status' | 'authorship';
type SortDirection = 'asc' | 'desc';

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
  const { hasPermission } = useAuth();

  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [poToUpdate, setPoToUpdate] = useState<PurchaseOrder | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(new Date());


  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = onPurchaseOrdersUpdate((poData) => {
        setPurchaseOrders(poData);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
  const handleDeletePurchaseOrder = async (id: string) => {
    try {
      await deletePurchaseOrder(id);
      toast({ title: 'Purchase Order Deleted', description: 'The purchase order has been successfully deleted.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete purchase order.', variant: 'destructive' });
    }
  };
  
  const updatePoStatus = async (id: string, status: PurchaseOrderStatus, deliveryDate?: string) => {
    try {
      await updatePurchaseOrder(id, { status, deliveryDate: deliveryDate || poToUpdate?.deliveryDate });
      toast({
        title: 'Status Updated',
        description: `Purchase Order status has been updated to ${status}.`,
      });
    } catch (error) {
       toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' });
    }
  };

  const handleOpenDeliveryDialog = (po: PurchaseOrder) => {
    setPoToUpdate(po);
    setDeliveryDate(new Date());
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
    const printWindow = window.open(`/purchase-orders/${poId}`, '_blank');
    if (printWindow) {
        printWindow.onload = () => {
            setTimeout(() => printWindow.print(), 500); // Give it a moment to render
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
             if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
             if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        }

        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
  
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return filtered;
  }, [purchaseOrders, sortConfig, searchQuery]);

  const getStatusBadgeVariant = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'Ordered':
        return 'default';
      case 'Amended':
        return 'secondary';
      case 'Delivered':
        return 'outline';
      case 'Canceled':
        return 'destructive';
      default:
        return 'default';
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
                    <Button variant="ghost" onClick={() => requestSort('status')}>
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
                {filteredAndSortedPOs.map(po => (
                <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.poNumber}</TableCell>
                    <TableCell>{new Date(po.poDate).toLocaleDateString()}</TableCell>
                    <TableCell>{po.companyName}</TableCell>
                    <TableCell>
                        <Badge variant={getStatusBadgeVariant(po.status)}>{po.status}</Badge>
                    </TableCell>
                    <TableCell>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                    {po.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                    <span>{po.lastModifiedBy || po.createdBy}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        Created by: {po.createdBy}
                                        {po.createdAt ? ` on ${format(new Date(po.createdAt), "PP")}` : ''}
                                    </p>
                                    {po.lastModifiedBy && (
                                      <p>
                                        Modified by: {po.lastModifiedBy}
                                        {po.updatedAt ? ` on ${format(new Date(po.updatedAt), "PP")}` : ''}
                                      </p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        {hasPermission('purchaseOrders', 'view') && (
                            <DropdownMenuItem onSelect={() => router.push(`/purchase-orders/${po.id}`)}>
                                <View className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>
                        )}
                        {hasPermission('purchaseOrders', 'edit') && (
                            <DropdownMenuItem onClick={() => router.push(`/purchase-orders/edit/${po.id}`)} disabled={po.status === 'Delivered' || po.status === 'Canceled'}>
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
                                <DropdownMenuItem onSelect={() => handleOpenDeliveryDialog(po)} disabled={po.status === 'Delivered' || po.status === 'Canceled'}>
                                    <PackageCheck className="mr-2 h-4 w-4" /> Mark as Delivered
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => updatePoStatus(po.id, 'Canceled')} disabled={po.status === 'Delivered' || po.status === 'Canceled'}>
                                    <Ban className="mr-2 h-4 w-4" /> Cancel Order
                                </DropdownMenuItem>
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
            <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
            <p className="text-muted-foreground">View and manage your purchase orders.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
                    <PlusCircle className="mr-2 h-4 w-4" /> New Purchase Order
                    </Link>
                </Button>
            )}
        </div>
      </header>
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
