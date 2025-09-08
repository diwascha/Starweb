
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { AttendanceRecord, Employee, AttendanceStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, Search, ArrowUpDown, CalendarIcon } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { format, parse, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { onEmployeesUpdate, addEmployee } from '@/services/employee-service';
import { onAttendanceUpdate, addAttendanceRecords } from '@/services/attendance-service';
import { getAttendanceBadgeVariant, cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DualDateRangePicker } from '@/components/ui/dual-date-range-picker';
import type { DateRange } from 'react-day-picker';


type SortKey = 'date' | 'employeeName' | 'status';
type SortDirection = 'asc' | 'desc';

const cleanEmployeeName = (name: any): string => {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
};

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

const attendanceStatuses: AttendanceStatus[] = ['Present', 'Absent', 'Saturday', 'Public Holiday'];

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

  useEffect(() => {
    setIsClient(true);
    const unsubEmployees = onEmployeesUpdate(setEmployees);
    const unsubAttendance = onAttendanceUpdate((records) => {
        setAttendance(records);
        if (records.length > 0) {
            const years = new Set(records.map(r => new NepaliDate(new Date(r.date)).getYear()));
            const sortedYears = Array.from(years).sort((a, b) => b - a);
            setBsYears(sortedYears);
            
            if (!selectedBsYear && !selectedBsMonth) {
                const latestRecord = records.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                const latestNepaliDate = new NepaliDate(new Date(latestRecord.date));
                setSelectedBsYear(String(latestNepaliDate.getYear()));
                setSelectedBsMonth(String(latestNepaliDate.getMonth()));
            }
        }
    });

    return () => {
        unsubEmployees();
        unsubAttendance();
    }
  }, []);
  

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
        
        parseAndStoreAttendance(jsonData);
      } catch (error) {
        console.error("File parsing error:", error);
        toast({ title: 'Error', description: 'Failed to parse the Excel file.', variant: 'destructive' });
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
  
  const parseTime = (time: any): string | null => {
      if (time === null || time === undefined || time === '' || time === 0 || (typeof time === 'string' && time.trim() === '-')) return null;
      
      if (time instanceof Date) {
        if (isNaN(time.getTime())) return null;
        return format(time, 'HH:mm');
      }
      
      if (typeof time === 'string') {
        const trimmedTime = time.trim();
        const formats = ['HH:mm:ss', 'h:mm:ss a', 'HH:mm', 'h:mm a'];
        for (const fmt of formats) {
            try {
                const parsedTime = parse(trimmedTime, fmt, new Date());
                if (!isNaN(parsedTime.getTime())) return format(parsedTime, 'HH:mm');
            } catch {}
        }
      }
      
      if (typeof time === 'number') { 
        if (time < 0 || time >= 1) return null;
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + time * 24 * 60 * 60 * 1000);
        if (isNaN(date.getTime())) return null;
        return format(date, 'HH:mm');
      }
      
      return null;
  };
  
    const parseDate = (dateInput: any): Date | null => {
        if (!dateInput) return null;
        if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
            return dateInput;
        }
        if (typeof dateInput === 'number') {
            const excelEpoch = new Date(1899, 11, 30);
            return new Date(excelEpoch.getTime() + dateInput * 24 * 60 * 60 * 1000);
        }
        if (typeof dateInput === 'string') {
            const dateOnlyString = dateInput.split(' ')[0];
            const formats = ['MM/dd/yyyy', 'yyyy-MM-dd', 'M/d/yy', 'M/d/yyyy'];
            for (const fmt of formats) {
                try {
                    const parsed = parse(dateOnlyString, fmt, new Date());
                    if(!isNaN(parsed.getTime())) return parsed;
                } catch {}
            }
        }
        return null;
    };


  const parseAndStoreAttendance = async (jsonData: any[][]) => {
    if (!user) {
        toast({ title: 'Error', description: 'You must be logged in to import attendance.', variant: 'destructive' });
        return;
    }
    
    if (!jsonData || jsonData.length < 2) {
        toast({ title: 'Error', description: 'Excel file is empty or missing a header row.', variant: 'destructive' });
        return;
    }
    
    const headerRow = jsonData[0].map(h => String(h).toLowerCase().trim());
    const dataRows = jsonData.slice(1);

    const getIndex = (aliases: string[]) => {
        for (const alias of aliases) {
            const index = headerRow.findIndex(h => h === alias);
            if (index !== -1) return index;
        }
        return -1;
    }

    const nameIndex = getIndex(['name']);
    const dateIndex = getIndex(['date']);
    const onDutyIndex = getIndex(['on duty', 'onduty']);
    const offDutyIndex = getIndex(['off duty', 'offduty']);
    const clockInIndex = getIndex(['clock in', 'clockin']);
    const clockOutIndex = getIndex(['clock out', 'clockout']);
    
    if (nameIndex === -1 || dateIndex === -1) {
        toast({ title: 'Error', description: 'Missing required "Name" or "Date" columns in the Excel file.', variant: 'destructive'});
        return;
    }

    const newRecords: Omit<AttendanceRecord, 'id'>[] = [];
    const employeeMap = new Map(employees.map(e => [cleanEmployeeName(e.name), e.name]));
    let skippedRows = 0;
    const newlyAddedEmployees = new Set<string>();
    
    for (const row of dataRows) {
        const nameFromFile = String(row[nameIndex] || '').trim();
        const cleanedNameFromFile = cleanEmployeeName(nameFromFile);
        let employeeNameInDb = employeeMap.get(cleanedNameFromFile);
        
        const adDate = parseDate(row[dateIndex]);

        if (!adDate || !nameFromFile) {
            skippedRows++;
            continue;
        }

        if (!employeeNameInDb) {
            try {
                const newEmployeeData = {
                    name: nameFromFile,
                    wageBasis: 'Monthly' as const,
                    wageAmount: 0,
                    createdBy: user.username,
                };
                await addEmployee(newEmployeeData);
                employeeNameInDb = nameFromFile;
                employeeMap.set(cleanedNameFromFile, nameFromFile);
                newlyAddedEmployees.add(nameFromFile);
            } catch (error) {
                console.error(`Failed to add new employee ${nameFromFile}:`, error);
                skippedRows++;
                continue;
            }
        }
      
        const dateStr = adDate.toISOString();
        const nepaliDate = new NepaliDate(adDate);
        const bsDate = nepaliDate.format('YYYY-MM-DD');
        
        const clockInValue = parseTime(clockInIndex > -1 ? row[clockInIndex] : null);
        const clockOutValue = parseTime(clockOutIndex > -1 ? row[clockOutIndex] : null);

        let status: AttendanceRecord['status'];

        if (nepaliDate.getDay() === 6) {
          status = 'Saturday';
        } else {
            if (!clockInValue || !clockOutValue) {
                status = 'Absent';
            } else {
                status = 'Present';
            }
        }
        
        const record: Omit<AttendanceRecord, 'id'> = {
            date: dateStr,
            bsDate,
            employeeName: employeeNameInDb,
            onDuty: onDutyIndex > -1 ? parseTime(row[onDutyIndex]) : null,
            offDuty: offDutyIndex > -1 ? parseTime(row[offDutyIndex]) : null,
            clockIn: clockInValue,
            clockOut: clockOutValue,
            status,
            importedBy: user.username,
        };
        newRecords.push(record);
    }
    
    if (newRecords.length > 0) {
        try {
            await addAttendanceRecords(newRecords);
            let description = `${newRecords.length} attendance records imported.`;
            if (newlyAddedEmployees.size > 0) {
                description += ` ${newlyAddedEmployees.size} new employees were added.`;
            }
            if (skippedRows > 0) {
                description += ` ${skippedRows} rows were skipped.`;
            }
            toast({ title: 'Import Complete', description });
        } catch (error) {
            console.error("Firestore import error:", error);
            toast({ title: 'Error', description: 'Failed to save attendance data to the database.', variant: 'destructive' });
        }
    } else {
        let description = 'No new valid attendance records found to import.';
        if (skippedRows > 0) {
            description += ` ${skippedRows} rows were skipped due to missing data.`;
        }
        toast({ title: 'Info', description: description });
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
    
    if (selectedBsYear && !dateRange) {
      filtered = filtered.filter(r => new NepaliDate(new Date(r.date)).getYear() === parseInt(selectedBsYear, 10));
    }
    if (selectedBsMonth && !dateRange) {
        filtered = filtered.filter(r => new NepaliDate(new Date(r.date)).getMonth() === parseInt(selectedBsMonth, 10));
    }

    if (dateRange?.from) {
        const interval = {
            start: startOfDay(dateRange.from),
            end: endOfDay(dateRange.to || dateRange.from),
        };
        filtered = filtered.filter(record => isWithinInterval(new Date(record.date), interval));
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
      if (sortConfig.key === 'employeeName') {
        const nameCompare = a.employeeName.localeCompare(b.employeeName);
        if (nameCompare !== 0) return sortConfig.direction === 'asc' ? nameCompare : -nameCompare;
      }

      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      
      if (sortConfig.key !== 'employeeName') {
         const nameCompare = a.employeeName.localeCompare(b.employeeName);
         if (nameCompare !== 0) return nameCompare;
      } else {
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
              <TableHead>Weekday</TableHead>
              <TableHead>On Duty</TableHead>
              <TableHead>Off Duty</TableHead>
              <TableHead>Clock In</TableHead>
              <TableHead>Clock Out</TableHead>
              <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedRecords.map(record => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{format(new Date(record.date), 'yyyy-MM-dd')}</TableCell>
                <TableCell>{record.bsDate}</TableCell>
                <TableCell>{record.employeeName}</TableCell>
                <TableCell>{format(new Date(record.date), 'EEEE')}</TableCell>
                <TableCell>{record.onDuty || '-'}</TableCell>
                <TableCell>{record.offDuty || '-'}</TableCell>
                <TableCell>{record.clockIn || '-'}</TableCell>
                <TableCell>{record.clockOut || '-'}</TableCell>
                <TableCell>
                  <Badge variant={getAttendanceBadgeVariant(record.status)}>
                    {record.status === 'Saturday' ? 'Day Off' : record.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };
  
  return (
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
                <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls"/>
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
                              {status === 'Saturday' ? 'Day Off' : status}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>
      )}

      {renderContent()}
    </div>
  );
}

    