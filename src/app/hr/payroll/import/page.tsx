'use client';

import { useState, useEffect, useRef } from 'react';
import type { Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, Calendar, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { importPayrollFromSheet, getPayrollYears } from '@/services/payroll-service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NepaliDate from 'nepali-date-converter';
import { cn } from '@/lib/utils';

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

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];


export default function ImportPayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [bsYears, setBsYears] = useState<number[]>([]);

    const [isSheetSelectDialogOpen, setIsSheetSelectDialogOpen] = useState(false);
    const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<SelectedSheet[]>([]);
    const [importProgress, setImportProgress] = useState<string | null>(null);

    useEffect(() => {
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        getPayrollYears().then(years => {
            const currentYear = new NepaliDate().getYear();
            const allYears = Array.from(new Set([...years, currentYear])).sort((a,b) => b-a);
            setBsYears(allYears);
        });
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
            // Default detected values for clarity, can be overriden manually
            let detectedMonth = String(currentNepaliDate.getMonth());
            let detectedYear = String(bsYears[0] || currentNepaliDate.getYear());
            
            const lowerName = sheetName.toLowerCase();
            const monthMatch = nepaliMonths.find(m => lowerName.includes(m.name.toLowerCase()));
            if (monthMatch) detectedMonth = String(monthMatch.value);
            
            const yearMatch = lowerName.match(/\d{4}/);
            if (yearMatch) detectedYear = yearMatch[0];

            setSelectedSheets(prev => [...prev, {
                name: sheetName,
                year: detectedYear,
                month: detectedMonth
            }]);
        } else {
            setSelectedSheets(prev => prev.filter(s => s.name !== sheetName));
        }
    };

    const handleSheetPeriodChange = (sheetName: string, type: 'year' | 'month', value: string) => {
        setSelectedSheets(prev => prev.map(s => s.name === sheetName ? { ...s, [type]: value } : s));
    };


    const handleImport = async () => {
        if (selectedSheets.length === 0 || !user) {
            toast({title: 'Error', description: 'Please select at least one sheet to import.', variant: 'destructive'});
            return;
        }
        
        setIsSheetSelectDialogOpen(false);
        setIsProcessing(true);
        setImportProgress(`Starting...`);

        let totalCreated = 0;
        let totalUpdated = 0;
        let totalNewEmployees = 0;

        for (const selected of selectedSheets) {
            const sheetInfo = availableSheets.find(s => s.name === selected.name);
            if (sheetInfo) {
                setImportProgress(`Processing sheet: ${sheetInfo.name}...`);
                 try {
                    const result = await importPayrollFromSheet(
                        sheetInfo.jsonData,
                        employees,
                        user.username, 
                        parseInt(selected.year, 10), 
                        parseInt(selected.month, 10)
                    );
                    totalCreated += result.createdCount;
                    totalUpdated += result.updatedCount;
                    totalNewEmployees += result.newEmployeesCount;
                } catch (error: any) {
                    toast({
                        title: `Import Error in ${sheetInfo.name}`,
                        description: error.message || 'An unexpected error occurred during import.',
                        variant: 'destructive',
                        duration: 8000
                    });
                    setImportProgress(null);
                    setIsProcessing(false);
                    return;
                }
            }
        }
        
        toast({ 
            title: 'Import Complete', 
            description: `${totalCreated} records created, ${totalUpdated} records updated. ${totalNewEmployees} new employees detected and onboarded.` 
        });
        
        setImportProgress(null);
        setIsProcessing(false);
        setFileName(null);
        
        getPayrollYears().then(setBsYears);
    };


    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Payroll Bulk Importer</h1>
                <p className="text-muted-foreground text-sm font-medium">Manually map spreadsheet sheets to organizational periods.</p>
            </header>
            
            <Card className="border-dashed shadow-none bg-muted/5">
                <CardHeader>
                    <CardTitle className="text-sm font-black uppercase text-gray-900">Upload Source</CardTitle>
                    <CardDescription>Supported formats: .xls, .xlsx, .xlsm. Unrecognized names will be automatically onboarded.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xls,.xlsx,.xlsm" className="hidden" />
                     <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} size="lg" className="h-12 px-8 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/10">
                         {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                         {isProcessing ? (importProgress || 'Mapping Data...') : 'Identify Local Excel File'}
                     </Button>
                     {fileName && <p className="text-[10px] font-black uppercase text-primary mt-3 px-1 flex items-center gap-1.5"><CheckCircle className="h-3 w-3"/> Selected: {fileName}</p>}
                </CardContent>
            </Card>

            <Dialog open={isSheetSelectDialogOpen} onOpenChange={setIsSheetSelectDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
                    <DialogHeader className="p-6 border-b bg-muted/10 shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase">Period Alignment</DialogTitle>
                        <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select the target Nepali Month for each identified sheet.</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-gray-50/30">
                        <div className="p-4 border-b flex items-center space-x-2 bg-white sticky top-0 z-10 shrink-0">
                            <Checkbox
                                id="select-all-sheets"
                                onCheckedChange={(checked) => {
                                    const currentNepaliDate = new NepaliDate();
                                    const defaultYear = String(bsYears[0] || currentNepaliDate.getYear());
                                    const defaultMonth = String(currentNepaliDate.getMonth());
                                    setSelectedSheets(
                                        checked ? availableSheets.map(s => ({ name: s.name, year: defaultYear, month: defaultMonth })) : []
                                    );
                                }}
                                checked={selectedSheets.length === availableSheets.length && availableSheets.length > 0}
                            />
                            <Label htmlFor="select-all-sheets" className="font-black text-xs uppercase tracking-tight text-gray-900">Process All Identified Sheets</Label>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-3">
                                {availableSheets.map(sheet => {
                                    const currentSelection = selectedSheets.find(s => s.name === sheet.name);
                                    const isSelected = !!currentSelection;
                                    return (
                                        <div key={sheet.name} className={cn(
                                            "p-4 rounded-xl border-2 transition-all space-y-4",
                                            isSelected ? "border-primary bg-primary/[0.03] shadow-sm" : "border-gray-100 bg-gray-50/50"
                                        )}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-3">
                                                    <Checkbox
                                                        id={`sheet-${sheet.name}`}
                                                        onCheckedChange={(checked) => handleSheetSelectionChange(sheet.name, !!checked)}
                                                        checked={isSelected}
                                                    />
                                                    <div className="flex flex-col">
                                                        <Label htmlFor={`sheet-${sheet.name}`} className="font-black text-sm text-gray-900 uppercase tracking-tight">{sheet.name}</Label>
                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{sheet.rowCount} data lines found</span>
                                                    </div>
                                                </div>
                                                {isSelected && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 h-6 uppercase text-[9px] font-black">Targeted</Badge>}
                                            </div>
                                            {isSelected && (
                                                <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[9px] font-black uppercase text-primary tracking-widest px-1">Target BS Year</Label>
                                                        <Select value={currentSelection.year} onValueChange={(value) => handleSheetPeriodChange(sheet.name, 'year', value)}>
                                                            <SelectTrigger className="h-9 bg-white border-primary/20"><SelectValue /></SelectTrigger>
                                                            <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[9px] font-black uppercase text-primary tracking-widest px-1">Target BS Month</Label>
                                                        <Select value={currentSelection.month} onValueChange={(value) => handleSheetPeriodChange(sheet.name, 'month', value)}>
                                                            <SelectTrigger className="h-9 bg-white border-primary/20"><SelectValue /></SelectTrigger>
                                                            <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
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
                    <DialogFooter className="p-6 border-t bg-white shrink-0">
                        <Button variant="outline" onClick={() => setIsSheetSelectDialogOpen(false)} className="h-11 px-8 font-bold text-xs uppercase tracking-widest border-gray-300">Cancel</Button>
                        <Button onClick={handleImport} disabled={selectedSheets.length === 0} className="h-11 px-10 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            Authorize Batch Import ({selectedSheets.length})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}