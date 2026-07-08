'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Upload, 
    Trash2, 
    Loader2, 
    Search, 
    User,
    CalendarIcon,
    AlertCircle,
    X,
    Plus,
    History
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onRawLogsUpdate, addRawMachineLogs, deleteRawLog, deleteRawLogsForMonth, deleteAllRawLogs } from '@/services/attendance-service';
import { cn, toNepaliDate, formatTimeForDisplay, getAttendanceBadgeVariant } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function RawMachineLogsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [importProgress, setImportProgress] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCleaningAll, setIsCleaningAll] = useState(false);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<string>(String(new NepaliDate().getYear()));
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new NepaliDate().getMonth()));

    // Import Dialog
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [availableSheets, setAvailableSheets] = useState<any[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<string[]>([]);

    useEffect(() => {
        setIsLoading(true);
        return onRawLogsUpdate((data) => {
            setLogs(data);
            setIsLoading(false);
        });
    }, []);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        logs.forEach(l => {
            if (l.bsYear) years.add(l.bsYear);
        });
        const result = Array.from(years).sort((a, b) => b - a);
        if (result.length === 0) return [new NepaliDate().getYear()];
        return result;
    }, [logs]);

    const availableMonths = useMemo(() => {
        const yearInt = parseInt(selectedYear);
        const months = new Set<number>();
        logs.filter(l => l.bsYear === yearInt).forEach(l => {
            if (l.bsMonth !== undefined) months.add(l.bsMonth);
        });
        
        const result = Array.from(months).sort((a, b) => a - b);
        
        // If no logs for this year, show all months so user can still select something
        if (result.length === 0) return NEPALI_MONTHS;
        
        return NEPALI_MONTHS.filter(m => result.includes(m.value));
    }, [logs, selectedYear]);

    // Ensure selection is valid when years/months change
    useEffect(() => {
        if (!availableYears.includes(parseInt(selectedYear))) {
            setSelectedYear(String(availableYears[0]));
        }
    }, [availableYears, selectedYear]);

    useEffect(() => {
        const monthInt = parseInt(selectedMonth);
        const isValid = availableMonths.some(m => m.value === monthInt);
        if (!isValid && availableMonths.length > 0) {
            setSelectedMonth(String(availableMonths[0].value));
        }
    }, [availableMonths, selectedMonth]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const XLSX = await import('xlsx');
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                
                const sheetsInfo = workbook.SheetNames.map(name => {
                    const ws = workbook.Sheets[name];
                    const json = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
                    return { name, rowCount: json.length > 1 ? json.length - 1 : 0, jsonData: json };
                }).filter(s => s.rowCount > 0);

                if (sheetsInfo.length === 0) {
                    toast({ title: 'Invalid File', description: 'No data rows found in Excel.' });
                    return;
                }

                setAvailableSheets(sheetsInfo);
                setIsImportDialogOpen(true);
            } catch {
                toast({ title: 'Error', description: 'Failed to parse Excel file.', variant: 'destructive' });
            }
        };
        reader.readAsArrayBuffer(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirmImport = async () => {
        if (!user || selectedSheets.length === 0) return;
        setIsImportDialogOpen(false);
        setImportProgress('Initializing...');

        try {
            let total = 0;
            for (const sheetName of selectedSheets) {
                const sheet = availableSheets.find(as => as.name === sheetName);
                if (sheet) {
                    const { logCount } = await addRawMachineLogs(
                        sheet.jsonData,
                        user.username,
                        sheetName,
                        (p) => setImportProgress(`Importing ${sheetName}: ${p} records`)
                    );
                    total += logCount;
                }
            }
            toast({ title: 'Data Dump Complete', description: `${total} machine logs stored.` });
        } catch (err: any) {
            toast({ title: 'Import Failed', description: err.message, variant: 'destructive' });
        } finally {
            setImportProgress(null);
            setSelectedSheets([]);
        }
    };

    const handleDeleteMonth = async () => {
        setIsDeleting(true);
        try {
            await deleteRawLogsForMonth(parseInt(selectedYear), parseInt(selectedMonth));
            toast({ title: 'Raw Logs Cleared', description: `Deleted all raw logs for ${NEPALI_MONTHS[parseInt(selectedMonth)].name} ${selectedYear}.` });
        } catch {
            toast({ title: 'Error', description: 'Failed to clear raw logs.', variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleClearAll = async () => {
        setIsCleaningAll(true);
        try {
            await deleteAllRawLogs();
            toast({ title: 'System Purge Complete', description: 'All raw machine logs have been permanently deleted.' });
        } catch {
            toast({ title: 'Error', description: 'Failed to purge raw logs.', variant: 'destructive' });
        } finally {
            setIsCleaningAll(false);
        }
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(l => {
            const matchesSearch = (l.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesPeriod = l.bsYear === parseInt(selectedYear) && l.bsMonth === parseInt(selectedMonth);
            return matchesSearch && matchesPeriod;
        });
    }, [logs, searchQuery, selectedYear, selectedMonth]);

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Machine Data Dump</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Immutable storage for raw attendance machine logs mapped to BS dates.</p>
                </div>
                <div className="flex gap-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" className="h-10 text-destructive border-destructive/20 hover:bg-red-50 font-bold uppercase text-[10px] tracking-widest" disabled={logs.length === 0 || isCleaningAll}>
                                {isCleaningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5"/> : <History className="mr-1.5 h-3.5 w-3.5" />}
                                Clear All History
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Purge All Machine Data?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete <b>EVERY</b> raw log in the database across all years and months. 
                                    This is a critical administrative action. Proceed with caution.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-white hover:bg-destructive/90">Yes, Purge Everything</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx,.xls" />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={!!importProgress} className="h-10 font-bold uppercase text-xs tracking-widest shadow-lg">
                        {importProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                        {importProgress ? 'Dumping...' : 'Direct Machine Import'}
                    </Button>
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white">
                <CardHeader className="bg-muted/20 border-b py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-wrap gap-4 items-end flex-1">
                        <div className="space-y-1.5 min-w-[200px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Search Records</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Filter raw logs..." className="pl-8 h-9 text-xs bg-white" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                            </div>
                        </div>
                        <div className="space-y-1.5 w-[120px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">BS Year</Label>
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {availableYears.map(y => <SelectItem key={`year-filter-${y}`} value={String(y)}>{y}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 w-[150px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">BS Month</Label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {availableMonths.map(m => <SelectItem key={`month-filter-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2">
                            <Badge variant="outline" className="h-9 font-black uppercase tracking-tighter bg-gray-50 border-gray-200">
                                {filteredLogs.length} Records
                            </Badge>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 text-destructive hover:bg-red-50 font-bold uppercase text-[10px]" disabled={filteredLogs.length === 0 || isDeleting}>
                                        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5"/> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                                        Clear Month
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Raw Machine Logs?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently remove all raw machine data for <b>{NEPALI_MONTHS[parseInt(selectedMonth)]?.name} {selectedYear}</b>. 
                                            This action is irreversible.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleDeleteMonth} className="bg-destructive text-white">Delete Now</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-auto">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent" key="header-row">
                                    <TableHead className="pl-6 font-bold">Employee Name</TableHead>
                                    <TableHead className="font-bold">Date (BS)</TableHead>
                                    <TableHead className="font-bold text-muted-foreground opacity-50">Date (AD)</TableHead>
                                    <TableHead className="font-bold">On Duty</TableHead>
                                    <TableHead className="font-bold">Off Duty</TableHead>
                                    <TableHead className="font-bold">Clock In</TableHead>
                                    <TableHead className="font-bold">Clock Out</TableHead>
                                    <TableHead className="font-bold text-center">Status</TableHead>
                                    <TableHead className="text-right pr-6 font-bold">System</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow key="loading-row"><TableCell colSpan={9} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                                ) : filteredLogs.map(l => (
                                    <TableRow key={l.id} className="h-12 border-b-gray-50 group hover:bg-muted/20 transition-colors">
                                        <TableCell className="pl-6 font-black text-gray-900">{l.employeeName}</TableCell>
                                        <TableCell className="font-mono font-bold text-blue-900">{toNepaliDate(l.date)}</TableCell>
                                        <TableCell className="font-mono text-gray-400 text-[10px]">{format(new Date(l.date), 'yyyy-MM-dd')}</TableCell>
                                        <TableCell className="text-muted-foreground font-medium">{formatTimeForDisplay(l.onDuty)}</TableCell>
                                        <TableCell className="text-muted-foreground font-medium">{formatTimeForDisplay(l.offDuty)}</TableCell>
                                        <TableCell className="font-bold text-blue-600">{formatTimeForDisplay(l.clockIn)}</TableCell>
                                        <TableCell className="font-bold text-blue-600">{formatTimeForDisplay(l.clockOut)}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={getAttendanceBadgeVariant(l.statusFromMachine as any)} className="text-[9px] uppercase font-black py-0">
                                                {l.statusFromMachine}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100" onClick={() => deleteRawLog(l.id)} title="Delete log entry">
                                                <Trash2 className="h-3.5 w-3.5"/>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!isLoading && filteredLogs.length === 0 && (
                                    <TableRow key="empty-row">
                                        <TableCell colSpan={9} className="h-60 text-center text-muted-foreground italic">
                                            <div className="flex flex-col items-center gap-3">
                                                <AlertCircle className="h-10 w-10 opacity-10"/>
                                                <p>No raw machine data found for this period.<br/><span className="text-[10px] font-bold uppercase not-italic">Upload an attendance machine Excel file to populate this dump.</span></p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Sheet Selection Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader className="p-6 border-b shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900">Configure Data Dump</DialogTitle>
                        <DialogDescription>Select the Excel sheets to import. The system will automatically map records to the correct BS periods based on their AD dates.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6">
                        <div className="space-y-4">
                            {availableSheets.map(sheet => (
                                <div key={sheet.name} className={cn(
                                    "p-4 rounded-xl border-2 transition-all flex items-center justify-between",
                                    selectedSheets.includes(sheet.name) ? "border-primary bg-primary/5 shadow-sm" : "border-gray-100 bg-gray-50/50"
                                )}>
                                    <div className="flex items-center gap-3">
                                        <Checkbox id={`check-${sheet.name}`} checked={selectedSheets.includes(sheet.name)} onCheckedChange={(v) => {
                                            if (v) setSelectedSheets([...selectedSheets, sheet.name]);
                                            else setSelectedSheets(selectedSheets.filter(s => s !== sheet.name));
                                        }} />
                                        <Label htmlFor={`check-${sheet.name}`} className="font-black text-sm">{sheet.name}</Label>
                                    </div>
                                    <Badge variant="secondary" className="uppercase text-[9px] font-black">{sheet.rowCount} rows detected</Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
                        <Button variant="outline" onClick={() => setIsImportDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest">Cancel</Button>
                        <Button onClick={handleConfirmImport} disabled={selectedSheets.length === 0} className="font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 px-8">
                            Start Automatic Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
