
'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import useLocalStorage from '@/hooks/use-local-storage';
import type { RawMaterial, PurchaseOrder } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Trash2, Check, ChevronsUpDown, Edit } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn, generateNextPONumber } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import NepaliDate from 'nepali-date-converter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const poItemSchema = z.object({
  rawMaterialId: z.string().min(1, 'Material is required.'),
  rawMaterialName: z.string(),
  rawMaterialType: z.string(),
  size: z.string(),
  gsm: z.string(),
  bf: z.string(),
  quantity: z.string().min(1, 'Quantity is required.'),
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

export function PurchaseOrderForm({ poToEdit }: PurchaseOrderFormProps) {
  const [rawMaterials] = useLocalStorage<RawMaterial[]>('rawMaterials', []);
  const [purchaseOrders, setPurchaseOrders] = useLocalStorage<PurchaseOrder[]>('purchaseOrders', []);
  const router = useRouter();
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [isCompanyPopoverOpen, setIsCompanyPopoverOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<{ oldName: string; newName: string; newAddress: string } | null>(null);

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
  }, []);
  
  useEffect(() => {
    if(isClient && !poToEdit) {
        form.setValue('poNumber', generateNextPONumber(purchaseOrders));
    }
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
      });
    }
  };
  
  const handleEditCompany = (company: {name: string, address: string}) => {
    setEditingCompany({ oldName: company.name, newName: company.name, newAddress: company.address });
  };
  
  const handleUpdateCompany = () => {
    if (!editingCompany) return;

    const { oldName, newName, newAddress } = editingCompany;

    if (!newName.trim() || !newAddress.trim()) {
      toast({ title: 'Error', description: 'Company name and address cannot be empty.', variant: 'destructive' });
      return;
    }

    setPurchaseOrders(prevPOs =>
      prevPOs.map(po => {
        if (po.companyName === oldName) {
          return { ...po, companyName: newName, companyAddress: newAddress };
        }
        return po;
      })
    );
    
    // Update current form if it was showing the old company name
    if (form.getValues('companyName') === oldName) {
        form.setValue('companyName', newName);
        form.setValue('companyAddress', newAddress);
    }

    toast({ title: 'Success', description: `Company "${oldName}" updated to "${newName}".` });
    setEditingCompany(null);
  };

  const addNewItem = () => {
    append({ rawMaterialId: '', rawMaterialName: '', rawMaterialType: '', size: '', gsm: '', bf: '', quantity: '' });
  };
  
  const poDate = form.watch('poDate');
  const nepaliDateString = useMemo(() => {
    if (!poDate) return '';
    const nepaliDate = new NepaliDate(poDate);
    return nepaliDate.format('YYYY/MM/DD');
  }, [poDate]);

  async function onSubmit(values: PurchaseOrderFormValues) {
    try {
      if (poToEdit) {
        const updatedPO: PurchaseOrder = {
          ...poToEdit,
          ...values,
          poDate: values.poDate.toISOString(),
        };
        setPurchaseOrders(purchaseOrders.map(p => (p.id === poToEdit.id ? updatedPO : p)));
        toast({ title: 'Success', description: 'Purchase Order updated.' });
        router.push(`/purchase-orders/${poToEdit.id}`);
      } else {
        const newPO: PurchaseOrder = {
          id: crypto.randomUUID(),
          ...values,
          poDate: values.poDate.toISOString(),
        };
        setPurchaseOrders([...purchaseOrders, newPO]);
        toast({ title: 'Success', description: 'New Purchase Order created.' });
        router.push(`/purchase-orders/${newPO.id}`);
      }
    } catch (error) {
      console.error('Failed to save purchase order:', error);
      toast({
        title: 'Error',
        description: 'Failed to save purchase order. Please try again.',
        variant: 'destructive',
      });
    }
  }

  const title = poToEdit ? 'Edit Purchase Order' : 'Create New Purchase Order';
  const buttonText = poToEdit ? 'Save Changes' : 'Create Purchase Order';

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
                            {field.value ? `${format(field.value, "PPP")} (${nepaliDateString} B.S.)` : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date > new Date() || date < new Date("1900-01-01")} initialFocus />
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
                <div className="flex justify-between items-center">
                    <CardTitle>Items</CardTitle>
                    <Button type="button" size="sm" onClick={addNewItem}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                    </Button>
                </div>
                <CardDescription>Add raw materials to the purchase order.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[300px]">Material</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Size (Inch)</TableHead>
                                <TableHead>GSM</TableHead>
                                <TableHead>BF</TableHead>
                                <TableHead>Quantity (Ton)</TableHead>
                                <TableHead className="w-[50px]"> </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((item, index) => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.rawMaterialId`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <Select onValueChange={(value) => { field.onChange(value); handleItemMaterialChange(index, value); }} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select a material" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {isClient && rawMaterials.map(p => (
                                                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>{item.rawMaterialType || '-'}</TableCell>
                                    <TableCell>{item.size || '-'}</TableCell>
                                    <TableCell>{item.gsm || '-'}</TableCell>
                                    <TableCell>{item.bf || '-'}</TableCell>
                                    <TableCell>
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.quantity`}
                                            render={({ field }) => (
                                                <FormItem><FormControl><Input placeholder="e.g. 5" {...field} /></FormControl><FormMessage /></FormItem>
                                            )}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                {form.formState.errors.items?.message && <p className="text-sm font-medium text-destructive mt-2">{form.formState.errors.items.message}</p>}
            </CardContent>
          </Card>
          <Button type="submit">{buttonText}</Button>
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
    </div>
  );
}
