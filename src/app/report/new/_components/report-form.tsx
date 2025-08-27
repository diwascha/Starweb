
'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
import type { Product, Report, TestData } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { generateReportVisualization } from '@/ai/flows/generate-report-visualization';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  productId: z.string().min(1, { message: 'Product is required.' }),
  dimension: z.string().min(1, { message: 'Dimension is required.' }),
  ply: z.string().min(1, { message: 'Ply is required.' }),
  gsm: z.string().min(1, { message: 'GSM is required.' }),
  stapleWidth: z.string().min(1, { message: 'Staple Width is required.' }),
  stapling: z.string().min(1, { message: 'Stapling is required.' }),
  overlapWidth: z.string().min(1, { message: 'Overlap Width is required.' }),
  printing: z.string().min(1, { message: 'Printing is required.' }),
  moisture: z.string().min(1, { message: 'Moisture is required.' }),
  load: z.string().min(1, { message: 'Load is required.' }),
});

export function ReportForm() {
  const [products] = useLocalStorage<Product[]>('products', []);
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const selectedProduct = products.find(p => p.id === values.productId);
      if (!selectedProduct) {
        toast({ title: 'Error', description: 'Selected product not found.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      const { productId, ...testDataValues } = values;
      const testData: TestData = testDataValues;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Data Input</CardTitle>
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product to test" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products.length > 0 ? (
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="dimension"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dimension</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 10x10x10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ply"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ply</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gsm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GSM (g/m²)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 150" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stapleWidth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Staple Width (mm)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stapling"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stapling</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Center" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="overlapWidth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Overlap Width (mm)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 25" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="printing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Printing</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 2-Color Flexo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="moisture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moisture (%)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 7.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="load"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Load (kg)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={isSubmitting || (isClient && products.length === 0)}>
              {isSubmitting ? 'Generating...' : 'Generate Report'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
