
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search, X, Check, User } from 'lucide-react';
import type { RawMaterial } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { onRawMaterialsUpdate, addRawMaterial, updateRawMaterial, deleteRawMaterial } from '@/services/raw-material-service';
import { format } from 'date-fns';


const materialTypes = [
    'Kraft Paper', 'Virgin Paper', 'Gum', 'Ink', 'Stitching Wire', 'Strapping', 'Machinery Spare Parts', 'Other'
];

const paperTypes = ['Kraft Paper', 'Virgin Paper'];

type RawMaterialSortKey = 'name' | 'type' | 'authorship';
type SortDirection = 'asc' | 'desc';

const generateMaterialName = (type: string, size: string, gsm: string, bf: string) => {
    if (paperTypes.includes(type)) {
        const parts = [type];
        if (size) parts.push(`${size} inch`);
        if (gsm) parts.push(`${gsm} GSM`);
        if (bf) parts.push(`${bf} BF`);
        return parts.join(' - ');
    }
    return '';
};


export default function RawMaterialsPage() {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
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

  useEffect(() => {
    const unsubscribe = onRawMaterialsUpdate((materials) => {
        setRawMaterials(materials);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);
  
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
    setNewMaterialBf(material.bf || '');
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
    
    const finalName = isPaper 
        ? generateMaterialName(
            newMaterialType.trim(), 
            newMaterialSize.trim(), 
            newMaterialGsm.trim(), 
            newMaterialBf.trim()
          )
        : newMaterialName.trim();
    
      try {
        if (editingMaterial) {
          const updatedMaterialData: Partial<Omit<RawMaterial, 'id'>> = {
            type: newMaterialType.trim(),
            name: finalName,
            size: isPaper ? newMaterialSize.trim() : '',
            gsm: isPaper ? newMaterialGsm.trim() : '',
            bf: isPaper ? newMaterialBf.trim() : '',
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
            bf: isPaper ? newMaterialBf.trim() : '',
            units: newMaterialUnits,
            createdBy: user.username,
            createdAt: now,
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
        const aValue = (a[sortConfig.key as keyof RawMaterial] || '').toString().toLowerCase();
        const bValue = (b[sortConfig.key as keyof RawMaterial] || '').toString().toLowerCase();

        if (sortConfig.key === 'authorship') {
             const aDate = a.lastModifiedAt || a.createdAt;
             const bDate = b.lastModifiedAt || b.createdAt;
             if (!aDate || !bDate) return 0;
             if (aDate < bDate) return sortConfig.direction === 'asc' ? -1 : 1;
             if (aDate > bDate) return sortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        }

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
  
  const isPaperTypeSelectedInDialog = paperTypes.includes(newMaterialType);

  const allUnits = useMemo(() => {
    const unitsSet = new Set<string>();
    rawMaterials.forEach(material => {
      if (Array.isArray(material.units)) {
        material.units.forEach(unit => unitsSet.add(unit));
      }
    });
    return Array.from(unitsSet).sort();
  }, [rawMaterials]);
  
  const handleUnitSelect = (unit: string) => {
    if (!newMaterialUnits.includes(unit)) {
        setNewMaterialUnits([...newMaterialUnits, unit]);
    }
    setUnitInputValue('');
  };

  const handleUnitRemove = (unit: string) => {
    setNewMaterialUnits(newMaterialUnits.filter(u => u !== unit));
  };

  const handleUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    if ((e.key === 'Enter' || e.key === ',' || e.key === '.') && value.trim()) {
        e.preventDefault();
        const newUnit = value.trim();
        if (!newMaterialUnits.find(u => u.toLowerCase() === newUnit.toLowerCase())) {
            setNewMaterialUnits([...newMaterialUnits, newUnit]);
        }
        setUnitInputValue('');
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
        <Card>
            <CardContent className="p-0">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('name')}>
                        Material Description
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    {activeTab === 'All' &&
                        <TableHead>
                            <Button variant="ghost" onClick={() => requestSort('type')}>
                            Type
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                        </TableHead>
                    }
                    {isCurrentTabPaper && (
                        <>
                            <TableHead>Size (Inch)</TableHead>
                            <TableHead>GSM</TableHead>
                            <TableHead>BF</TableHead>
                        </>
                    )}
                    <TableHead>Units</TableHead>
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
                    {filteredAndSortedMaterials.map(material => (
                    <TableRow key={material.id}>
                        <TableCell className="font-medium">{material.name}</TableCell>
                        {activeTab === 'All' && <TableCell>{material.type}</TableCell>}
                        {isCurrentTabPaper && (
                             <>
                                <TableCell>{material.size || '-'}</TableCell>
                                <TableCell>{material.gsm || '-'}</TableCell>
                                <TableCell>{material.bf || '-'}</TableCell>
                            </>
                        )}
                        <TableCell>{Array.isArray(material.units) ? material.units.join(', ') : ''}</TableCell>
                         <TableCell>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                                        {material.lastModifiedBy ? <Edit className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                        <span>{material.lastModifiedBy || material.createdBy}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {material.createdBy && (
                                            <p>
                                            Created by: {material.createdBy}
                                            {material.createdAt ? ` on ${format(new Date(material.createdAt), "PP")}` : ''}
                                            </p>
                                        )}
                                        {material.lastModifiedBy && (
                                        <p>
                                            Modified by: {material.lastModifiedBy}
                                            {material.lastModifiedAt ? ` on ${format(new Date(material.lastModifiedAt), "PP")}` : ''}
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
                                        <AlertDialogAction onClick={() => handleDeleteMaterial(material.id)}>Delete</AlertDialogAction>
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
            </CardContent>
        </Card>
    );
  };
  
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Raw Materials</h1>
            <p className="text-muted-foreground">Add, view, and manage your raw materials for purchase orders.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search materials..."
                    className="pl-8 sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
          {hasPermission('rawMaterials', 'create') && (
            <Dialog open={isMaterialDialogOpen} onOpenChange={setIsMaterialDialogOpen}>
                <DialogTrigger asChild>
                <Button onClick={openAddMaterialDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Add Raw Material
                </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>
                <form
                    id="add-material-form"
                    onSubmit={e => {
                    e.preventDefault();
                    handleMaterialSubmit();
                    }}
                >
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="material-type">Type</Label>
                            <Select onValueChange={setNewMaterialType} value={newMaterialType}>
                                <SelectTrigger id="material-type">
                                    <SelectValue placeholder="Select a type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {materialTypes.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {!isPaperTypeSelectedInDialog && newMaterialType && (
                            <div className="space-y-2">
                                <Label htmlFor="material-name">Name / Description</Label>
                                <Input
                                id="material-name"
                                value={newMaterialName}
                                onChange={e => setNewMaterialName(e.target.value)}
                                placeholder={"Product description"}
                                />
                            </div>
                        )}
                        
                        {isPaperTypeSelectedInDialog && (
                            <>
                               <div className="space-y-2">
                                 <Label htmlFor="material-size">Size (Inch)</Label>
                                 <Input
                                    id="material-size"
                                    value={newMaterialSize}
                                    onChange={e => setNewMaterialSize(e.target.value)}
                                    placeholder="e.g. 42.5"
                                  />
                               </div>
                                <div className="space-y-2">
                                 <Label htmlFor="material-gsm">GSM</Label>
                                 <Input
                                    id="material-gsm"
                                    value={newMaterialGsm}
                                    onChange={e => setNewMaterialGsm(e.target.value)}
                                    placeholder="e.g. 150"
                                  />
                               </div>
                                <div className="space-y-2">
                                 <Label htmlFor="material-bf">BF</Label>
                                 <Input
                                    id="material-bf"
                                    value={newMaterialBf}
                                    onChange={e => setNewMaterialBf(e.target.value)}
                                    placeholder="e.g. 20"
                                  />
                               </div>
                            </>
                        )}
                         {newMaterialType && (
                            <div className="space-y-2">
                                <Label htmlFor="material-units">Units of Measurement</Label>
                                 <Popover open={isUnitPopoverOpen} onOpenChange={setIsUnitPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <div className="flex min-h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm flex-wrap gap-1">
                                        {newMaterialUnits.map(unit => (
                                            <Badge key={unit} variant="secondary" className="gap-1">
                                                {unit}
                                                <button type="button" onClick={() => handleUnitRemove(unit)} className="rounded-full hover:bg-background/50">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                        <input
                                            placeholder={newMaterialUnits.length === 0 ? "e.g. Kg, Ton..." : ""}
                                            value={unitInputValue}
                                            onChange={e => setUnitInputValue(e.target.value)}
                                            onKeyDown={handleUnitKeyDown}
                                            className="bg-transparent outline-none flex-1 placeholder:text-muted-foreground text-sm"
                                        />
                                        </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                        <Command>
                                            <CommandInput 
                                                placeholder="Search or create unit..."
                                                value={unitInputValue}
                                                onValueChange={setUnitInputValue}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && unitInputValue.trim()) {
                                                        e.preventDefault();
                                                        handleUnitSelect(unitInputValue.trim());
                                                    }
                                                }}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    <div className="p-2 text-sm text-center">
                                                        No results. Press Enter to add.
                                                    </div>
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {allUnits.filter(u => !newMaterialUnits.includes(u)).map(unit => (
                                                        <CommandItem key={unit} onSelect={() => handleUnitSelect(unit)}>
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
                <DialogFooter>
                    <Button type="submit" form="add-material-form">{dialogButtonText}</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>
          )}
        </div>
      </header>
       {isLoading ? renderContent() : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
              {tabs.map(tab => (
                   <TabsTrigger key={tab} value={tab}>{tab}</TabsTrigger>
              ))}
          </TabsList>
          {tabs.map(tab => (
              <TabsContent key={tab} value={tab} className="mt-4">
                  {renderContent()}
              </TabsContent>
          ))}
        </Tabs>
       )}
    </div>
  );
}

