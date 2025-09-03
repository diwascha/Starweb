
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Edit, Trash2, MoreHorizontal, ArrowUpDown } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, Product, ProductSpecification } from '@/lib/types';
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
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

const initialSpecValues: ProductSpecification = {
  dimension: '',
  ply: '',
  gsm: '',
  stapleWidth: '',
  stapling: '',
  overlapWidth: '',
  printing: '',
  moisture: '',
  load: '',
};

type ProductSortKey = 'name' | 'materialCode' | 'companyName';
type SortDirection = 'asc' | 'desc';

export default function ProductsPage() {
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const [products, setProducts] = useLocalStorage<Product[]>('products', []);
  const [newProductName, setNewProductName] = useState('');
  const [newMaterialCode, setNewMaterialCode] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newSpec, setNewSpec] = useState<ProductSpecification>(initialSpecValues);
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [productSortConfig, setProductSortConfig] = useState<{ key: ProductSortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });

  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const resetForm = () => {
    setNewProductName('');
    setNewMaterialCode('');
    setNewCompanyName('');
    setNewAddress('');
    setNewSpec(initialSpecValues);
    setEditingProduct(null);
  };

  const openAddProductDialog = () => {
    resetForm();
    setIsProductDialogOpen(true);
  };

  const openEditProductDialog = (product: Product) => {
    setEditingProduct(product);
    setNewProductName(product.name);
    setNewMaterialCode(product.materialCode);
    setNewCompanyName(product.companyName);
    setNewAddress(product.address);
    setNewSpec(product.specification);
    setIsProductDialogOpen(true);
  };

  const handleProductSubmit = () => {
    const isSpecFilled = Object.values(newSpec).every(val => val.trim() !== '');
    if (newProductName.trim() !== '' && newMaterialCode.trim() !== '' && newCompanyName.trim() !== '' && newAddress.trim() !== '' && isSpecFilled) {
      if (editingProduct) {
        // Edit existing product
        const updatedProduct: Product = {
          ...editingProduct,
          name: newProductName.trim(),
          materialCode: newMaterialCode.trim(),
          companyName: newCompanyName.trim(),
          address: newAddress.trim(),
          specification: newSpec,
        };
        setProducts(products.map(p => (p.id === editingProduct.id ? updatedProduct : p)));
        // Also update the product details in any existing reports
        setReports(reports.map(r => r.product.id === editingProduct.id ? {...r, product: updatedProduct} : r));
        toast({ title: 'Success', description: 'Product updated.' });
      } else {
        // Add new product
        const newProduct: Product = {
          id: crypto.randomUUID(),
          name: newProductName.trim(),
          materialCode: newMaterialCode.trim(),
          companyName: newCompanyName.trim(),
          address: newAddress.trim(),
          specification: newSpec,
        };
        setProducts([...products, newProduct]);
        toast({ title: 'Success', description: 'New product added.' });
      }
      resetForm();
      setIsProductDialogOpen(false);
    } else {
      toast({ title: 'Error', description: 'Please fill all the fields.', variant: 'destructive' });
    }
  };
  
  const deleteProduct = (id: string) => {
    setProducts(products.filter(product => product.id !== id));
    setReports(reports.filter(report => report.product.id !== id));
    toast({ title: 'Product Deleted', description: 'The product and its associated reports have been deleted.' });
  };

  const handleSpecChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewSpec(prev => ({ ...prev, [name]: value }));
  };

  const formatLabel = (key: string) => {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };
  
  const dialogTitle = editingProduct ? 'Edit Product' : 'Add New Product';
  const dialogDescription = editingProduct ? 'Update the details and specifications for this product.' : 'Enter the details and specifications for the new product.';
  const dialogButtonText = editingProduct ? 'Save changes' : 'Save product';

  const requestProductSort = (key: ProductSortKey) => {
    let direction: SortDirection = 'asc';
    if (productSortConfig.key === key && productSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setProductSortConfig({ key, direction });
  };
  
  const sortedProducts = useMemo(() => {
    const sortableProducts = [...products];
    if (productSortConfig.key) {
      sortableProducts.sort((a, b) => {
        const aValue = a[productSortConfig.key].toLowerCase();
        const bValue = b[productSortConfig.key].toLowerCase();

        if (aValue < bValue) {
          return productSortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return productSortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableProducts;
  }, [products, productSortConfig]);

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

    if (products.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">No products found</h3>
              <p className="text-sm text-muted-foreground">Get started by adding a new product.</p>
              <Button className="mt-4" onClick={openAddProductDialog}>
                 <Plus className="mr-2 h-4 w-4" /> Add Product
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
                    <Button variant="ghost" onClick={() => requestProductSort('name')}>
                    Product Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestProductSort('materialCode')}>
                    Material Code
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead>
                    <Button variant="ghost" onClick={() => requestProductSort('companyName')}>
                    Delivered To
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sortedProducts.map(product => (
                <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.materialCode}</TableCell>
                    <TableCell>{product.companyName}</TableCell>
                    <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEditProductDialog(product)}>
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
                                        This will permanently delete the product and all associated reports. This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteProduct(product.id)}>Delete</AlertDialogAction>
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
            <h1 className="text-3xl font-bold tracking-tight">Products</h1>
            <p className="text-muted-foreground">Add, view, and manage your products.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddProductDialog}>
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>
              <form
                id="add-product-form"
                onSubmit={e => {
                  e.preventDefault();
                  handleProductSubmit();
                }}
              >
                <ScrollArea className="h-[60vh] pr-4">
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="product-name" className="text-right">
                        Product Name
                      </Label>
                      <Input
                        id="product-name"
                        value={newProductName}
                        onChange={e => setNewProductName(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="material-code" className="text-right">
                        Material Code
                      </Label>
                      <Input
                        id="material-code"
                        value={newMaterialCode}
                        onChange={e => setNewMaterialCode(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="company-name" className="text-right">
                        Delivered To
                      </Label>
                      <Input
                        id="company-name"
                        value={newCompanyName}
                        onChange={e => setNewCompanyName(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                      <Label htmlFor="address" className="text-right mt-2">
                        Address
                      </Label>
                      <Textarea
                        id="address"
                        value={newAddress}
                        onChange={e => setNewAddress(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <h3 className="text-lg font-semibold mt-4 col-span-4">Standard Specifications</h3>
                    {Object.keys(initialSpecValues).map(key => (
                      <div key={key} className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor={key} className="text-right">
                          {formatLabel(key)}
                        </Label>
                        <Input
                          id={key}
                          name={key}
                          value={newSpec[key as keyof ProductSpecification]}
                          onChange={handleSpecChange}
                          className="col-span-3"
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </form>
              <DialogFooter>
                <Button type="submit" form="add-product-form">{dialogButtonText}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      {renderContent()}
    </div>
  );
}
