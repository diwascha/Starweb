'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { AttendanceRecord, Employee, AttendanceStatus, PublicHoliday, LeaveRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
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
    AlertCircle
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { onEmployeesUpdate } from '@/services/employee-service';
import { 
    updateAttendanceRecord, 
    deleteAttendanceRecord, 
    deleteAttendanceForMonth, 
    getAttendanceForMonth, 
    getAttendanceYears, 
    onAttendanceUpdate,
    deleteAllAttendance 
} from '@/services/attendance-service';
import { onHolidaysUpdate, onLeaveRequestsUpdate } from '@/services/hr-admin-service';
import { getAttendanceBadgeVariant, cn, formatTimeForDisplay, toNepaliDate } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import NepaliDate from 'nepali-date-converter';
import { format as formatDate, startOfDay, isEqual, isWithinInterval } from 'date-fns';
import { NEPALI_MONTHS } from '@/lib/constants';
import Link from 'next/link';

type SortKey = 'date' | 'employeeName' | 'status' | 'regularHours' | 'overtimeHours';
type SortDirection = 'asc' | 'desc';

export default function AttendanceRegistryPage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  
  const [filterEmployeeName, setFilterEmployeeName] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedBsYear, setSelectedBsYear] = useState<string>(String(new NepaliDate().getYear()));
  const [selectedBsMonth, setSelectedBsMonth] = useState<string>(String(new NepaliDate().getMonth()));
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: '', clockOut: '', status: '' as any, regularHours: 0, overtimeHours: 0, remarks: '' });
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    onEmployeesUpdate(setEmployees);
    const unsubHolidays = onHolidaysUpdate(setHolidays);
    const unsubLeaves = onLeaveRequestsUpdate(setLeaveRequests);
    const unsubAttendance = onAttendanceUpdate((data) => {
        setAttendance(data);
        setIsDataLoading(false);
    });
    return () => {
        unsubHolidays();
        unsubLeaves();
        unsubAttendance();
    };
  }, []);

  useEffect(() => {
    getAttendanceYears().then(setBsYears);
  }, [attendance]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getDisplayRemark = useCallback((record: AttendanceRecord) => {
    const recordDate = startOfDay(new Date(record.date));
    const finalRemarks: string[] = [];
    
    // 1. Check for Holiday
    const holiday = holidays.find(h => isEqual(startOfDay(new Date(h.date)), recordDate));
    if (holiday) finalRemarks.push(`Public Holiday: ${holiday.name}`);

    // 2. Check for Approved Leave
    const leave = leaveRequests.find(l => 
        l.employeeId === record.employeeId && 
        l.status === 'Approved' &&
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
    if (record.remarks && !finalRemarks.some(fr => record.remarks?.includes(fr) || fr.includes(record.remarks))) {
        finalRemarks.push(record.remarks);
    }

    return finalRemarks.join('; ') || '—';
  }, [holidays, leaveRequests]);

  const filteredAndSortedRecords = useMemo(() => {
    let filtered = attendance.filter(r => r.bsYear === parseInt(selectedBsYear) && r.bsMonth === parseInt(selectedBsMonth));
    
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
  }, [attendance, selectedBsYear, selectedBsMonth, sortConfig, searchQuery, filterEmployeeName, filterStatus]);
  
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

  const handleDeleteMonth = async () => {
    try {
        await deleteAttendanceForMonth(parseInt(selectedBsYear), parseInt(selectedBsMonth));
        toast({ title: 'Period Cleared' });
    } catch {
        toast({ title: 'Error', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl"><UserCheck className="h-6 w-6 text-primary"/></div>
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase">Attendance Registry</h1>
                    <p className="text-muted-foreground text-sm font-medium italic">Validated labor metrics and work-hour records.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" asChild className="h-10 uppercase text-[10px] font-black tracking-widest">
                    <Link href="/hr/attendance/raw"><HardDrive className="mr-2 h-3.5 w-3.5"/> View Raw Dump</Link>
                </Button>
                <Button asChild className="h-10 uppercase text-[10px] font-black tracking-widest shadow-lg shadow-primary/20">
                    <Link href="/hr/attendance/calculate"><Calculator className="mr-2 h-3.5 w-3.5"/> Run Calculation</Link>
                </Button>
            </div>
        </header>

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end bg-muted/20 p-4 rounded-xl border border-dashed">
            <div className="space-y-1.5 w-[120px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Year (BS)</Label>
                <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{bsYears.map(y => <SelectItem key={`year-${y}`} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5 w-[150px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Month (BS)</Label>
                <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>{NEPALI_MONTHS.map(m => <SelectItem key={`month-${m.value}`} value={String(m.value)}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Quick Search</Label>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search employee..." className="pl-8 h-9 text-xs bg-white" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
            </div>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 text-destructive hover:bg-red-50 font-bold uppercase text-[10px]">
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear Period
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear Processed Records?</AlertDialogTitle>
                        <AlertDialogDescription>This will remove all calculated work hours for this month. Raw machine data will be preserved.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteMonth} className="bg-destructive text-white">Clear Now</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>

        <Card className="shadow-sm border-gray-100 bg-white overflow-hidden">
            <CardContent className="p-0">
                <ScrollArea className="w-full">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                            <TableRow className="hover:bg-transparent h-12">
                                <TableHead className="pl-6 font-bold">
                                    <Button variant="ghost" onClick={() => requestSort('date')} className="-ml-4 h-8 px-2 text-xs font-bold text-foreground hover:bg-transparent">
                                        Date (AD) <ArrowUpDown className={cn("ml-2 h-3 w-3", sortConfig.key === 'date' ? "opacity-100" : "opacity-30")} />
                                    </Button>
                                </TableHead>
                                <TableHead className="font-bold">Date (BS)</TableHead>
                                <TableHead className="font-bold">Employee Name</TableHead>
                                <TableHead className="text-center font-bold">Status</TableHead>
                                <TableHead className="text-center font-bold">Clock In/Out</TableHead>
                                <TableHead className="text-right font-bold">Normal Hrs</TableHead>
                                <TableHead className="text-right font-bold">OT Hrs</TableHead>
                                <TableHead className="font-bold">Remarks</TableHead>
                                <TableHead className="text-right pr-6 font-bold">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isDataLoading ? (
                                <TableRow key="loading-row"><TableCell colSpan={9} className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto opacity-20"/></TableCell></TableRow>
                            ) : filteredAndSortedRecords.map(r => (
                                <TableRow key={r.id} className="h-14 hover:bg-muted/20 transition-colors">
                                    <TableCell className="pl-6 font-mono text-gray-400 text-[10px]">{formatDate(new Date(r.date), 'yyyy-MM-dd')}</TableCell>
                                    <TableCell className="font-mono font-bold text-blue-900">{toNepaliDate(r.date)}</TableCell>
                                    <TableCell className="font-black text-gray-900">{r.employeeName}</TableCell>
                                    <TableCell className="text-center"><Badge variant={getAttendanceBadgeVariant(r.status as any)} className="text-[9px] font-black uppercase h-5">{r.status}</Badge></TableCell>
                                    <TableCell className="text-center font-medium text-blue-800">
                                        <div className="flex flex-col">
                                            <span>{formatTimeForDisplay(r.clockIn)} — {formatTimeForDisplay(r.clockOut)}</span>
                                            <span className="text-[8px] uppercase text-muted-foreground">Ref: {formatTimeForDisplay(r.onDuty)} — {formatTimeForDisplay(r.offDuty)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-black text-gray-700">{r.regularHours.toFixed(1)}</TableCell>
                                    <TableCell className="text-right font-black text-emerald-700">+{r.overtimeHours.toFixed(1)}</TableCell>
                                    <TableCell className="max-w-[200px] truncate text-[10px] text-muted-foreground italic" title={getDisplayRemark(r)}>
                                        {getDisplayRemark(r)}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditDialog(r)}><Edit className="h-4 w-4 text-primary"/></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!isDataLoading && filteredAndSortedRecords.length === 0 && (
                                <TableRow key="no-records-row">
                                    <TableCell colSpan={9} className="h-60 text-center text-muted-foreground italic">
                                        <div className="flex flex-col items-center gap-3">
                                            <AlertCircle className="h-10 w-10 opacity-10"/>
                                            <p>No processed records found for this period.<br/><span className="text-[10px] font-bold uppercase not-italic">Run the Hourly Calculation Logic to generate records.</span></p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
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
    </div>
  );
}
