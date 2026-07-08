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
    Plus
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { onRawLogsUpdate, addRawMachineLogs, deleteRawLog } from '@/services/attendance-service';
import { cn, toNepaliDate, formatTimeForDisplay } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import NepaliDate from 'nepali-date-converter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

export default function RawMachineLogsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [importProgress, setImportProgress] = useState<string | null>(null);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<string>(String(new NepaliDate().getYear()));
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new NepaliDate().getMonth()));

    // Import Dialog
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [availableSheets, setAvailableSheets] = useState<any[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<{ name: string; periods: { year: string; month: string }[] }[]>([]);

    useEffect(() => {
        setIsLoading(true);
        return onRawLogsUpdate((data) => {
            setLogs(data);
            setIsLoading(false);
        });
    }, []);

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
            for (const sheetSelection of selectedSheets) {
                const sheet = availableSheets.find(as => as.name === sheetSelection.name);
                if (sheet) {
                    const periods = sheetSelection.periods.map(p => ({ 
                        year: parseInt(p.year), 
                        month: parseInt(p.month) 
                    }));
                    
                    const { logCount } = await addRawMachineLogs(
                        sheet.jsonData,
                        user.username,
                        periods,
                        sheetSelection.name,
                        (p) => setImportProgress(`Importing ${sheetSelection.name}: ${p} records`)
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

    const filteredLogs = useMemo(() => {
        return logs.filter(l => {
            const matchesSearch = l.employeeName.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesPeriod = l.bsYear === parseInt(selectedYear) && l.bsMonth === parseInt(selectedMonth);
            return matchesSearch && matchesPeriod;
        });
    }, [logs, searchQuery, selectedYear, selectedMonth]);

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Machine Data Dump</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Immutable storage for raw attendance machine logs.</p>
                </div>
                <div className="flex gap-2">
                    <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx,.xls" />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={!!importProgress} className="h-10 font-bold uppercase text-xs tracking-widest shadow-lg">
                        {importProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                        {importProgress ? 'Dumping...' : 'Direct Machine Import'}
                    </Button>
                </div>
            </header>

            <Card className="shadow-sm border-gray-100 bg-white">
                <CardHeader className="bg-muted/20 border-b py-4 px-6 flex flex-row items-center justify-between">
                    <div className="flex gap-4 items-end flex-1">
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
                                    {[2080, 2081, 2082].map(y => <SelectItem key={`year-${y}`} value={String(y)}>{y}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 w-[150px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">BS Month</Label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {NEPALI_MONTHS.map(m => <SelectItem key={`month-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <Badge variant="outline" className="h-8 font-black uppercase tracking-tighter bg-gray-50 border-gray-200">
                        Total Dump: {filteredLogs.length} Records
                    </Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="max-h-[600px] overflow-auto">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold">Employee Name</TableHead>
                                    <TableHead className="font-bold">Date (AD)</TableHead>
                                    <TableHead className="font-bold">On Duty</TableHead>
                                    <TableHead className="font-bold">Off Duty</TableHead>
                                    <TableHead className="font-bold">Clock In</TableHead>
                                    <TableHead className="font-bold">Clock Out</TableHead>
                                    <TableHead className="font-bold text-center">Status (Absent)</TableHead>
                                    <TableHead className="text-right pr-6 font-bold">System</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow key="loading-row"><TableCell colSpan={8} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                                ) : filteredLogs.map(l => (
                                    <TableRow key={l.id} className="h-12 border-b-gray-50 group hover:bg-muted/20 transition-colors">
                                        <TableCell className="pl-6 font-black text-gray-900">{l.employeeName}</TableCell>
                                        <TableCell className="font-mono text-gray-500">{format(new Date(l.date), 'yyyy-MM-dd')}</TableCell>
                                        <TableCell className="text-muted-foreground font-medium">{formatTimeForDisplay(l.onDuty)}</TableCell>
                                        <TableCell className="text-muted-foreground font-medium">{formatTimeForDisplay(l.offDuty)}</TableCell>
                                        <TableCell className="font-bold text-blue-600">{formatTimeForDisplay(l.clockIn)}</TableCell>
                                        <TableCell className="font-bold text-blue-600">{formatTimeForDisplay(l.clockOut)}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className="text-[9px] uppercase font-black py-0">
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
                                        <TableCell colSpan={8} className="h-60 text-center text-muted-foreground italic">
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
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
                    <DialogHeader className="p-6 border-b shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900">Configure Data Dump</DialogTitle>
                        <DialogDescription>Map Excel sheets to specific periods before importing into raw storage. Record dates must match selected periods.</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-4">
                            {availableSheets.map(sheet => {
                                const selection = selectedSheets.find(s => s.name === sheet.name);
                                return (
                                    <div key={sheet.name} className={cn(
                                        "p-4 rounded-xl border-2 transition-all",
                                        selection ? "border-primary bg-primary/5 shadow-sm" : "border-gray-100 bg-gray-50/50"
                                    )}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <Checkbox id={`check-${sheet.name}`} checked={!!selection} onCheckedChange={(v) => {
                                                    if (v) setSelectedSheets([...selectedSheets, { name: sheet.name, periods: [{ year: selectedYear, month: selectedMonth }] }]);
                                                    else setSelectedSheets(selectedSheets.filter(s => s.name !== sheet.name));
                                                }} />
                                                <Label htmlFor={`check-${sheet.name}`} className="font-black text-sm">{sheet.name}</Label>
                                            </div>
                                            <Badge variant="secondary" className="uppercase text-[9px] font-black">{sheet.rowCount} rows</Badge>
                                        </div>
                                        {selection && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                                                {selection.periods.map((period, pIdx) => (
                                                    <div key={pIdx} className="flex gap-4 items-end">
                                                        <div className="space-y-1 flex-1">
                                                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Target BS Year</Label>
                                                            <Select value={period.year} onValueChange={(v) => {
                                                                const newPeriods = [...selection.periods];
                                                                newPeriods[pIdx] = { ...newPeriods[pIdx], year: v };
                                                                setSelectedSheets(selectedSheets.map(s => s.name === sheet.name ? { ...s, periods: newPeriods } : s));
                                                            }}>
                                                                <SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger>
                                                                <SelectContent>{[2080, 2081, 2082].map(y => <SelectItem key={`sel-year-${y}`} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1 flex-1">
                                                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Target BS Month</Label>
                                                            <Select value={period.month} onValueChange={(v) => {
                                                                const newPeriods = [...selection.periods];
                                                                newPeriods[pIdx] = { ...newPeriods[pIdx], month: v };
                                                                setSelectedSheets(selectedSheets.map(s => s.name === sheet.name ? { ...s, periods: newPeriods } : s));
                                                            }}>
                                                                <SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger>
                                                                <SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={`sel-month-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        </div>
                                                        {selection.periods.length > 1 && (
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                                                                const newPeriods = selection.periods.filter((_, i) => i !== pIdx);
                                                                setSelectedSheets(selectedSheets.map(s => s.name === sheet.name ? { ...s, periods: newPeriods } : s));
                                                            }}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 text-[10px] uppercase font-black text-primary hover:bg-primary/5"
                                                    onClick={() => {
                                                        const newPeriods = [...selection.periods, { year: selectedYear, month: selectedMonth }];
                                                        setSelectedSheets(selectedSheets.map(s => s.name === sheet.name ? { ...s, periods: newPeriods } : s));
                                                    }}
                                                >
                                                    <Plus className="mr-1 h-3 w-3" /> Add Target Period
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
                        <Button variant="outline" onClick={() => setIsImportDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest">Cancel</Button>
                        <Button onClick={handleConfirmImport} disabled={selectedSheets.length === 0} className="font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 px-8">
                            Confirm Data Dump
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
