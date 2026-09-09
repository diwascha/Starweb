'use client';

import { useRef, useState } from 'react';
import { Terminal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';
import {
    previewLedgerSheet,
    importLedgerWorkbook,
    NON_DATA_SHEETS,
    type LedgerSheetPreview,
    type ConfirmedSheetMapping,
} from '@/services/attendance/ledger-import';

interface MappingRow extends LedgerSheetPreview {
    year: string;
    month: string;
    includeAttendance: boolean;
    includePayroll: boolean;
}

/**
 * Self-contained "Import Consolidated Ledger" action: file picker, sheet
 * detection, the year/month confirmation dialog, and the commit step. Drop
 * it wherever historical attendance/payroll data should be importable -
 * currently the Attendance Logs page, since that's where its output lands.
 */
export default function LedgerImportButton({ onImportComplete }: { onImportComplete?: () => void }) {
    const { user } = useAuth();
    const { toast } = useToast();

    const [isReadingLedger, setIsReadingLedger] = useState(false);
    const [isImportingLedger, setIsImportingLedger] = useState(false);
    const [ledgerImportProgress, setLedgerImportProgress] = useState<string | null>(null);
    const ledgerFileInputRef = useRef<HTMLInputElement>(null);
    const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
    const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
    const [hasConsolidatedSummary, setHasConsolidatedSummary] = useState(false);
    const [includeConsolidatedSummary, setIncludeConsolidatedSummary] = useState(true);
    const ledgerSheetsRef = useRef<Map<string, any[][]>>(new Map());

    // Phase 1: read the workbook and build a per-sheet preview for the user
    // to confirm (or correct) before anything is written.
    const handleLedgerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsReadingLedger(true);
        try {
            const XLSX = await import('xlsx');
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = new Uint8Array(event.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                    const candidateSheets = workbook.SheetNames.filter(
                        name => !NON_DATA_SHEETS.has(name.trim().toLowerCase())
                    );

                    const sheetsMap = new Map<string, any[][]>();
                    const rows: MappingRow[] = [];
                    let foundSummary = false;
                    const fallbackYear = new NepaliDate().getYear();
                    const fallbackMonth = new NepaliDate().getMonth();

                    for (const sheetName of candidateSheets) {
                        const grid = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: null });
                        sheetsMap.set(sheetName, grid);
                        const preview = previewLedgerSheet(sheetName, grid);
                        if (preview.isConsolidatedSummary) {
                            foundSummary = true;
                        }
                        // A sheet named "Consolidated Ledger" that carries no
                        // normal per-row attendance/payroll data is purely the
                        // VBA 5-section summary format - handled exclusively
                        // via the "Also Import" checkbox below, not this table.
                        if (preview.isConsolidatedSummary && !preview.hasAttendance && !preview.hasPayroll) {
                            continue;
                        }
                        rows.push({
                            ...preview,
                            year: String(preview.guessedYear ?? fallbackYear),
                            month: String(preview.guessedMonth ?? fallbackMonth),
                            includeAttendance: preview.hasAttendance,
                            includePayroll: preview.hasPayroll,
                        });
                    }

                    if (rows.length === 0 && !foundSummary) {
                        toast({ title: 'Nothing Recognizable', description: `No attendance/payroll sheets or a "Consolidated Ledger" summary sheet were found. Available sheets: ${workbook.SheetNames.join(', ')}`, variant: 'destructive' });
                        return;
                    }

                    ledgerSheetsRef.current = sheetsMap;
                    setMappingRows(rows);
                    setHasConsolidatedSummary(foundSummary);
                    setIncludeConsolidatedSummary(foundSummary);
                    setIsMappingDialogOpen(true);
                } catch (error: any) {
                    toast({ title: 'Could Not Read File', description: error.message || 'Failed to parse the Excel file.', variant: 'destructive' });
                } finally {
                    setIsReadingLedger(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setIsReadingLedger(false);
            toast({ title: 'System Error', description: 'Failed to load spreadsheet processor.', variant: 'destructive' });
        }
        if (ledgerFileInputRef.current) ledgerFileInputRef.current.value = '';
    };

    // Phase 2: commit exactly what the user confirmed in the mapping dialog.
    const handleConfirmLedgerImport = async () => {
        if (!user) return;
        const mappings: ConfirmedSheetMapping[] = mappingRows
            .filter(r => r.includeAttendance || r.includePayroll)
            .map(r => ({
                sheetName: r.sheetName,
                year: parseInt(r.year, 10),
                month: parseInt(r.month, 10),
                includeAttendance: r.includeAttendance,
                includePayroll: r.includePayroll,
            }));

        if (mappings.length === 0 && !includeConsolidatedSummary) {
            toast({ title: 'Nothing Selected', description: 'Select at least one sheet to import.', variant: 'destructive' });
            return;
        }

        setIsImportingLedger(true);
        setIsMappingDialogOpen(false);
        setLedgerImportProgress('Starting import...');
        try {
            const result = await importLedgerWorkbook(
                ledgerSheetsRef.current,
                mappings,
                includeConsolidatedSummary && hasConsolidatedSummary,
                user.username,
                (label) => setLedgerImportProgress(`Processing: ${label}`)
            );

            toast({
                title: 'Ledger Import Complete',
                description: `${result.attendanceRecords} attendance records, ${result.payrollRecords} payroll records${result.bonusSummaries || result.behaviorLedger || result.behaviorAnalytics ? `, ${result.bonusSummaries} bonus summaries, ${result.behaviorLedger} behavior ledger, ${result.behaviorAnalytics} analytics entries` : ''}${result.newEmployees ? `, ${result.newEmployees} new employees onboarded` : ''}.${result.skippedSheets.length ? ` Skipped: ${result.skippedSheets.join(', ')}.` : ''}`,
            });
            onImportComplete?.();
        } catch (error: any) {
            toast({ title: 'Ledger Import Failed', description: error.message || 'Failed to import the confirmed sheets.', variant: 'destructive' });
        } finally {
            setIsImportingLedger(false);
            setLedgerImportProgress(null);
        }
    };

    const updateMappingRow = (sheetName: string, updates: Partial<MappingRow>) => {
        setMappingRows(prev => prev.map(r => r.sheetName === sheetName ? { ...r, ...updates } : r));
    };

    return (
        <>
            <input
                type="file"
                ref={ledgerFileInputRef}
                onChange={handleLedgerFileUpload}
                accept=".xls,.xlsx,.xlsm"
                className="hidden"
            />
            <Button
                variant="outline"
                onClick={() => ledgerFileInputRef.current?.click()}
                disabled={isImportingLedger || isReadingLedger}
                className="h-10 font-black text-[10px] uppercase tracking-widest border-dashed border-primary/30 text-primary hover:bg-primary/5"
            >
                {(isImportingLedger || isReadingLedger) ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Terminal className="mr-2 h-4 w-4"/>}
                {isReadingLedger ? 'Reading...' : isImportingLedger ? 'Processing...' : 'Import Consolidated Ledger'}
            </Button>

            {isImportingLedger && (
                <Card className="bg-primary/5 border-primary/20 animate-in fade-in zoom-in-95">
                    <CardContent className="py-6 flex items-center gap-4">
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                        <div className="space-y-1">
                            <p className="text-sm font-black uppercase text-gray-900">Processing Master Ledger</p>
                            {ledgerImportProgress && (
                                <p className="text-[10px] text-primary font-black uppercase tracking-widest animate-pulse">
                                    {ledgerImportProgress}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">Confirm Sheet Placement</DialogTitle>
                        <DialogDescription>
                            Confirm the year and month each sheet belongs to before importing. Attendance rows use their own dates when present; the payroll block has no date column of its own, so this is what files it under a period.
                        </DialogDescription>
                    </DialogHeader>

                    {hasConsolidatedSummary && (
                        <label className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 cursor-pointer">
                            <Checkbox checked={includeConsolidatedSummary} onCheckedChange={(v) => setIncludeConsolidatedSummary(Boolean(v))} />
                            <div>
                                <p className="text-xs font-black uppercase text-gray-900">Also Import "Consolidated Ledger" Summary</p>
                                <p className="text-[10px] text-muted-foreground">Imports its own pre-computed Bonus, Behavior, and Analytics sections.</p>
                            </div>
                        </label>
                    )}

                    <div className="border rounded-lg overflow-hidden">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead className="pl-4 font-bold">Sheet</TableHead>
                                    <TableHead className="text-center font-bold">Year (BS)</TableHead>
                                    <TableHead className="text-center font-bold">Month (BS)</TableHead>
                                    <TableHead className="text-center font-bold">Attendance</TableHead>
                                    <TableHead className="text-center font-bold">Payroll</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {mappingRows.map(row => (
                                    <TableRow key={row.sheetName} className="h-14">
                                        <TableCell className="pl-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900">{row.sheetName}</span>
                                                <span className="text-[9px] text-muted-foreground uppercase">
                                                    {row.rowCount} rows{!row.hasAttendance && !row.hasPayroll ? ' - no recognizable data' : ''}
                                                    {row.isConsolidatedSummary ? ' - also the Consolidated Ledger summary sheet' : ''}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Select value={row.year} onValueChange={(v) => updateMappingRow(row.sheetName, { year: v })}>
                                                <SelectTrigger className="h-8 w-[90px] mx-auto"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {Array.from({ length: 15 }, (_, i) => 2077 + i).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Select value={row.month} onValueChange={(v) => updateMappingRow(row.sheetName, { month: v })}>
                                                <SelectTrigger className="h-8 w-[120px] mx-auto"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Checkbox
                                                checked={row.includeAttendance}
                                                disabled={!row.hasAttendance}
                                                onCheckedChange={(v) => updateMappingRow(row.sheetName, { includeAttendance: Boolean(v) })}
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Checkbox
                                                checked={row.includePayroll}
                                                disabled={!row.hasPayroll}
                                                onCheckedChange={(v) => updateMappingRow(row.sheetName, { includePayroll: Boolean(v) })}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {mappingRows.length === 0 && (
                                    <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground italic">No monthly sheets detected - only the summary sheet, if selected above, will be imported.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMappingDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmLedgerImport} className="font-black text-xs uppercase tracking-widest">
                            Confirm & Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
