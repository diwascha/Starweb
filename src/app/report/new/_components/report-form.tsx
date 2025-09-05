
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
import type { Product, Report, TestResultData, ProductSpecification } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { generateNextSerialNumber } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onProductsUpdate } from '@/services/product-service';
import { addReport, updateReport, getReportsForSerial } from '@/services/report-service';

const testResultSchema = z.object({
  value: z.string().min(1, { message: 'Result is required.' }),
  remark: z.string().optional(),
});

const reportFormSchema = z.object({
  productId: z.string().min(1, { message: 'Product is required.' }),
  taxInvoiceNumber: z.string().optional(),
  challanNumber: z.string().optional(),
  quantity: z.string().optional(),
  dimension: testResultSchema,
  ply: testResultSchema,
  weightOfBox: testResultSchema,
  gsm: testResultSchema,
  stapleWidth: testResultSchema,
  stapling: testResultSchema,
  overlapWidth: testResultSchema,
  printing: testResultSchema,
  moisture: testResultSchema,
  load: testResultSchema,
});

type ReportFormValues = z.infer<typeof reportFormSchema>;

interface ReportFormProps {
    reportToEdit?: Report;
}

const testDataKeys: (keyof ProductSpecification)[] = [
  'dimension',
  'ply',
  'weightOfBox',
  'gsm',
  'stapleWidth',
  'stapling',
  'overlapWidth',
  'printing',
  'moisture',
  'load',
];

const staticFields: (keyof ProductSpecification)[] = ['dimension', 'ply', 'weightOfBox', 'stapleWidth', 'stapling', 'overlapWidth', 'printing'];
const dynamicFields: (keyof ProductSpecification)[] = ['gsm', 'moisture', 'load'];

type BoxType = 'Wet' | 'Dry' | 'Normal';

const parseSpecValue = (specStr: string): { min: number; max: number | null } => {
    if (!specStr) return { min: 0, max: null };
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
  const [products, setProducts] = useState<Product[]>([]);
  const router = useRouter();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedBoxType, setSelectedBoxType] = useState<BoxType>('Normal');

  const defaultValues = useMemo(() => {
    if (reportToEdit) {
      return {
        productId: reportToEdit.product.id,
        taxInvoiceNumber: reportToEdit.taxInvoiceNumber,
        challanNumber: reportToEdit.challanNumber,
        quantity: reportToEdit.quantity,
        ...reportToEdit.testData,
      };
    }
    return {
      productId: '',
      taxInvoiceNumber: '',
      challanNumber: '',
      quantity: '',
      dimension: { value: '', remark: '' },
      ply: { value: '', remark: '' },
      weightOfBox: { value: '', remark: '' },
      gsm: { value: '', remark: '' },
      stapleWidth: { value: '', remark: '' },
      stapling: { value: '', remark: '' },
      overlapWidth: { value: '', remark: '' },
      printing: { value: '', remark: '' },
      moisture: { value: '', remark: '' },
      load: { value: '', remark: '' },
    };
  }, [reportToEdit]);
  
  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    defaultValues,
  });

  useEffect(() => {
    setIsClient(true);
    const unsubProducts = onProductsUpdate(setProducts);
    
    if (reportToEdit) {
        setSelectedProduct(reportToEdit.product);
        form.reset(defaultValues);
    }

    return () => {
        unsubProducts();
    }
  }, [reportToEdit, form, defaultValues]);
  
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
    if (!spec) {
        toast({ title: 'Missing Specification', description: 'Selected product is missing standard specifications.', variant: 'destructive'});
        return;
    }
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
        const gsmVariation = gsmSpec.min * 0.10;
        gsmResult = gsmSpec.min + (moisturePercentage * gsmVariation);
    } else {
        gsmResult = gsmSpec.min + moisturePercentage * (gsmSpec.max - gsmSpec.min);
    }
    
    const safeMinGsm = gsmSpec.min + 5;
    gsmResult = Math.max(gsmResult, safeMinGsm);
    
    if (gsmSpec.max !== null) {
      gsmResult = Math.min(gsmResult, gsmSpec.max);
    }
    
    form.setValue('moisture.value', String(parseFloat(moistureResult.toFixed(2))));
    form.setValue('gsm.value', String(parseFloat(gsmResult.toFixed(2))));
    form.setValue('load.value', String(Math.max(loadMin, parseFloat(loadResult.toFixed(2)))));
  };

  const handleProductChange = (productId: string) => {
    form.setValue('productId', productId);
    const product = products.find(p => p.id === productId);
    if (product) {
      setSelectedProduct(product);
      testDataKeys.forEach(field => {
        const isStatic = staticFields.includes(field);
        form.setValue(`${field}.value`, (isStatic && product.specification) ? product.specification[field] : '');
        form.setValue(`${field}.remark`, '');
      });
      const defaultBoxType = 'Normal';
      setSelectedBoxType(defaultBoxType);
      calculateAndSetValues(defaultBoxType);
    } else {
      setSelectedProduct(null);
       testDataKeys.forEach(field => {
         form.setValue(`${field}.value`, '');
         form.setValue(`${field}.remark`, '');
       });
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
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to perform this action.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { productId, taxInvoiceNumber, challanNumber, quantity, ...testDataValues } = values;
      const testData: TestResultData = testDataValues as TestResultData;
      
      
      if (reportToEdit) {
          const updatedReportData: Partial<Report> = {
              product: selectedProduct,
              taxInvoiceNumber: taxInvoiceNumber || 'N/A',
              challanNumber: challanNumber || 'N/A',
              quantity: quantity || 'N/A',
              testData,
              lastModifiedBy: user.username,
          };
          await updateReport(reportToEdit.id, updatedReportData);
          toast({ title: 'Success', description: 'Report updated successfully.' });
          router.push(`/report/${reportToEdit.id}`);
      } else {
        const allReports = await getReportsForSerial();
        const nextSerialNumber = generateNextSerialNumber(allReports);
        const now = new Date().toISOString();

        const productForDb: Product = {
          ...selectedProduct,
          lastModifiedBy: selectedProduct.lastModifiedBy || null,
        };

        const newReportData: Omit<Report, 'id'> = {
            serialNumber: nextSerialNumber,
            taxInvoiceNumber: taxInvoiceNumber || 'N/A',
            challanNumber: challanNumber || 'N/A',
            quantity: quantity || 'N/A',
            product: productForDb,
            date: now,
            createdAt: now,
            testData,
            printLog: [],
            createdBy: user.username,
        };

        const newReportId = await addReport(newReportData);
        toast({ title: 'Success', description: 'Report generated successfully.' });
        router.push(`/report/${newReportId}`);
      }
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
                  <Select onValueChange={handleProductChange} value={field.value} disabled={!!reportToEdit}>
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
                  {testDataKeys.map(key => (
                      <div key={key} className="space-y-4">
                        <FormField
                          control={form.control}
                          name={`${key}.value`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{formatLabel(key)}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={`Result for ${formatLabel(key)}`}
                                  {...field}
                                  readOnly={staticFields.includes(key)}
                                  className={staticFields.includes(key) ? "bg-muted/50 cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              <FormDescription>
                                Standard: {selectedProduct.specification?.[key] || 'N/A'}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
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
