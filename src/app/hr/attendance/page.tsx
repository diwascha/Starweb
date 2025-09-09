

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { AttendanceRecord, Employee, AttendanceStatus, RawAttendanceRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, Search, ArrowUpDown, CalendarIcon, Edit, MoreHorizontal, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { format, parse, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { onEmployeesUpdate, addEmployee } from '@/services/employee-service';
import { onAttendanceUpdate, addAttendanceRecords, updateAttendanceRecord, deleteAttendanceRecord, deleteAttendanceForMonth, batchUpdateAttendance } from '@/services/attendance-service';
import { getAttendanceBadgeVariant, cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';
import { calculateAttendance, reprocessSingleRecord } from '@/lib/attendance';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';


type SortKey = 'date' | 'employeeName' | 'status' | 'regularHours' | 'overtimeHours';
type SortDirection = 'asc' | 'desc';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const attendanceStatuses: AttendanceStatus[] = ['Present', 'Absent', 'C/I Miss', 'C/O Miss', 'Saturday', 'Public Holiday', 'EXTRAOK'];

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'employeeName', direction: 'asc' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const { hasPermission, user } = useAuth();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterEmployeeName, setFilterEmployeeName] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | AttendanceStatus>('All');
  
  const [bsYears, setBsYears] = useState<number[]>([]);
  const [selectedBsYear, setSelectedBsYear] = useState<string>('');
  const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
  
  // Edit Dialog State
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: '', clockOut: '', status: '' as AttendanceStatus });
  const [isRecalculating, setIsRecalculating] = useState(false);


  useEffect(() => {
    setIsClient(true);
    const unsubEmployees = onEmployeesUpdate(setEmployees);
    const unsubAttendance = onAttendanceUpdate((records) => {
      const validRecords = records.filter(r => r.date && !isNaN(new Date(r.date).getTime()));
      setAttendance(validRecords);

      if (validRecords.length > 0) {
        const years = Array.from(new Set(validRecords.map(r => new NepaliDate(new Date(r.date)).getYear()))).sort((a, b) => b - a);
        setBsYears(years);

        const latestRecord = validRecords.reduce((latest, current) => 
            new Date(current.date) > new Date(latest.date) ? current : latest
        );
        if (latestRecord) {
            const latestNepaliDate = new NepaliDate(new Date(latestRecord.date));
            if (!selectedBsYear) {
              setSelectedBsYear(String(latestNepaliDate.getYear()));
              setSelectedBsMonth(String(latestNepaliDate.getMonth()));
            }
        }
      }
    });

    return () => {
        unsubEmployees();
        unsubAttendance();
    }
  }, [selectedBsYear]);
  
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    toast({ title: 'Recalculating...', description: `Processing ${filteredAndSortedRecords.length} records.` });

    try {
        const rawRows: RawAttendanceRow[] = filteredAndSortedRecords.map(r => ({
            employeeName: r.employeeName,
            dateAD: r.date,
            onDuty: r.onDuty,
            offDuty: r.offDuty,
            clockIn: r.clockIn,
            clockOut: r.clockOut,
            status: r.status,
            remarks: r.remarks,
            sourceSheet: r.sourceSheet
        }));

        const reprocessedRecords = calculateAttendance(rawRows);

        const updates = reprocessedRecords.map((reprocessed, index) => {
            const originalRecord = filteredAndSortedRecords[index];
            return {
                id: originalRecord.id,
                updates: reprocessSingleRecord(reprocessed),
            };
        });

        await batchUpdateAttendance(updates);

        toast({ title: 'Success', description: `${updates.length} records have been recalculated and updated.` });
    } catch (error) {
        console.error("Recalculation failed:", error);
        toast({ title: 'Error', description: 'An error occurred during recalculation.', variant: 'destructive' });
    } finally {
        setIsRecalculating(false);
    }
  };


  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        const existingEmployeeNames = new Set(employees.map(emp => emp.name.toLowerCase()));
        const newlyAddedEmployees = new Set<string>();
        let totalSkippedRows = 0;
        const allRawAttendanceData: RawAttendanceRow[] = [];
        const processedSheets: string[] = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

            if (jsonData.length < 2) continue;

            const headerRow = jsonData[0].map((h: any) => String(h || '').trim().toLowerCase());
            
            const headerVariations: { [key: string]: string[] } = {
                name: ['name'],
                date: ['date'],
                onDuty: ['on duty', 'onduty'],
                offDuty: ['off duty', 'offduty'],
                clockIn: ['clock in', 'clockin'],
                clockOut: ['clock out', 'clockout'],
                status: ['absent', 'status']
            };
            
            const headerMap: { [key: string]: number } = {};
            for (const key in headerVariations) {
                const index = headerRow.findIndex((header: string) => headerVariations[key].includes(header));
                if (index !== -1) {
                    headerMap[key] = index;
                }
            }

            if (headerMap['name'] === undefined || headerMap['date'] === undefined) {
                console.warn(`Skipping sheet "${sheetName}": Missing "Name" or "Date" column.`);
                continue;
            }

            processedSheets.push(sheetName);
            let sheetSkippedRows = 0;
            for (const row of jsonData.slice(1)) {
                const employeeName = row[headerMap['name']] ? String(row[headerMap['name']]).trim() : '';
                const dateValue = row[headerMap['date']];
                
                if (!employeeName || !dateValue) {
                    sheetSkippedRows++;
                    continue;
                }
                
                if (!existingEmployeeNames.has(employeeName.toLowerCase())) {
                     const newEmployee: Omit<Employee, 'id'> = {
                        name: employeeName,
                        wageBasis: 'Monthly',
                        wageAmount: 0, 
                        createdBy: user.username,
                        createdAt: new Date().toISOString(),
                        status: 'Working'
                    };
                    await addEmployee(newEmployee);
                    existingEmployeeNames.add(employeeName.toLowerCase());
                    newlyAddedEmployees.add(employeeName);
                }

                allRawAttendanceData.push({
                    employeeName: employeeName,
                    dateAD: dateValue,
                    onDuty: row[headerMap['onDuty']] ? String(row[headerMap['onDuty']]) : null,
                    offDuty: row[headerMap['offDuty']] ? String(row[headerMap['offDuty']]) : null,
                    clockIn: row[headerMap['clockIn']] ? String(row[headerMap['clockIn']]) : null,
                    clockOut: row[headerMap['clockOut']] ? String(row[headerMap['clockOut']]) : null,
                    status: row[headerMap['status']] ? String(row[headerMap['status']]) : '',
                    remarks: null,
                    sourceSheet: sheetName,
                });
            }
            totalSkippedRows += sheetSkippedRows;
        }
        
        if (allRawAttendanceData.length === 0) {
            let description = 'No valid attendance records found to import.';
            if (totalSkippedRows > 0) {
                description += ` ${totalSkippedRows} rows were skipped due to missing name or date.`;
            }
            toast({ title: 'Import Finished', description: description });
            return;
        }

        const processedRecords = calculateAttendance(allRawAttendanceData);

        const newRecords = processedRecords
          .filter(p => p.dateADISO && !isNaN(new Date(p.dateADISO).getTime()))
          .map(p => ({
            date: p.dateADISO,
            bsDate: p.dateBS,
            employeeName: p.employeeName,
            onDuty: p.onDuty || null,
            offDuty: p.offDuty || null,
            clockIn: p.clockIn || null,
            clockOut: p.clockOut || null,
            status: p.normalizedStatus as AttendanceStatus,
            grossHours: p.grossHours,
            overtimeHours: p.overtimeHours,
            regularHours: p.regularHours,
            remarks: p.calcRemarks,
            importedBy: user.username,
            sourceSheet: p.sourceSheet,
        }));

        if (newRecords.length > 0) {
            await addAttendanceRecords(newRecords);

            const latestImportedRecord = newRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            const latestNepaliDate = new NepaliDate(new Date(latestImportedRecord.date));
            
            setSelectedBsYear(String(latestNepaliDate.getYear()));
            setSelectedBsMonth(String(latestNepaliDate.getMonth()));
            setDateRange(undefined);

            let description = `${newRecords.length} records processed from sheets: ${processedSheets.join(', ')}.`;
            if (newlyAddedEmployees.size > 0) {
                description += ` ${newlyAddedEmployees.size} new employees added.`;
            }
             if (totalSkippedRows > 0) {
                description += ` ${totalSkippedRows} rows skipped due to missing name or date.`;
            }
            toast({ title: 'Import Complete', description, duration: 8000 });
        } else {
            let description = 'No new valid attendance records found to import.';
            if (totalSkippedRows > 0) {
                description += ` ${totalSkippedRows} rows skipped due to missing name or date.`;
            }
            toast({ title: 'Info', description: description });
        }

      } catch (error) {
        console.error("File processing error:", error);
        toast({ title: 'Error', description: 'Failed to process the Excel file. Check column names and data format.', variant: 'destructive' });
      }
    };
    reader.onerror = (error) => {
      toast({ title: 'Error', description: 'Failed to read the file.', variant: 'destructive' });
      console.error("File reading error:", error);
    };
    reader.readAsArrayBuffer(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleOpenEditDialog = (record: AttendanceRecord) => {
    setEditingRecord(record);
    setEditForm({
        clockIn: record.clockIn || '',
        clockOut: record.clockOut || '',
        status: record.status
    });
    setIsEditDialogOpen(true);
  };
  
  const handleSaveEdit = async () => {
    if (!editingRecord || !user) return;

    const reprocessed = reprocessSingleRecord({
        ...editingRecord,
        clockIn: editForm.clockIn || null,
        clockOut: editForm.clockOut || null,
        status: editForm.status,
        dateAD: editingRecord.date
    });
    
    try {
        await updateAttendanceRecord(editingRecord.id, reprocessed);
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
        toast({ title: 'Success', description: 'Attendance record deleted.' });
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to delete record.', variant: 'destructive' });
    }
  };
  
  const handleCleanBaishakhData = async () => {
    try {
        await deleteAttendanceForMonth(2082, 0); // Year 2082, Month 0 (Baishakh)
        toast({
            title: 'Cleanup Successful',
            description: 'Attendance data for Baishakh 2082 has been removed.',
        });
    } catch (error) {
        console.error("Failed to clean Baishakh data:", error);
        toast({
            title: 'Cleanup Failed',
            description: 'Could not remove the old attendance data.',
            variant: 'destructive',
        });
    }
  };


  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedRecords = useMemo(() => {
    let filtered = [...attendance];

    if (!dateRange?.from && selectedBsYear && selectedBsMonth) {
      const yearInt = parseInt(selectedBsYear, 10);
      const monthInt = parseInt(selectedBsMonth, 10);
      if (!isNaN(yearInt) && !isNaN(monthInt)) {
        filtered = filtered.filter(r => {
          if (!r.date || isNaN(new Date(r.date).getTime())) return false;
          try {
            const nepaliDate = new NepaliDate(new Date(r.date));
            return nepaliDate.getYear() === yearInt && nepaliDate.getMonth() === monthInt;
          } catch {
            return false;
          }
        });
      }
    } else if (dateRange?.from) {
      const interval = {
        start: startOfDay(dateRange.from),
        end: endOfDay(dateRange.to || dateRange.from),
      };
      filtered = filtered.filter(record => record.date && isWithinInterval(new Date(record.date), interval));
    }
    
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(record =>
        record.employeeName.toLowerCase().includes(lowercasedQuery)
      );
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
  }, [attendance, sortConfig, searchQuery, dateRange, filterEmployeeName, selectedBsYear, selectedBsMonth, filterStatus]);
  
  const uniqueEmployeeNames = useMemo(() => {
      const names = new Set(employees.map(e => e.name));
      return ['All', ...Array.from(names).sort()];
  }, [employees]);
  
  const renderContent = () => {
    if (!isClient) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <h3 className="text-2xl font-bold tracking-tight">Loading...</h3>
        </div>
      );
    }
    
    if (attendance.length === 0) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm py-24">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-2xl font-bold tracking-tight">No attendance records found</h3>
            <p className="text-sm text-muted-foreground">Get started by importing an Excel file.</p>
             {hasPermission('hr', 'create') && (
                <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Import Attendance
                </Button>
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
                <TableCell className="font-medium">{record.date ? format(new Date(record.date), 'yyyy-MM-dd') : 'Invalid'}</TableCell>
                <TableCell>{record.bsDate}</TableCell>
                <TableCell>{record.employeeName}</TableCell>
                <TableCell><Badge variant="outline">{record.sourceSheet}</Badge></TableCell>
                 <TableCell>
                  <Badge variant={getAttendanceBadgeVariant(record.status)}>
                    {record.status}
                  </Badge>
                </TableCell>
                <TableCell>
                    {record.onDuty || '-'} / {record.offDuty || '-'}
                </TableCell>
                <TableCell>
                    {record.clockIn || '-'} / {record.clockOut || '-'}
                </TableCell>
                <TableCell>{record.regularHours.toFixed(1)}</TableCell>
                <TableCell>{record.overtimeHours.toFixed(1)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => handleOpenEditDialog(record)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                              <AlertDialogTrigger asChild>
                                  <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                      <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                      <span className="text-destructive">Delete</span>
                                  </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader>
                                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                      <AlertDialogDescription>This action cannot be undone. This will permanently delete the attendance record.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(record.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground">Manage and import employee attendance records.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
           <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by employee..."
              className="pl-8 w-full sm:w-auto"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('hr', 'create') && (
            <>
                <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
                <Button onClick={() => fileInputRef.current?.click()} className="w-full sm:w-auto">
                    <Upload className="mr-2 h-4 w-4" /> Import Attendance
                </Button>
            </>
           )}
        </div>
      </header>

      {attendance.length > 0 && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-center">
              <Label>Filter by:</Label>
              <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                      <SelectValue placeholder="Year (BS)" />
                  </SelectTrigger>
                  <SelectContent>
                      {bsYears.map(year => (
                          <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
              <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="Month (BS)" />
                  </SelectTrigger>
                  <SelectContent>
                      {nepaliMonths.map(month => (
                          <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
              <Popover>
                  <PopoverTrigger asChild>
                      <Button id="date" variant={"outline"} className={cn("w-full sm:w-auto justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                      <DualDateRangePicker selected={dateRange} onSelect={setDateRange} />
                  </PopoverContent>
              </Popover>
               <Select value={filterEmployeeName} onValueChange={setFilterEmployeeName}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Select Employee" />
                  </SelectTrigger>
                  <SelectContent>
                      {uniqueEmployeeNames.map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
               <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'All' | AttendanceStatus)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="All">All Statuses</SelectItem>
                      {attendanceStatuses.map(status => (
                          <SelectItem key={status} value={status}>
                              {status}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
               <Button variant="secondary" onClick={handleRecalculate} disabled={isRecalculating}>
                  {isRecalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Recalculate
               </Button>
              <AlertDialog>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">Clean Baishakh Data</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                      <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                              This action will permanently delete all attendance records for the Nepali month of Baishakh, 2082. This cannot be undone.
                          </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCleanBaishakhData}>Yes, Delete Data</AlertDialogAction>
                      </AlertDialogFooter>
                  </AlertDialogContent>
              </AlertDialog>
          </div>
      )}
      {renderContent()}
    </div>
     <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Edit Attendance for {editingRecord?.employeeName}</DialogTitle>
                <DialogDescription>
                    Date: {editingRecord ? format(new Date(editingRecord.date), 'PPP') : ''}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-clock-in">Clock In Time (HH:mm)</Label>
                    <Input id="edit-clock-in" value={editForm.clockIn} onChange={e => setEditForm(prev => ({...prev, clockIn: e.target.value}))} placeholder="e.g., 08:00"/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-clock-out">Clock Out Time (HH:mm)</Label>
                    <Input id="edit-clock-out" value={editForm.clockOut} onChange={e => setEditForm(prev => ({...prev, clockOut: e.target.value}))} placeholder="e.g., 17:00"/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select value={editForm.status} onValueChange={(value: AttendanceStatus) => setEditForm(prev => ({ ...prev, status: value }))}>
                        <SelectTrigger id="edit-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {attendanceStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );

    





    



    