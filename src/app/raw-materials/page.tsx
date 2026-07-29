'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, X, Check, User, Loader2, ChevronsUpDown, ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react';
import type { RawMaterial, UnitOfMeasurement } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
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
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn, normalizeBF } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { onRawMaterialsUpdate, addRawMaterial, updateRawMaterial, deleteRawMaterial } from '@/services/raw-material-service';
import { format } from 'date-fns';
import { onUomsUpdate } from '@/services/uom-service';

const materialTypes = [
    'Kraft Paper', 'Virgin Paper', 'Gum', 'Ink', 'Stitching Wire', 'Strapping', 'Machinery Spare Parts', 'Other'
];

const paperTypes = ['Kraft Paper', 'Virgin Paper'];
const bfOptions = ['16 BF', '18 BF', '20 BF', '22 BF'];

type RawMaterialSortKey = 'name' | 'type' | 'authorship';
type SortDirection = 'asc' | 'desc';

const generateMaterialName = (type: string, size: string, gsm: string, bf: string) => {
    if (paperTypes.includes(type)) {
        const parts = [type];
        if (size) parts.push(`${size} inch`);
        if (gsm) parts.push(`${gsm} GSM`);
        if (bf) parts.push(`${normalizeBF(bf)}`);
        return parts.join(' - ');
    }
    return '';
};


export default function RawMaterialsPage() {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [newMaterialType, setNewMaterialType] = useState('');
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialSize, setNewMaterialSize] = useState('');
  const [newMaterialGsm, setNewMaterialGsm] = useState('');
  const [newMaterialBf, setNewMaterialBf] = useState('');
  const [newMaterialUnits, setNewMaterialUnits] = useState<string[]>([]);
  
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [sortConfig, setSortConfig] = useState<{ key: RawMaterialSortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });
  
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('All');
  const { hasPermission, user } = useAuth();
  
  const [unitInputValue, setUnitInputValue] = useState('');
  const [isUnitPopoverOpen, setIsUnitPopoverOpen] = useState(false);
  const [isQuickAddTypePopoverOpen, setIsQuickAddTypePopoverOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const unsubMaterials = onRawMaterialsUpdate((materials) => {
        setRawMaterials(materials);
        setIsLoading(false);
    });
    const unsubUoms = onUomsUpdate(setUoms);
    return () => {
        unsubMaterials();
        unsubUoms();
    };
  }, []);

  const allUnits = useMemo(() => {
    return uoms.map(u => u.abbreviation).sort();
  }, [uoms]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, itemsPerPage]);
  
  const resetForm = () => {
    setNewMaterialType('');
    setNewMaterialName('');
    setNewMaterialSize('');
    setNewMaterialGsm('');
    setNewMaterialBf('');
    setNewMaterialUnits([]);
    setEditingMaterial(null);
  };

  const openAddMaterialDialog = () => {
    resetForm();
    setIsMaterialDialogOpen(true);
  };

  const openEditMaterialDialog = (material: RawMaterial) => {
    setEditingMaterial(material);
    setNewMaterialType(material.type);
    setNewMaterialName(material.name);
    setNewMaterialSize(material.size || '');
    setNewMaterialGsm(material.gsm || '');
    setNewMaterialBf(normalizeBF(material.bf) || '');
    setNewMaterialUnits(Array.isArray(material.units) ? material.units : []);
    setIsMaterialDialogOpen(true);
  };

  const handleMaterialSubmit = async () => {
    if (!user) {
        toast({ title: 'Error', description: 'You must be logged in.', variant: 'destructive' });
        return;
    }
    const isPaper = paperTypes.includes(newMaterialType);
    
    if (newMaterialType.trim() === '') {
        toast({ title: 'Error', description: 'Please select a material type.', variant: 'destructive' });
        return;
    }

    if (newMaterialUnits.length === 0) {
        toast({ title: 'Error', description: 'Please provide at least one unit of measurement.', variant: 'destructive' });
        return;
    }

    if (!isPaper && newMaterialName.trim() === '') {
      toast({ title: 'Error', description: 'Please provide a name/description.', variant: 'destructive' });
      return;
    }
    
    const finalBF = isPaper ? normalizeBF(newMaterialBf) : '';
    const finalName = isPaper 
        ? generateMaterialName(
            newMaterialType.trim(), 
            newMaterialSize.trim(), 
            newMaterialGsm.trim(), 
            finalBF
          )
        : newMaterialName.trim();
    
      try {
        if (editingMaterial) {
          const updatedMaterialData: Partial<Omit<RawMaterial, 'id'>> = {
            type: newMaterialType.trim(),
            name: finalName,
            size: isPaper ? newMaterialSize.trim() : '',
            gsm: isPaper ? newMaterialGsm.trim() : '',
            bf: finalBF,
            units: newMaterialUnits,
            lastModifiedBy: user.username,
            lastModifiedAt: new Date().toISOString(),
          };
          await updateRawMaterial(editingMaterial.id, updatedMaterialData);
          toast({ title: 'Success', description: 'Raw material updated.' });
        } else {
          const now = new Date().toISOString();
          const newMaterialData: Omit<RawMaterial, 'id'> = {
            type: newMaterialType.trim(),
            name: finalName,
            size: isPaper ? newMaterialSize.trim() : '',
            gsm: isPaper ? newMaterialGsm.trim() : '',
            bf: finalBF,
            units: newMaterialUnits,
            createdBy: user.username,
            createdAt: now,
            ownership: 'Both',
          };
          await addRawMaterial(newMaterialData);
          toast({ title: 'Success', description: 'New raw material added.' });
        }
        resetForm();
        setIsMaterialDialogOpen(false);
      } catch (error) {
         toast({ title: 'Error', description: 'Failed to save raw material.', variant: 'destructive' });
      }
  };
  
  const handleDeleteMaterial = async (id: string) => {
    try {
        await deleteRawMaterial(id);
        toast({ title: 'Raw Material Deleted', description: 'The raw material has been deleted.' });
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to delete raw material.', variant: 'destructive' });
    }
  };

  const dialogTitle = editingMaterial ? 'Edit Raw Material' : 'Add New Raw Material';
  const dialogDescription = editingMaterial ? 'Update the details for this material.' : 'Enter the details for the new raw material.';
  const dialogButtonText = editingMaterial ? 'Save changes' : 'Save material';

  const requestSort = (key: RawMaterialSortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const tabs = useMemo(() => {
    const types = new Set(rawMaterials.map(m => m.type));
    return ['All', ...Array.from(types).sort()];
  }, [rawMaterials]);
  
  const filteredAndSortedMaterials = useMemo(() => {
    let filtered = [...rawMaterials];
    
    if (activeTab !== 'All') {
        filtered = filtered.filter(m => m.type === activeTab);
    }

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(material =>
            (material.name || '').toLowerCase().includes(lowercasedQuery) ||
            (material.type || '').toLowerCase().includes(lowercasedQuery)
        );
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        if (sortConfig.key === 'authorship') {
             const aDate = a.lastModifiedAt || a.createdAt;
             const bDate = b.lastModifiedAt || b.createdAt;
             if (!aDate || !bDate) return 0;
             if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
             if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        }

        const aValue = (a[sortConfig.key as keyof RawMaterial] || '').toString().toLowerCase();
        const bValue = (b[sortConfig.key as keyof RawMaterial] || '').toString().toLowerCase();


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
  }, [rawMaterials, sortConfig, searchQuery, activeTab]);

  const paginatedMaterials = useMemo(() => {
    if (itemsPerPage === -1) return filteredAndSortedMaterials;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedMaterials.slice(start, start + itemsPerPage);
  }, [filteredAndSortedMaterials, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredAndSortedMaterials.length / itemsPerPage);
  }, [filteredAndSortedMaterials, itemsPerPage]);
  
  const isPaperTypeSelectedInDialog = paperTypes.includes(newMaterialType);

  const handleUnitSelect = (unit: string) => {
    if (!newMaterialUnits.includes(unit)) {
        setNewMaterialUnits([...newMaterialUnits, unit]);
    }
    setUnitInputValue('');
  };

  const handleUnitRemove = (unit: string) => {
    setNewMaterialUnits(newMaterialUnits.filter(u => u !== unit));
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

    if (rawMaterials.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">No raw materials found</h3>
              <p className="text-sm text-muted-foreground">Get started by adding a new raw material.</p>
              {hasPermission('rawMaterials', 'create') && (
                <Button className="mt-4" onClick={openAddMaterialDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Add Raw Material
                </Button>
              )}
            </div>
          </div>
        );
      }
    
    const isCurrentTabPaper = paperTypes.includes(activeTab);

    return (
        <Card className="shadow-none border-none ring-1 ring-black/5 bg-white">
            <CardContent className="p-0">
                <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/50 border-b">
                    <TableHead className="pl-6 font-bold uppercase text-[11px] tracking-widest text-muted-foreground">
                        <Button variant="ghost" onClick={() => requestSort('name')} className="-ml-4 h-8 px-2 hover:bg-transparent font-bold">
                        Material Description
                        <ArrowUpDown className={cn("ml-2 h-3 w-3", sortConfig.key === 'name' ? "opacity-100 text-primary" : "opacity-30")} />
                        </Button>
                    </TableHead>
                    {activeTab === 'All' &&
                        <TableHead className="font-bold uppercase text-[11px] tracking-widest text-muted-foreground">
                            <Button variant="ghost" onClick={() => requestSort('type')} className="-ml-4 h-8 px-2 hover:bg-transparent font-bold">
                            Type
                            <ArrowUpDown className={cn("ml-2 h-3 w-3", sortConfig.key === 'type' ? "opacity-100 text-primary" : "opacity-30")} />
                            </Button>
                        </TableHead>
                    }
                    {isCurrentTabPaper && (
                        <>
                            <TableHead className="text-center font-bold text-[11px] uppercase tracking-widest text-muted-foreground">Size (Inch)</TableHead>
                            <TableHead className="text-center font-bold text-[11px] uppercase tracking-widest text-muted-foreground">GSM</TableHead>
                            <TableHead className="text-center font-bold text-[11px] uppercase tracking-widest text-muted-foreground">BF</TableHead>
                        </>
                    )}
                    <TableHead className="font-bold text-[11px] uppercase tracking-widest text-muted-foreground">Units</TableHead>
                     <TableHead className="font-bold uppercase text-[11px] tracking-widest text-muted-foreground">
                        <Button variant="ghost" onClick={() => requestSort('authorship')} className="-ml-4 h-8 px-2 hover:bg-transparent font-bold">
                            Authorship
                            <ArrowUpDown className={cn("ml-2 h-3 w-3", sortConfig.key === 'authorship' ? "opacity-100 text-primary" : "opacity-30")} />
                        </Button>
                    </TableHead>
                    <TableHead className="text-right pr-6 font-bold text-[11px] uppercase tracking-widest text-muted-foreground">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedMaterials.map(material => {
                        const isRowPaper = paperTypes.includes(material.type);
                        return (
                        <TableRow key={material.id} className="h-14 border-b hover:bg-muted/30 transition-colors">
                            <TableCell className="font-bold text-gray-900 pl-6">{material.name}</TableCell>
                            {activeTab === 'All' && <TableCell className="text-xs uppercase font-medium">{material.type}</TableCell>}
                            {isCurrentTabPaper && (
                                <>
                                    <TableCell className="text-center font-medium text-xs">{isRowPaper ? (material.size || '-') : '-'}</TableCell>
                                    <TableCell className="text-center font-medium text-xs">{isRowPaper ? (material.gsm || '-') : '-'}</TableCell>
                                    <TableCell className="text-center font-medium text-xs">{isRowPaper ? (normalizeBF(material.bf) || '-') : '-'}</TableCell>
                                </>
                            )}
                            <TableCell>
                                <div className="flex flex-wrap gap-1">
                                    {Array.isArray(material.units) ? material.units.map(u => (
                                        <Badge key={u} variant="secondary" className="text-[9px] uppercase font-black px-1.5 h-4">{u}</Badge>
                                    )) : ''}
                                </div>
                            </TableCell>
                             <TableCell>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground cursor-help">
                                                {material.lastModifiedBy ? <Edit className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                                <span>{material.lastModifiedBy || material.createdBy}</span>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <div className="text-xs space-y-1">
                                                {material.createdBy && (
                                                    <p><span className="font-semibold">Created:</span> {material.createdBy} ({format(new Date(material.createdAt), "PP")})</p>
                                                )}
                                                {material.lastModifiedBy && material.lastModifiedAt && (
                                                <p><span className="font-semibold">Modified:</span> {material.lastModifiedBy} ({format(new Date(material.lastModifiedAt), "PP")})</p>
                                                )}
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-right pr-6">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                {hasPermission('rawMaterials', 'edit') && (
                                    <DropdownMenuItem onSelect={() => openEditMaterialDialog(material)}>
                                        <Edit className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                )}
                                {hasPermission('rawMaterials', 'edit') && hasPermission('rawMaterials', 'delete') && <DropdownMenuSeparator />}
                                {hasPermission('rawMaterials', 'delete') && (
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
                                                This will permanently delete the raw material. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDeleteMaterial(material.id)} className="bg-destructive text-white">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    )})}
                </TableBody>
                </Table>
            </CardContent>
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredAndSortedMaterials.length}</span> materials</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredAndSortedMaterials.length)}</span> of <span className="font-bold text-foreground">{filteredAndSortedMaterials.length}</span> materials
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
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
            <h1 className="text-3xl font-black tracking-tighter text-gray-900 uppercase">Procurement Registry</h1>
            <p className="text-muted-foreground text-sm font-medium">Manage your raw material inventory and paper specifications.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search materials..."
                    className="pl-8 sm:w-[250px] bg-white h-10 border-gray-300"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          {hasPermission('rawMaterials', 'create') && (
            <Dialog open={isMaterialDialogOpen} onOpenChange={setIsMaterialDialogOpen}>
                <DialogTrigger asChild>
                <Button onClick={openAddMaterialDialog} className="h-10 font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                    <Plus className="mr-2 h-4 w-4" /> Add Raw Material
                </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase text-gray-900">{dialogTitle}</DialogTitle>
                    <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{dialogDescription}</DialogDescription>
                </DialogHeader>
                <form
                    id="add-material-form"
                    onSubmit={e => {
                    e.preventDefault();
                    handleMaterialSubmit();
                    }}
                >
                    <div className="grid gap-5 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="material-type" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type / Category <span className="text-destructive">*</span></Label>
                            <Popover open={isQuickAddTypePopoverOpen} onOpenChange={setIsQuickAddTypePopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-between h-11 bg-gray-50 border-gray-300 font-normal">
                                        {newMaterialType || "Select or type category..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                    <Command>
                                        <CommandInput 
                                            placeholder="Search or add category..."
                                            onValueChange={(val: string) => setNewMaterialType(val)}
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                <button type="button" className="p-2 text-xs text-left w-full hover:bg-muted font-bold text-primary" onClick={() => setIsQuickAddTypePopoverOpen(false)}>
                                                    <PlusCircle className="inline mr-2 h-3.5 w-3.5"/> Add "{newMaterialType}"
                                                </button>
                                            </CommandEmpty>
                                            <CommandGroup>
                                                {materialTypes.map(cat => (
                                                    <CommandItem key={cat} value={cat} onSelect={() => {
                                                        setNewMaterialType(cat);
                                                        setIsQuickAddTypePopoverOpen(false);
                                                    }} className="text-xs">
                                                        <Check className={cn("mr-2 h-4 w-4", newMaterialType === cat ? "opacity-100" : "opacity-0")} />
                                                        {cat}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        
                        {!isPaperTypeSelectedInDialog && newMaterialType && (
                            <div className="space-y-2">
                                <Label htmlFor="material-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name / Description <span className="text-destructive">*</span></Label>
                                <Input
                                id="material-name"
                                value={newMaterialName}
                                onChange={e => setNewMaterialName(e.target.value)}
                                placeholder={"e.g. Gum, Stitching Wire, Part #123"}
                                className="h-11 font-bold"
                                />
                            </div>
                        )}
                        
                        {isPaperTypeSelectedInDialog && (
                            <>
                               <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="material-size" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Size (Inch)</Label>
                                        <Input
                                            id="material-size"
                                            value={newMaterialSize}
                                            onChange={e => setNewMaterialSize(e.target.value)}
                                            placeholder="e.g. 42.5"
                                            className="h-10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="material-gsm" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">GSM</Label>
                                        <Input
                                            id="material-gsm"
                                            value={newMaterialGsm}
                                            onChange={e => setNewMaterialGsm(e.target.value)}
                                            placeholder="e.g. 150"
                                            className="h-10"
                                        />
                                    </div>
                               </div>
                                <div className="space-y-2">
                                    <Label htmlFor="material-bf" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bursting Factor (BF)</Label>
                                    <Select value={normalizeBF(newMaterialBf)} onValueChange={(val: string) => setNewMaterialBf(val)}>
                                        <SelectTrigger id="material-bf" className="h-11"><SelectValue placeholder="Select BF" /></SelectTrigger>
                                        <SelectContent>
                                            {bfOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                         {newMaterialType && (
                            <div className="space-y-2">
                                <Label htmlFor="material-units" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Units of Measurement <span className="text-destructive">*</span></Label>
                                 <Popover open={isUnitPopoverOpen} onOpenChange={setIsUnitPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <div className="flex min-h-11 w-full items-center justify-between rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm cursor-pointer shadow-inner">
                                            <div className="flex wrap gap-1.5 flex-1">
                                                {newMaterialUnits.map(unit => (
                                                    <Badge key={unit} variant="secondary" className="gap-1 px-2 h-6 font-black uppercase text-[9px]">
                                                        {unit}
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleUnitRemove(unit); }} className="rounded-full hover:bg-background/50">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </Badge>
                                                ))}
                                                {newMaterialUnits.length === 0 && <span className="text-muted-foreground text-xs font-bold opacity-50 uppercase tracking-tighter">Choose units...</span>}
                                            </div>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                        <Command>
                                            <CommandInput 
                                                placeholder="Search or add unit..."
                                                value={unitInputValue}
                                                onValueChange={(val: string) => setUnitInputValue(val)}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <button type="button" className="p-2 text-sm text-left w-full hover:bg-muted font-bold text-primary" onClick={() => handleUnitSelect(unitInputValue)}>
                                                        <PlusCircle className="inline mr-2 h-3 w-3"/> Add "{unitInputValue}"
                                                    </button>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {allUnits.filter(u => !newMaterialUnits.includes(u)).map(unit => (
                                                        <CommandItem key={unit} value={unit} onSelect={() => handleUnitSelect(unit)} className="text-xs">
                                                            <Check className={cn("mr-2 h-4 w-4", newMaterialUnits.includes(unit) ? "opacity-100" : "opacity-0")} />
                                                            {unit}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}
                    </div>
                </form>
                <DialogFooter className="bg-muted/30 p-6 border-t">
                    <Button variant="outline" onClick={() => setIsMaterialDialogOpen(false)} className="h-11 font-bold uppercase text-[10px] tracking-widest px-8">Cancel</Button>
                    <Button type="submit" form="add-material-form" className="h-11 font-black uppercase text-[10px] tracking-widest px-12 shadow-xl shadow-primary/20">{dialogButtonText}</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>
          )}
        </div>
      </header>
       {isLoading ? renderContent() : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 bg-muted/50 p-1 h-11 border">
              {tabs.map(tab => (
                   <TabsTrigger key={tab} value={tab} className="font-bold text-[10px] uppercase tracking-[0.2em] px-8 h-full data-[state=active]:bg-white data-[state=active]:shadow-sm">{tab}</TabsTrigger>
              ))}
          </TabsList>
          {tabs.map(tab => (
              <TabsContent key={tab} value={tab} className="mt-0 border-none p-0 animate-in fade-in zoom-in-95">
                  {renderContent()}
              </TabsContent>
          ))}
        </Tabs>
       )}
    </div>
  );
}
