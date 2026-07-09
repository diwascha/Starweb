'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, FileSpreadsheet, CheckCircle, Terminal } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { importPayrollFromSheet } from '@/services/payroll-service';
import { importVbaReport } from '@/services/vba-import-service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NepaliDate from 'nepali-date-converter';
import { cn } from '@/lib/utils';
import { NEPALI_MONTHS } from '@/lib/constants';

interface SheetInfo {
  name: string;
  rowCount: number;
  jsonData: any[][];
}

interface SelectedSheet {
    name: string;
    year: string;
    month: string;
}

export default function ImportPayrollPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [importMode, setImportMode] = useState<'STANDARD' | 'VBA'>('STANDARD');
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [bsYears, setBsYears] = useState<number[]>([]);

    const [isSheetSelectDialogOpen, setIsSheetSelectDialogOpen] = useState(false);
    const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<SelectedSheet[]>([]);
    const [importProgress, setImportProgress] = useState<string | null>(null);

    useEffect(() => {
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const allYears = [];
        for (let y = 2080; y <= 2100; y++) allYears.push(y);
        setBsYears(allYears);
        return () => unsubEmployees();
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setFileName(file.name);

        const XLSX = await import('xlsx');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                const sheetsInfo: SheetInfo[] = workbook.SheetNames.map(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });
                    return {
                        name: sheetName,
                        rowCount: jsonData.length > 1 ? jsonData.length - 1 : 0, 
                        jsonData: jsonData,
                    };
                }).filter(sheet => sheet.rowCount > 0);

                if (sheetsInfo.length === 0) {
                    toast({ title: 'No Data Found', description: 'The selected file does not contain any sheets with data.' });
                    return;
                }

                setAvailableSheets(sheetsInfo);
                setSelectedSheets([]);
                setIsSheetSelectDialogOpen(true);

            } catch (error) {
                console.error("File processing error:", error);
                toast({ title: 'Error', description: 'Failed to read the Excel file.', variant: 'destructive' });
            } finally {
                setIsProcessing(false);
            }
        };
        reader.readAsArrayBuffer(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSheetSelectionChange = (sheetName: string, checked: boolean) => {
        const currentNepaliDate = new NepaliDate();
        if (checked) {
            const defaultMonth = String(currentNepaliDate.getMonth());
            const defaultYear = String(currentNepaliDate.getYear());
            
            setSelectedSheets(prev => [...prev, {
                name: sheetName,
                year: defaultYear,
                month: defaultMonth
            }]);
        } else {
            setSelectedSheets(prev => prev.filter(s => s.name !== sheetName));
        }
    };

    const handleSheetPeriodChange = (sheetName: string, type: 'year' | 'month', value: string) => {
        setSelectedSheets(prev => prev.map(s => s.name === sheetName ? { ...s, [type]: value } : s));
    };

    const handleImport = async () => {
        if (selectedSheets.length === 0 || !user) return;
        
        setIsSheetSelectDialogOpen(false);
        setIsProcessing(true);
        setImportProgress(`Starting...`);

        try {
            if (importMode === 'VBA') {
                for (const selected of selectedSheets) {
                    const sheet = availableSheets.find(s => s.name === selected.name);
                    if (sheet) {
                        setImportProgress(`Importing VBA Blocks: ${sheet.name}...`);
                        await importVbaReport(
                            sheet.jsonData, 
                            parseInt(selected.year), 
                            parseInt(selected.month), 
                            user.username
                        );
                    }
                }
                toast({ title: 'VBA Report Import Success', description: 'Financial and behavioral data blocks have been mirrored.' });
            } else {
                let totalCreated = 0;
                let currentEmployeesList = [...employees];

                for (const selected of selectedSheets) {
                    const sheet = availableSheets.find(s => s.name === selected.name);
                    if (sheet) {
                        setImportProgress(`Processing ${sheet.name}...`);
                        const result = await importPayrollFromSheet(
                            sheet.jsonData,
                            currentEmployeesList,
                            user.username, 
                            parseInt(selected.year), 
                            parseInt(selected.month)
                        );
                        totalCreated += result.createdCount;
                        if (result.newEmployees) currentEmployeesList = [...currentEmployeesList, ...result.newEmployees];
                    }
                }
                toast({ title: 'Import Complete', description: `${totalCreated} payroll records processed.` });
            }
            
            router.push('/hr/payroll');
        } catch (error: any) {
            toast({ title: `Import Error`, description: error.message, variant: 'destructive' });
        } finally {
            setImportProgress(null);
            setIsProcessing(false);
            setFileName(null);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Payroll Bulk Importer</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Manually map spreadsheet sheets to organizational periods.</p>
                </div>
                <Tabs value={importMode} onValueChange={(v: any) => setImportMode(v)} className="bg-muted/30 p-1 rounded-lg">
                    <TabsList className="h-8">
                        <TabsTrigger value="STANDARD" className="text-[10px] uppercase font-bold px-4">Standard Sheet</TabsTrigger>
                        <TabsTrigger value="VBA" className="text-[10px] uppercase font-bold px-4 gap-1.5"><Terminal className="h-3 w-3"/> VBA System Report</TabsTrigger>
                    </TabsList>
                </Tabs>
            </header>
            
            <Card className={cn(
                "border-dashed shadow-none transition-colors",
                importMode === 'VBA' ? "bg-indigo-50/20 border-indigo-200" : "bg-muted/5"
            )}>
                <CardHeader>
                    <CardTitle className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                        {importMode === 'VBA' && <Terminal className="h-4 w-4 text-indigo-600"/>}
                        Upload Source
                    </CardTitle>
                    <CardDescription>
                        {importMode === 'VBA' 
                            ? "Mirror pre-computed blocks (Payroll, Punctuality, Comparison). No daily data required." 
                            : "Standard payroll table with optional analytics harvesting."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xls,.xlsx,.xlsm" className="hidden" />
                     <Button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isProcessing} 
                        size="lg" 
                        className={cn(
                            "h-12 px-8 font-black text-xs uppercase tracking-widest shadow-xl",
                            importMode === 'VBA' ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/10" : "shadow-primary/10"
                        )}
                    >
                         {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                         {isProcessing ? (importProgress || 'Mapping Data...') : 'Identify Local Excel File'}
                     </Button>
                     {fileName && <p className="text-[10px] font-black uppercase text-primary mt-3 px-1 flex items-center gap-1.5"><CheckCircle className="h-3 w-3"/> Selected: {fileName}</p>}
                </CardContent>
            </Card>

            <Dialog open={isSheetSelectDialogOpen} onOpenChange={setIsSheetSelectDialogOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
                    <DialogHeader className="p-6 border-b bg-muted/5 shrink-0 text-left">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg"><FileSpreadsheet className="h-5 w-5 text-primary"/></div>
                            <div>
                                <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Period Alignment</DialogTitle>
                                <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select the target month for each identified report sheet.</DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-gray-50/30">
                        <div className="p-4 border-b flex items-center space-x-2 bg-white sticky top-0 z-10 shrink-0">
                            <Checkbox
                                id="select-all-sheets"
                                onCheckedChange={(checked) => {
                                    const curr = new NepaliDate();
                                    const y = String(curr.getYear());
                                    const m = String(curr.getMonth());
                                    setSelectedSheets(checked ? availableSheets.map(s => ({ name: s.name, year: y, month: m })) : []);
                                }}
                                checked={selectedSheets.length === availableSheets.length && availableSheets.length > 0}
                            />
                            <Label htmlFor="select-all-sheets" className="font-black text-[10px] uppercase tracking-widest text-gray-900 cursor-pointer">Process All Identified Sheets</Label>
                        </div>

                        <ScrollArea className="flex-1 h-full">
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {availableSheets.map(sheet => {
                                    const sel = selectedSheets.find(s => s.name === sheet.name);
                                    return (
                                        <div key={`sheet-item-${sheet.name}`} className={cn(
                                            "p-4 rounded-xl border-2 transition-all space-y-4",
                                            !!sel ? "border-primary bg-primary/[0.03] shadow-sm ring-1 ring-primary/5" : "border-gray-100 bg-gray-50/50"
                                        )}>
                                            <div className="flex items-center space-x-3 overflow-hidden">
                                                <Checkbox
                                                    id={`sheet-${sheet.name}`}
                                                    onCheckedChange={(checked) => handleSheetSelectionChange(sheet.name, !!checked)}
                                                    checked={!!sel}
                                                />
                                                <div className="flex flex-col overflow-hidden">
                                                    <Label htmlFor={`sheet-${sheet.name}`} className="font-black text-xs text-gray-900 uppercase tracking-tight truncate cursor-pointer">{sheet.name}</Label>
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">{sheet.rowCount} data lines</span>
                                                </div>
                                            </div>
                                            {!!sel && (
                                                <div className="pl-7 grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-left-2">
                                                    <div className="space-y-1">
                                                        <Label className="text-[9px] font-black uppercase text-primary tracking-widest px-1">BS Year</Label>
                                                        <Select value={sel.year} onValueChange={(v) => handleSheetPeriodChange(sheet.name, 'year', v)}>
                                                            <SelectTrigger className="h-8 bg-white border-primary/20 text-[10px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent className="max-h-[200px]">
                                                                {bsYears.map(y => <SelectItem key={`yr-${sheet.name}-${y}`} value={String(y)} className="text-xs">{y}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[9px] font-black uppercase text-primary tracking-widest px-1">BS Month</Label>
                                                        <Select value={sel.month} onValueChange={(v) => handleSheetPeriodChange(sheet.name, 'month', v)}>
                                                            <SelectTrigger className="h-8 bg-white border-primary/20 text-[10px]"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {NEPALI_MONTHS.map(m => <SelectItem key={`mo-${sheet.name}-${m.value}`} value={String(m.value)} className="text-xs">{m.name}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <ScrollBar orientation="vertical" />
                        </ScrollArea>
                    </div>

                    <DialogFooter className="p-6 border-t bg-white shrink-0 flex flex-col sm:flex-row gap-3">
                        <Button variant="outline" onClick={() => setIsSheetSelectDialogOpen(false)} className="h-11 px-8 font-bold text-xs uppercase tracking-widest border-gray-300 w-full sm:w-auto">Cancel</Button>
                        <Button onClick={handleImport} disabled={selectedSheets.length === 0} className="h-11 px-10 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 w-full sm:w-auto">
                            Authorize Batch Import ({selectedSheets.length})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
