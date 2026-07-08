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
    ArrowUpDown,
    Edit,
    Clock,
    PlusCircle,
    CheckCircle2,
    ChevronDown,
    Check
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { addRawMachineLogs, deleteRawLog, deleteAllRawLogs, updateRawLog, addBulkManualLogs, onRawLogsUpdate } from '@/services/attendance-service';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onHolidaysUpdate, onLeaveRequestsUpdate } from '@/services/hr-admin-service';
import { cn, toNepaliDate, formatTimeForDisplay, getAttendanceBadgeVariant } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEPALI_MONTHS } from '@/lib/constants';
import type { PublicHoliday, LeaveRequest, Employee, RawMachineLog } from '@/lib/types';
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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import NepaliDate from 'nepali-date-converter';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type SortKey = 'date' | 'employeeName' | 'statusFromMachine';
type SortDirection = 'asc' | 'desc';

export default function RawMachineLogsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [logs, setLogs] = useState<RawMachineLog[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [importProgress, setImportProgress] = useState<string | null>(null);
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
    const [overwriteExisting, setOverwriteExisting] = useState(false);

    // Bulk Entry Dialog
    const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
    const [bulkDateRange, setBulkDateRange] = useState<DateRange | undefined>(undefined);
    const [bulkEmployeeNames, setBulkEmployeeNames] = useState<string[]>([]);
    const [bulkTimes, setBulkTimes] = useState({ onDuty: '09:00:00', offDuty: '17:00:00', clockIn: '09:00:00', clockOut: '17:00:00', remarks: 'Manual Attendance Entry' });
    const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

    // Edit Dialog
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<any>(null);
    const [editForm, setEditForm] = useState({ onDuty: '', offDuty: '', clockIn: '', clockOut: '', remarks: '' });

    useEffect(() => {
        setIsLoading(true);
        const unsubHolidays = onHolidaysUpdate(setHolidays);
        const unsubLeaves = onLeaveRequestsUpdate(setLeaveRequests);
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubLogs = onRawLogsUpdate((data) => {
            setLogs(data);
            setIsDataLoading(false);
        });
        const setIsDataLoading = (v: boolean) => setIsLoading(v);
        return () => {
            unsubHolidays();
            unsubLeaves();
            unsubEmployees();
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
        
        const holiday = holidays.find(h => isEqual(startOfDay(new Date(h.date)), logDate));
        if (holiday) finalRemarks.push(`Public Holiday: ${holiday.name}`);

        const leave = leaveRequests.find(l => 
            l.employeeName === log.employeeName && 
            l.status === 'Approved' &&
            isWithinInterval(logDate, { 
                start: startOfDay(new Date(l.startDate)), 
                end: startOfDay(new Date(l.endDate)) 
            })
        );
        if (leave) finalRemarks.push(`${leave.leaveType} Leave: ${leave.reason}`);

        if (logDate.getDay() === 6) finalRemarks.push('Weekly Off (Saturday)');

        if (!log.clockIn && !log.clockOut) {
            if (finalRemarks.length === 0) finalRemarks.push('Absent');
        } else if (!log.clockIn) {
            finalRemarks.push('Clock In Missing');
        } else if (!log.clockOut) {
            finalRemarks.push('Clock Out Missing');
        }

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
                
                const sheetsInfo = workbook.SheetNames.map(sheetName => {
                    const ws = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
                    return { name: sheetName, rowCount: json.length > 1 ? json.length - 1 : 0, jsonData: json };
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
        
        const estimatedTotal = selectedSheets.reduce((sum, name) => {
            const sheet = availableSheets.find(as => as.name === name);
            return sum + (sheet?.rowCount || 0);
        }, 0);

        setImportProgress(`0 / ${estimatedTotal}`);

        try {
            let totalCreated = 0;
            let totalUpdated = 0;
            let totalSkipped = 0;
            let currentOffset = 0;

            for (const sheetName of selectedSheets) {
                const sheet = availableSheets.find(as => as.name === sheetName);
                if (sheet) {
                    const result = await addRawMachineLogs(
                        sheet.jsonData,
                        user.username,
                        sheetName,
                        (p) => {
                            setImportProgress(`${currentOffset + p} / ${estimatedTotal}`);
                        },
                        { overwrite: overwriteExisting }
                    );
                    totalCreated += result.createdCount;
                    totalUpdated += result.updatedCount;
                    totalSkipped += result.skippedCount;
                    currentOffset += (result.createdCount + result.updatedCount + result.skippedCount);
                }
            }
            setImportProgress(`${currentOffset} / ${estimatedTotal}`);
            toast({ 
                title: 'Import Successful', 
                description: `Created: ${totalCreated}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}` 
            });
        } catch (err: any) {
            toast({ title: 'Import Failed', description: err.message, variant: 'destructive' });
        } finally {
            setTimeout(() => {
                setImportProgress(null);
                setSelectedSheets([]);
                setOverwriteExisting(false);
            }, 1000);
        }
    };

    const handleBulkSubmit = async () => {
        if (!user || !bulkDateRange?.from || !bulkDateRange?.to || bulkEmployeeNames.length === 0) {
            toast({ title: 'Validation Error', description: 'Please select date range and at least one employee.', variant: 'destructive' });
            return;
        }

        setIsSubmittingBulk(true);
        try {
            const count = await addBulkManualLogs(
                { from: bulkDateRange.from, to: bulkDateRange.to },
                bulkEmployeeNames,
                bulkTimes,
                user.username
            );
            toast({ title: 'Bulk Entry Success', description: `Successfully recorded ${count} logs for ${bulkEmployeeNames.length} employees.` });
            setIsBulkDialogOpen(false);
            setBulkDateRange(undefined);
            setBulkEmployeeNames([]);
        } catch (error: any) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmittingBulk(false);
        }
    };

    const handleClearAll = async () => {
        setIsCleaningAll(true);
        try {
            await deleteAllRawLogs();
            toast({ title: 'System Purge Complete', description: 'All raw machine logs have been permanently deleted.' });
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
        } finally {
            setIsCleaningAll(false);
        }
    };

    const handleOpenEditDialog = (log: any) => {
        setEditingLog(log);
        setEditForm({
            onDuty: log.onDuty || '',
            offDuty: log.offDuty || '',
            clockIn: log.clockIn || '',
            clockOut: log.clockOut || '',
            remarks: log.remarks || ''
        });
        setIsEditDialogOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingLog) return;
        try {
            await updateRawLog(editingLog.id, editForm);
            toast({ title: 'Log Entry Updated' });
            setIsEditDialogOpen(false);
        } catch {
            toast({ title: 'Error', variant: 'destructive' });
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
            if (aVal !== bVal) {
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return a.employeeName.localeCompare(b.employeeName);
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
                    <Button variant="outline" onClick={() => setIsBulkDialogOpen(true)} className="h-10 font-bold uppercase text-xs tracking-widest border-primary/20 text-primary hover:bg-primary/5">
                        <PlusCircle className="mr-2 h-4 w-4" /> Bulk Entry
                    </Button>
                    <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx,.xls" />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={!!importProgress} className="h-10 font-bold uppercase text-xs tracking-widest shadow-lg">
                        {importProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                        {importProgress ? importProgress : 'Direct Machine Import'}
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
                                    <TableHead className="font-bold text-center">Shift Schedule</TableHead>
                                    <TableHead className="font-bold text-center">In/Out Times</TableHead>
                                    <TableHead className="font-bold text-center">Machine Status</TableHead>
                                    <TableHead className="font-bold">System Flags / Remarks</TableHead>
                                    <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
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
                                        <TableCell className="text-center">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-500">{formatTimeForDisplay(l.onDuty)}</span>
                                                <span className="font-medium text-gray-500">{formatTimeForDisplay(l.offDuty)}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex flex-col">
                                                <span className={cn("font-bold", l.isManual ? "text-indigo-600 font-black" : "text-blue-600")}>
                                                    {formatTimeForDisplay(l.clockIn)}
                                                </span>
                                                <span className={cn("font-bold", l.isManual ? "text-indigo-600 font-black" : "text-blue-600")}>
                                                    {formatTimeForDisplay(l.clockOut)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={getAttendanceBadgeVariant(l.statusFromMachine as any)} className="text-[9px] font-black uppercase py-0 h-5">
                                                {l.statusFromMachine}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[250px] truncate text-muted-foreground italic font-medium" title={getDisplayRemark(l)}>
                                            {getDisplayRemark(l)}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleOpenEditDialog(l)} title="Edit log entry">
                                                    <Edit className="h-3.5 w-3.5"/>
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRawLog(l.id)} title="Delete log entry">
                                                    <Trash2 className="h-3.5 w-3.5"/>
                                                </Button>
                                            </div>
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

            {/* Bulk Entry Dialog */}
            <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[95vh] flex flex-col p-0 shadow-2xl border-none">
                    <DialogHeader className="p-6 border-b bg-indigo-50/30 shrink-0">
                        <DialogTitle className="text-2xl font-black text-gray-900 uppercase tracking-tight">Manual Bulk Entry</DialogTitle>
                        <DialogDescription className="text-xs font-bold uppercase tracking-widest text-indigo-600">HR Direct Input Module</DialogDescription>
                    </DialogHeader>
                    
                    <ScrollArea className="flex-1 p-6 bg-gray-50/30">
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">1. Select Target Period</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10 bg-white shadow-none", !bulkDateRange && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {bulkDateRange?.from ? (
                                                    bulkDateRange.to ? (
                                                        `${toNepaliDate(bulkDateRange.from.toISOString())} - ${toNepaliDate(bulkDateRange.to.toISOString())} BS`
                                                    ) : toNepaliDate(bulkDateRange.from.toISOString())
                                                ) : <span>Select period range</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <DualDateRangePicker selected={bulkDateRange} onSelect={setBulkDateRange} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                
                                <div className="space-y-4">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-1">2. Configure Schedule & Times</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">On Duty (Ref)</Label>
                                            <Input type="time" value={bulkTimes.onDuty} onChange={e => setBulkTimes({...bulkTimes, onDuty: e.target.value})} className="h-9 bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Off Duty (Ref)</Label>
                                            <Input type="time" value={bulkTimes.offDuty} onChange={e => setBulkTimes({...bulkTimes, offDuty: e.target.value})} className="h-9 bg-white" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-black uppercase text-indigo-600">Clock In (Actual)</Label>
                                            <Input type="time" value={bulkTimes.clockIn} onChange={e => setBulkTimes({...bulkTimes, clockIn: e.target.value})} className="h-9 border-indigo-200 bg-white focus-visible:ring-indigo-500 font-black" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-black uppercase text-indigo-600">Clock Out (Actual)</Label>
                                            <Input type="time" value={bulkTimes.clockOut} onChange={e => setBulkTimes({...bulkTimes, clockOut: e.target.value})} className="h-9 border-indigo-200 bg-white focus-visible:ring-indigo-500 font-black" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] font-bold uppercase text-muted-foreground">Audit Remark</Label>
                                        <Input value={bulkTimes.remarks} onChange={e => setBulkTimes({...bulkTimes, remarks: e.target.value})} className="h-9 bg-white" placeholder="Reason for manual entry..." />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">3. Select Employees ({bulkEmployeeNames.length} selected)</Label>
                                    <div className="flex items-center gap-2">
                                         <Button variant="ghost" size="sm" onClick={() => setBulkEmployeeNames(employees.map(e => e.name))} className="h-6 text-[9px] font-black uppercase text-indigo-600 hover:bg-indigo-50">Select All</Button>
                                         <Button variant="ghost" size="sm" onClick={() => setBulkEmployeeNames([])} className="h-6 text-[9px] font-black uppercase text-muted-foreground hover:bg-muted">Clear</Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {employees.map(e => (
                                        <div key={e.id} className={cn(
                                            "flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer",
                                            bulkEmployeeNames.includes(e.name) ? "bg-indigo-600 border-indigo-600 text-white shadow-md" : "bg-white border-gray-100 hover:border-indigo-200 text-gray-700"
                                        )} onClick={() => {
                                            if (bulkEmployeeNames.includes(e.name)) setBulkEmployeeNames(bulkEmployeeNames.filter(n => n !== e.name));
                                            else setBulkEmployeeNames([...bulkEmployeeNames, e.name]);
                                        }}>
                                            <Checkbox checked={bulkEmployeeNames.includes(e.name)} onCheckedChange={() => {}} className={bulkEmployeeNames.includes(e.name) ? "border-white data-[state=checked]:bg-white data-[state=checked]:text-indigo-600" : ""} />
                                            <span className="text-[11px] font-bold truncate">{e.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    
                    <DialogFooter className="p-6 border-t bg-white shrink-0">
                        <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)} className="font-bold uppercase text-[10px] tracking-widest h-11 border-gray-300">Cancel</Button>
                        <Button 
                            onClick={handleBulkSubmit} 
                            disabled={isSubmittingBulk || !bulkDateRange?.from || bulkEmployeeNames.length === 0}
                            className="font-black uppercase text-[10px] tracking-widest h-11 shadow-xl shadow-indigo-500/20 bg-indigo-600 hover:bg-indigo-700 text-white px-10"
                        >
                            {isSubmittingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}
                            Commit Bulk Manual Entries
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Log Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Modify Raw Entry</DialogTitle>
                        <DialogDescription>Adjust machine data for {editingLog?.employeeName}.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">On Duty (In)</Label>
                                <Input value={editForm.onDuty} onChange={e => setEditForm({...editForm, onDuty: e.target.value})} placeholder="09:00:00" className="h-10 font-mono" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Off Duty (Out)</Label>
                                <Input value={editForm.offDuty} onChange={e => setEditForm({...editForm, offDuty: e.target.value})} placeholder="17:00:00" className="h-10 font-mono" />
                            </div>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Clock In (Actual)</Label>
                                <Input value={editForm.clockIn} onChange={e => setEditForm({...editForm, clockIn: e.target.value})} placeholder="09:00:00" className="h-10 font-mono" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Clock Out (Actual)</Label>
                                <Input value={editForm.clockOut} onChange={e => setEditForm({...editForm, clockOut: e.target.value})} placeholder="17:00:00" className="h-10 font-mono" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Manual Remark</Label>
                            <Input value={editForm.remarks} onChange={e => setEditForm({...editForm, remarks: e.target.value})} placeholder="e.g. Machine error corrected" className="h-10" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="font-bold uppercase text-[10px]">Cancel</Button>
                        <Button onClick={handleSaveEdit} className="font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 px-8">Save Adjustments</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sheet Selection Dialog */}
            <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader className="p-6 border-b shrink-0">
                        <DialogTitle className="text-xl font-black text-gray-900 uppercase tracking-tight">Configure Data Dump</DialogTitle>
                        <DialogDescription>Select sheets to import. The system intelligently detects duplicates to keep your records clean.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
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

                        <Separator className="border-dashed" />
                        
                        <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border-2 border-amber-100">
                            <div className="space-y-1">
                                <Label htmlFor="overwrite-partial" className="font-black text-xs text-amber-900 uppercase tracking-tight">Overwrite Partial Duplicates</Label>
                                <p className="text-[10px] text-amber-800 leading-tight">Replace existing records if clock times differ in the new file.</p>
                            </div>
                            <Switch id="overwrite-partial" checked={overwriteExisting} onCheckedChange={setOverwriteExisting} />
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
