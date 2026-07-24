'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { RawMaterial, PurchaseOrder, Amendment, UnitOfMeasurement, Party, PartyType, AccountOwnership } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Trash2, Check, ChevronsUpDown, Edit, X, ChevronDown, Save, Loader2 } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, generateNextPONumber, toNepaliDate, normalizeBF } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { onRawMaterialsUpdate, addRawMaterial, renameCategory, deleteCategory } from '@/services/raw-material-service';
import { onPurchaseOrdersUpdate, addPurchaseOrder, updatePurchaseOrder } from '@/services/purchase-order-service';
import { onUomsUpdate, addUom } from '@/services/uom-service';
import { Badge } from '@/components/ui/badge';
import { onPartiesUpdate, addParty, updateParty } from '@/services/party-service';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const poItemSchema = z.object({
  rawMaterialId: z.string().min(1, 'Material is required.'),
  rawMaterialName: z.string(),
  rawMaterialType: z.string(),
  size: z.string(),
  gsm: z.string(),
  bf: z.string(),
  quantity: z.string().min(1, 'Quantity is required.'),
  unit: z.string().min(1, 'Unit is required.'),
});

const purchaseOrderSchema = z.object({
  poNumber: z.string().min(1, 'PO Number is required.'),
  poDate: z.date({ required_error: 'A PO date is required.' }),
  partyId: z.string().min(1, 'Company name is required.'),
  companyName: z.string().min(1, 'Company name is required.'),
  companyAddress: z.string().min(1, 'Company address is required.'),
  panNumber: z.string().optional(),
  items: z.array(poItemSchema).min(1, 'At least one item is required.'),
});

type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

interface PurchaseOrderFormProps {
  poToEdit?: PurchaseOrder;
}

const baseMaterialTypes = [
    'Kraft Paper', 'Virgin Paper', 'Gum', 'Ink', 'Stitching Wire', 'Strapping', 'Machinery Spare Parts', 'Other'
];

const paperTypes = ['Kraft Paper', 'Virgin Paper'];
const bfOptions = ['16 BF', '18 BF', '20 BF', '22 BF'];

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

export function PurchaseOrderForm({ poToEdit }: PurchaseOrderFormProps) {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const router = useRouter();
  const { toast } = useToast();
  const { user, getAllowedOwnerships } = useAuth();
  const allowedOwnerships = useMemo(() => getAllowedOwnerships('purchaseOrders'), [getAllowedOwnerships]);
  const [isClient, setIsClient] = useState(false);
  
  const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  
  const [isPartyDialogOpen, setIsPartyDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState<{name: string, type: PartyType, ownership: AccountOwnership, address?: string, panNumber?: string}>({name: '', type: 'Vendor', ownership: '', address: '', panNumber: ''});
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isQuickAddMaterialDialogOpen, setIsQuickAddMaterialDialogOpen] = useState(false);
  const [quickAddMaterialSearch, setQuickAddMaterialSearch] = useState('');
  const [isRenamingCategory, setIsRenamingCategory] = useState(false);
  const [categoryRenameValue, setCategoryRenameValue] = useState('');
  
  const [unitInputValue, setUnitInputValue] = useState('');
  const [isQuickAddUnitPopoverOpen, setIsQuickAddUnitPopoverOpen] = useState(false);
  const [isQuickAddTypePopoverOpen, setIsQuickAddTypePopoverOpen] = useState(false);

  const title = poToEdit ? (poToEdit.isDraft ? 'Edit Draft PO' : 'Amend Purchase Order') : 'New Purchase Order';

  const defaultValues = useMemo(() => {
    if (poToEdit) {
      return {
        ...poToEdit,
        poDate: new Date(poToEdit.poDate),
      };
    }
    return {
      poNumber: '',
      poDate: new Date(),
      partyId: '',
      companyName: '',
      companyAddress: '',
      panNumber: '',
      items: [],
    };
  }, [poToEdit]);

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues,
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  // useWatch returns a fresh (cloned) value on every change, so useMemo
  // below actually recomputes. form.watch("items") returns a mutated-in-place
  // reference, which caused the Total footer to stay stale.
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedPoDate = useWatch({ control: form.control, name: "poDate" });
  const watchedPartyId = useWatch({ control: form.control, name: "partyId" });
  
  const quantityTotalsByUnit = useMemo(() => {
    return (watchedItems || []).reduce((acc, item) => {
        const quantity = parseFloat(item.quantity);
        const unit = item.unit;
        if (!isNaN(quantity) && unit) {
            acc[unit] = (acc[unit] || 0) + quantity;
        }
        return acc;
    }, {} as Record<string, number>);
  }, [watchedItems]);

  useEffect(() => {
    setIsClient(true);
    const unsubs = [
      onRawMaterialsUpdate(setRawMaterials),
      onPurchaseOrdersUpdate(setPurchaseOrders),
      onUomsUpdate(setUoms),
      onPartiesUpdate(setParties)
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, []);
  
  useEffect(() => {
    if(isClient && !poToEdit && purchaseOrders.length > 0) {
        generateNextPONumber(purchaseOrders, watchedPoDate?.toISOString()).then(nextPoNumber => {
            form.setValue('poNumber', nextPoNumber);
        });
    }
  }, [isClient, poToEdit, purchaseOrders, form, watchedPoDate]);

  useEffect(() => {
    if (poToEdit) {
      form.reset(defaultValues);
    }
  }, [poToEdit?.id, form, defaultValues]);

  const companies = useMemo(() => {
    return parties
        .filter(p => p.ownership === 'Both' || allowedOwnerships.includes(p.ownership))
        .sort((a,b) => a.name.localeCompare(b.name));
  }, [parties, allowedOwnerships]);

  const allCategories = useMemo(() => {
    const types = new Set([...baseMaterialTypes, ...rawMaterials.map(m => m.type)]);
    return Array.from(types).sort();
  }, [rawMaterials]);

  const filteredRawMaterials = useMemo(() => {
    let filtered = rawMaterials;
    if (!selectedCategories.includes('All') && selectedCategories.length > 0) {
        filtered = rawMaterials.filter(m => selectedCategories.includes(m.type));
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [rawMaterials, selectedCategories]);

  const showPaperSpecs = useMemo(() => {
    return selectedCategories.includes('All') || selectedCategories.some(c => paperTypes.includes(c));
  }, [selectedCategories]);

  const handleCompanySelect = (partyId: string) => {
    const party = companies.find(c => c.id === partyId);
    if (party) {
        form.setValue('partyId', party.id);
        form.setValue('companyName', party.name);
        form.setValue('companyAddress', party.address || '');
        form.setValue('panNumber', party.panNumber || '');
    }
    setIsCompanyPopoverOpen(false);
  };
  
  const handleOpenPartyDialog = (party: Party | null = null, searchName: string = '') => {
      if (party) {
          setEditingParty(party);
          setPartyForm({ name: party.name, type: party.type, ownership: party.ownership || '', address: party.address || '', panNumber: party.panNumber || '' });
      } else {
          setEditingParty(null);
          setPartyForm({ 
            name: searchName, 
            type: 'Vendor', 
            ownership: allowedOwnerships.includes('Shivam') ? 'Shivam' : (allowedOwnerships[0] || 'Both'), 
            address: '', 
            panNumber: '' 
          });
      }
      setIsCompanyPopoverOpen(false);
      setIsPartyDialogOpen(true);
  };

  const handlePartySubmit = async () => {
    if(!user) return;
    if(!partyForm.name || !partyForm.type) {
        toast({title: 'Error', description: 'Party name and type are required.', variant: 'destructive'});
        return;
    }
    try {
        if (editingParty) {
            await updateParty(editingParty.id, { ...partyForm, lastModifiedBy: user.username });
            const party = { ...editingParty, ...partyForm };
            handleCompanySelect(party.id);
            toast({title: 'Success', description: 'Party updated.'});
        } else {
            const newPartyId = await addParty({...partyForm, createdBy: user.username });
            handleCompanySelect(newPartyId);
            toast({title: 'Success', description: 'New party added.'});
        }
        setIsPartyDialogOpen(false);
    } catch {
         toast({title: 'Error', description: 'Failed to save party.', variant: 'destructive'});
    }
  };

  const handleItemMaterialChange = (index: number, rawMaterialId: string) => {
    const material = rawMaterials.find(p => p.id === rawMaterialId);
    if (material) {
      update(index, {
        rawMaterialId: material.id,
        rawMaterialName: material.name,
        rawMaterialType: material.type,
        size: material.size || '',
        gsm: material.gsm || '',
        bf: normalizeBF(material.bf) || '',
        quantity: watchedItems[index]?.quantity || '',
        unit: (material.units && material.units[0]) || '',
      });
    }
  };

  const addNewItem = () => {
    append({ 
      rawMaterialId: '', 
      rawMaterialName: '', 
      rawMaterialType: '', 
      size: '', 
      gsm: '', 
      bf: '', 
      quantity: '', 
      unit: '' 
    });
  };

  async function onSubmit(values: PurchaseOrderFormValues, finalize: boolean = false) {
    if (!user || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const isCurrentlyDraft = poToEdit ? poToEdit.isDraft : true;
      const now = new Date().toISOString();
      const party = companies.find(c => c.id === values.partyId);

      let poData: Omit<PurchaseOrder, 'id'> = {
        ...values,
        poDate: values.poDate.toISOString(),
        status: finalize ? 'Ordered' : 'Draft',
        isDraft: !finalize,
        amendments: poToEdit?.amendments || [],
        createdAt: poToEdit?.createdAt || now,
        createdBy: poToEdit?.createdBy || user.username,
        updatedAt: now,
        lastModifiedBy: user.username,
        ownership: party?.ownership || 'Both',
      };

      if (poToEdit?.id) {
        if (!isCurrentlyDraft && !finalize) {
          const newAmendment: Amendment = {
            date: now,
            remarks: 'Order details updated after finalization.',
            amendedBy: user.username,
          };
          poData.status = 'Amended';
          poData.amendments = [...(poToEdit.amendments || []), newAmendment];
        } else if (isCurrentlyDraft && finalize) {
           poData.status = 'Ordered';
        } else if (isCurrentlyDraft && !finalize) {
           poData.status = 'Draft';
        }

        await updatePurchaseOrder(poToEdit.id, poData);
        toast({ title: 'Success', description: `Purchase Order ${poData.status.toLowerCase()}.` });
        
        if (finalize || !isCurrentlyDraft) {
            router.push(`/purchase-orders/view?id=${poToEdit.id}`);
        } else {
            router.push('/purchase-orders/list');
        }

      } else {
        const newPOId = await addPurchaseOrder(poData);
        toast({ title: 'Success', description: `Purchase Order ${finalize ? 'created' : 'saved as draft'}.` });
        
        if (finalize) {
            router.push(`/purchase-orders/view?id=${newPOId}`);
        } else {
            router.push('/purchase-orders/list');
        }
      }
    } catch (error) {
      console.error('Failed to save purchase order:', error);
      toast({
        title: 'Error',
        description: 'Failed to save purchase order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const [quickAddForm, setQuickAddForm] = useState({
    type: '', name: '', size: '', gsm: '', bf: '', units: [] as string[]
  });
  
  useEffect(() => {
    if (isQuickAddMaterialDialogOpen) {
      setQuickAddForm({
        type: selectedCategories.length === 1 && selectedCategories[0] !== 'All' ? selectedCategories[0] : '',
        name: quickAddMaterialSearch,
        size: '',
        gsm: '',
        bf: '',
        units: [],
      });
    }
  }, [selectedCategories, isQuickAddMaterialDialogOpen, quickAddMaterialSearch]);

  const handleQuickAddMaterial = async () => {
    if (!user) {
        toast({ title: 'Error', description: 'You must be logged in.', variant: 'destructive' });
        return;
    }
    const { type, name, size, gsm, bf, units } = quickAddForm;
    const isPaper = paperTypes.includes(type);

    if (!type) {
        toast({ title: 'Error', description: 'Please select a material type.', variant: 'destructive' });
        return;
    }
    if (units.length === 0) {
        toast({ title: 'Error', description: 'Please provide at least one unit of measurement.', variant: 'destructive' });
        return;
    }

    if (!isPaper && name.trim() === '') {
      toast({ title: 'Error', description: 'Please provide a name/description.', variant: 'destructive' });
      return;
    }
    
    const finalBF = isPaper ? normalizeBF(bf) : '';
    const finalName = isPaper 
        ? generateMaterialName(
            type.trim(), 
            size.trim(), 
            gsm.trim(), 
            finalBF
          )
        : name.trim();
    
      try {
        const now = new Date().toISOString();
        for (const unitAbbr of units) {
          const exists = uoms.some(u => u.abbreviation.toLowerCase() === unitAbbr.toLowerCase());
          if (!exists) {
            await addUom({
              name: unitAbbr,
              abbreviation: unitAbbr,
              createdBy: user.username,
              createdAt: now
            });
          }
        }

        const newMaterial: Omit<RawMaterial, 'id'> = {
            type,
            name: finalName,
            size: isPaper ? size : '',
            gsm: isPaper ? gsm : '',
            bf: finalBF,
            units: units,
            createdBy: user.username,
            createdAt: now,
            ownership: 'Both'
        };
        
        await addRawMaterial(newMaterial);
        toast({ title: 'Success', description: `Added "${finalName}".` });
        setIsQuickAddMaterialDialogOpen(false);
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to add material.', variant: 'destructive' });
    }
  };
  
  const handleRenameCategory = async () => {
    if (!user || !quickAddForm.type || !categoryRenameValue.trim()) return;
    try {
        await renameCategory(quickAddForm.type, categoryRenameValue.trim(), user.username);
        setQuickAddForm(prev => ({ ...prev, type: categoryRenameValue.trim() }));
        setIsRenamingCategory(false);
        setCategoryRenameValue('');
        toast({ title: 'Success', description: 'Category renamed globally.' });
    } catch {
        toast({ title: 'Error', description: 'Failed to rename category.', variant: 'destructive' });
    }
  };

  const handleDeleteCategoryItems = async () => {
    if (!quickAddForm.type) return;
    try {
        await deleteCategory(quickAddForm.type);
        setQuickAddForm(prev => ({ ...prev, type: '' }));
        toast({ title: 'Success', description: 'Category deleted and associated materials removed.' });
    } catch {
        toast({ title: 'Error', description: 'Failed to delete category.', variant: 'destructive' });
    }
  };

  const allUnits = useMemo(() => {
    return uoms.map(u => u.abbreviation).sort();
  }, [uoms]);
  
  const handleQuickAddUnitSelect = (unit: string) => {
    if (!quickAddForm.units.includes(unit)) {
        setQuickAddForm(prev => ({...prev, units: [...prev.units, unit]}));
    }
    setUnitInputValue('');
  };

  const handleUnitRemove = (unit: string) => {
    setQuickAddForm(prev => ({...prev, units: prev.units.filter(u => u !== unit)}));
  };

  const handleQuickAddUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' && e.currentTarget.value.endsWith(' ')) {
        e.preventDefault();
        const newUnit = e.currentTarget.value.trim();
        if (newUnit && !quickAddForm.units.find(u => u.toLowerCase() === newUnit.toLowerCase())) {
            setQuickAddForm(prev => ({...prev, units: [...prev.units, newUnit]}));
        }
        setUnitInputValue('');
    }
  };
  
  const handleToggleCategory = (category: string) => {
    setSelectedCategories(prev => {
        if (category === 'All') return ['All'];
        const withoutAll = prev.filter(c => c !== 'All');
        if (withoutAll.includes(category)) {
            const next = withoutAll.filter(c => c !== category);
            return next.length === 0 ? ['All'] : next;
        } else {
            return [...withoutAll, category];
        }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      <Form {...form}>
        <form className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>PO Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="poNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Number</FormLabel>
                    <FormControl><Input {...field} readOnly={!poToEdit} className={!poToEdit ? "bg-muted/50" : ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="poDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>PO Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? `${toNepaliDate(field.value.toISOString())} BS (${format(field.value, "PPP")})` : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <DualCalendar selected={field.value} onSelect={field.onChange} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="partyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Company</FormLabel>
                    <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between">
                                {field.value ? companies.find(c => c.id === field.value)?.name : "Select or type a company..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                            <Command>
                                <CommandInput 
                                    placeholder="Search or add company..."
                                    value={companySearch}
                                    onValueChange={setCompanySearch}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleOpenPartyDialog(null, companySearch);
                                                setCompanySearch('');
                                            }}
                                        >
                                            <PlusCircle className="mr-2 h-4 w-4"/> Add "{companySearch}"
                                        </Button>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {companies.map((company) => (
                                            <CommandItem key={company.id} value={company.name} onSelect={() => {
                                              handleCompanySelect(company.id);
                                              setCompanySearch('');
                                            }} className="flex justify-between items-center text-xs">
                                                <div className="flex items-center">
                                                    <Check className={cn("mr-2 h-4 w-4", field.value === company.id ? "opacity-100" : "opacity-0")} />
                                                    {company.name}
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleOpenPartyDialog(company); }}>
                                                    <Edit className="h-4 w-4"/>
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
                <FormField
                    control={form.control}
                    name="companyAddress"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Supplier Address</FormLabel>
                            <FormControl><Textarea {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="panNumber"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>PAN Number</FormLabel>
                            <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
          </Card>

          <Card>
             <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1.5">
                        <CardTitle>Items</CardTitle>
                        <CardDescription>Add raw materials to the purchase order.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                         <div className="w-full sm:w-auto">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full sm:w-[250px] justify-between text-xs font-normal">
                                        <span className="truncate">
                                            {selectedCategories.includes('All') 
                                                ? "All Categories" 
                                                : selectedCategories.join(', ')}
                                        </span>
                                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[250px] p-0" align="start">
                                    <div className="p-2 space-y-2">
                                        <div className="flex items-center space-x-2 p-1 rounded hover:bg-muted cursor-pointer" onClick={() => handleToggleCategory('All')}>
                                            <Checkbox checked={selectedCategories.includes('All')} onCheckedChange={() => handleToggleCategory('All')} />
                                            <Label className="cursor-pointer">All Categories</Label>
                                        </div>
                                        <Separator />
                                        <ScrollArea className="h-60">
                                            {allCategories.map(category => (
                                                <div key={category} className="flex items-center space-x-2 p-2 rounded hover:bg-muted cursor-pointer" 
                                                     onClick={() => handleToggleCategory(category)}>
                                                    <Checkbox checked={selectedCategories.includes(category)} onCheckedChange={() => handleToggleCategory(category)} />
                                                    <Label className="cursor-pointer">{category}</Label>
                                                </div>
                                            ))}
                                        </ScrollArea>
                                    </div>
                                </PopoverContent>
                            </Popover>
                         </div>
                        <Button 
                            type="button" 
                            size="sm" 
                            variant="outline"
                            onClick={() => setIsQuickAddMaterialDialogOpen(true)}
                            className="w-full sm:w-auto"
                        >
                            <PlusCircle className="mr-2 h-4 w-4" /> ADD PRODUCT CATEGORY
                        </Button>
                        <Button 
                            type="button" 
                            size="sm" 
                            className="w-full sm:w-auto"
                            onClick={addNewItem}
                        >
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[300px]">Material</TableHead>
                                {showPaperSpecs && (
                                    <>
                                        <TableHead className="text-center">Size (Inch)</TableHead>
                                        <TableHead className="text-center">GSM</TableHead>
                                        <TableHead className="text-center">BF</TableHead>
                                    </>
                                )}
                                <TableHead className="w-[200px]">Quantity</TableHead>
                                <TableHead className="w-[50px]"> </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((item, index) => {
                                const selectedMaterial = rawMaterials.find(m => m.id === item.rawMaterialId);
                                
                                return (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.rawMaterialId`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button variant="outline" role="combobox" className="w-full justify-between h-9 text-xs font-normal">
                                                                    {field.value ? rawMaterials.find(m => m.id === field.value)?.name : "Select a material"}
                                                                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="p-0">
                                                            <Command>
                                                                <CommandInput 
                                                                    placeholder="Search material..."
                                                                    onValueChange={setQuickAddMaterialSearch}
                                                                />
                                                                <CommandList>
                                                                    <CommandEmpty>
                                                                        <Button
                                                                            variant="ghost"
                                                                            className="w-full justify-start text-xs"
                                                                            onClick={() => setIsQuickAddMaterialDialogOpen(true)}
                                                                        >
                                                                            <PlusCircle className="mr-2 h-3 w-3"/> Add "{quickAddMaterialSearch}"
                                                                        </Button>
                                                                    </CommandEmpty>
                                                                    <CommandGroup>
                                                                        {isClient && filteredRawMaterials.map(p => (
                                                                            <CommandItem
                                                                                key={p.id}
                                                                                value={p.name}
                                                                                onSelect={() => {
                                                                                    form.setValue(`items.${index}.rawMaterialId`, p.id);
                                                                                    handleItemMaterialChange(index, p.id);
                                                                                }}
                                                                                className="text-xs"
                                                                            >
                                                                                <Check className={cn("mr-2 h-4 w-4", p.id === field.value ? "opacity-100" : "opacity-0")} />
                                                                                {p.name}
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
                                    </TableCell>
                                    {showPaperSpecs && (
                                        <>
                                            <TableCell className="text-center">
                                                <Input readOnly value={item.size || '-'} className="bg-muted/30 border-none h-9 text-xs text-center" />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Input readOnly value={item.gsm || '-'} className="bg-muted/30 border-none h-9 text-xs text-center" />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Input readOnly value={item.bf || '-'} className="bg-muted/30 border-none h-9 text-xs text-center" />
                                            </TableCell>
                                        </>
                                    )}
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <FormField
                                                control={form.control}
                                                name={`items.${index}.quantity`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormControl>
                                                            <Input 
                                                                placeholder="Qty"
                                                                {...field}
                                                                className="h-9 text-xs"
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            {selectedMaterial && Array.isArray(selectedMaterial.units) && selectedMaterial.units.length > 0 && (
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.unit`}
                                                    render={({ field }) => (
                                                        <FormItem className="w-[80px]">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger className="h-9 text-[10px] px-2">
                                                                        <SelectValue placeholder="Unit" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    {selectedMaterial.units.map(u => (
                                                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(index)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={showPaperSpecs ? 4 : 1} className="text-right font-bold">Total</TableCell>
                                <TableCell className="font-bold">
                                    {Object.entries(quantityTotalsByUnit).map(([unit, total]) => (
                                        <span key={unit} className="mr-4">{total.toLocaleString()} {unit}</span>
                                    ))}
                                </TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
                {form.formState.errors.items?.root?.message && <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.items.root.message}</p>}
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
            </Button>
            
            {poToEdit && !poToEdit.isDraft ? (
                 <Button type="button" onClick={form.handleSubmit(v => onSubmit(v, false))} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                </Button>
            ) : (
                 <>
                    <Button type="button" variant="secondary" onClick={form.handleSubmit(v => onSubmit(v, false))} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {poToEdit ? 'Save Draft' : 'Save as Draft'}
                    </Button>
                    <Button type="button" onClick={form.handleSubmit(v => onSubmit(v, true))} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Finalize Purchase Order
                    </Button>
                </>
            )}
          </div>
        </form>
      </Form>
      
      <Dialog open={isPartyDialogOpen} onOpenChange={(isOpen) => {
          if(!isOpen) setEditingParty(null);
          setIsPartyDialogOpen(isOpen);
      }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{editingParty ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="party-name-dialog">Supplier Name</Label>
                    <Input id="party-name-dialog" value={partyForm.name} onChange={(e) => setPartyForm(prev => ({...prev, name: e.target.value}))}/>
                </div>
                <div className="space-y-2">
                    <Label>Ownership</Label>
                    <Select value={partyForm.ownership} onValueChange={(v: AccountOwnership) => setPartyForm({...partyForm, ownership: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {allowedOwnerships.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="party-pan-dialog">PAN Number</Label>
                    <Input id="party-pan-dialog" value={partyForm.panNumber || ''} onChange={(e) => setPartyForm(prev => ({...prev, panNumber: e.target.value}))}/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="party-address-dialog">Address</Label>
                    <Textarea id="party-address-dialog" value={partyForm.address} onChange={(e) => setPartyForm(prev => ({...prev, address: e.target.value}))}/>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPartyDialogOpen(false)}>Cancel</Button>
                <Button onClick={handlePartySubmit}>{editingParty ? 'Save Changes' : 'Add Supplier'}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

       <Dialog open={isQuickAddMaterialDialogOpen} onOpenChange={setIsQuickAddMaterialDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Quick Add Product Category</DialogTitle>
                <DialogDescription>Define a new material specification. You can also create completely new categories if needed.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                 <div className="space-y-2">
                    <Label htmlFor="quick-add-type">Category / Type</Label>
                    <div className="flex gap-2">
                        <Popover open={isQuickAddTypePopoverOpen} onOpenChange={setIsQuickAddTypePopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between h-9">
                                    {quickAddForm.type || "Select or type a category..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0">
                                <Command>
                                    <CommandInput 
                                        placeholder="Search or add category..."
                                        onValueChange={(val) => setQuickAddForm(prev => ({...prev, type: val}))}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            <button type="button" className="p-2 text-xs text-left w-full hover:bg-muted" onClick={() => setIsQuickAddTypePopoverOpen(false)}>
                                                Add new category: "{quickAddForm.type}"
                                            </button>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {allCategories.map(cat => (
                                                <CommandItem key={cat} value={cat} onSelect={() => {
                                                    setQuickAddForm(prev => ({...prev, type: cat}));
                                                    setIsQuickAddTypePopoverOpen(false);
                                                }} className="text-xs">
                                                    <Check className={cn("mr-2 h-4 w-4", quickAddForm.type === cat ? "opacity-100" : "opacity-0")} />
                                                    {cat}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        {quickAddForm.type && (
                            <div className="flex gap-1">
                                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { setIsRenamingCategory(true); setCategoryRenameValue(quickAddForm.type); }}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="icon" className="h-9 w-9 text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete category "{quickAddForm.type}"?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete all raw material items associated with this category. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleDeleteCategoryItems}>Confirm Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}
                    </div>
                 </div>
                 
                 {isRenamingCategory && (
                    <div className="flex items-center gap-2 p-3 bg-muted rounded-md animate-in fade-in slide-in-from-top-2">
                        <Input 
                            value={categoryRenameValue} 
                            onChange={e => setCategoryRenameValue(e.target.value)}
                            placeholder="New category name..."
                            className="h-8 text-xs bg-white"
                        />
                        <Button size="sm" variant="outline" onClick={() => setIsRenamingCategory(false)} className="h-8">Cancel</Button>
                        <Button size="sm" onClick={handleRenameCategory} className="h-8">Apply</Button>
                    </div>
                 )}

                 {quickAddForm.type && !paperTypes.includes(quickAddForm.type) && (
                     <div className="space-y-2">
                         <Label htmlFor="quick-add-name">Name / Description</Label>
                         <Input
                             id="quick-add-name"
                             value={quickAddForm.name}
                             onChange={e => setQuickAddForm(prev => ({...prev, name: e.target.value}))}
                             placeholder="e.g. Corrugation Gum, Stitching Wire, Part #123"
                         />
                     </div>
                 )}
                 
                 {quickAddForm.type && paperTypes.includes(quickAddForm.type) && (
                     <>
                        <div className="space-y-2">
                            <Label htmlFor="quick-add-size">Size (Inch)</Label>
                            <Input id="quick-add-size" value={quickAddForm.size} onChange={e => setQuickAddForm(prev => ({...prev, size: e.target.value}))} placeholder="e.g. 42.5" />
                        </div>
                         <div className="space-y-2">
                          <Label htmlFor="quick-add-gsm">GSM</Label>
                          <Input id="quick-add-gsm" value={quickAddForm.gsm} onChange={e => setQuickAddForm(prev => ({...prev, gsm: e.target.value}))} placeholder="e.g. 150" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="quick-add-bf">BF</Label>
                            <Select value={quickAddForm.bf} onValueChange={value => setQuickAddForm(prev => ({...prev, bf: value}))}>
                                <SelectTrigger id="quick-add-bf">
                                    <SelectValue placeholder="Select BF" />
                                </SelectTrigger>
                                <SelectContent>
                                    {bfOptions.map(option => (
                                        <SelectItem key={option} value={option}>{option}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                     </>
                 )}
                 {quickAddForm.type && (
                    <div className="space-y-2">
                        <Label htmlFor="material-units">Units of Measurement</Label>
                         <Popover open={isQuickAddUnitPopoverOpen} onOpenChange={setIsQuickAddUnitPopoverOpen}>
                            <PopoverTrigger asChild>
                                <div className="flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <div className="flex wrap gap-1 flex-1">
                                        {quickAddForm.units.map(unit => (
                                            <Badge key={unit} variant="secondary" className="gap-1">
                                                {unit}
                                                <button type="button" onClick={() => handleUnitRemove(unit)} className="rounded-full hover:bg-background/50">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                        <input
                                            placeholder={quickAddForm.units.length === 0 ? "e.g. Kg, Ton, Piece..." : ""}
                                            value={unitInputValue}
                                            onChange={e => setUnitInputValue(e.target.value)}
                                            onKeyDown={handleQuickAddUnitKeyDown}
                                            className="bg-transparent outline-none flex-1 placeholder:text-muted-foreground text-sm min-w-[80px]"
                                        />
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                <Command>
                                    <CommandInput 
                                        placeholder="Search or add unit..."
                                        value={unitInputValue}
                                        onValueChange={setUnitInputValue}
                                        onKeyDown={(e) => {
                                             if (e.key === ' ' && e.currentTarget.value.endsWith(' ')) {
                                                e.preventDefault();
                                                const newUnit = e.currentTarget.value.trim();
                                                if (newUnit) {
                                                    handleQuickAddUnitSelect(newUnit);
                                                }
                                            }
                                        }}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            <div className="p-2 text-sm text-center">
                                                No results. Type and press space twice to add.
                                            </div>
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {allUnits.filter(u => !quickAddForm.units.includes(u)).map(unit => (
                                                <CommandItem key={unit} onSelect={() => handleQuickAddUnitSelect(unit)} className="text-xs">
                                                    <Check className={cn("mr-2 h-4 w-4", quickAddForm.units.includes(unit) ? "opacity-100" : "opacity-0")} />
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
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsQuickAddMaterialDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleQuickAddMaterial}>Add Material</Button>
            </DialogFooter>
        </DialogContent>
       </Dialog>
    </div>
  );
}