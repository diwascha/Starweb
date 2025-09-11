
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Employee, Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, ListChecks, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { importPayrollFromSheet, getPayrollYears } from '@/services/payroll-service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NepaliDate from 'nepali-date-converter';

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

interface ValidationResult {
    totalRows: number;
    validRows: any[];
    errors: { row: number, message: string }[];
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
                const workbook = XLSX.read(data, { type: 'array' });
                
                const sheetsInfo: SheetInfo[] = workbook.SheetNames.map(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });
                    return {
                        name: sheetName,
                        rowCount: jsonData.length > 1 ? jsonData.length - 1 : 0, // Exclude header
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
            setSelectedSheets(prev => [...prev, {
                name: sheetName,
                year: String(bsYears[0] || currentNepaliDate.getYear()),
                month: String(currentNepaliDate.getMonth())
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
        
        toast({ title: 'Import Complete', description: `${totalCreated} records created, ${totalUpdated} records updated.` });
        
        setImportProgress(null);
        setIsProcessing(false);
        setFileName(null);
        
        // Refresh years list
        getPayrollYears().then(setBsYears);
    };


    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Import Payroll</h1>
                <p className="text-muted-foreground">Upload an Excel file to import historical payroll data.</p>
            </header>
            
            <Card>
                <CardHeader>
                    <CardTitle>Upload File</CardTitle>
                    <CardDescription>Select the Excel file containing payroll data. You will be prompted to select which sheets to import.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />
                     <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                         {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                         {isProcessing ? (importProgress || 'Processing...') : 'Choose Excel File'}
                     </Button>
                     {fileName && <p className="text-sm text-muted-foreground mt-2">Selected: {fileName}</p>}
                </CardContent>
            </Card>

            <Dialog open={isSheetSelectDialogOpen} onOpenChange={setIsSheetSelectDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Select Sheets to Import</DialogTitle>
                        <DialogDescription>Choose sheets and their target period. Data will be mapped to the selected Nepali month and year.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 border-b pb-2">
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
                                <Label htmlFor="select-all-sheets" className="font-bold">Select All Sheets</Label>
                            </div>
                            <ScrollArea className="h-[300px]">
                                {availableSheets.map(sheet => {
                                    const currentSelection = selectedSheets.find(s => s.name === sheet.name);
                                    const isSelected = !!currentSelection;
                                    return (
                                        <div key={sheet.name} className="p-2 rounded-md hover:bg-muted space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`sheet-${sheet.name}`}
                                                    onCheckedChange={(checked) => handleSheetSelectionChange(sheet.name, !!checked)}
                                                    checked={isSelected}
                                                />
                                                <Label htmlFor={`sheet-${sheet.name}`} className="flex-1">{sheet.name}</Label>
                                                <Badge variant="secondary">{sheet.rowCount} records</Badge>
                                            </div>
                                            {isSelected && (
                                                <div className="pl-6 flex items-center gap-2">
                                                    <Select value={currentSelection.year} onValueChange={(value) => handleSheetPeriodChange(sheet.name, 'year', value)}>
                                                        <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                                                        <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                    <Select value={currentSelection.month} onValueChange={(value) => handleSheetPeriodChange(sheet.name, 'month', value)}>
                                                        <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
                                                        <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </ScrollArea>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSheetSelectDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleImport} disabled={selectedSheets.length === 0}>Import Selected ({selectedSheets.length})</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
