'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, FileSpreadsheet, CheckCircle, Terminal, History } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate } from '@/services/employee-service';
import { importConsolidatedLedger } from '@/services/vba-import-service';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const TARGET_SHEET_NAME = 'Consolidated Ledger';

export default function ImportPayrollPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { user } = useAuth();
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState<string | null>(null);

    useEffect(() => {
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        return () => unsubEmployees();
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) return;

        setIsProcessing(true);
        setFileName(file.name);
        setImportProgress("Reading spreadsheet...");

        try {
            const XLSX = await import('xlsx');
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                    // Find the target sheet by name (case-insensitive, trimmed) instead of
                    // blindly grabbing SheetNames[0]. Sheet order in the workbook is not
                    // guaranteed to put the Consolidated Ledger first.
                    const sheetName = workbook.SheetNames.find(
                        (name) => name.trim().toLowerCase() === TARGET_SHEET_NAME.toLowerCase()
                    );

                    if (!sheetName) {
                        toast({
                            title: 'Sheet Not Found',
                            description: `Could not find a sheet named "${TARGET_SHEET_NAME}" in this workbook. Available sheets: ${workbook.SheetNames.join(', ')}`,
                            variant: 'destructive',
                        });
                        setFileName(null);
                        setImportProgress(null);
                        setIsProcessing(false);
                        return;
                    }

                    const worksheet = workbook.Sheets[sheetName];
                    const grid = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null });

                    // Sanity check: header row 2 (index 1), column B should read "Employee".
                    // Catches future layout drift before we burn a full parse pass on bad data.
                    const headerRow = grid[1] || [];
                    if (String(headerRow[0] || '').trim().toLowerCase() !== 'employee') {
                        toast({
                            title: 'Unexpected Sheet Layout',
                            description: `Row 2, Column A was expected to read "Employee" but found "${headerRow[0] ?? '(empty)'}". The ledger layout may have changed.`,
                            variant: 'destructive',
                        });
                        setFileName(null);
                        setImportProgress(null);
                        setIsProcessing(false);
                        return;
                    }

                    setImportProgress("Mapping data blocks...");
                    const result = await importConsolidatedLedger(grid, user.username, (current, total) => {
                        setImportProgress(`Processing row ${current} of ${total}`);
                    });

                    toast({ 
                        title: 'Import Successful', 
                        description: `Finalized: ${result.payroll} Payroll, ${result.behaviorLedger} Behavior, ${result.bonusSummaries} Bonus, and ${result.behaviorAnalytics} Analytics records.` 
                    });
                    
                    setTimeout(() => {
                        router.push('/hr/payroll');
                    }, 1000);
                } catch (error: any) {
                    console.error("File processing error:", error);
                    toast({ title: 'Import Failed', description: error.message || 'Failed to read the Excel file.', variant: 'destructive' });
                    setFileName(null);
                    setImportProgress(null);
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setIsProcessing(false);
            toast({ title: 'System Error', description: 'Failed to load spreadsheet processor.', variant: 'destructive' });
        }
        
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Ledger Master Importer</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Update entire workforce ecosystem from the Consolidated Ledger.</p>
                </div>
            </header>
            
            <Card className="border-dashed shadow-none bg-primary/[0.02] border-primary/20">
                <CardHeader>
                    <CardTitle className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-primary"/>
                        VBA Consolidation Source
                    </CardTitle>
                    <CardDescription>
                        Upload your Master Ledger spreadsheet. The system will automatically map:
                        Annual Bonus Summary, Monthly Accruals, Behavior Metrics, Financial Payroll, and qualitative Insights.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 gap-6">
                     <div className={cn(
                         "w-20 h-20 rounded-full flex items-center justify-center transition-all",
                         isProcessing ? "bg-primary/20 scale-110" : "bg-primary/10"
                     )}>
                        {isProcessing ? <Loader2 className="h-10 w-10 text-primary animate-spin" /> : <FileSpreadsheet className="h-10 w-10 text-primary" />}
                     </div>

                     <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xls,.xlsx,.xlsm" className="hidden" />
                     
                     <div className="text-center space-y-4">
                        <Button 
                            onClick={() => fileInputRef.current?.click()} 
                            disabled={isProcessing} 
                            size="lg" 
                            className="h-12 px-10 font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20"
                        >
                            {isProcessing ? 'Processing Master Grid...' : 'Authorize Cloud Import'}
                        </Button>
                        
                        {importProgress && (
                            <p className="text-[10px] font-black uppercase text-primary animate-pulse tracking-widest">
                                {importProgress}
                            </p>
                        )}
                        
                        {fileName && !isProcessing && (
                            <p className="text-[10px] font-black uppercase text-emerald-600 flex items-center justify-center gap-1.5">
                                <CheckCircle className="h-3 w-3"/> Selected: {fileName}
                            </p>
                        )}
                     </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-muted/10 border-none shadow-none ring-1 ring-black/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <History className="h-3 w-3"/>
                            Versioning Rule
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                            The system uses deterministic keys. Re-uploading the same ledger will <b>overwrite</b> existing entries for matching periods, ensuring zero duplication.
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-muted/10 border-none shadow-none ring-1 ring-black/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <CheckCircle className="h-3 w-3"/>
                            Auto-Onboarding
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                            Missing employees detected in the ledger will be automatically onboarded with a default 'Working' status profile.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
