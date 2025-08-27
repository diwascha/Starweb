'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Plus, FileText, MoreHorizontal } from 'lucide-react';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Report, Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

export default function DashboardClient() {
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const [products, setProducts] = useLocalStorage<Product[]>('products', []);
  const [newProductName, setNewProductName] = useState('');
  const [newMaterialCode, setNewMaterialCode] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const { toast } = useToast();

  const handleAddProduct = () => {
    if (newProductName.trim() !== '' && newMaterialCode.trim() !== '' && newCompanyName.trim() !== '' && newAddress.trim() !== '') {
      const newProduct: Product = {
        id: crypto.randomUUID(),
        name: newProductName.trim(),
        materialCode: newMaterialCode.trim(),
        companyName: newCompanyName.trim(),
        address: newAddress.trim(),
      };
      setProducts([...products, newProduct]);
      setNewProductName('');
      setNewMaterialCode('');
      setNewCompanyName('');
      setNewAddress('');
      setIsAddProductOpen(false);
      toast({ title: 'Success', description: 'New product added.' });
    } else {
      toast({ title: 'Error', description: 'Please fill all the fields.', variant: 'destructive' });
    }
  };

  const deleteReport = (id: string) => {
    setReports(reports.filter(report => report.id !== id));
    toast({ title: 'Report Deleted', description: 'The report has been successfully deleted.' });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report Dashboard</h1>
          <p className="text-muted-foreground">View and manage your test reports.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
                <DialogDescription>Enter the details of the new product.</DialogDescription>
              </DialogHeader>
              <form
                id="add-product-form"
                onSubmit={e => {
                  e.preventDefault();
                  handleAddProduct();
                }}
              >
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="product-name" className="text-right">
                      Name
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
                      Company
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
                </div>
              </form>
              <DialogFooter>
                <Button type="submit" form="add-product-form">Save product</Button>
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

      {reports.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map(report => (
            <Card key={report.id}>
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span>{report.product.name}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => deleteReport(report.id)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardTitle>
                <CardDescription>
                  Report generated on {new Date(report.date).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  View the detailed test report and analysis.
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/report/${report.id}`}>View Report</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h3 className="text-2xl font-bold tracking-tight">No reports found</h3>
            <p className="text-sm text-muted-foreground">Get started by creating a new test report.</p>
            <Button className="mt-4" asChild>
              <Link href="/report/new">
                <PlusCircle className="mr-2 h-4 w-4" /> New Report
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
