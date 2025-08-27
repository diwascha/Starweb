'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Product, Report, TestResultData } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const reportFormSchema = z.object({
  productId: z.string().min(1, { message: 'Product is required.' }),
  taxInvoiceNumber: z.string().min(1, { message: 'Tax Invoice Number is required.' }),
  challanNumber: z.string().min(1, { message: 'Challan Number is required.' }),
  dimension: z.string().min(1, { message: 'Dimension result is required.' }),
  ply: z.string().min(1, { message: 'Ply result is required.' }),
  gsm: z.string().min(1, { message: 'GSM result is required.' }),
  stapleWidth: z.string().min(1, { message: 'Staple Width result is required.' }),
  stapling: z.string().min(1, { message: 'Stapling result is required.' }),
  overlapWidth: z.string().min(1, { message: 'Overlap Width result is required.' }),
  printing: z.string().min(1, { message: 'Printing result is required.' }),
  moisture: z.string().min(1, { message: 'Moisture result is required.' }),
  load: z.string().min(1, { message: 'Load result is required.' }),
});

type ReportFormValues = z.infer<typeof reportFormSchema>;

interface ReportFormProps {
    reportToEdit?: Report;
}

export function ReportForm({ reportToEdit }: ReportFormProps) {
  const [products] = useLocalStorage<Product[]>('products', []);
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    setIsClient(true);
    if (reportToEdit) {
        const product = products.find(p => p.id === reportToEdit.product.id);
        setSelectedProduct(product || null);
    }
  }, [reportToEdit, products]);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: reportToEdit ? {
        productId: reportToEdit.product.id,
        taxInvoiceNumber: reportToEdit.taxInvoiceNumber,
        challanNumber: reportToEdit.challanNumber,
        ...reportToEdit.testData
    } : {
      productId: '',
      taxInvoiceNumber: '',
      challanNumber: '',
      dimension: '',
      ply: '',
      gsm: '',
      stapleWidth: '',
      stapling: '',
      overlapWidth: '',
      printing: '',
      moisture: '',
      load: '',
    },
  });

  const handleProductChange = (productId: string) => {
    form.setValue('productId', productId);
    const product = products.find(p => p.id === productId);
    setSelectedProduct(product || null);
  };

  async function onSubmit(values: ReportFormValues) {
    if (!selectedProduct) {
      toast({ title: 'Error', description: 'Please select a product.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { productId, taxInvoiceNumber, challanNumber, ...testDataValues } = values;
      const testData: TestResultData = testDataValues;
      
      if (reportToEdit) {
          const updatedReport: Report = {
              ...reportToEdit,
              product: selectedProduct,
              taxInvoiceNumber,
              challanNumber,
              testData,
          };
          setReports(reports.map(r => r.id === reportToEdit.id ? updatedReport : r));
          toast({ title: 'Success', description: 'Report updated successfully.' });
          router.push(`/report/${reportToEdit.id}`);
      } else {
        const nextSerialNumber = (reports.length + 1).toString().padStart(3, '0');
        const serialNumber = `2082/083-${nextSerialNumber}`;

        const newReport: Report = {
            id: crypto.randomUUID(),
            serialNumber,
            taxInvoiceNumber,
            challanNumber,
            product: selectedProduct,
            date: new Date().toISOString(),
            testData,
            printLog: [],
        };

        setReports([...reports, newReport]);
        toast({ title: 'Success', description: 'Report generated successfully.' });
        router.push(`/report/${newReport.id}`);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate report. Please try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  }

  const specKeys = selectedProduct ? (Object.keys(selectedProduct.specification) as Array<keyof TestResultData>) : [];

  const formatLabel = (key: string) => {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const title = reportToEdit ? 'Edit Test Report' : 'Create New Test Report';
  const description = reportToEdit ? 'Update the test results for this report.' : 'Fill in the details below to generate a new report.';
  const buttonText = isSubmitting ? (reportToEdit ? 'Updating...' : 'Generating...') : (reportToEdit ? 'Update Report' : 'Generate Report');

  return (
    <>
     <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
    <Card>
      <CardHeader>
        <CardTitle>Test Result Input</CardTitle>
        <CardDescription>Select a product and enter the measured test results against its standard specifications.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="productId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select onValueChange={handleProductChange} defaultValue={field.value} disabled={!!reportToEdit}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product to test" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isClient && products.length > 0 ? (
                        products.map(product => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({product.materialCode})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-muted-foreground">No products found. Add one from the dashboard.</div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedProduct && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField
                        control={form.control}
                        name="taxInvoiceNumber"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tax Invoice Number</FormLabel>
                            <FormControl>
                            <Input placeholder="Enter Tax Invoice Number" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="challanNumber"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Challan No</FormLabel>
                            <FormControl>
                            <Input placeholder="Enter Challan Number" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {specKeys.map(key => (
                    <FormField
                        key={key}
                        control={form.control}
                        name={key}
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>{formatLabel(key)}</FormLabel>
                            <FormControl>
                            <Input placeholder={`Enter result for ${formatLabel(key)}`} {...field} />
                            </FormControl>
                            <FormDescription>
                            Standard: {selectedProduct.specification[key]}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    ))}
                </div>
              </>
            )}

            <Button type="submit" disabled={isSubmitting || !selectedProduct || !isClient || (isClient && products.length === 0)}>
              {buttonText}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
    </>
  );
}
