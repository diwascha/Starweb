'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
    FileText, 
    Save, 
    Loader2, 
    ArrowLeft, 
    Search, 
    Check, 
    PlusCircle, 
    CalendarIcon,
    Package,
    ShieldCheck,
    Edit
} from 'lucide-react';
import type { Product, Report, ProductSpecification } from '@/lib/types';
import { onProductsUpdate } from '@/services/product-service';
import { addReport, onReportsUpdate } from '@/services/report-service';
import { generateNextSerialNumber, toNepaliDate, generateId } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DualCalendar } from '@/components/ui/dual-calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

export default function NewReportPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [allReports, setAllReports] = useState<Report[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    
    const [formData, setFormData] = useState({
        serialNumber: '',
        taxInvoiceNumber: '',
        challanNumber: '',
        quantity: '',
        date: new Date(),
        testData: {} as Record<string, { value: string; remark?: string }>
    });

    useEffect(() => {
        const unsubs = [
            onProductsUpdate(setProducts),
            onReportsUpdate((data) => {
                setAllReports(data);
                setIsLoading(false);
            })
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    useEffect(() => {
        if (!isLoading && allReports.length >= 0) {
            generateNextSerialNumber(allReports, formData.date.toISOString()).then(num => {
                setFormData(prev => ({ ...prev, serialNumber: num }));
            });
        }
    }, [allReports, isLoading, formData.date]);

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product);
        setIsProductPopoverOpen(false);
        
        // Initialize testData with spec keys
        const initialTestData: any = {};
        Object.keys(product.specification || {}).forEach(key => {
            if (key !== 'dimension' && key !== 'ply') {
                initialTestData[key] = { value: '', remark: '' };
            }
        });
        setFormData(prev => ({ ...prev, testData: initialTestData }));
    };

    const handleTestValueChange = (key: string, val: string) => {
        setFormData(prev => ({
            ...prev,
            testData: {
                ...prev.testData,
                [key]: { ...prev.testData[key], value: val }
            }
        }));
    };

    const handleSubmit = async () => {
        if (!user || !selectedProduct) return;
        setIsSaving(true);
        try {
            const reportId = await addReport({
                serialNumber: formData.serialNumber,
                taxInvoiceNumber: formData.taxInvoiceNumber || 'N/A',
                challanNumber: formData.challanNumber || 'N/A',
                quantity: formData.quantity || 'N/A',
                product: selectedProduct,
                date: formData.date.toISOString(),
                createdAt: new Date().toISOString(),
                testData: formData.testData as any,
                createdBy: user.username,
                ownership: selectedProduct.ownership || 'Both'
            });
            toast({ title: 'Report Created', description: `Voucher #${formData.serialNumber} saved.` });
            router.push(`/report/${reportId}`);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const specKeys = useMemo(() => {
        if (!selectedProduct) return [];
        return Object.keys(selectedProduct.specification || {}).filter(k => 
            !['dimension', 'ply', 'view', 'edit', 'delete', 'add', 'all'].includes(k)
        );
    }, [selectedProduct]);

    const formatLabel = (key: string) => {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    };

    if (isLoading) return <div className="p-12 text-center flex flex-col items-center justify-center h-[70vh] gap-4"><Loader2 className="animate-spin h-8 w-8 text-primary"/><p>Fetching registry standards...</p></div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-10 w-10 border shadow-sm"><ArrowLeft className="h-5 w-5" /></Button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Initialize QT Report</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Create a new technical verification document.</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <Card className="shadow-sm border-gray-100 overflow-hidden">
                        <CardHeader className="bg-muted/10 border-b py-4 px-6">
                            <CardTitle className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                                <Package className="h-4 w-4 text-primary"/>
                                Product Selection
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">Search Manufacturing Catalog</Label>
                                <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="w-full justify-between h-11 text-base font-bold bg-white">
                                            {selectedProduct ? selectedProduct.name : "Select or type product name..."}
                                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
                                        <Command>
                                            <CommandInput placeholder="Search variants..." value={productSearch} onValueChange={setProductSearch} />
                                            <CommandList>
                                                <CommandEmpty>No products found.</CommandEmpty>
                                                <CommandGroup>
                                                    {products.map(p => (
                                                        <CommandItem key={p.id} value={p.name} onSelect={() => handleProductSelect(p)} className="h-11">
                                                            <Check className={cn("mr-2 h-4 w-4", selectedProduct?.id === p.id ? "opacity-100" : "opacity-0")} />
                                                            <div className="flex flex-col">
                                                                <span className="font-bold uppercase text-xs">{p.name}</span>
                                                                <span className="text-[10px] text-muted-foreground uppercase">{p.materialCode} &bull; {p.partyName}</span>
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </CardContent>
                    </Card>

                    {selectedProduct && (
                        <Card className="shadow-lg border-primary/20 overflow-hidden ring-4 ring-primary/5 animate-in fade-in slide-in-from-bottom-2">
                            <CardHeader className="bg-primary/5 border-b py-5 px-6">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                                        <Edit className="h-4 w-4 text-primary"/>
                                        Test Parameters Result
                                    </CardTitle>
                                    <Badge variant="outline" className="bg-white px-3 font-black text-[9px] uppercase tracking-tighter text-blue-600 border-blue-200">
                                        {selectedProduct.specification.ply} Ply Construction
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    {specKeys.map(key => (
                                        <div key={key} className="space-y-1.5 group">
                                            <div className="flex justify-between items-center px-1">
                                                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{formatLabel(key)}</Label>
                                                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter opacity-0 group-focus-within:opacity-100 transition-opacity">Expected: {selectedProduct.specification[key as keyof ProductSpecification]}</span>
                                            </div>
                                            <Input 
                                                value={formData.testData[key]?.value || ''} 
                                                onChange={e => handleTestValueChange(key, e.target.value)}
                                                placeholder={selectedProduct.specification[key as keyof ProductSpecification] || 'Value'}
                                                className="h-10 font-bold border-2 focus-visible:ring-primary focus-visible:border-primary transition-all"
                                            />
                                        </div>
                                    ))}
                                </div>
                                {specKeys.length === 0 && (
                                    <div className="py-12 text-center text-muted-foreground italic text-sm">This product has no technical parameters defined.</div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="lg:col-span-1 space-y-8">
                    <Card className="shadow-sm border-gray-100 bg-white">
                        <CardHeader className="py-4 border-b bg-muted/5">
                            <CardTitle className="text-xs uppercase font-black tracking-widest text-muted-foreground">Document Identity</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Report Serial #</Label>
                                <Input value={formData.serialNumber} readOnly className="bg-muted/50 font-mono text-sm h-10 border-2" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Document Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start h-10 font-bold text-xs border-2 bg-white">
                                            <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                                            {toNepaliDate(formData.date.toISOString())} BS ({format(formData.date, "PP")})
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <DualCalendar selected={formData.date} onSelect={d => d && setFormData(prev => ({ ...prev, date: d }))} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Separator />
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Tax Invoice Reference</Label>
                                <Input value={formData.taxInvoiceNumber} onChange={e => setFormData(p => ({...p, taxInvoiceNumber: e.target.value}))} placeholder="e.g. TI-1234" className="h-10" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Dispatch Qty</Label>
                                <Input value={formData.quantity} onChange={e => setFormData(p => ({...p, quantity: e.target.value}))} placeholder="e.g. 500 Pcs" className="h-10 font-bold" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border-blue-200 bg-blue-50/10 overflow-hidden">
                        <CardHeader className="py-4 px-6 border-b border-blue-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-xl"><ShieldCheck className="h-4 w-4 text-blue-600"/></div>
                                <CardTitle className="text-xs font-black uppercase text-blue-900 tracking-wider">Finalize Report</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <p className="text-[10px] text-blue-800 leading-relaxed font-medium mb-6">
                                By committing this report, you verify that the test results accurately reflect the technical performance of the manufactured batch.
                            </p>
                            <Button 
                                onClick={handleSubmit} 
                                disabled={isSaving || !selectedProduct} 
                                className="w-full h-12 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20"
                            >
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Authorize & Save
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
