'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AttendanceRecord, Employee, AttendanceStatus, PublicHoliday, LeaveRequest, HrShift, RawMachineLog } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
    Search, 
    ArrowUpDown, 
    Edit, 
    MoreHorizontal, 
    Trash2, 
    Loader2, 
    Calculator,
    HardDrive,
    FilterX,
    ClipboardList,
    Plus,
    UserCheck,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Lock,
    LockOpen,
    CalendarClock,
    LogIn,
    LogOut,
    Users
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { onEmployeesUpdate, updateEmployee } from '@/services/employee-service';
import {
    updateAttendanceRecord,
    deleteAttendanceRecord,
    deleteAttendanceForMonth,
    deleteAttendanceAndPayrollForFiscalYear,
    getAttendanceForMonth,
    onAttendanceUpdate,
    deleteAllAttendance,
    runHourlyCalculation,
    onAttendancePeriodLocksUpdate,
    setAttendancePeriodLock,
    bulkClockInOut,
    onRawLogsUpdate,
    updateRawLog,
    type AttendancePeriodLock
} from '@/services/attendance-service';
import { onHolidaysUpdate, onLeaveRequestsUpdate, onShiftsUpdate } from '@/services/hr-admin-service';
import { getAttendanceBadgeVariant, cn, formatTimeForDisplay, toNepaliDate, getAttendanceRowHighlight } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { SortableHead } from '@/components/ui/sortable-head';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { Columns3 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import NepaliDate from 'nepali-date-converter';
import { format as formatDate, startOfDay, isEqual, isWithinInterval } from 'date-fns';
import { NEPALI_MONTHS } from '@/lib/constants';
import Link from 'next/link';
import LedgerImportButton from './_components/ledger-import-button';
import { getFiscalYearStart, getFiscalYearMonths, getAvailableFiscalYears, formatFiscalYear, fiscalMonthName } from '@/lib/fiscal-year';

type SortKey = 'date' | 'employeeName' | 'status' | 'regularHours' | 'overtimeHours';
type SortDirection = 'asc' | 'desc';

type ColumnKey = 'bsDate' | 'shift' | 'weekday' | 'onDuty' | 'offDuty' | 'clockIn' | 'clockOut' | 'absent' | 'gTime' | 'breakHours' | 'gHours' | 'overtime' | 'regularHours' | 'remarks';

const COLUMN_LABELS: { key: ColumnKey; label: string }[] = [
    { key: 'bsDate', label: 'BS Date' },
    { key: 'shift', label: 'Shift' },
    { key: 'weekday', label: 'Weekday' },
    { key: 'onDuty', label: 'On duty' },
    { key: 'offDuty', label: 'Off duty' },
    { key: 'clockIn', label: 'Clock In' },
    { key: 'clockOut', label: 'Clock Out' },
    { key: 'absent', label: 'Absent' },
    { key: 'gTime', label: 'G. Time' },
    { key: 'breakHours', label: 'Break' },
    { key: 'gHours', label: 'G. Hours' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'regularHours', label: 'Regular Hours' },
    { key: 'remarks', label: 'Remarks' },
];

export default function AttendanceRegistryPage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [filterEmployeeName, setFilterEmployeeName] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterShifts, setFilterShifts] = useState<string[]>([]);
  const [filterWeekdays, setFilterWeekdays] = useState<string[]>([]);
  const [filterOnDuty, setFilterOnDuty] = useState<string[]>([]);
  const [filterOffDuty, setFilterOffDuty] = useState<string[]>([]);
  const [filterAbsent, setFilterAbsent] = useState<string[]>([]);
  
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(
    String(getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth()))
  );
  const [selectedFyMonthIndex, setSelectedFyMonthIndex] = useState<string>('All');
  const fyStart = parseInt(selectedFiscalYear);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: '', clockOut: '', status: '' as any, regularHours: 0, overtimeHours: 0, remarks: '' });
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [isCalcDialogOpen, setIsCalcDialogOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcStep, setCalcStep] = useState<'confirm' | 'result'>('confirm');
  const [calcResult, setCalcResult] = useState<{ processed: number } | null>(null);

  const [periodLocks, setPeriodLocks] = useState<AttendancePeriodLock[]>([]);
  const [isTogglingLock, setIsTogglingLock] = useState(false);

  const [shifts, setShifts] = useState<HrShift[]>([]);
  const [rawLogs, setRawLogs] = useState<RawMachineLog[]>([]);

  // Shift Reschedule dialog
  const [isShiftAssignOpen, setIsShiftAssignOpen] = useState(false);
  const [shiftAssignEmployeeId, setShiftAssignEmployeeId] = useState<string>('');
  const [shiftAssignShiftId, setShiftAssignShiftId] = useState<string>('none');
  const [isSavingShiftAssign, setIsSavingShiftAssign] = useState(false);

  // Bulk Clock In/Out dialog
  const [isBulkClockOpen, setIsBulkClockOpen] = useState(false);
  const [bulkClockDate, setBulkClockDate] = useState<string>(formatDate(new Date(), 'yyyy-MM-dd'));
  const [bulkClockActionType, setBulkClockActionType] = useState<'IN' | 'OUT'>('IN');
  const [bulkClockTime, setBulkClockTime] = useState<string>('08:00');
  const [bulkClockSelectedIds, setBulkClockSelectedIds] = useState<string[]>([]);
  const [isBulkClocking, setIsBulkClocking] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(
    () => Object.fromEntries(COLUMN_LABELS.map(c => [c.key, true])) as Record<ColumnKey, boolean>
  );
  const isColVisible = (key: ColumnKey) => visibleColumns[key];
  const toggleColumn = (key: ColumnKey) => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  // Date, Name, Gross Hours, and Actions are always shown; everything else in
  // COLUMN_LABELS can be toggled off.
  const visibleColCount = 4 + Object.values(visibleColumns).filter(Boolean).length;

  useEffect(() => {
    onEmployeesUpdate(setEmployees);
    const unsubHolidays = onHolidaysUpdate(setHolidays);
    const unsubLeaves = onLeaveRequestsUpdate(setLeaveRequests);
    const unsubLocks = onAttendancePeriodLocksUpdate(setPeriodLocks);
    const unsubShifts = onShiftsUpdate(setShifts);
    const unsubRawLogs = onRawLogsUpdate(setRawLogs);
    const unsubAttendance = onAttendanceUpdate((data) => {
        setAttendance(data);
        setIsDataLoading(false);
    });
    return () => {
        unsubLocks();
        unsubHolidays();
        unsubLeaves();
        unsubShifts();
        unsubRawLogs();
        unsubAttendance();
    };
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFiscalYear, selectedFyMonthIndex, searchQuery, filterEmployeeName, filterStatus, itemsPerPage]);

  const availableFiscalYears = useMemo(() => {
    const years = getAvailableFiscalYears(attendance.map(r => ({ bsYear: r.bsYear, bsMonth: r.bsMonth })));
    const current = getFiscalYearStart(new NepaliDate().getYear(), new NepaliDate().getMonth());
    return years.includes(current) ? years : [current, ...years].sort((a, b) => b - a);
  }, [attendance]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getDisplayRemark = useCallback((record: AttendanceRecord) => {
    if (!record?.date) return '—';
    
    const recordDate = startOfDay(new Date(record.date));
    const finalRemarks: string[] = [];
    
    // 1. Check for Holiday
    const holiday = holidays.find(h => h?.date && isEqual(startOfDay(new Date(h.date)), recordDate));
    if (holiday) finalRemarks.push(`Public Holiday: ${holiday.name}`);

    // 2. Check for Approved Leave
    const leave = leaveRequests.find(l => 
        l?.employeeId === record.employeeId && 
        l?.status === 'Approved' &&
        l?.startDate && l?.endDate &&
        isWithinInterval(recordDate, { 
            start: startOfDay(new Date(l.startDate)), 
            end: startOfDay(new Date(l.endDate)) 
        })
    );
    if (leave) finalRemarks.push(`${leave.leaveType} Leave: ${leave.reason}`);

    // 3. Saturday
    if (recordDate.getDay() === 6) finalRemarks.push('Weekly Off (Saturday)');

    // 4. Missing Punches
    if (!record.clockIn && !record.clockOut) {
        if (finalRemarks.length === 0) finalRemarks.push('Absent');
    } else if (!record.clockIn) {
        finalRemarks.push('Clock In Missing');
    } else if (!record.clockOut) {
        finalRemarks.push('Clock Out Missing');
    }

    // 5. Existing Remarks
    if (record.remarks && !finalRemarks.some(fr => record.remarks?.includes(fr) || fr.includes(record.remarks || ''))) {
        finalRemarks.push(record.remarks);
    }

    return finalRemarks.join('; ') || '—';
  }, [holidays, leaveRequests]);

  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const shiftMap = useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts]);

  const getRecordShiftName = useCallback((record: AttendanceRecord) => {
    const emp = employeeMap.get(record.employeeId);
    const shift = emp?.shiftId ? shiftMap.get(emp.shiftId) : undefined;
    return shift ? shift.name : 'Standard';
  }, [employeeMap, shiftMap]);

  const filteredAndSortedRecords = useMemo(() => {
    const fyStart = parseInt(selectedFiscalYear);
    let filtered = attendance.filter(r => getFiscalYearStart(r.bsYear, r.bsMonth) === fyStart);
    if (selectedFyMonthIndex !== 'All') {
        const target = getFiscalYearMonths(fyStart)[parseInt(selectedFyMonthIndex)];
        filtered = filtered.filter(r => r.bsYear === target.bsYear && r.bsMonth === target.bsMonth);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(record => record.employeeName.toLowerCase().includes(q));
    }
    
    if (filterEmployeeName !== 'All') {
        filtered = filtered.filter(record => record.employeeName === filterEmployeeName);
    }

    if (filterStatus !== 'All') {
        filtered = filtered.filter(record => record.status === filterStatus);
    }

    if (filterShifts.length > 0) {
        filtered = filtered.filter(record => filterShifts.includes(getRecordShiftName(record)));
    }

    if (filterWeekdays.length > 0) {
        filtered = filtered.filter(record => filterWeekdays.includes(record.weekday || '—'));
    }

    if (filterOnDuty.length > 0) {
        filtered = filtered.filter(record => filterOnDuty.includes(formatTimeForDisplay(record.onDuty)));
    }

    if (filterOffDuty.length > 0) {
        filtered = filtered.filter(record => filterOffDuty.includes(formatTimeForDisplay(record.offDuty)));
    }

    if (filterAbsent.length > 0) {
        filtered = filtered.filter(record => filterAbsent.includes(record.absent ? 'Yes' : 'No'));
    }

    filtered.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal !== bVal) {
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        // Secondary sort: alphabetical by name for same date/value
        return a.employeeName.localeCompare(b.employeeName);
    });
    return filtered;
  }, [attendance, selectedFiscalYear, selectedFyMonthIndex, sortConfig, searchQuery, filterEmployeeName, filterStatus, filterShifts, filterWeekdays, filterOnDuty, filterOffDuty, filterAbsent, getRecordShiftName]);

  const paginatedRecords = useMemo(() => {
    if (itemsPerPage === -1) return filteredAndSortedRecords;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedRecords.slice(start, start + itemsPerPage);
  }, [filteredAndSortedRecords, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredAndSortedRecords.length / itemsPerPage);
  }, [filteredAndSortedRecords, itemsPerPage]);
  
  const sortedEmployeesForFilter = useMemo(() => {
    return [...employees].sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const rawLogMap = useMemo(() => new Map(rawLogs.map(l => [l.id, l])), [rawLogs]);

  const shiftFilterOptions = useMemo(() => {
    const names = Array.from(new Set(attendance.map(r => getRecordShiftName(r)))).sort((a, b) => a.localeCompare(b));
    return names.map(n => ({ value: n, label: n }));
  }, [attendance, getRecordShiftName]);

  const weekdayFilterOptions = useMemo(() => {
    const days = Array.from(new Set(attendance.map(r => r.weekday || '—')));
    const order = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', '—'];
    days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return days.map(d => ({ value: d, label: d }));
  }, [attendance]);

  const onDutyFilterOptions = useMemo(() => {
    const times = Array.from(new Set(attendance.map(r => formatTimeForDisplay(r.onDuty)))).sort();
    return times.map(t => ({ value: t, label: t }));
  }, [attendance]);

  const offDutyFilterOptions = useMemo(() => {
    const times = Array.from(new Set(attendance.map(r => formatTimeForDisplay(r.offDuty)))).sort();
    return times.map(t => ({ value: t, label: t }));
  }, [attendance]);

  const handleToggleOtOk = async (record: AttendanceRecord, approved: boolean) => {
    if (!record.sourceLogId) {
        toast({ title: 'Cannot Update', description: 'This record has no linked raw log (it predates this feature).', variant: 'destructive' });
        return;
    }
    try {
        await updateRawLog(record.sourceLogId, { otApproved: approved });
        toast({
            title: approved ? 'OT Approved' : 'OT Ok Removed',
            description: 'Run Calculation for this month to apply the pay change.',
        });
    } catch {
        toast({ title: 'Error', description: 'Could not update the OT approval.', variant: 'destructive' });
    }
  };

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
            description: `Updated the raw log for ${count} employee(s) on ${bulkClockDate}. Run Calculation to reflect this in the table below.`,
        });
        setIsBulkClockOpen(false);
        setBulkClockSelectedIds([]);
    } catch {
        toast({ title: 'Error', description: 'Could not apply the bulk clock action.', variant: 'destructive' });
    } finally {
        setIsBulkClocking(false);
    }
  };

  const handleOpenEditDialog = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditForm({
        clockIn: record.clockIn || '', 
        clockOut: record.clockOut || '',
        status: record.status, 
        regularHours: record.regularHours,
        overtimeHours: record.overtimeHours,
        remarks: record.remarks || ''
    });
    setIsEditDialogOpen(true);
  };
  
  const handleSaveEdit = async () => {
    if (!editingRecord || !user) return;
    try {
        await updateAttendanceRecord(editingRecord.id, {
            ...editForm,
            regularHours: Number(editForm.regularHours),
            overtimeHours: Number(editForm.overtimeHours),
            grossHours: Number(editForm.regularHours) + Number(editForm.overtimeHours),
        });
        toast({ title: 'Record Updated' });
        setIsEditDialogOpen(false);
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const [isDeletingFiscalYear, setIsDeletingFiscalYear] = useState(false);

  const handleDeleteMonth = async () => {
    if (selectedFyMonthIndex === 'All') return;
    try {
        const target = getFiscalYearMonths(parseInt(selectedFiscalYear))[parseInt(selectedFyMonthIndex)];
        const result = await deleteAttendanceForMonth(target.bsYear, target.bsMonth);
        if (result.locked) {
            toast({ title: 'Period Locked', description: 'Unlock this period before deleting it.', variant: 'destructive' });
        } else {
            toast({ title: 'Period Cleared', description: 'Attendance and payroll for this month have been removed.' });
        }
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleDeleteFiscalYear = async () => {
    setIsDeletingFiscalYear(true);
    try {
        const result = await deleteAttendanceAndPayrollForFiscalYear(getFiscalYearMonths(fyStart));
        toast({
            title: 'Fiscal Year Cleared',
            description: `Removed attendance and payroll for ${result.monthsDeleted} month(s).${result.monthsSkippedLocked ? ` ${result.monthsSkippedLocked} locked month(s) were skipped.` : ''}`,
        });
    } catch {
        toast({ title: 'Error', description: 'Could not clear the fiscal year.', variant: 'destructive' });
    } finally {
        setIsDeletingFiscalYear(false);
    }
  };

  const handleResetFilters = () => {
    setFilterEmployeeName('All');
    setFilterStatus('All');
    setFilterShifts([]);
    setFilterWeekdays([]);
    setFilterOnDuty([]);
    setFilterOffDuty([]);
    setFilterAbsent([]);
    setSearchQuery('');
  };

  // The calculation always targets the month currently selected in the page
  // filters - never a month picked independently inside the dialog - so
  // recalculating can't silently hit a different period than the one being
  // viewed (and its lock).
  const calcTargetMonth = useMemo(() => {
    if (selectedFyMonthIndex === 'All') return null;
    return getFiscalYearMonths(fyStart)[parseInt(selectedFyMonthIndex)];
  }, [selectedFyMonthIndex, fyStart]);

  const currentViewLock = useMemo(() => {
    if (!calcTargetMonth) return undefined;
    return periodLocks.find(l => l.bsYear === calcTargetMonth.bsYear && l.bsMonth === calcTargetMonth.bsMonth);
  }, [periodLocks, calcTargetMonth]);
  const isCurrentViewLocked = Boolean(currentViewLock?.locked);
  const isCalcTargetLocked = isCurrentViewLocked;

  const handleRunCalculation = async () => {
    if (!user || isCalcTargetLocked || !calcTargetMonth) return;
    setIsCalculating(true);
    try {
        const { processed } = await runHourlyCalculation(calcTargetMonth.bsYear, calcTargetMonth.bsMonth, user.username);
        // Re-lock immediately so the just-calculated period can't be
        // recalculated again without another deliberate unlock.
        await setAttendancePeriodLock(calcTargetMonth.bsYear, calcTargetMonth.bsMonth, true, user.username);
        setCalcResult({ processed });
        setCalcStep('result');
    } catch (error: any) {
        toast({ title: 'Calculation Failed', description: error.message, variant: 'destructive' });
    } finally {
        setIsCalculating(false);
    }
  };

  const handleToggleLock = async () => {
    if (selectedFyMonthIndex === 'All' || !user) return;
    setIsTogglingLock(true);
    try {
        const target = getFiscalYearMonths(fyStart)[parseInt(selectedFyMonthIndex)];
        await setAttendancePeriodLock(target.bsYear, target.bsMonth, !isCurrentViewLocked, user.username);
        toast({
            title: isCurrentViewLocked ? 'Period Unlocked' : 'Period Locked',
            description: isCurrentViewLocked
                ? 'This period can be recalculated again.'
                : 'This period is now protected from recalculation.',
        });
    } catch (error) {
        toast({ title: 'Action Failed', description: 'Could not update the period lock.', variant: 'destructive' });
    } finally {
        setIsTogglingLock(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl"><UserCheck className="h-6 w-6 text-primary"/></div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Attendance Logs</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Validated labor metrics and work-hour records.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" asChild className="h-10 uppercase text-[10px] font-black tracking-widest">
                    <Link href="/hr/attendance/raw"><HardDrive className="mr-2 h-3.5 w-3.5"/> View Raw Dump</Link>
                </Button>
                <LedgerImportButton />
                <Button
                    variant="outline"
                    onClick={() => { setBulkClockSelectedIds([]); setBulkClockActionType('IN'); setBulkClockTime('08:00'); setIsBulkClockOpen(true); }}
                    className="h-10 uppercase text-[10px] font-black tracking-widest border-gray-200"
                >
                    <Users className="mr-2 h-3.5 w-3.5"/> Bulk Clock In/Out
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-10 uppercase text-[10px] font-black tracking-widest border-gray-200">
                            <Columns3 className="mr-2 h-3.5 w-3.5"/> Columns
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-[10px] font-black uppercase text-muted-foreground">Toggle Columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {COLUMN_LABELS.map(c => (
                            <DropdownMenuCheckboxItem
                                key={c.key}
                                checked={visibleColumns[c.key]}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={() => toggleColumn(c.key)}
                                className="text-xs font-bold"
                            >
                                {c.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    variant="outline"
                    onClick={handleToggleLock}
                    disabled={isTogglingLock || selectedFyMonthIndex === 'All'}
                    title={selectedFyMonthIndex === 'All' ? 'Select a specific month to lock/unlock it.' : undefined}
                    className="h-10 uppercase text-[10px] font-black tracking-widest border-gray-200 text-muted-foreground hover:text-primary"
                >
                    {isTogglingLock ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : isCurrentViewLocked ? <Lock className="mr-2 h-3.5 w-3.5 text-amber-600" /> : <LockOpen className="mr-2 h-3.5 w-3.5" />}
                    {isCurrentViewLocked ? 'Unlock Period' : 'Lock Period'}
                </Button>
                <Button
                    onClick={() => {
                        if (selectedFyMonthIndex === 'All') {
                            toast({ title: 'Select a Month', description: 'Pick a specific fiscal month above before running the calculation.', variant: 'destructive' });
                            return;
                        }
                        setCalcStep('confirm');
                        setCalcResult(null);
                        setIsCalcDialogOpen(true);
                    }}
                    className="h-10 uppercase text-[10px] font-black tracking-widest shadow-lg shadow-primary/20"
                >
                    <Calculator className="mr-2 h-3.5 w-3.5"/> Run Calculation
                </Button>
            </div>
        </header>

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
            <div className="space-y-1.5 w-[110px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Fiscal Year</Label>
                <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableFiscalYears.map(y => <SelectItem key={`fy-${y}`} value={String(y)}>{formatFiscalYear(y)}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5 w-[150px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Month</Label>
                <Select value={selectedFyMonthIndex} onValueChange={setSelectedFyMonthIndex}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Months</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => i).map(i => <SelectItem key={`fym-${i}`} value={String(i)}>{fiscalMonthName(i)}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5 w-[180px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Employee</Label>
                <Select value={filterEmployeeName} onValueChange={setFilterEmployeeName}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Employees" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Employees</SelectItem>
                        {sortedEmployeesForFilter.map(e => <SelectItem key={`filter-emp-${e.id}`} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5 w-[150px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="All Status" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Status</SelectItem>
                        <SelectItem value="Present">Present</SelectItem>
                        <SelectItem value="Absent">Absent</SelectItem>
                        <SelectItem value="Public Holiday">Public Holiday</SelectItem>
                        <SelectItem value="Saturday">Saturday</SelectItem>
                        <SelectItem value="Leave">Leave</SelectItem>
                        <SelectItem value="C/I Miss">Clock In Missing</SelectItem>
                        <SelectItem value="C/O Miss">Clock Out Missing</SelectItem>
                        <SelectItem value="EXTRAOK">EXTRAOK</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[150px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Quick Search</Label>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search employee..." className="pl-8 h-9 text-xs bg-white" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                {(filterEmployeeName !== 'All' || filterStatus !== 'All' || filterShifts.length > 0 || filterWeekdays.length > 0 || filterOnDuty.length > 0 || filterOffDuty.length > 0 || filterAbsent.length > 0 || searchQuery !== '') && (
                    <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-9 text-muted-foreground hover:text-foreground font-bold uppercase text-[10px]">
                        <FilterX className="mr-1.5 h-3.5 w-3.5" /> Reset
                    </Button>
                )}
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={selectedFyMonthIndex === 'All' || isCurrentViewLocked}
                            title={selectedFyMonthIndex === 'All' ? 'Select a specific month to clear.' : isCurrentViewLocked ? 'Unlock this period before deleting it.' : undefined}
                            className="h-9 text-destructive hover:bg-red-50 font-bold uppercase text-[10px]"
                        >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear Period
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Clear Processed Records?</AlertDialogTitle>
                            <AlertDialogDescription>This will remove all calculated work hours and payroll for this month. Raw machine data will be preserved.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteMonth} className="bg-destructive text-white">Clear Now</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isDeletingFiscalYear}
                            className="h-9 text-destructive hover:bg-red-50 font-bold uppercase text-[10px]"
                        >
                            {isDeletingFiscalYear ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Clear Fiscal Year
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Clear All Data for FY {formatFiscalYear(fyStart)}?</AlertDialogTitle>
                            <AlertDialogDescription>This will remove all calculated work hours and payroll for every month in this fiscal year. Locked months are skipped. Raw machine data will be preserved. This action is irreversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteFiscalYear} className="bg-destructive text-white">Clear Fiscal Year</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>

        <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                            <TableRow className="hover:bg-transparent h-12">
                                <SortableHead label="Date" sortKey="date" sortConfig={sortConfig} onSort={requestSort} className="pl-6 text-left" />
                                {isColVisible('bsDate') && <TableHead className="font-bold">BS Date</TableHead>}
                                <SortableHead label="Name" sortKey="employeeName" sortConfig={sortConfig} onSort={requestSort} className="text-left">
                                    <MultiSelectFilter label="Employee" options={sortedEmployeesForFilter.map(e => ({ value: e.name, label: e.name }))} selected={filterEmployeeName === 'All' ? [] : [filterEmployeeName]} onChange={(sel) => setFilterEmployeeName(sel.length === 0 ? 'All' : sel[sel.length - 1])} />
                                </SortableHead>
                                {isColVisible('shift') && (
                                    <TableHead className="font-bold">
                                        <span className="inline-flex items-center gap-1">Shift <MultiSelectFilter label="Shift" options={shiftFilterOptions} selected={filterShifts} onChange={setFilterShifts} /></span>
                                    </TableHead>
                                )}
                                {isColVisible('weekday') && (
                                    <TableHead className="font-bold">
                                        <span className="inline-flex items-center gap-1">Weekday <MultiSelectFilter label="Weekday" options={weekdayFilterOptions} selected={filterWeekdays} onChange={setFilterWeekdays} /></span>
                                    </TableHead>
                                )}
                                {isColVisible('onDuty') && (
                                    <TableHead className="text-center font-bold">
                                        <span className="inline-flex items-center gap-1 justify-center">On duty <MultiSelectFilter label="On Duty" options={onDutyFilterOptions} selected={filterOnDuty} onChange={setFilterOnDuty} /></span>
                                    </TableHead>
                                )}
                                {isColVisible('offDuty') && (
                                    <TableHead className="text-center font-bold">
                                        <span className="inline-flex items-center gap-1 justify-center">Off duty <MultiSelectFilter label="Off Duty" options={offDutyFilterOptions} selected={filterOffDuty} onChange={setFilterOffDuty} /></span>
                                    </TableHead>
                                )}
                                {isColVisible('clockIn') && <TableHead className="text-center font-bold">Clock In</TableHead>}
                                {isColVisible('clockOut') && <TableHead className="text-center font-bold">Clock Out</TableHead>}
                                {isColVisible('absent') && (
                                    <TableHead className="text-center font-bold">
                                        <span className="inline-flex items-center gap-1 justify-center">Absent <MultiSelectFilter label="Absent" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} selected={filterAbsent} onChange={setFilterAbsent} /></span>
                                    </TableHead>
                                )}
                                {isColVisible('gTime') && <TableHead className="text-right font-bold">G. Time</TableHead>}
                                {isColVisible('breakHours') && <TableHead className="text-right font-bold">Break</TableHead>}
                                {isColVisible('gHours') && <TableHead className="text-right font-bold">G. Hours</TableHead>}
                                <TableHead className="text-right font-bold">Gross Hours</TableHead>
                                {isColVisible('overtime') && (
                                    <SortableHead label="Overtime" sortKey="overtimeHours" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                )}
                                {isColVisible('regularHours') && (
                                    <SortableHead label="Regular Hours" sortKey="regularHours" sortConfig={sortConfig} onSort={requestSort} align="right" />
                                )}
                                {isColVisible('remarks') && <TableHead className="font-bold">Remarks</TableHead>}
                                <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isDataLoading ? (
                                <TableRow key="loading-row"><TableCell colSpan={visibleColCount} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : paginatedRecords.map(r => {
                                const highlight = getAttendanceRowHighlight(r);
                                return (
                                <TableRow key={r.id} className="h-14 hover:bg-muted/20 transition-colors" style={highlight ? { backgroundColor: highlight } : undefined}>
                                    <TableCell className="pl-6 font-mono text-gray-400 text-[10px]">{formatDate(new Date(r.date), 'yyyy-MM-dd')}</TableCell>
                                    {isColVisible('bsDate') && <TableCell className="font-mono font-bold text-blue-900">{r.dateBS}</TableCell>}
                                    <TableCell className="font-black text-gray-900">{r.employeeName}</TableCell>
                                    {isColVisible('shift') && (
                                        <TableCell>
                                            {(() => {
                                                const emp = employeeMap.get(r.employeeId);
                                                const shift = emp?.shiftId ? shiftMap.get(emp.shiftId) : undefined;
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => emp && handleOpenShiftAssign(emp.id)}
                                                        disabled={!emp}
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title={emp ? 'Reschedule shift' : 'Employee not found'}
                                                    >
                                                        <CalendarClock className="h-3 w-3" />
                                                        {shift ? shift.name : 'Standard'}
                                                    </button>
                                                );
                                            })()}
                                        </TableCell>
                                    )}
                                    {isColVisible('weekday') && <TableCell className="text-[10px] text-muted-foreground uppercase">{r.weekday || '—'}</TableCell>}
                                    {isColVisible('onDuty') && <TableCell className="text-center text-[11px] text-muted-foreground">{formatTimeForDisplay(r.onDuty)}</TableCell>}
                                    {isColVisible('offDuty') && <TableCell className="text-center text-[11px] text-muted-foreground">{formatTimeForDisplay(r.offDuty)}</TableCell>}
                                    {isColVisible('clockIn') && <TableCell className="text-center font-medium text-blue-800">{formatTimeForDisplay(r.clockIn)}</TableCell>}
                                    {isColVisible('clockOut') && <TableCell className="text-center font-medium text-blue-800">{formatTimeForDisplay(r.clockOut)}</TableCell>}
                                    {isColVisible('absent') && (
                                        <TableCell className="text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                {r.absent ? <Badge variant="destructive" className="text-[9px] font-black uppercase h-5">Yes</Badge> : <span className="text-[10px] text-muted-foreground">No</span>}
                                                {(() => {
                                                    const rawLog = r.sourceLogId ? rawLogMap.get(r.sourceLogId) : undefined;
                                                    const otOk = Boolean(rawLog?.otApproved);
                                                    return (
                                                        <Select
                                                            value={otOk ? 'yes' : 'no'}
                                                            onValueChange={(v) => handleToggleOtOk(r, v === 'yes')}
                                                            disabled={!r.sourceLogId}
                                                        >
                                                            <SelectTrigger
                                                                className={cn("h-5 w-[74px] text-[8px] font-black uppercase tracking-wide px-1.5", otOk ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "text-muted-foreground")}
                                                                title="OT Ok: pays for time worked outside the assigned shift window"
                                                            >
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="no" className="text-[10px] font-bold uppercase">OT Ok: No</SelectItem>
                                                                <SelectItem value="yes" className="text-[10px] font-bold uppercase">OT Ok: Yes</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    );
                                                })()}
                                            </div>
                                        </TableCell>
                                    )}
                                    {isColVisible('gTime') && <TableCell className="text-right text-[11px] text-muted-foreground">{r.gTime != null ? r.gTime.toFixed(2) : '—'}</TableCell>}
                                    {isColVisible('breakHours') && <TableCell className="text-right text-[11px] text-muted-foreground">{r.breakHours != null ? r.breakHours.toFixed(2) : '—'}</TableCell>}
                                    {isColVisible('gHours') && <TableCell className="text-right text-[11px] text-muted-foreground">{r.gHours != null ? r.gHours.toFixed(2) : '—'}</TableCell>}
                                    <TableCell className="text-right font-bold text-gray-900">{r.grossHours.toFixed(1)}</TableCell>
                                    {isColVisible('overtime') && <TableCell className="text-right font-black text-emerald-700">+{r.overtimeHours.toFixed(1)}</TableCell>}
                                    {isColVisible('regularHours') && <TableCell className="text-right font-black text-gray-700">{r.regularHours.toFixed(1)}</TableCell>}
                                    {isColVisible('remarks') && (
                                        <TableCell className="max-w-[200px] truncate text-[10px] text-muted-foreground italic" title={getDisplayRemark(r)}>
                                            {getDisplayRemark(r)}
                                        </TableCell>
                                    )}
                                    <TableCell className="text-right pr-6">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditDialog(r)}><Edit className="h-4 w-4 text-primary"/></Button>
                                    </TableCell>
                                </TableRow>
                                );
                            })}
                            {!isDataLoading && paginatedRecords.length === 0 && (
                                <TableRow key="no-records-row">
                                    <TableCell colSpan={visibleColCount} className="h-60 text-center text-muted-foreground italic">
                                        <div className="flex flex-col items-center gap-3">
                                            <AlertCircle className="h-10 w-10 opacity-10"/>
                                            <p>No processed records found for this period.<br/><span className="text-[10px] font-bold uppercase not-italic">Run the Hourly Calculation Logic to generate records.</span></p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </CardContent>
            {(totalPages > 1 || itemsPerPage !== -1) && (
                <CardFooter className="flex items-center justify-between py-4 border-t bg-muted/5">
                    <div className="text-xs text-muted-foreground font-medium">
                        {itemsPerPage === -1 ? (
                            <>Showing all <span className="font-bold text-foreground">{filteredAndSortedRecords.length}</span> records</>
                        ) : (
                            <>
                                Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-foreground">{Math.min(currentPage * itemsPerPage, filteredAndSortedRecords.length)}</span> of <span className="font-bold text-foreground">{filteredAndSortedRecords.length}</span> records
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page:</span>
                            <Select value={String(itemsPerPage)} onValueChange={(v) => {
                                setItemsPerPage(parseInt(v));
                                setCurrentPage(1);
                            }}>
                                <SelectTrigger className="h-8 w-[70px] bg-white border-gray-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="-1">All</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {itemsPerPage !== -1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="text-xs font-bold px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardFooter>
            )}
        </Card>

        {/* Manual Tweak Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black text-gray-900">Manual Tweak</DialogTitle>
                    <DialogDescription>Adjust work hours for {editingRecord?.employeeName}.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-5 py-4">
                    <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Clock In</Label><Input value={editForm.clockIn} onChange={e => setEditForm({...editForm, clockIn: e.target.value})} className="h-10" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Clock Out</Label><Input value={editForm.clockOut} onChange={e => setEditForm({...editForm, clockOut: e.target.value})} className="h-10" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Regular Hrs</Label><Input type="number" step="0.5" value={editForm.regularHours} onChange={e => setEditForm({...editForm, regularHours: Number(e.target.value)})} className="h-10 font-bold" /></div>
                    <div className="space-y-1.5"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Overtime Hrs</Label><Input type="number" step="0.5" value={editForm.overtimeHours} onChange={e => setEditForm({...editForm, overtimeHours: Number(e.target.value)})} className="h-10 font-bold text-emerald-600" /></div>
                    <div className="space-y-1.5 col-span-2"><Label className="text-[10px] uppercase font-bold text-muted-foreground">Status / Remarks</Label><Input value={editForm.remarks} onChange={e => setEditForm({...editForm, remarks: e.target.value})} className="h-10" /></div>
                </div>
                <DialogFooter><Button onClick={handleSaveEdit} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">Confirm Adjustments</Button></DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Run Calculation Dialog */}
        <Dialog open={isCalcDialogOpen} onOpenChange={setIsCalcDialogOpen}>
            <DialogContent className="sm:max-w-md">
                {calcStep === 'confirm' ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl font-black text-gray-900">Run Attendance Processor</DialogTitle>
                            <DialogDescription>
                                You are about to recalculate <span className="font-bold text-foreground">{calcTargetMonth ? `${fiscalMonthName(parseInt(selectedFyMonthIndex))}, ${calcTargetMonth.bsYear}` : 'the selected month'}</span> — the month currently shown on this page. No other month is affected.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-2">
                            <p className="text-[10px] font-black uppercase text-muted-foreground">This will:</p>
                            <ul className="text-[11px] text-gray-700 space-y-1.5 list-disc pl-4">
                                <li>Delete and regenerate every processed attendance record for this month from the raw machine logs.</li>
                                <li>Apply each employee's assigned shift, break window, and the HR Operational Rules configured under HR Setting.</li>
                                <li>Overwrite any manual tweaks made to this month's attendance records.</li>
                                <li>Re-lock this period automatically once finished, so it can't be run again by accident.</li>
                            </ul>
                        </div>
                        {isCalcTargetLocked && (
                            <div className="p-3 rounded-lg bg-amber-50 border-2 border-amber-200 flex gap-3">
                                <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-800 leading-relaxed font-medium italic">This period is locked. Unlock it from the Attendance Logs header before re-running the calculation.</p>
                            </div>
                        )}
                        <DialogFooter>
                            <Button onClick={handleRunCalculation} disabled={isCalculating || isCalcTargetLocked} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                                {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Calculator className="mr-2 h-4 w-4"/>}
                                {isCalculating ? 'Processing...' : isCalcTargetLocked ? 'Period Locked' : 'I Understand, Recalculate This Month'}
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl font-black text-gray-900">Calculation Complete</DialogTitle>
                            <DialogDescription>
                                {calcTargetMonth ? `${fiscalMonthName(parseInt(selectedFyMonthIndex))}, ${calcTargetMonth.bsYear}` : 'This period'} has been recalculated.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="p-4 rounded-lg bg-emerald-50 border-2 border-emerald-200 flex gap-3">
                            <UserCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-black text-emerald-900">{calcResult?.processed ?? 0} attendance record(s) processed.</p>
                                <p className="text-[10px] text-emerald-800 font-medium italic">The period has been re-locked to protect this result. Unlock it from the header if you need to run it again.</p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => setIsCalcDialogOpen(false)} className="w-full h-11 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20">
                                Done
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>

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
