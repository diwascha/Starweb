
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
import { generateNextSerialNumber } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RefreshCw } from 'lucide-react';

const reportFormSchema = z.object({
  productId: z.string().min(1, { message: 'Product is required.' }),
  taxInvoiceNumber: z.string().min(1, { message: 'Tax Invoice Number is required.' }),
  challanNumber: z.string().min(1, { message: 'Challan Number is required.' }),
  quantity: z.string().min(1, { message: 'Quantity is required.' }),
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

const staticFields: (keyof TestResultData)[] = ['dimension', 'ply', 'stapleWidth', 'stapling', 'overlapWidth', 'printing'];
const dynamicFields: (keyof TestResultData)[] = ['gsm', 'moisture', 'load'];

type BoxType = 'Wet' | 'Dry' | 'Normal';

const parseSpecValue = (specStr: string): { min: number; max: number | null } => {
    if (!specStr) return { min: 0, max: null };
    // This regex finds all decimal or integer numbers in the string, ignoring text.
    const numbers = specStr.match(/\d+(\.\d+)?/g);
    if (!numbers) return { min: 0, max: null };

    const parsedNumbers = numbers.map(parseFloat);
    if (parsedNumbers.length === 1) {
        return { min: parsedNumbers[0], max: null };
    }
    return { min: Math.min(...parsedNumbers), max: Math.max(...parsedNumbers) };
};

const getRandomInRange = (min: number, max: number, precision: number = 2) => {
    const value = Math.random() * (max - min) + min;
    return parseFloat(value.toFixed(precision));
};

export function ReportForm({ reportToEdit }: ReportFormProps) {
  const [products] = useLocalStorage<Product[]>('products', []);
  const [reports, setReports] = useLocalStorage<Report[]>('reports', []);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedBoxType, setSelectedBoxType] = useState<BoxType>('Normal');

  useEffect(() => {
    setIsClient(true);
    if (reportToEdit) {
        const product = products.find(p => p.id === reportToEdit.product.id);
        setSelectedProduct(product || null);
        setSelectedBoxType('Normal');
    }
  }, [reportToEdit, products]);
  
  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: reportToEdit ? {
        productId: reportToEdit.product.id,
        taxInvoiceNumber: reportToEdit.taxInvoiceNumber,
        challanNumber: reportToEdit.challanNumber,
        quantity: reportToEdit.quantity,
        ...reportToEdit.testData
    } : {
      productId: '',
      taxInvoiceNumber: '',
      challanNumber: '',
      quantity: '',
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

  const calculateAndSetValues = (boxType: BoxType) => {
    if (!selectedProduct) {
      toast({
        title: 'Select a Product',
        description: 'Please select a product before generating values.',
        variant: 'destructive',
      });
      return;
    }

    const spec = selectedProduct.specification;
    const gsmSpec = parseSpecValue(spec.gsm);
    const loadSpec = parseSpecValue(spec.load);
    const loadMin = loadSpec.min;
    
    const moistureLow = 6.5;
    const moistureHigh = 9.5;
    const moistureBaseForGsm = 6.0;

    let moistureResult: number;
    let loadResult: number = 0;

    
    switch (boxType) {
        case 'Wet':
          moistureResult = getRandomInRange(9.0, moistureHigh);
          break;
        case 'Dry':
          moistureResult = getRandomInRange(moistureLow, 7.0);
          break;
        case 'Normal':
        default:
          moistureResult = getRandomInRange(7.1, 8.9);
          break;
    }
    
    switch (boxType) {
      case 'Wet':
        loadResult = getRandomInRange(loadMin + 3, loadMin + 5);
        break;
      case 'Dry':
        loadResult = getRandomInRange(loadMin + 15, loadMin + 25);
        break;
      case 'Normal':
      default:
        loadResult = getRandomInRange(loadMin + 6, loadMin + 14);
        break;
    }

    
    let gsmResult: number;
    const moisturePercentage = Math.max(0, (moistureResult - moistureBaseForGsm) / (moistureHigh - moistureBaseForGsm));

    if (gsmSpec.max === null || gsmSpec.max === gsmSpec.min) {
        // Handle single value spec: add a small variation based on moisture
        // The variation is a percentage of the moisture effect, applied to a small range (e.g., 10% of base)
        const gsmVariation = gsmSpec.min * 0.10; // Allow 10% variation
        gsmResult = gsmSpec.min + (moisturePercentage * gsmVariation);
    } else {
        // Handle range spec: linear interpolation
        gsmResult = gsmSpec.min + moisturePercentage * (gsmSpec.max - gsmSpec.min);
    }
    
    // Ensure GSM result is at least 5 above minimum, but not exceeding max if it exists.
    const safeMinGsm = gsmSpec.min + 5;
    gsmResult = Math.max(gsmResult, safeMinGsm);
    
    if (gsmSpec.max !== null) {
      gsmResult = Math.min(gsmResult, gsmSpec.max);
    }
    
    form.setValue('moisture', String(parseFloat(moistureResult.toFixed(2))));
    form.setValue('gsm', String(parseFloat(gsmResult.toFixed(2))));
    form.setValue('load', String(Math.max(loadMin, parseFloat(loadResult.toFixed(2)))));
  };


  useEffect(() => {
    if (selectedProduct && !reportToEdit) {
      handleProductChange(selectedProduct.id);
    }
    // eslint-disable--next-line react-hooks/exhaustive-deps
  }, [selectedProduct, reportToEdit]);

  const handleProductChange = (productId: string) => {
    form.setValue('productId', productId);
    const product = products.find(p => p.id === productId);
    if (product) {
      setSelectedProduct(product);
      staticFields.forEach(field => {
        form.setValue(field, product.specification[field]);
      });
      const defaultBoxType = 'Normal';
      setSelectedBoxType(defaultBoxType);
      calculateAndSetValues(defaultBoxType);
    } else {
      setSelectedProduct(null);
       dynamicFields.forEach(field => form.setValue(field, ''));
       staticFields.forEach(field => form.setValue(field, ''));
    }
  };


  const handleRegenerate = () => {
    if (selectedBoxType) {
      calculateAndSetValues(selectedBoxType);
    } else {
      toast({
        title: 'Select a Box Type',
        description: 'Please select a box type before regenerating values.',
        variant: 'destructive',
      });
    }
  };


  async function onSubmit(values: ReportFormValues) {
    if (!selectedProduct) {
      toast({ title: 'Error', description: 'Please select a product.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { productId, taxInvoiceNumber, challanNumber, quantity, ...testDataValues } = values;
      const testData: TestResultData = testDataValues;
      
      let newReportId = reportToEdit ? reportToEdit.id : crypto.randomUUID();

      if (reportToEdit) {
          const updatedReport: Report = {
              ...reportToEdit,
              product: selectedProduct,
              taxInvoiceNumber,
              challanNumber,
              quantity,
              testData,
          };
          setReports(reports.map(r => r.id === reportToEdit.id ? updatedReport : r));
          toast({ title: 'Success', description: 'Report updated successfully.' });
      } else {
        const newReportData: Omit<Report, 'id' | 'serialNumber'> = {
            taxInvoiceNumber,
            challanNumber,
            quantity,
            product: selectedProduct,
            date: new Date().toISOString(),
            testData,
            printLog: [],
        };

        const tempReport: Report = {
            ...newReportData,
            id: newReportId,
            serialNumber: 'PENDING',
        };
        
        setReports(prevReports => {
            const allReports = [...(prevReports || []), tempReport];
            const finalSerialNumber = generateNextSerialNumber(allReports);
            
            return allReports.map(r => 
                r.id === newReportId ? { ...r, serialNumber: finalSerialNumber } : r
            );
        });

        toast({ title: 'Success', description: 'Report generated successfully.' });
      }
       router.push(`/report/${newReportId}`);
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate report. Please try again.',
        variant: 'destructive',
      });
    } finally {
        setIsSubmitting(false);
    }
  }

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
                 <FormItem>
                    <FormLabel>Box Type Classification</FormLabel>
                    <FormDescription>
                        Select a box type to auto-fill Moisture, GSM, and Load based on predefined rules.
                    </FormDescription>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
                        <RadioGroup
                            onValueChange={(value) => {
                                const boxType = value as BoxType;
                                setSelectedBoxType(boxType);
                                calculateAndSetValues(boxType);
                            }}
                            value={selectedBoxType || ''}
                            className="flex flex-row gap-4"
                            disabled={!selectedProduct}
                        >
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="Wet" />
                                </FormControl>
                                <FormLabel className="font-normal">Wet Box</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="Dry" />
                                </FormControl>
                                <FormLabel className="font-normal">Dry Box</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="Normal" />
                                </FormControl>
                                <FormLabel className="font-normal">Normal Box</FormLabel>
                            </FormItem>
                        </RadioGroup>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRegenerate}
                            disabled={!selectedBoxType || !selectedProduct}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Regenerate
                        </Button>
                    </div>
                </FormItem>
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
                    <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                            <Input placeholder="Enter Quantity" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {dynamicFields.map(key => (
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
                    {staticFields.map(key => (
                      <FormField
                          key={key}
                          control={form.control}
                          name={key}
                          render={({ field }) => (
                          <FormItem>
                              <FormLabel>{formatLabel(key)}</FormLabel>
                              <FormControl>
                              <Input {...field} readOnly className="bg-muted/50 cursor-not-allowed"/>
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
