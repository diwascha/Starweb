
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, ListChecks, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { importPayrollFromSheet } from '@/services/payroll-service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


interface SheetInfo {
  name: string;
  jsonData: any[][];
}

interface ValidationResult {
    totalRows: number;
    validRows: any[];
    errors: { row: number, message: string }[];
}

export default function ImportPayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    
    useEffect(() => {
        const unsub = onEmployeesUpdate(setEmployees);
        return () => unsub();
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsParsing(true);
        setFileName(file.name);
        setParsedData(null);
        setValidationResult(null);

        const XLSX = await import('xlsx');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
                setParsedData(jsonData);
                validateData(jsonData);
            } catch (error) {
                console.error("File processing error:", error);
                toast({ title: 'Error', description: 'Failed to read the Excel file.', variant: 'destructive' });
            } finally {
                setIsParsing(false);
            }
        };
        reader.readAsArrayBuffer(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const validateData = (data: any[]) => {
        const errors: { row: number, message: string }[] = [];
        const validRows: any[] = [];
        const employeeNameMap = new Map(employees.map(e => [e.name.toLowerCase(), e.id]));

        data.forEach((row, index) => {
            const employeeName = row['Name']?.trim();
            if (!employeeName) {
                errors.push({ row: index + 2, message: "Employee 'Name' is missing." });
                return;
            }
            if (!employeeNameMap.has(employeeName.toLowerCase())) {
                errors.push({ row: index + 2, message: `Employee '${employeeName}' not found in the database.` });
                return;
            }
            if (isNaN(Number(row['BS Year'])) || isNaN(Number(row['BS Month']))) {
                errors.push({ row: index + 2, message: "'BS Year' and 'BS Month' must be valid numbers." });
                return;
            }
            if (isNaN(Number(row['Net Payment']))) {
                errors.push({ row: index + 2, message: "'Net Payment' must be a valid number." });
                return;
            }

            validRows.push({
                ...row,
                employeeId: employeeNameMap.get(employeeName.toLowerCase())
            });
        });
        setValidationResult({ totalRows: data.length, validRows, errors });
    };

    const handleImport = async () => {
        if (!validationResult || !user) return;
        setIsImporting(true);
        try {
            const { createdCount, updatedCount } = await importPayrollFromSheet(validationResult.validRows, user.username);
            toast({
                title: 'Import Complete',
                description: `${createdCount} new records created, ${updatedCount} records updated.`
            });
            setParsedData(null);
            setValidationResult(null);
            setFileName(null);
        } catch (error: any) {
            toast({ title: 'Import Failed', description: error.message, variant: 'destructive' });
        } finally {
            setIsImporting(false);
        }
    };


    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Import Payroll</h1>
                <p className="text-muted-foreground">Upload an Excel file to import historical payroll data.</p>
            </header>
            
            <Card>
                <CardHeader>
                    <CardTitle>Step 1: Upload File</CardTitle>
                    <CardDescription>Select the Excel file containing payroll data from columns Q to AE.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />
                     <Button onClick={() => fileInputRef.current?.click()} disabled={isParsing || isImporting}>
                         {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                         {isParsing ? 'Parsing...' : 'Choose Excel File'}
                     </Button>
                     {fileName && <p className="text-sm text-muted-foreground mt-2">Selected: {fileName}</p>}
                </CardContent>
            </Card>
            
            {validationResult && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Step 2: Validate & Import</CardTitle>
                        <CardDescription>Review the validation results below. Records with errors will be skipped.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-muted-foreground" /> Total Rows: {validationResult.totalRows}</div>
                            <div className="flex items-center gap-2 text-green-600"><CheckCircle className="h-5 w-5" /> Valid for Import: {validationResult.validRows.length}</div>
                            <div className="flex items-center gap-2 text-red-600"><XCircle className="h-5 w-5" /> Rows with Errors: {validationResult.errors.length}</div>
                        </div>

                        {validationResult.errors.length > 0 && (
                             <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg max-h-60 overflow-y-auto">
                                <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Errors Found</h4>
                                <ul className="space-y-1 text-sm text-destructive/80">
                                    {validationResult.errors.map((err, i) => (
                                        <li key={i}>- Row {err.row}: {err.message}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        <Button onClick={handleImport} disabled={isImporting || validationResult.validRows.length === 0}>
                             {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Import {validationResult.validRows.length} Records
                        </Button>
                    </CardContent>
                 </Card>
            )}

        </div>
    );
}
