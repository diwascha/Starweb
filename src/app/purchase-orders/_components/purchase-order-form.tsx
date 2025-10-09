
'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { RawMaterial, PurchaseOrder, Amendment, UnitOfMeasurement } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Trash2, Check, ChevronsUpDown, Edit, X } from 'lucide-react';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { format } from 'date-fns';
import { cn, generateNextPONumber, toNepaliDate } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { summarizePurchaseOrderChanges } from '@/ai/flows/summarize-po-changes-flow';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onRawMaterialsUpdate, addRawMaterial } from '@/services/raw-material-service';
import { onPurchaseOrdersUpdate, addPurchaseOrder, updatePurchaseOrder } from '@/services/purchase-order-service';
import { onUomsUpdate, addUom } from '@/services/uom-service';
import { Badge } from '@/components/ui/badge';

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
  companyName: z.string().min(1, 'Company name is required.'),
  companyAddress: z.string().min(1, 'Company address is required.'),
  items: z.array(poItemSchema).min(1, 'At least one item is required.'),
});

type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

interface PurchaseOrderFormProps {
  poToEdit?: PurchaseOrder;
}

const materialTypesForAdd = [
    'Kraft Paper', 'Virgin Paper', 'Gum', 'Ink', 'Stitching Wire', 'Strapping', 'Machinery Spare Parts', 'Other'
];

const paperTypes = ['Kraft Paper', 'Virgin Paper'];

export function PurchaseOrderForm({ poToEdit }: PurchaseOrderFormProps) {
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<{ oldName: string; newName: string; newAddress: string } | null>(null);
  const [itemFilterType, setItemFilterType] = useState<string>('All');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuickAddMaterialDialogOpen, setIsQuickAddMaterialDialogOpen] = useState(false);
  const [quickAddMaterialSearch, setQuickAddMaterialSearch] = useState('');

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
      companyName: '',
      companyAddress: '',
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
  
  useEffect(() => {
    setIsClient(true);
    const unsubRawMaterials = onRawMaterialsUpdate(setRawMaterials);
    const unsubPOs = onPurchaseOrdersUpdate(setPurchaseOrders);
    const unsubUoms = onUomsUpdate(setUoms);
    return () => {
      unsubRawMaterials();
      unsubPOs();
      unsubUoms();
    };
  }, []);
  
  useEffect(() => {
    const setInitialPoNumber = async () => {
        if(isClient && !poToEdit) {
            const nextPoNumber = await generateNextPONumber(purchaseOrders);
            form.setValue('poNumber', nextPoNumber);
        }
    }
    setInitialPoNumber();
    if (poToEdit) {
      form.reset(defaultValues);
    }
  }, [isClient, poToEdit, purchaseOrders, form, defaultValues]);

  const companies = useMemo(() => {
    const companyMap = new Map<string, {name: string, address: string}>();
    purchaseOrders.forEach(po => {
        if (po.companyName && !companyMap.has(po.companyName.toLowerCase())) {
            companyMap.set(po.companyName.toLowerCase(), { name: po.companyName, address: po.companyAddress });
        }
    });
    return Array.from(companyMap.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [purchaseOrders]);

  const materialTypesForFilter = useMemo(() => {
    const types = new Set(rawMaterials.map(m => m.type));
    return ['All', ...Array.from(types).sort()];
  }, [rawMaterials]);

  const filteredRawMaterials = useMemo(() => {
    if (itemFilterType === 'All') {
      return rawMaterials;
    }
    return rawMaterials.filter(m => m.type === itemFilterType);
  }, [rawMaterials, itemFilterType]);

  const watchedItems = form.watch("items");
  const totalQuantity = useMemo(() => {
      return watchedItems.reduce((total, item) => {
          const quantity = parseFloat(item.quantity);
          return isNaN(quantity) ? total : total + quantity;
      }, 0);
  }, [watchedItems]);


  const handleCompanySelect = (companyName: string) => {
    form.setValue('companyName', companyName);
    const existingCompany = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
    if (existingCompany) {
      form.setValue('companyAddress', existingCompany.address);
    } else {
      form.setValue('companyAddress', '');
    }
    setIsCompanyPopoverOpen(false);
  };
  
  const handleItemMaterialChange = (index: number, rawMaterialId: string) => {
    const material = rawMaterials.find(p => p.id === rawMaterialId);
    if (material) {
      update(index, {
        rawMaterialId: material.id,
        rawMaterialName: material.name,
        rawMaterialType: material.type,
        size: material.size,
        gsm: material.gsm,
        bf: material.bf,
        quantity: '',
        unit: (material.units && material.units[0]) || '',
      });
    }
  };
  
  const handleEditCompany = (company: {name: string, address: string}) => {
    setEditingCompany({ oldName: company.name, newName: company.name, newAddress: company.address });
  };
  
  const handleUpdateCompany = async () => {
    if (!editingCompany) return;

    const { oldName, newName, newAddress } = editingCompany;

    if (!newName.trim() || !newAddress.trim()) {
      toast({ title: 'Error', description: 'Company name and address cannot be empty.', variant: 'destructive' });
      return;
    }

    // This part requires updating all relevant POs in Firestore.
    // This is a complex operation and might be better handled with a backend function for larger datasets.
    // For now, we update them one by one.
    const updates = purchaseOrders
      .filter(po => po.companyName === oldName)
      .map(po => updatePurchaseOrder(po.id, { companyName: newName, companyAddress: newAddress }));
      
    await Promise.all(updates);
    
    if (form.getValues('companyName') === oldName) {
        form.setValue('companyName', newName);
        form.setValue('companyAddress', newAddress);
    }

    toast({ title: 'Success', description: `Company "${oldName}" updated to "${newName}".` });
    setEditingCompany(null);
  };

  const addNewItem = () => {
    append({ rawMaterialId: '', rawMaterialName: '', rawMaterialType: '', size: '', gsm: '', bf: '', quantity: '', unit: '' });
  };

  async function onSubmit(values: PurchaseOrderFormValues) {
    if (!user) {
        toast({ title: 'Error', description: 'You must be logged in to perform this action.', variant: 'destructive' });
        return;
    }
    setIsSubmitting(true);
    try {
      if (poToEdit) {
        const updatedPODataForAI: PurchaseOrder = {
          ...poToEdit,
          ...values,
          poDate: values.poDate.toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'Amended',
          lastModifiedBy: user.username,
        };

        const { summary } = await summarizePurchaseOrderChanges(poToEdit, updatedPODataForAI);
        
        const newAmendment: Amendment = {
          date: new Date().toISOString(),
          remarks: summary || 'No specific changes were identified.',
          amendedBy: user.username,
        };
        
        const updatedPOForFirestore: Partial<Omit<PurchaseOrder, 'id'>> = {
            ...values,
            poDate: values.poDate.toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'Amended',
            lastModifiedBy: user.username,
            amendments: [...(poToEdit.amendments || []), newAmendment],
        };

        await updatePurchaseOrder(poToEdit.id, updatedPOForFirestore);
        toast({ title: 'Success', description: 'Purchase Order updated.' });
        router.push(`/purchase-orders/${poToEdit.id}`);
      } else {
        const now = new Date().toISOString();
        const newPO: Omit<PurchaseOrder, 'id'> = {
          ...values,
          poDate: values.poDate.toISOString(),
          createdAt: now,
          updatedAt: now,
          amendments: [],
          status: 'Ordered',
          createdBy: user.username,
        };
        const newPOId = await addPurchaseOrder(newPO);
        toast({ title: 'Success', description: 'New Purchase Order created.' });
        router.push(`/purchase-orders/${newPOId}`);
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

  const title = poToEdit ? 'Edit Purchase Order' : 'Create New Purchase Order';
  const buttonText = poToEdit ? 'Save Changes' : 'Create Purchase Order';
  const showPaperColumns = itemFilterType === 'All' || paperTypes.includes(itemFilterType);

  const [quickAddForm, setQuickAddForm] = useState({
      type: '', name: '', size: '', gsm: '', bf: '', units: [] as string[]
  });
  const [quickAddUnitInput, setQuickAddUnitInput] = useState('');
  const [isQuickAddUnitPopoverOpen, setIsQuickAddUnitPopoverOpen] = useState(false);
  
  useEffect(() => {
    if (isQuickAddMaterialDialogOpen) {
      setQuickAddForm({
        type: itemFilterType !== 'All' ? itemFilterType : '',
        name: quickAddMaterialSearch,
        size: '',
        gsm: '',
        bf: '',
        units: [],
      });
    }
  }, [itemFilterType, isQuickAddMaterialDialogOpen, quickAddMaterialSearch]);


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

    const finalName = isPaper ? generateMaterialName(type, size, gsm, bf) : name;
    if (!finalName) {
        toast({ title: 'Error', description: 'Please fill out the material details.', variant: 'destructive' });
        return;
    }
    
    // Add any new units to the central UoM collection
    for (const unitAbbr of units) {
      const exists = uoms.some(u => u.abbreviation.toLowerCase() === unitAbbr.toLowerCase());
      if (!exists) {
        await addUom({
          name: unitAbbr, // Or prompt for a full name
          abbreviation: unitAbbr,
          createdBy: user.username,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const newMaterial: Omit<RawMaterial, 'id'> = {
        type,
        name: finalName,
        size: isPaper ? size : '',
        gsm: isPaper ? gsm : '',
        bf: isPaper ? bf : '',
        units: units,
        createdBy: user.username,
        createdAt: new Date().toISOString(),
    };
    
    try {
        await addRawMaterial(newMaterial);
        toast({ title: 'Success', description: `Added "${finalName}".` });
        setIsQuickAddMaterialDialogOpen(false);
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to add material.', variant: 'destructive' });
    }
  };
  
  const isQuickAddPaper = paperTypes.includes(quickAddForm.type);
  
  const allUnits = useMemo(() => {
    return uoms.map(u => u.abbreviation).sort();
  }, [uoms]);
  
  const handleQuickAddUnitSelect = (unit: string) => {
    if (!quickAddForm.units.includes(unit)) {
        setQuickAddForm(prev => ({...prev, units: [...prev.units, unit]}));
    }
    setQuickAddUnitInput('');
  };

  const handleQuickAddUnitRemove = (unit: string) => {
    setQuickAddForm(prev => ({...prev, units: prev.units.filter(u => u !== unit)}));
  };

  const handleQuickAddUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' && e.currentTarget.value.endsWith(' ')) {
        e.preventDefault();
        const newUnit = e.currentTarget.value.trim();
        if (newUnit && !quickAddForm.units.find(u => u.toLowerCase() === newUnit.toLowerCase())) {
            setQuickAddForm(prev => ({...prev, units: [...prev.units, newUnit]}));
        }
        setQuickAddUnitInput('');
    }
  };


  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Company</FormLabel>
                    <Popover open={isCompanyPopoverOpen} onOpenChange={setIsCompanyPopoverOpen}>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button variant="outline" role="combobox" className="w-full justify-between">
                                {field.value || "Select or type a company..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0">
                            <Command>
                                <CommandInput 
                                    placeholder="Search or add company..."
                                    onValueChange={(value) => form.setValue('companyName', value)}
                                    value={field.value}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        <button type="button" className="w-full text-left p-2 text-sm" onClick={() => handleCompanySelect(field.value)}>
                                            Add "{field.value}"
                                        </button>
                                    </CommandEmpty>
                                    <CommandGroup>
                                        {companies.map((company) => (
                                            <CommandItem key={company.name} value={company.name} onSelect={() => handleCompanySelect(company.name)} className="flex justify-between items-center">
                                                <div className="flex items-center">
                                                    <Check className={cn("mr-2 h-4 w-4", field.value?.toLowerCase() === company.name.toLowerCase() ? "opacity-100" : "opacity-0")} />
                                                    {company.name}
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleEditCompany(company); }}>
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
                           <Select value={itemFilterType} onValueChange={setItemFilterType}>
                               <SelectTrigger className="w-full sm:w-[180px]">
                                   <SelectValue placeholder="Filter by type..." />
                               </SelectTrigger>
                               <SelectContent>
                                   {materialTypesForFilter.map(type => (
                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                   ))}
                               </SelectContent>
                           </Select>
                         </div>
                        <Button type="button" size="sm" onClick={addNewItem} className="w-full sm:w-auto">
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
                                {itemFilterType === 'All' && <TableHead>Type</TableHead>}
                                {showPaperColumns && (
                                    <>
                                        <TableHead>Size (Inch)</TableHead>
                                        <TableHead>GSM</TableHead>
                                        <TableHead>BF</TableHead>
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
                                                                <Button variant="outline" role="combobox" className="w-full justify-between">
                                                                    {field.value ? filteredRawMaterials.find(m => m.id === field.value)?.name : "Select a material"}
                                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                                                                        <button
                                                                            type="button"
                                                                            className="w-full text-left p-2 text-sm"
                                                                            onClick={() => setIsQuickAddMaterialDialogOpen(true)}
                                                                        >
                                                                            Add "{quickAddMaterialSearch}"
                                                                        </button>
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
                                    {itemFilterType === 'All' && <TableCell>{item.rawMaterialType || '-'}</TableCell>}
                                    {showPaperColumns && (
                                        <>
                                            <TableCell>{item.size || '-'}</TableCell>
                                            <TableCell>{item.gsm || '-'}</TableCell>
                                            <TableCell>{item.bf || '-'}</TableCell>
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
                                                                placeholder="e.g. 5"
                                                                {...field} 
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
                                                        <FormItem className="w-[100px]">
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger>
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
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                         <TableFooter>
                            <TableRow>
                                <TableCell colSpan={showPaperColumns ? 4 : (itemFilterType === 'All' ? 2 : 1)}>Total</TableCell>
                                <TableCell className="font-bold">{totalQuantity.toLocaleString()}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
                {form.formState.errors.items?.root?.message && <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.items.root.message}</p>}
            </CardContent>
          </Card>
          <Button type="submit" disabled={isSubmitting}>
             {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : buttonText}
          </Button>
        </form>
      </Form>
      
      <Dialog open={!!editingCompany} onOpenChange={() => setEditingCompany(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit Company</DialogTitle>
            </DialogHeader>
            {editingCompany && (
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="company-name-edit">Company Name</Label>
                        <Input
                            id="company-name-edit"
                            value={editingCompany.newName}
                            onChange={(e) => setEditingCompany(prev => prev ? { ...prev, newName: e.target.value } : null)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="company-address-edit">Company Address</Label>
                        <Textarea
                            id="company-address-edit"
                            value={editingCompany.newAddress}
                            onChange={(e) => setEditingCompany(prev => prev ? { ...prev, newAddress: e.target.value } : null)}
                        />
                    </div>
                </div>
            )}
            <DialogFooter>
                <Button variant="outline" onClick={() => setEditingCompany(null)}>Cancel</Button>
                <Button onClick={handleUpdateCompany}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

       <Dialog open={isQuickAddMaterialDialogOpen} onOpenChange={setIsQuickAddMaterialDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Quick Add Raw Material</DialogTitle>
                <DialogDescription>Add a new material that is not in the list.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                 <div className="space-y-2">
                    <Label htmlFor="quick-add-type">Type</Label>
                    <Select value={quickAddForm.type} onValueChange={value => setQuickAddForm(prev => ({...prev, type: value}))}>
                        <SelectTrigger id="quick-add-type">
                            <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                        <SelectContent>
                            {materialTypesForAdd.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                 </div>
                 {!isQuickAddPaper && quickAddForm.type && (
                     <div className="space-y-2">
                         <Label htmlFor="quick-add-name">Name / Description</Label>
                         <Input
                             id="quick-add-name"
                             value={quickAddForm.name}
                             onChange={e => setQuickAddForm(prev => ({...prev, name: e.target.value}))}
                             placeholder="e.g. Corrugation Gum"
                         />
                     </div>
                 )}
                 {isQuickAddPaper && (
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
                          <Input id="quick-add-bf" value={quickAddForm.bf} onChange={e => setQuickAddForm(prev => ({...prev, bf: e.target.value}))} placeholder="e.g. 20" />
                        </div>
                     </>
                 )}
                 {quickAddForm.type && (
                    <div className="space-y-2">
                        <Label htmlFor="material-units">Units of Measurement</Label>
                         <Popover open={isQuickAddUnitPopoverOpen} onOpenChange={setIsQuickAddUnitPopoverOpen}>
                            <PopoverTrigger asChild>
                                <div className="flex min-h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm flex-wrap gap-1">
                                {quickAddForm.units.map(unit => (
                                    <Badge key={unit} variant="secondary" className="gap-1">
                                        {unit}
                                        <button type="button" onClick={() => handleQuickAddUnitRemove(unit)} className="rounded-full hover:bg-background/50">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                                <input
                                    placeholder={quickAddForm.units.length === 0 ? "e.g. Kg, Ton..." : ""}
                                    value={quickAddUnitInput}
                                    onChange={e => setQuickAddUnitInput(e.target.value)}
                                    onKeyDown={handleQuickAddUnitKeyDown}
                                    className="bg-transparent outline-none flex-1 placeholder:text-muted-foreground text-sm"
                                />
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                <Command>
                                    <CommandInput 
                                        placeholder="Search or add unit..."
                                        value={quickAddUnitInput}
                                        onValueChange={setQuickAddUnitInput}
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
                                                <CommandItem key={unit} onSelect={() => handleQuickAddUnitSelect(unit)}>
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
