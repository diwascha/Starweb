'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
    History,
    FilterX,
    ArrowUpDown
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
import { onHolidaysUpdate, onLeaveRequestsUpdate } from '@/services/hr-admin-service';
import { cn, toNepaliDate, formatTimeForDisplay, getAttendanceBadgeVariant } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import type { PublicHoliday, LeaveRequest } from '@/lib/types';
import NepaliDate from 'nepali-date-converter';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, startOfDay, isEqual, isWithinInterval } from 'date-fns';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger 
} from '@/components/ui/alert-dialog';

type SortKey = 'date' | 'employeeName' | 'statusFromMachine';
type SortDirection = 'asc' | 'desc';

export default function RawMachineLogsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [logs, setLogs] = useState<any[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [importProgress, setImportProgress] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCleaningAll, setIsCleaningAll] = useState(false);
    
    // Filters & Sorting
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedMonth, setSelectedMonth] = useState<string>('All');
    const [selectedRemark, setSelectedRemark] = useState<string>('All');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });

    // Import Dialog
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [availableSheets, setAvailableSheets] = useState<any[]>([]);
    const [selectedSheets, setSelectedSheets] = useState<string[]>([]);

    useEffect(() => {
        setIsLoading(true);
        const unsubHolidays = onHolidaysUpdate(setHolidays);
        const unsubLeaves = onLeaveRequestsUpdate(setLeaveRequests);
        const unsubLogs = onRawLogsUpdate((data) => {
            setLogs(data);
            setIsLoading(false);
        });
        return () => {
            unsubHolidays();
            unsubLeaves();
            unsubLogs();
        };
    }, []);

    const availableYears = useMemo(() => {
        const years = new Set<number>();
        logs.forEach(l => {
            if (l.bsYear) years.add(l.bsYear);
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [logs]);

    const availableMonths = useMemo(() => {
        if (selectedYear === 'All') return NEPALI_MONTHS;
        
        const yearInt = parseInt(selectedYear);
        const months = new Set<number>();
        logs.filter(l => l.bsYear === yearInt).forEach(l => {
            if (l.bsMonth !== undefined) months.add(l.bsMonth);
        });
        
        const result = Array.from(months).sort((a, b) => a - b);
        if (result.length === 0) return NEPALI_MONTHS;
        return NEPALI_MONTHS.filter(m => result.includes(m.value));
    }, [logs, selectedYear]);

    const getDisplayRemark = useCallback((log: any) => {
        const logDate = startOfDay(new Date(log.date));
        const finalRemarks: string[] = [];
        
        // 1. Check for Holiday
        const holiday = holidays.find(h => isEqual(startOfDay(new Date(h.date)), logDate));
        if (holiday) finalRemarks.push(`Public Holiday: ${holiday.name}`);

        // 2. Check for Approved Leave
        const leave = leaveRequests.find(l => 
            l.employeeName === log.employeeName && 
            l.status === 'Approved' &&
            isWithinInterval(logDate, { 
                start: startOfDay(new Date(l.startDate)), 
                end: startOfDay(new Date(l.endDate)) 
            })
        );
        if (leave) finalRemarks.push(`${leave.leaveType} Leave: ${leave.reason}`);

        // 3. Saturday
        if (logDate.getDay() === 6) finalRemarks.push('Weekly Off (Saturday)');

        // 4. Missing Punches (Dynamic detection)
        if (!log.clockIn && !log.clockOut) {
            if (finalRemarks.length === 0) finalRemarks.push('Absent');
        } else if (!log.clockIn) {
            finalRemarks.push('Clock In Missing');
        } else if (!log.clockOut) {
            finalRemarks.push('Clock Out Missing');
        }

        // 5. Existing Machine Remarks
        if (log.remarks && !finalRemarks.some(fr => log.remarks.includes(fr) || fr.includes(log.remarks))) {
            finalRemarks.push(log.remarks);
        }

        return finalRemarks.join('; ') || '—';
    }, [holidays, leaveRequests]);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

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
        setImportProgress('Initializing Single-Pass Processor...');

        try {
            let total = 0;
            for (const sheetName of selectedSheets) {
                const sheet = availableSheets.find(as => as.name === sheetName);
                if (sheet) {
                    const { logCount } = await addRawMachineLogs(
                        sheet.jsonData,
                        user.username,
                        sheetName,
                        (p) => setImportProgress(`Streaming ${sheetName}: ${p} records synced`)
                    );
                    total += logCount;
                }
            }
            toast({ title: 'Import Successful', description: `${total} unique records stored in the data dump.` });
        } catch (err: any) {
            toast({ title: 'Import Failed', description: err.message, variant: 'destructive' });
        } finally {
            setImportProgress(null);
            setSelectedSheets([]);
        }
    };

    const handleDeleteMonth = async () => {
        if (selectedYear === 'All' || selectedMonth === 'All') return;
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
        let filtered = logs.filter(l => {
            const matchesSearch = (l.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesYear = selectedYear === 'All' || l.bsYear === parseInt(selectedYear);
            const matchesMonth = selectedMonth === 'All' || l.bsMonth === parseInt(selectedMonth);
            
            if (selectedRemark !== 'All') {
                const remark = getDisplayRemark(l).toLowerCase();
                
                if (selectedRemark === 'Missing Clock In/Out') {
                    const isInMiss = remark.includes('clock in missing') || l.statusFromMachine === 'C/I Miss';
                    const isOutMiss = remark.includes('clock out missing') || l.statusFromMachine === 'C/O Miss';
                    if (!(isInMiss || isOutMiss)) return false;
                } else if (selectedRemark === 'Absent') {
                    if (!(remark.includes('absent') || l.statusFromMachine === 'Absent')) return false;
                } else if (selectedRemark === 'Public Holiday') {
                    if (!remark.includes('public holiday')) return false;
                } else if (selectedRemark === 'Leave') {
                    if (!remark.includes('leave')) return false;
                }
            }

            return matchesSearch && matchesYear && matchesMonth;
        });

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [logs, searchQuery, selectedYear, selectedMonth, selectedRemark, sortConfig, getDisplayRemark]);

    const handleClearFilters = () => {
        setSearchQuery('');
        setSelectedYear('All');
        setSelectedMonth('All');
        setSelectedRemark('All');
    };

    const isFiltered = selectedYear !== 'All' || selectedMonth !== 'All' || searchQuery !== '' || selectedRemark !== 'All';

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
                                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Years" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Years</SelectItem>
                                    {availableYears.map(y => <SelectItem key={`year-filter-${y}`} value={String(y)}>{y}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 w-[140px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">BS Month</Label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Months" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Months</SelectItem>
                                    {availableMonths.map(m => <SelectItem key={`month-filter-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5 w-[180px]">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Filter Remarks</Label>
                            <Select value={selectedRemark} onValueChange={setSelectedRemark}>
                                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Records" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Records</SelectItem>
                                    <SelectItem value="Missing Clock In/Out">Missing Clock In/Out</SelectItem>
                                    <SelectItem value="Absent">Absent Only</SelectItem>
                                    <SelectItem value="Public Holiday">Public Holiday</SelectItem>
                                    <SelectItem value="Leave">On Leave</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2">
                            <Badge variant="outline" className="h-9 font-black uppercase tracking-tighter bg-gray-50 border-gray-200 px-4">
                                {filteredLogs.length} Records
                            </Badge>
                            {isFiltered && (
                                <Button variant="ghost" size="icon" onClick={handleClearFilters} className="h-9 w-9 text-muted-foreground" title="Clear Filters">
                                    <FilterX className="h-4 w-4" />
                                </Button>
                            )}
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 text-destructive hover:bg-red-50 font-bold uppercase text-[10px]" disabled={filteredLogs.length === 0 || isDeleting || selectedYear === 'All' || selectedMonth === 'All'}>
                                        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5"/> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                                        Clear Period
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
                    <ScrollArea className="w-full">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent" key="header-row">
                                    <TableHead className="pl-6 font-bold">
                                        <Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4 h-8 px-2 text-xs font-bold text-foreground hover:bg-transparent">
                                            Date (AD) <ArrowUpDown className={cn("ml-2 h-3 w-3", sortConfig.key === 'date' ? "opacity-100" : "opacity-30")} />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="font-bold">Date (BS)</TableHead>
                                    <TableHead className="font-bold">Employee Name</TableHead>
                                    <TableHead className="font-bold">Clock In</TableHead>
                                    <TableHead className="font-bold">Clock Out</TableHead>
                                    <TableHead className="font-bold text-center">Status</TableHead>
                                    <TableHead className="font-bold">Remarks</TableHead>
                                    <TableHead className="text-right pr-6 font-bold">System</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow key="loading-row"><TableCell colSpan={8} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                                ) : filteredLogs.map(l => (
                                    <TableRow key={l.id} className="h-12 border-b-gray-50 group hover:bg-muted/20 transition-colors">
                                        <TableCell className="pl-6 font-mono text-gray-400 text-[10px]">{format(new Date(l.date), 'yyyy-MM-dd')}</TableCell>
                                        <TableCell className="font-mono font-bold text-blue-900">{toNepaliDate(l.date)}</TableCell>
                                        <TableCell className="font-black text-gray-900">{l.employeeName}</TableCell>
                                        <TableCell className="font-bold text-blue-600">{formatTimeForDisplay(l.clockIn)}</TableCell>
                                        <TableCell className="font-bold text-blue-600">{formatTimeForDisplay(l.clockOut)}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={getAttendanceBadgeVariant(l.statusFromMachine as any)} className="text-[9px] font-black uppercase py-0 h-5">
                                                {l.statusFromMachine}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate text-muted-foreground italic font-medium" title={getDisplayRemark(l)}>
                                            {getDisplayRemark(l)}
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
                                                <p>No raw machine data found matching the current filters.<br/><span className="text-[10px] font-bold uppercase not-italic">Upload an attendance machine Excel file to populate this dump.</span></p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Sheet Selection Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader className="p-6 border-b shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Configure Data Dump</DialogTitle>
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
