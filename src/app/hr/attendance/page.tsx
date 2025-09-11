

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { AttendanceRecord, Employee, AttendanceStatus, RawAttendanceRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, Search, ArrowUpDown, CalendarIcon, Edit, MoreHorizontal, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { format as formatDate } from 'date-fns';
import { onEmployeesUpdate, addEmployee } from '@/services/employee-service';
import { updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceForMonth, getAttendanceForMonth, getAttendanceYears, addAttendanceAndPayrollRecords } from '@/services/attendance-service';
import { getAttendanceBadgeVariant, cn, formatTimeForDisplay } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import NepaliDate from 'nepali-date-converter';


type SortKey = 'date' | 'employeeName' | 'status' | 'regularHours' | 'overtimeHours';
type SortDirection = 'asc' | 'desc';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, "name": "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const attendanceStatuses: AttendanceStatus[] = ['Present', 'Absent', 'C/I Miss', 'C/O Miss', 'Saturday', 'Public Holiday', 'EXTRAOK'];

interface SheetInfo {
  name: string;
  rowCount: number;
  jsonData: any[];
}


export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'employeeName', direction: 'asc' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  
  const [filterEmployeeName, setFilterEmployeeName] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | AttendanceStatus>('All');
  
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedBsYear, setSelectedBsYear] = useState<string>('');
  const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ onDuty: '', offDuty: '', clockIn: '', clockOut: '', status: '' as AttendanceStatus, regularHours: 0, overtimeHours: 0 });
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Import Dialog State
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importTargetYear, setImportTargetYear] = useState<string>('');
  const [importTargetMonth, setImportTargetMonth] = useState<string>('');
  const [isSheetSelectDialogOpen, setIsSheetSelectDialogOpen] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState<string | null>(null);


  const fetchAttendanceData = useCallback(async () => {
    if (selectedBsYear && selectedBsMonth !== '') {
      setIsDataLoading(true);
      const year = parseInt(selectedBsYear, 10);
      const month = parseInt(selectedBsMonth, 10);
      if (!isNaN(year) && !isNaN(month)) {
        try {
            const records = await getAttendanceForMonth(year, month);
            setAttendance(records);
        } catch (error) {
            console.error("Failed to fetch attendance data:", error);
            toast({ title: 'Error', description: 'Could not fetch attendance records.', variant: 'destructive' });
            setAttendance([]);
        } finally {
            setIsDataLoading(false);
        }
      } else {
          setAttendance([]);
          setIsDataLoading(false);
      }
    } else {
        setAttendance([]);
        setIsDataLoading(false);
    }
  }, [selectedBsYear, selectedBsMonth, toast]);

   useEffect(() => {
    const unsubEmployees = onEmployeesUpdate(setEmployees);
    return () => unsubEmployees();
  }, []);

  useEffect(() => {
    let isMounted = true;
    getAttendanceYears().then(years => {
        if (isMounted) {
            const currentNepaliDate = new NepaliDate();
            const allYears = Array.from(new Set([...years, currentNepaliDate.getYear()])).sort((a,b) => b-a);
            setBsYears(allYears);
            
            if (allYears.length > 0) {
              if (!selectedBsYear || !allYears.includes(parseInt(selectedBsYear, 10))) {
                const currentYear = currentNepaliDate.getYear();
                const defaultYear = allYears.includes(currentYear) ? currentYear : allYears[0];
                setSelectedBsYear(String(defaultYear));
                
                const currentMonth = currentNepaliDate.getMonth();
                setSelectedBsMonth(String(currentMonth));

                setImportTargetYear(String(defaultYear));
                setImportTargetMonth(String(currentMonth));
              }
            } else {
                setIsDataLoading(false);
            }
        }
    });
    return () => { isMounted = false; };
  }, []);
  
  useEffect(() => {
    if (selectedBsYear && selectedBsMonth) {
      fetchAttendanceData();
    }
  }, [fetchAttendanceData, selectedBsYear, selectedBsMonth]);
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
            
            const sheetsInfo: SheetInfo[] = workbook.SheetNames.map(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: null });
                return {
                    name: sheetName,
                    rowCount: jsonData.length > 1 ? jsonData.length - 1 : 0, // Exclude header
                    jsonData: jsonData,
                };
            }).filter(sheet => sheet.rowCount > 0);

            if (sheetsInfo.length === 0) {
                toast({ title: 'No Data Found', description: 'The selected file does not contain any sheets with data.' });
                return;
            }

            setAvailableSheets(sheetsInfo);
            setSelectedSheets([]);
            setIsSheetSelectDialogOpen(true);

        } catch (error) {
            console.error("File processing error:", error);
            toast({ title: 'Error', description: 'Failed to read the Excel file. It might be corrupted or in an unsupported format.', variant: 'destructive' });
        }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleSheetImport = async () => {
    if (selectedSheets.length === 0 || !user || !importTargetYear || !importTargetMonth) {
        toast({title: 'Error', description: 'Please select a year, month, and sheets to import.', variant: 'destructive'});
        return;
    }
    
    setIsImportDialogOpen(false);
    setIsSheetSelectDialogOpen(false);
    const sheetsToProcess = availableSheets.filter(sheet => selectedSheets.includes(sheet.name));
    const totalRecordsToProcess = sheetsToProcess.reduce((sum, sheet) => sum + sheet.rowCount, 0);
    setImportProgress(`0/${totalRecordsToProcess}`);

    const existingEmployeeNames = new Set(employees.map(emp => emp.name.toLowerCase()));
    const newlyAddedEmployees = new Set<string>();
    let totalSkippedRows = 0;
    const allRawRows: RawAttendanceRow[] = [];
    
    for (const sheet of sheetsToProcess) {
        const jsonData = sheet.jsonData;
        const headerRow = jsonData[0].map((h: any) => String(h || '').trim().toLowerCase());
        
        const headerVariations: { [key: string]: string[] } = {
            name: ['name', 'employee name'],
            day: ['day', 'date'], // Prioritize 'day'
            onDuty: ['on duty', 'onduty'],
            offDuty: ['off duty', 'offduty'],
            clockIn: ['clock in', 'clockin'],
            clockOut: ['clock out', 'clockout'],
            status: ['absent', 'status'],
            normalHours: ['normal'],
            otHours: ['ot'],
            totalHours: ['total hour'], rate: ['rate'], regularPay: ['normal pay'], otPay: ['ot pay'], totalPay: ['total pay'],
            absentDays: ['absent day'], deduction: ['deduction'], allowance: ['allowance'], bonus: ['bonus'],
            salaryTotal: ['salary total'], tds: ['tds'], gross: ['gross'], advance: ['advance'],
            netPayment: ['net payment'], payrollRemark: ['remark'],
        };
        
        const headerMap: { [key: string]: number } = {};
        for (const key in headerVariations) {
            const index = headerRow.findIndex((header: string) => headerVariations[key].some(v => header.includes(v)));
            if (index !== -1) {
                headerMap[key] = index;
            }
        }
        
        if (headerMap['name'] === undefined || headerMap['day'] === undefined) {
            toast({ title: 'Skipping Sheet', description: `Sheet "${sheet.name}" is missing 'Name' and a 'Day' column.`, variant: 'destructive' });
            continue;
        }

        for (const row of jsonData.slice(1)) {
            const employeeName = row[headerMap['name']] ? String(row[headerMap['name']]).trim() : '';
            const dayValue = row[headerMap['day']];
            
            if (!employeeName || dayValue === null || dayValue === undefined || String(dayValue).trim() === '') {
                totalSkippedRows++;
                continue;
            }
            
            if (!existingEmployeeNames.has(employeeName.toLowerCase()) && !newlyAddedEmployees.has(employeeName)) {
                 const newEmployee: Omit<Employee, 'id'> = {
                    name: employeeName, wageBasis: 'Monthly', wageAmount: 0, 
                    createdBy: user.username, createdAt: new Date().toISOString(), status: 'Working'
                };
                try {
                    await addEmployee(newEmployee);
                    existingEmployeeNames.add(employeeName.toLowerCase());
                    newlyAddedEmployees.add(employeeName);
                } catch (e) {
                    console.error("Failed to add new employee:", e);
                    totalSkippedRows++;
                    continue;
                }
            }

            const rawRowData: RawAttendanceRow = {
                employeeName: employeeName,
                day: dayValue,
                onDuty: row[headerMap['onDuty']], offDuty: row[headerMap['offDuty']],
                clockIn: row[headerMap['clockIn']], clockOut: row[headerMap['clockOut']],
                status: row[headerMap['status']], normalHours: row[headerMap['normalHours']], otHours: row[headerMap['otHours']],
                sourceSheet: sheet.name, totalHours: row[headerMap['totalHours']], rate: row[headerMap['rate']],
                regularPay: row[headerMap['regularPay']], otPay: row[headerMap['otPay']], totalPay: row[headerMap['totalPay']],
                absentDays: row[headerMap['absentDays']], deduction: row[headerMap['deduction']], allowance: row[headerMap['allowance']],
                bonus: row[headerMap['bonus']], salaryTotal: row[headerMap['salaryTotal']], tds: row[headerMap['tds']],
                gross: row[headerMap['gross']], advance: row[headerMap['advance']], netPayment: row[headerMap['netPayment']],
                payrollRemark: row[headerMap['payrollRemark']],
            };
            allRawRows.push(rawRowData);
        }
    }
    
    if (allRawRows.length === 0) {
        let description = 'No valid attendance records found to import.';
        if (totalSkippedRows > 0) description += ` ${totalSkippedRows} rows were skipped.`;
        toast({ title: 'Import Finished', description });
        setImportProgress(null);
        return;
    }
    
    const { attendanceCount, payrollCount } = await addAttendanceAndPayrollRecords(
        allRawRows,
        employees,
        user.username,
        parseInt(importTargetYear),
        parseInt(importTargetMonth),
        (progress) => {
            setImportProgress(`${progress}/${totalRecordsToProcess}`);
        }
    );

    if (attendanceCount > 0) {
        let description = `${attendanceCount} attendance records processed.`;
        if (payrollCount > 0) description += ` ${payrollCount} payroll records imported/updated.`;
        if (newlyAddedEmployees.size > 0) description += ` ${newlyAddedEmployees.size} new employees added.`;
        if (totalSkippedRows > 0) description += ` ${totalSkippedRows} rows were skipped.`;
        
        toast({ title: 'Import Complete', description, duration: 8000 });
        const years = await getAttendanceYears();
        setBsYears(years);
    } else {
        toast({ title: 'Info', description: `No new valid records found. ${totalSkippedRows} rows were skipped.` });
    }
    
    setImportProgress(null);
  };
  
  const handleOpenEditDialog = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditForm({
        onDuty: record.onDuty || '', offDuty: record.offDuty || '',
        clockIn: record.clockIn || '', clockOut: record.clockOut || '',
        status: record.status,
        regularHours: record.regularHours,
        overtimeHours: record.overtimeHours
    });
    setIsEditDialogOpen(true);
  };
  
  const handleSaveEdit = async () => {
    if (!editingRecord || !user) return;

    try {
        const updates: Partial<AttendanceRecord> = {
            onDuty: editForm.onDuty || null,
            offDuty: editForm.offDuty || null,
            clockIn: editForm.clockIn || null,
            clockOut: editForm.clockOut || null,
            status: editForm.status,
            regularHours: Number(editForm.regularHours) || 0,
            overtimeHours: Number(editForm.overtimeHours) || 0,
            grossHours: (Number(editForm.regularHours) || 0) + (Number(editForm.overtimeHours) || 0)
        };
        await updateAttendanceRecord(editingRecord.id, updates);
        await fetchAttendanceData(); // Refetch data
        toast({ title: 'Success', description: 'Attendance record updated.' });
        setIsEditDialogOpen(false);
        setEditingRecord(null);
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to update record.', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
        await deleteAttendanceRecord(id);
        await fetchAttendanceData(); // Refetch data
        toast({ title: 'Success', description: 'Attendance record deleted.' });
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to delete record.', variant: 'destructive' });
    }
  };
  
  const handleDeleteMonthData = async () => {
    if (!selectedBsYear || !selectedBsMonth) {
        toast({ title: 'Error', description: 'Please select a year and month to delete.', variant: 'destructive' });
        return;
    }
    try {
        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        await deleteAttendanceForMonth(year, month);
        await fetchAttendanceData(); // Refetch data
        toast({ title: 'Cleanup Successful', description: `Attendance data for ${nepaliMonths[month].name} ${year} has been removed.` });
    } catch (error) {
        console.error("Failed to clean month data:", error);
        toast({ title: 'Cleanup Failed', description: 'Could not remove the attendance data.', variant: 'destructive' });
    }
  };

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedRecords = useMemo(() => {
    let filtered = [...attendance];
    
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(record => record.employeeName.toLowerCase().includes(lowercasedQuery));
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
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key !== 'date') {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA < dateB) return -1;
          if (dateA > dateB) return 1;
      }
      return 0;
    });
    return filtered;
  }, [attendance, sortConfig, searchQuery, filterEmployeeName, filterStatus]);
  
  const uniqueEmployeeNames = useMemo(() => {
      const names = new Set(employees.map(e => e.name));
      return ['All', ...Array.from(names).sort()];
  }, [employees]);
  
  const renderContent = () => {
    if (isDataLoading) return <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24"><h3 className="text-2xl font-bold tracking-tight">Loading...</h3></div>;
    
    if (attendance.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">No attendance records for this period</h3>
            <p className="text-sm text-muted-foreground">Get started by importing an Excel file.</p>
             {hasPermission('hr', 'create') && (
                <DialogTrigger asChild>
                    <Button className="mt-4" disabled={!!importProgress}>
                        {importProgress ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {importProgress}</> : <><Upload className="mr-2 h-4 w-4" /> Import Attendance</>}
                    </Button>
                </DialogTrigger>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Button variant="ghost" onClick={() => requestSort('date')}>Date (AD) <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead>Date (BS)</TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('employeeName')}>Employee Name <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead>Source Sheet</TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead>On/Off Duty</TableHead>
              <TableHead>Clock In/Out</TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('regularHours')}>Regular Hours <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('overtimeHours')}>Overtime Hours <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedRecords.map(record => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.date ? formatDate(new Date(record.date), 'yyyy-MM-dd') : 'Invalid'}</TableCell>
                <TableCell>{record.bsDate}</TableCell>
                <TableCell>{record.employeeName}</TableCell>
                <TableCell><Badge variant="outline">{record.sourceSheet}</Badge></TableCell>
                 <TableCell><Badge variant={getAttendanceBadgeVariant(record.status)}>{record.status}</Badge></TableCell>
                <TableCell>{formatTimeForDisplay(record.onDuty)} / {formatTimeForDisplay(record.offDuty)}</TableCell>
                <TableCell>{formatTimeForDisplay(record.clockIn)} / {formatTimeForDisplay(record.clockOut)}</TableCell>
                <TableCell>{(record.regularHours || 0).toFixed(1)}</TableCell>
                <TableCell>{(record.overtimeHours || 0).toFixed(1)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => handleOpenEditDialog(record)}><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                              <AlertDialogTrigger asChild><DropdownMenuItem onSelect={e => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4 text-destructive" /> <span className="text-destructive">Delete</span></DropdownMenuItem></AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the attendance record.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(record.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                      </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };
  
  return (
    <>
    <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <div className="flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
            <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
            <p className="text-muted-foreground">Manage and import employee attendance records.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search by employee..." className="pl-8 w-full sm:w-auto" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {hasPermission('hr', 'create') && (
                <DialogTrigger asChild>
                    <Button className="w-full sm:w-auto" disabled={!!importProgress}>
                        {importProgress ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {`Importing (${importProgress})`}</> : <><Upload className="mr-2 h-4 w-4" /> Import Attendance</>}
                    </Button>
                </DialogTrigger>
            )}
            </div>
        </header>

        {(!isDataLoading || attendance.length > 0) && bsYears.length > 0 && (
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-center">
                <Label>Filter by:</Label>
                <Select value={selectedBsYear} onValueChange={setSelectedBsYear}><SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger><SelectContent>{bsYears.map(year => (<SelectItem key={year} value={String(year)}>{year}</SelectItem>))}</SelectContent></Select>
                <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger><SelectContent>{nepaliMonths.map(month => (<SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>))}</SelectContent></Select>
                <Select value={filterEmployeeName} onValueChange={setFilterEmployeeName}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Select Employee" /></SelectTrigger><SelectContent>{uniqueEmployeeNames.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}</SelectContent></Select>
                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'All' | AttendanceStatus)}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Select Status" /></SelectTrigger><SelectContent><SelectItem value="All">All Statuses</SelectItem>{attendanceStatuses.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent></Select>
                <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive-outline"><Trash2 className="mr-2 h-4 w-4" /> Delete Month Data</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete All Data for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete all attendance records for the selected month.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteMonthData}>Confirm Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                </AlertDialog>
            </div>
        )}
        {renderContent()}
        </div>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Import Attendance Data</DialogTitle>
                <DialogDescription>
                    Select the Nepali month and year this data belongs to. The system will look for a "Day" column in your Excel file to construct the correct dates.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Target Year (BS)</Label>
                         <Select value={importTargetYear} onValueChange={setImportTargetYear}>
                            <SelectTrigger><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                            <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Target Month (BS)</Label>
                        <Select value={importTargetMonth} onValueChange={setImportTargetMonth}>
                            <SelectTrigger><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                            <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Excel File (.xlsx, .xls)</Label>
                    <Input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>Cancel</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
     <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit Attendance for {editingRecord?.employeeName}</DialogTitle><DialogDescription>Date: {editingRecord ? formatDate(new Date(editingRecord.date), 'PPP') : ''}</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="edit-on-duty">On Duty Time (HH:mm)</Label><Input id="edit-on-duty" value={editForm.onDuty} onChange={e => setEditForm(prev => ({...prev, onDuty: e.target.value}))} placeholder="e.g., 08:00"/></div><div className="space-y-2"><Label htmlFor="edit-off-duty">Off Duty Time (HH:mm)</Label><Input id="edit-off-duty" value={editForm.offDuty} onChange={e => setEditForm(prev => ({...prev, offDuty: e.target.value}))} placeholder="e.g., 17:00"/></div></div>
                 <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="edit-clock-in">Clock In Time (HH:mm)</Label><Input id="edit-clock-in" value={editForm.clockIn} onChange={e => setEditForm(prev => ({...prev, clockIn: e.target.value}))} placeholder="e.g., 08:00"/></div><div className="space-y-2"><Label htmlFor="edit-clock-out">Clock Out Time (HH:mm)</Label><Input id="edit-clock-out" value={editForm.clockOut} onChange={e => setEditForm(prev => ({...prev, clockOut: e.target.value}))} placeholder="e.g., 17:00"/></div></div>
                 <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="edit-regular-hours">Regular Hours</Label><Input id="edit-regular-hours" type="number" value={editForm.regularHours} onChange={e => setEditForm(prev => ({...prev, regularHours: Number(e.target.value) || 0}))} /></div><div className="space-y-2"><Label htmlFor="edit-overtime-hours">Overtime Hours</Label><Input id="edit-overtime-hours" type="number" value={editForm.overtimeHours} onChange={e => setEditForm(prev => ({...prev, overtimeHours: Number(e.target.value) || 0}))} /></div></div>
                <div className="space-y-2"><Label htmlFor="edit-status">Status</Label><Select value={editForm.status} onValueChange={(value: AttendanceStatus) => setEditForm(prev => ({ ...prev, status: value }))}><SelectTrigger id="edit-status"><SelectValue /></SelectTrigger><SelectContent>{attendanceStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button><Button onClick={handleSaveEdit}>Save Changes</Button></DialogFooter>
        </DialogContent>
    </Dialog>
     <Dialog open={isSheetSelectDialogOpen} onOpenChange={setIsSheetSelectDialogOpen}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Select Sheets to Import</DialogTitle><DialogDescription>Your Excel file contains multiple sheets. Choose one or more to import.</DialogDescription></DialogHeader>
            <div className="py-4 space-y-2">
                <div className="flex items-center space-x-2 border-b pb-2">
                    <Checkbox id="select-all-sheets" onCheckedChange={(checked) => setSelectedSheets(checked ? availableSheets.map(s => s.name) : [])} checked={selectedSheets.length === availableSheets.length} />
                    <Label htmlFor="select-all-sheets" className="font-bold">Select All</Label>
                </div>
                <ScrollArea className="h-[300px]">
                    {availableSheets.map(sheet => (
                        <div key={sheet.name} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                            <Checkbox id={`sheet-${sheet.name}`} onCheckedChange={(checked) => setSelectedSheets(prev => checked ? [...prev, sheet.name] : prev.filter(s => s !== sheet.name))} checked={selectedSheets.includes(sheet.name)} />
                            <Label htmlFor={`sheet-${sheet.name}`} className="flex-1">{sheet.name}</Label>
                            <Badge variant="secondary">{sheet.rowCount} records</Badge>
                        </div>
                    ))}
                </ScrollArea>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsSheetSelectDialogOpen(false)}>Cancel</Button><Button onClick={handleSheetImport} disabled={selectedSheets.length === 0}>Import Selected ({selectedSheets.length})</Button></DialogFooter>
        </DialogContent>
     </Dialog>
    </>
  );
}
