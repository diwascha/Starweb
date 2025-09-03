
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown, Search } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { RawMaterial } from '@/lib/types';
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

const materialTypes = [
    'Kraft Paper', 'Virgin Paper', 'Gum', 'Ink', 'Stitching Wire', 'Strapping', 'Machinery Spare Parts', 'Other'
];

type RawMaterialSortKey = 'name' | 'type';
type SortDirection = 'asc' | 'desc';

const generateMaterialName = (type: string, size: string, gsm: string, bf: string) => {
    if (type === 'Kraft Paper' || type === 'Virgin Paper') {
        const parts = [type];
        if (size) parts.push(`${size} inch`);
        if (gsm) parts.push(`${gsm} GSM`);
        if (bf) parts.push(`${bf} BF`);
        return parts.join(' - ');
    }
    return type;
};


export default function RawMaterialsPage() {
  const [rawMaterials, setRawMaterials] = useLocalStorage<RawMaterial[]>('rawMaterials', []);
  
  const [newMaterialType, setNewMaterialType] = useState('');
  const [newMaterialSize, setNewMaterialSize] = useState('');
  const [newMaterialGsm, setNewMaterialGsm] = useState('');
  const [newMaterialBf, setNewMaterialBf] = useState('');
  
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [sortConfig, setSortConfig] = useState<{ key: RawMaterialSortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });
  
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  const resetForm = () => {
    setNewMaterialType('');
    setNewMaterialSize('');
    setNewMaterialGsm('');
    setNewMaterialBf('');
    setEditingMaterial(null);
  };

  const openAddMaterialDialog = () => {
    resetForm();
    setIsMaterialDialogOpen(true);
  };

  const openEditMaterialDialog = (material: RawMaterial) => {
    setEditingMaterial(material);
    setNewMaterialType(material.type);
    setNewMaterialSize(material.size);
    setNewMaterialGsm(material.gsm);
    setNewMaterialBf(material.bf);
    setIsMaterialDialogOpen(true);
  };

  const handleMaterialSubmit = () => {
    if (newMaterialType.trim() !== '') {
        const generatedName = generateMaterialName(newMaterialType.trim(), newMaterialSize.trim(), newMaterialGsm.trim(), newMaterialBf.trim());

      if (editingMaterial) {
        const updatedMaterial: RawMaterial = {
          ...editingMaterial,
          type: newMaterialType.trim(),
          name: generatedName,
          size: newMaterialSize.trim(),
          gsm: newMaterialGsm.trim(),
          bf: newMaterialBf.trim(),
        };
        setRawMaterials(rawMaterials.map(m => (m.id === editingMaterial.id ? updatedMaterial : m)));
        toast({ title: 'Success', description: 'Raw material updated.' });
      } else {
        const newMaterial: RawMaterial = {
          id: crypto.randomUUID(),
          type: newMaterialType.trim(),
          name: generatedName,
          size: newMaterialSize.trim(),
          gsm: newMaterialGsm.trim(),
          bf: newMaterialBf.trim(),
        };
        setRawMaterials([...rawMaterials, newMaterial]);
        toast({ title: 'Success', description: 'New raw material added.' });
      }
      resetForm();
      setIsMaterialDialogOpen(false);
    } else {
      toast({ title: 'Error', description: 'Please select a Type.', variant: 'destructive' });
    }
  };
  
  const deleteMaterial = (id: string) => {
    setRawMaterials(rawMaterials.filter(material => material.id !== id));
    toast({ title: 'Raw Material Deleted', description: 'The raw material has been deleted.' });
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
  
  const filteredAndSortedMaterials = useMemo(() => {
    let filtered = [...rawMaterials];

    if (searchQuery) {
        const lowercasedQuery = searchQuery.toLowerCase();
        filtered = filtered.filter(material =>
            (material.name || '').toLowerCase().includes(lowercasedQuery) ||
            (material.type || '').toLowerCase().includes(lowercasedQuery)
        );
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key].toLowerCase();
        const bValue = b[sortConfig.key].toLowerCase();

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
  }, [rawMaterials, sortConfig, searchQuery]);
  
  const isPaper = newMaterialType === 'Kraft Paper' || newMaterialType === 'Virgin Paper';

  const renderContent = () => {
    if (!isClient) {
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
              <Button className="mt-4" onClick={openAddMaterialDialog}>
                 <Plus className="mr-2 h-4 w-4" /> Add Raw Material
              </Button>
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
                    <Button variant="ghost" onClick={() => requestSort('name')}>
                    Material Description
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('type')}>
                    Type
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>Size (Inch)</TableHead>
                <TableHead>GSM</TableHead>
                <TableHead>BF</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filteredAndSortedMaterials.map(material => (
                <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell>{material.type}</TableCell>
                    <TableCell>{material.size || '-'}</TableCell>
                    <TableCell>{material.gsm || '-'}</TableCell>
                    <TableCell>{material.bf || '-'}</TableCell>
                    <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditMaterialDialog(material)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
                                    <AlertDialogAction onClick={() => deleteMaterial(material.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
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
                    {isPaper && (
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
                  </div>
              </form>
              <DialogFooter>
                <Button type="submit" form="add-material-form">{dialogButtonText}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      {renderContent()}
    </div>
  );
}
