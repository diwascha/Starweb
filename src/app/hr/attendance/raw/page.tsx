'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
    HardDrive,
    Upload,
    Trash2,
    Search,
    FilterX,
    Loader2,
    FileSpreadsheet,
    AlertTriangle,
    CheckCircle2,
    Plus,
    X,
    Clock,
    History,
    ChevronLeft,
    ChevronRight,
    Users,
    ArrowUpDown,
    CalendarClock,
    LogIn,
    LogOut
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
    onRawLogsUpdate,
    deleteAllRawLogs,
    deleteRawLog,
    deleteRawLogsForMonth
} from '@/services/attendance/data';
import { addRawMachineLogs, addBulkManualLogs, bulkClockInOut } from '@/services/attendance/import';
import { importLegacyPayrollSheet } from '@/services/payroll/legacy-import';
import { resolvePeriodFromSheetName } from '@/lib/attendance';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn, toNepaliDate, formatTimeForDisplay } from '@/lib/utils';
import { format } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { NEPALI_MONTHS } from '@/lib/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableHead } from '@/components/ui/sortable-head';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import type { Employee, HrShift } from '@/lib/types';
import { onEmployeesUpdate, updateEmployee } from '@/services/employee-service';
import { onShiftsUpdate } from '@/services/hr-admin-service';

type SortKey = 'date' | 'employeeName' | 'statusFromMachine';
type SortDirection = 'asc' | 'desc';

export default function MachineLogsPage() {
    const { user, hasPermission } = useAuth();
    const { toast } = useToast();

    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });

    // Import State
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importTotal, setImportTotal] = useState(0);
    const [currentSheetLabel, setCurrentSheetLabel] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filters
    const [filterMonth, setFilterMonth] = useState<string>('All');
    const [filterYear, setFilterYear] = useState<string>(String(new NepaliDate().getYear()));

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [shifts, setShifts] = useState<HrShift[]>([]);

    // Column filters
    const [filterEmployeeNames, setFilterEmployeeNames] = useState<string[]>([]);
    const [filterStatuses, setFilterStatuses] = useState<string[]>([]);

    // Shift Reschedule dialog
    const [isShiftAssignOpen, setIsShiftAssignOpen] = useState(false);
    const [shiftAssignEmployeeId, setShiftAssignEmployeeId] = useState<string>('');
    const [shiftAssignShiftId, setShiftAssignShiftId] = useState<string>('none');
    const [isSavingShiftAssign, setIsSavingShiftAssign] = useState(false);

    // Bulk Clock In/Out dialog
    const [isBulkClockOpen, setIsBulkClockOpen] = useState(false);
    const [bulkClockDate, setBulkClockDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [bulkClockActionType, setBulkClockActionType] = useState<'IN' | 'OUT'>('IN');
    const [bulkClockTime, setBulkClockTime] = useState<string>('08:00');
    const [bulkClockSelectedIds, setBulkClockSelectedIds] = useState<string[]>([]);
    const [isBulkClocking, setIsBulkClocking] = useState(false);

    const [isPurging, setIsPurging] = useState(false);
    const handlePurgeAllLogs = async () => {
        setIsPurging(true);
        try {
            await deleteAllRawLogs();
            toast({ title: 'Machine History Cleared', description: 'All raw log records have been removed.' });
        } catch (error: any) {
            toast({ title: 'Purge Failed', description: error?.message || 'Could not remove raw log records.', variant: 'destructive' });
        } finally {
            setIsPurging(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        const unsub = onRawLogsUpdate((data) => {
            setLogs(data);
            setIsLoading(false);
        });
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubShifts = onShiftsUpdate(setShifts);
        return () => {
            unsub();
            unsubEmployees();
            unsubShifts();
        };
    }, []);

    const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
    const employeeByName = useMemo(() => new Map(employees.map(e => [e.name.toLowerCase().trim(), e])), [employees]);
    const shiftMap = useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts]);

    const activeEmployeesForBulkClock = useMemo(() => {
        return [...employees].filter(e => e.status === 'Working').sort((a, b) => a.name.localeCompare(b.name));
    }, [employees]);

    const handleOpenShiftAssign = (employeeId: string) => {
        const emp = employeeMap.get(employeeId);
        setShiftAssignEmployeeId(employeeId);
        setShiftAssignShiftId(emp?.shiftId || 'none');
        setIsShiftAssignOpen(true);
    };

    const handleSaveShiftAssign = async () => {
        if (!shiftAssignEmployeeId) return;
        setIsSavingShiftAssign(true);
        try {
            await updateEmployee(shiftAssignEmployeeId, { shiftId: shiftAssignShiftId === 'none' ? '' : shiftAssignShiftId });
            toast({ title: 'Shift Updated', description: 'The employee has been rescheduled. Existing clock-in/out records were not changed.' });
            setIsShiftAssignOpen(false);
        } catch {
            toast({ title: 'Error', description: 'Could not update the assigned shift.', variant: 'destructive' });
        } finally {
            setIsSavingShiftAssign(false);
        }
    };

    const toggleBulkClockEmployee = (employeeId: string) => {
        setBulkClockSelectedIds(prev => prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]);
    };

    const handleRunBulkClock = async () => {
        if (!user || bulkClockSelectedIds.length === 0 || !bulkClockDate || !bulkClockTime) return;
        setIsBulkClocking(true);
        try {
            const names = bulkClockSelectedIds.map(id => employeeMap.get(id)?.name).filter((n): n is string => Boolean(n));
            const count = await bulkClockInOut(new Date(bulkClockDate), names, bulkClockActionType, bulkClockTime, user.username);
            toast({
                title: `Bulk Clock ${bulkClockActionType === 'IN' ? 'In' : 'Out'} Applied`,
                description: `Updated ${count} employee(s) on ${bulkClockDate}.`,
            });
            setIsBulkClockOpen(false);
            setBulkClockSelectedIds([]);
        } catch {
            toast({ title: 'Error', description: 'Could not apply the bulk clock action.', variant: 'destructive' });
        } finally {
            setIsBulkClocking(false);
        }
    };

    const availableYears = useMemo(() => {
        const years = new Set(logs.map(l => l.bsYear));
        years.add(new NepaliDate().getYear());
        return Array.from(years).sort((a, b) => b - a);
    }, [logs]);

    const filteredAndSortedLogs = useMemo(() => {
        let filtered = [...logs];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(l => 
                l.employeeName.toLowerCase().includes(q) || 
                (l.sourceSheet || '').toLowerCase().includes(q) ||
                l.dateBS.includes(q)
            );
        }

        if (filterMonth !== 'All') {
            filtered = filtered.filter(l => l.bsMonth === parseInt(filterMonth));
        }

        if (filterYear) {
            filtered = filtered.filter(l => l.bsYear === parseInt(filterYear));
        }

        if (filterEmployeeNames.length > 0) {
            filtered = filtered.filter(l => filterEmployeeNames.includes(l.employeeName));
        }

        if (filterStatuses.length > 0) {
            filtered = filtered.filter(l => filterStatuses.includes(l.statusFromMachine));
        }

        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key] || '';
            const bVal = b[sortConfig.key] || '';
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [logs, searchQuery, filterMonth, filterYear, filterEmployeeNames, filterStatuses, sortConfig]);

    const employeeFilterOptions = useMemo(() => {
        const names = Array.from(new Set(logs.map(l => l.employeeName))).sort((a, b) => a.localeCompare(b));
        return names.map(n => ({ value: n, label: n }));
    }, [logs]);

    const statusFilterOptions = useMemo(() => {
        const statuses = Array.from(new Set(logs.map(l => l.statusFromMachine).filter(Boolean)));
        return statuses.map(s => ({ value: s, label: s }));
    }, [logs]);

    const paginatedLogs = useMemo(() => {
        if (itemsPerPage === -1) return filteredAndSortedLogs;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedLogs.slice(start, start + itemsPerPage);
    }, [filteredAndSortedLogs, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredAndSortedLogs.length / itemsPerPage);

    // Sheets that hold something other than a month's attendance/payroll data
    // (dashboards, lookup tables, logs, or the Consolidated Ledger summary
    // sheet, which "Import Consolidated Ledger" handles separately). Sheets
    // named "Sheet1"/"Sheet2" are NOT excluded here - that default Excel
    // name is common enough on real exports that skipping it by name would
    // silently drop legitimate data; a sheet with no recognizable header is
    // already skipped gracefully per-sheet below.
    const NON_ATTENDANCE_SHEETS = new Set(['dashboard', 'log', 'rates', 'consolidated ledger']);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsImporting(true);
        setImportProgress(0);
        setCurrentSheetLabel(null);

        try {
            const XLSX = await import('xlsx');
            const reader = new FileReader();
            reader.onload = async (event) => {
                const totals = { created: 0, updated: 0, newEmployees: 0, payroll: 0 };
                const skippedSheets: string[] = [];
                const failedSheets: string[] = [];

                try {
                    const data = new Uint8Array(event.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const dataSheets = workbook.SheetNames.filter(
                        name => !NON_ATTENDANCE_SHEETS.has(name.trim().toLowerCase())
                    );

                    for (let i = 0; i < dataSheets.length; i++) {
                        const sheetName = dataSheets[i];
                        setCurrentSheetLabel(`Sheet ${i + 1} of ${dataSheets.length}: ${sheetName}`);
                        const jsonData = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1 });

                        try {
                            const result = await addRawMachineLogs(
                                jsonData,
                                user.username,
                                sheetName,
                                (current, total) => {
                                    setImportProgress(current);
                                    setImportTotal(total);
                                },
                                { overwrite: true }
                            );

                            totals.created += result.createdCount;
                            totals.updated += result.updatedCount;
                            totals.newEmployees += result.newEmployeesCount;

                            const period = result.dominantPeriod || resolvePeriodFromSheetName(sheetName);
                            if (period && result.headerIndex >= 0) {
                                const payrollResult = await importLegacyPayrollSheet(
                                    jsonData,
                                    result.headerRow,
                                    result.headerIndex,
                                    period.year,
                                    period.month,
                                    sheetName,
                                    user.username
                                );
                                totals.payroll += payrollResult.payrollRecords;
                                totals.newEmployees += payrollResult.newEmployees;
                            }
                        } catch (sheetError: any) {
                            // A sheet with no recognizable "Name"/"Date" header isn't an
                            // attendance sheet (e.g. a stray notes tab) - skip it, don't
                            // fail the whole import.
                            skippedSheets.push(sheetName);
                        }
                    }

                    if (totals.created + totals.updated + totals.payroll === 0) {
                        toast({
                            title: 'Nothing Imported',
                            description: skippedSheets.length > 0
                                ? `No recognizable attendance data found. Skipped sheets: ${skippedSheets.join(', ')}`
                                : 'No data rows found in this workbook.',
                            variant: 'destructive',
                        });
                    } else {
                        toast({
                            title: 'Import Successful',
                            description: `${dataSheets.length - skippedSheets.length} sheet(s) processed - ${totals.created} created, ${totals.updated} updated attendance logs, ${totals.payroll} payroll records imported${totals.newEmployees ? `, ${totals.newEmployees} new employees onboarded` : ''}.${skippedSheets.length ? ` Skipped: ${skippedSheets.join(', ')}.` : ''}`,
                        });
                    }
                } catch (error: any) {
                    toast({ title: 'Import Failed', description: error.message, variant: 'destructive' });
                } finally {
                    setIsImporting(false);
                    setCurrentSheetLabel(null);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setIsImporting(false);
            toast({ title: 'Error', description: 'Failed to process file.', variant: 'destructive' });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const requestSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><HardDrive className="h-6 w-6 text-primary"/></div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Data Import</h1>
                        <p className="text-muted-foreground text-sm font-medium italic">Machine punch logs, in one place.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => { setBulkClockSelectedIds([]); setBulkClockActionType('IN'); setBulkClockTime('08:00'); setIsBulkClockOpen(true); }}
                        className="h-10 uppercase text-[10px] font-black tracking-widest border-gray-200"
                    >
                        <Users className="mr-2 h-3.5 w-3.5"/> Bulk Clock In/Out
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xlsx,.xls"
                        className="hidden"
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="h-10 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20"
                    >
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Upload className="mr-2 h-4 w-4"/>}
                        {isImporting ? 'Reading...' : 'Import Machine Logs'}
                    </Button>
                </div>
            </header>

            {isImporting && (
                <Card className="bg-primary/5 border-primary/20 animate-in fade-in zoom-in-95">
                    <CardContent className="py-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Loader2 className="h-6 w-6 text-primary animate-spin" />
                            <div className="space-y-1">
                                <p className="text-sm font-black uppercase text-gray-900">Synchronizing Cloud Registry</p>
                                {currentSheetLabel && (
                                    <p className="text-[10px] text-primary font-black uppercase tracking-widest">
                                        {currentSheetLabel}
                                    </p>
                                )}
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                    Processing row {importProgress} of {importTotal}...
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex flex-col md:flex-row gap-4 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
                <div className="space-y-1.5 w-[120px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Year (BS)</Label>
                    <Select value={filterYear} onValueChange={setFilterYear}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 w-[140px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Month (BS)</Label>
                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Months</SelectItem>
                            {NEPALI_MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground px-1">Search Employee / Sheet</Label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter data..." 
                            className="pl-8 h-9 text-xs bg-white" 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(searchQuery || filterMonth !== 'All' || filterEmployeeNames.length > 0 || filterStatuses.length > 0) && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setFilterMonth('All'); setFilterEmployeeNames([]); setFilterStatuses([]); }} className="h-9 text-muted-foreground uppercase font-black text-[9px]">
                            <FilterX className="mr-1.5 h-3.5 w-3.5" /> Reset
                        </Button>
                    )}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={isPurging} className="h-9 text-destructive hover:bg-red-50 uppercase font-black text-[9px]">
                                {isPurging ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Purge Logs
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Clear Machine History?</AlertDialogTitle>
                                <AlertDialogDescription>This will remove every raw log record currently in the system. This does not affect calculated attendance.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handlePurgeAllLogs} className="bg-destructive text-white">Wipe Registry</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <ScrollArea className="w-full">
                        <Table className="text-[13px]">
                            <TableHeader className="bg-muted/50">
                                <TableRow className="hover:bg-transparent h-11">
                                    <SortableHead label="Work Date" sortKey="date" sortConfig={sortConfig} onSort={requestSort} className="pl-6 text-left" />
                                    <SortableHead label="Employee" sortKey="employeeName" sortConfig={sortConfig} onSort={requestSort} className="text-left">
                                        <MultiSelectFilter label="Employee" options={employeeFilterOptions} selected={filterEmployeeNames} onChange={setFilterEmployeeNames} />
                                    </SortableHead>
                                    <TableHead className="text-center font-bold">Assigned Shift</TableHead>
                                    <TableHead className="text-center font-bold">Shift Schedule</TableHead>
                                    <TableHead className="text-center font-bold">Machine Punch</TableHead>
                                    <SortableHead label="Machine Status" sortKey="statusFromMachine" sortConfig={sortConfig} onSort={requestSort} align="center">
                                        <MultiSelectFilter label="Status" options={statusFilterOptions} selected={filterStatuses} onChange={setFilterStatuses} />
                                    </SortableHead>
                                    <TableHead className="text-right font-bold">Import Batch</TableHead>
                                    <TableHead className="text-right pr-6 font-bold" />
                                </TableRow>
                            </TableHeader>
                            <TableBody className="bg-white">
                                {paginatedLogs.map((log) => (
                                    <TableRow key={log.id} className="h-14 border-b hover:bg-muted/10 transition-colors">
                                        <TableCell className="pl-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900">{log.dateBS}</span>
                                                <span className="text-[10px] text-muted-foreground tabular-nums uppercase">{format(new Date(log.date), 'dd MMM yyyy')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-black text-blue-900 uppercase tracking-tight">{log.employeeName}</TableCell>
                                        <TableCell className="text-center">
                                            {(() => {
                                                const emp = employeeByName.get(log.employeeName.toLowerCase().trim());
                                                const shift = emp?.shiftId ? shiftMap.get(emp.shiftId) : undefined;
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => emp && handleOpenShiftAssign(emp.id)}
                                                        disabled={!emp}
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title={emp ? 'Reschedule shift' : 'No matching employee record'}
                                                    >
                                                        <CalendarClock className="h-3 w-3" />
                                                        {shift ? shift.name : 'Standard'}
                                                    </button>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-gray-500 text-xs">
                                            {log.onDuty ? `${log.onDuty.substring(0, 5)} - ${log.offDuty?.substring(0, 5)}` : '—'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="font-black text-gray-900 tabular-nums">
                                                    {formatTimeForDisplay(log.clockIn)} — {formatTimeForDisplay(log.clockOut)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline" className={cn(
                                                "text-[9px] uppercase font-black px-2 h-4",
                                                log.statusFromMachine === 'Absent' ? "text-red-500 border-red-100 bg-red-50" : "text-emerald-600 border-emerald-100 bg-emerald-50"
                                            )}>
                                                {log.statusFromMachine}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex flex-col text-right">
                                                <span className="text-[10px] font-bold text-gray-700 truncate max-w-[120px]">{log.sourceSheet}</span>
                                                <span className="text-[8px] text-muted-foreground uppercase">{format(new Date(log.importedAt), 'p, PP')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRawLog(log.id)}>
                                                <Trash2 className="h-3.5 w-3.5"/>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!isLoading && paginatedLogs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-60 text-center text-muted-foreground italic">
                                            <div className="flex flex-col items-center gap-3">
                                                <HardDrive className="h-10 w-10 opacity-10"/>
                                                <p>No raw machine data found for this period.<br/><span className="text-[10px] font-bold uppercase not-italic">Click 'Import Machine Logs' to ingest biometric data.</span></p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
                {totalPages > 1 && (
                    <CardFooter className="py-3 border-t bg-muted/5 flex justify-between items-center px-6">
                         <div className="text-[10px] font-bold text-muted-foreground uppercase">Page {currentPage} of {totalPages}</div>
                         <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4"/></Button>
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4"/></Button>
                         </div>
                    </CardFooter>
                )}
            </Card>

            {/* Shift Reschedule Dialog */}
            <Dialog open={isShiftAssignOpen} onOpenChange={setIsShiftAssignOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">Reschedule Shift</DialogTitle>
                        <DialogDescription>
                            {employeeMap.get(shiftAssignEmployeeId)?.name || 'Employee'} — assigning a shift only changes how future calculations read this employee's break window and default duty times. Existing clock-in/out records are never touched.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5 py-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground">Assigned Shift</Label>
                        <Select value={shiftAssignShiftId} onValueChange={setShiftAssignShiftId}>
                            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Standard (HR Operational Rules default)</SelectItem>
                                {shifts.map(s => (
                                    <SelectItem key={`shift-opt-${s.id}`} value={s.id}>
                                        {s.name} ({formatTimeForDisplay(s.onDuty)}–{formatTimeForDisplay(s.offDuty)}, break {formatTimeForDisplay(s.breakStart)}–{formatTimeForDisplay(s.breakEnd)})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {shifts.length === 0 && (
                            <p className="text-[10px] text-muted-foreground italic pt-1">No shifts defined yet. Define shift patterns from HR Settings → Shift Pattern Registry.</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveShiftAssign} disabled={isSavingShiftAssign} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            {isSavingShiftAssign ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CalendarClock className="mr-2 h-4 w-4"/>}
                            Save Reschedule
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Clock In/Out Dialog */}
            <Dialog open={isBulkClockOpen} onOpenChange={setIsBulkClockOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-gray-900">Bulk Clock In / Clock Out</DialogTitle>
                        <DialogDescription>Stamp a single clock time for multiple employees on one date. Only the selected side (In or Out) is written — the other punch and any existing record are preserved.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-4 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Date</Label>
                            <Input type="date" value={bulkClockDate} onChange={e => setBulkClockDate(e.target.value)} className="h-10" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Action</Label>
                            <Select value={bulkClockActionType} onValueChange={(v) => setBulkClockActionType(v as 'IN' | 'OUT')}>
                                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IN"><span className="inline-flex items-center gap-1.5"><LogIn className="h-3.5 w-3.5"/> Clock In</span></SelectItem>
                                    <SelectItem value="OUT"><span className="inline-flex items-center gap-1.5"><LogOut className="h-3.5 w-3.5"/> Clock Out</span></SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Time</Label>
                            <Input type="time" value={bulkClockTime} onChange={e => setBulkClockTime(e.target.value)} className="h-10" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-black uppercase text-muted-foreground">Select Employees ({bulkClockSelectedIds.length} selected)</Label>
                            <div className="flex items-center gap-3">
                                <button type="button" className="text-[10px] font-bold uppercase text-primary hover:underline" onClick={() => setBulkClockSelectedIds(activeEmployeesForBulkClock.map(e => e.id))}>Select All</button>
                                <button type="button" className="text-[10px] font-bold uppercase text-muted-foreground hover:underline" onClick={() => setBulkClockSelectedIds([])}>Clear</button>
                            </div>
                        </div>
                        <ScrollArea className="h-[240px] rounded-lg border p-2">
                            {activeEmployeesForBulkClock.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground italic px-2 py-2">No active employees found.</p>
                            ) : activeEmployeesForBulkClock.map(e => {
                                const shift = e.shiftId ? shiftMap.get(e.shiftId) : undefined;
                                return (
                                    <label key={`bulk-emp-${e.id}`} className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-muted/50 cursor-pointer text-xs">
                                        <span className="flex items-center gap-2">
                                            <Checkbox checked={bulkClockSelectedIds.includes(e.id)} onCheckedChange={() => toggleBulkClockEmployee(e.id)} />
                                            <span className="font-bold">{e.name}</span>
                                        </span>
                                        <span className="text-[10px] text-muted-foreground uppercase">{shift ? shift.name : 'Standard'}</span>
                                    </label>
                                );
                            })}
                        </ScrollArea>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleRunBulkClock} disabled={isBulkClocking || bulkClockSelectedIds.length === 0} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                            {isBulkClocking ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : bulkClockActionType === 'IN' ? <LogIn className="mr-2 h-4 w-4"/> : <LogOut className="mr-2 h-4 w-4"/>}
                            {isBulkClocking ? 'Applying...' : `Apply Clock ${bulkClockActionType === 'IN' ? 'In' : 'Out'} to ${bulkClockSelectedIds.length} Employee(s)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

