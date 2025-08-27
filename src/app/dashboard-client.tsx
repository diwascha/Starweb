'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PlusCircle, Plus, FileText, MoreHorizontal, Edit, Trash2, View, Printer } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, Product, ProductSpecification } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useRouter } from 'next/navigation';

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

export default function DashboardClient() {
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const [products, setProducts] = useLocalStorage<Product[]>('products', []);
  const [newProductName, setNewProductName] = useState('');
  const [newMaterialCode, setNewMaterialCode] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newSpec, setNewSpec] = useState<ProductSpecification>(initialSpecValues);
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

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

  const deleteReport = (id: string) => {
    setReports(reports.filter(report => report.id !== id));
    toast({ title: 'Report Deleted', description: 'The report has been successfully deleted.' });
  };
  
  const handlePrint = (report: Report) => {
    const newLogEntry = { date: new Date().toISOString() };
    const updatedReport = {
      ...report,
      printLog: [...(report.printLog || []), newLogEntry],
    };
    
    const updatedReports = reports.map(r => r.id === report.id ? updatedReport : r);
    setReports(updatedReports);
    
    // Use a timeout to ensure state update is processed before navigating
    setTimeout(() => {
        const printWindow = window.open(`/report/${report.id}`, '_blank');
        if (printWindow) {
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    }, 100);
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
    
    const sortedReports = [...reports].sort((a, b) => {
      return a.product.name.localeCompare(b.product.name);
    });
    
    const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));


    if (reports.length === 0 && products.length === 0) {
        return (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
            <div className="flex flex-col items-center gap-1 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-2xl font-bold tracking-tight">No products or reports</h3>
              <p className="text-sm text-muted-foreground">Get started by adding a product, then create a report.</p>
              <Button className="mt-4" onClick={openAddProductDialog}>
                 <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </div>
          </div>
        );
      }

    return (
        <div className="flex flex-col gap-8">
            <section>
                <h2 className="text-2xl font-semibold tracking-tight mb-4">Reports</h2>
                {reports.length > 0 ? (
                    <Card>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Test Serial No.</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Invoice Number</TableHead>
                            <TableHead>Challan Number</TableHead>
                            <TableHead>Quantities</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedReports.map(report => (
                            <TableRow key={report.id}>
                              <TableCell className="font-medium">{report.serialNumber}</TableCell>
                              <TableCell>{report.product.name}</TableCell>
                              <TableCell>{report.taxInvoiceNumber}</TableCell>
                              <TableCell>{report.challanNumber}</TableCell>
                              <TableCell>{report.quantity}</TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => router.push(`/report/${report.id}`)}>
                                      <View className="mr-2 h-4 w-4" /> View
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => router.push(`/report/edit/${report.id}`)}>
                                      <Edit className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => handlePrint(report)}>
                                      <Printer className="mr-2 h-4 w-4" /> Print
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
                                            This action cannot be undone. This will permanently delete the report.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteReport(report.id)}>Delete</AlertDialogAction>
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
                ) : (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-12">
                        <div className="flex flex-col items-center gap-1 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                        <h3 className="text-xl font-bold tracking-tight">No reports found</h3>
                        <p className="text-sm text-muted-foreground">Get started by creating a new test report.</p>
                        <Button className="mt-4" asChild>
                            <Link href="/report/new">
                            <PlusCircle className="mr-2 h-4 w-4" /> New Report
                            </Link>
                        </Button>
                        </div>
                    </div>
                )}
            </section>
            
            <section>
                <h2 className="text-2xl font-semibold tracking-tight mb-4">Products</h2>
                {products.length > 0 ? (
                    <Card>
                        <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Material Code</TableHead>
                            <TableHead>Delivered To</TableHead>
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
                ) : (
                     <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-12">
                        <div className="flex flex-col items-center gap-1 text-center">
                            <h3 className="text-xl font-bold tracking-tight">No products found</h3>
                            <p className="text-sm text-muted-foreground">Get started by adding a product.</p>
                            <Button className="mt-4" onClick={openAddProductDialog}>
                                <Plus className="mr-2 h-4 w-4" /> Add Product
                            </Button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
  };
  
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report Dashboard</h1>
          <p className="text-muted-foreground">View and manage your test reports and products.</p>
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
          <Button asChild>
            <Link href="/report/new">
              <PlusCircle className="mr-2 h-4 w-4" /> New Report
            </Link>
          </Button>
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
