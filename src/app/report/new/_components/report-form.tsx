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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useLocalStorage from '@/hooks/use-local-storage';
import type { Product, Report, TestResultData } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { generateReportVisualization } from '@/ai/flows/generate-report-visualization';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const reportFormSchema = z.object({
  productId: z.string().min(1, { message: 'Product is required.' }),
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

export function ReportForm() {
  const [products] = useLocalStorage<Product[]>('products', []);
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      productId: '',
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
      const { productId, ...testDataValues } = values;
      const testData: TestResultData = testDataValues;

      const visualization = await generateReportVisualization({
        productName: selectedProduct.name,
        testData: testData,
      });

      const newReport: Report = {
        id: crypto.randomUUID(),
        product: selectedProduct,
        date: new Date().toISOString(),
        testData,
        visualization,
      };

      setReports([...reports, newReport]);
      toast({ title: 'Success', description: 'Report generated successfully.' });
      router.push(`/report/${newReport.id}`);
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate report visualization. Please try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  }

  const specKeys = selectedProduct ? (Object.keys(selectedProduct.specification) as Array<keyof TestResultData>) : [];

  const formatLabel = (key: string) => {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Result Input</CardTitle>
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
                  <Select onValueChange={handleProductChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product to test" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isClient && products.length > 0 ? (
                        products.map(product => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
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
            )}

            <Button type="submit" disabled={isSubmitting || (isClient && products.length === 0)}>
              {isSubmitting ? 'Generating...' : 'Generate Report'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
