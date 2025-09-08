
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { AttendanceRecord, Employee } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, Search, ArrowUpDown } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { format, parse } from 'date-fns';
import { onEmployeesUpdate, addEmployee } from '@/services/employee-service';
import { onAttendanceUpdate, addAttendanceRecords } from '@/services/attendance-service';
import { getAttendanceBadgeVariant } from '@/lib/utils';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type SortKey = 'date' | 'employeeName' | 'status';
type SortDirection = 'asc' | 'desc';

const nepaliMonths = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];

const nepaliWeekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const cleanEmployeeName = (name: any): string => {
  if (typeof name !== 'string') return '';
  // Trim whitespace, replace multiple spaces with a single space, and convert to lowercase
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
};

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const { hasPermission, user } = useAuth();
  
  const [selectedBsYear, setSelectedBsYear] = useState<string>('');
  const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
  
  const { availableYears, availableMonths } = useMemo(() => {
    const yearMonthSet = new Set<string>();
    attendance.forEach(r => {
        if(r.bsDate) {
            yearMonthSet.add(r.bsDate.substring(0, 7)); // YYYY-MM
        }
    });
    
    const sortedYearMonths = Array.from(yearMonthSet).sort().reverse();
    const years = [...new Set(sortedYearMonths.map(ym => ym.substring(0, 4)))];
    
    let monthsForYear: string[] = [];
    if (selectedBsYear) {
      monthsForYear = [...new Set(
        sortedYearMonths
          .filter(ym => ym.startsWith(selectedBsYear))
          .map(ym => ym.substring(5, 7))
      )];
    }
    
    return { availableYears: years, availableMonths: monthsForYear };

  }, [attendance, selectedBsYear]);
  
  useEffect(() => {
    setIsClient(true);
    const unsubEmployees = onEmployeesUpdate(setEmployees);
    const unsubAttendance = onAttendanceUpdate((records) => {
        setAttendance(records);
        // Set default filter to the latest month with data
        if (records.length > 0) {
            const latestRecord = records.sort((a, b) => b.bsDate.localeCompare(a.bsDate))[0];
            if (latestRecord && latestRecord.bsDate) {
                const latestYear = latestRecord.bsDate.substring(0, 4);
                const latestMonth = latestRecord.bsDate.substring(5, 7);
                if (!selectedBsYear) setSelectedBsYear(latestYear);
                if (!selectedBsMonth) setSelectedBsMonth(latestMonth);
            }
        }
    });

    return () => {
        unsubEmployees();
        unsubAttendance();
    }
  }, []);
  
  useEffect(() => {
      // If the selected year changes, update the available months and select the first one
      if (selectedBsYear && availableMonths.length > 0) {
          if (!availableMonths.includes(selectedBsMonth)) {
              setSelectedBsMonth(availableMonths[0]);
          }
      }
  }, [selectedBsYear, availableMonths, selectedBsMonth]);


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
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 }); // Read as array of arrays
        
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
      if (!time) return null;
      if (time instanceof Date) {
        return format(time, 'HH:mm');
      }
      if (typeof time === 'string') {
        const formats = ['HH:mm:ss', 'h:mm:ss a', 'HH:mm', 'h:mm a'];
        for (const fmt of formats) {
            try {
                const parsedTime = parse(time, fmt, new Date());
                if (!isNaN(parsedTime.getTime())) return format(parsedTime, 'HH:mm');
            } catch {}
        }
      }
      if (typeof time === 'number') { 
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + time * 24 * 60 * 60 * 1000);
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
        
        const clockInValue = clockInIndex > -1 ? row[clockInIndex] : undefined;

        let status: AttendanceRecord['status'] = 'Present';
        if (nepaliDate.getDay() === 6) { 
            status = 'Saturday';
        } else if (!clockInValue) { 
            status = 'Absent';
        }
        
        const record: Omit<AttendanceRecord, 'id'> = {
            date: dateStr,
            bsDate,
            employeeName: employeeNameInDb,
            onDuty: onDutyIndex > -1 ? parseTime(row[onDutyIndex]) : null,
            offDuty: offDutyIndex > -1 ? parseTime(row[offDutyIndex]) : null,
            clockIn: clockInIndex > -1 ? parseTime(row[clockInIndex]) : null,
            clockOut: clockOutIndex > -1 ? parseTime(row[clockOutIndex]) : null,
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
    
    if (selectedBsYear && selectedBsMonth) {
        const yearMonthPrefix = `${selectedBsYear}-${selectedBsMonth}`;
        filtered = filtered.filter(record => record.bsDate && record.bsDate.startsWith(yearMonthPrefix));
    }
    
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(record =>
        record.employeeName.toLowerCase().includes(lowercasedQuery)
      );
    }

    filtered.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      
      // Secondary sort to keep things stable
      if (a.employeeName < b.employeeName) return -1;
      if (a.employeeName > b.employeeName) return 1;
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;

      return 0;
    });
    
    return filtered;
  }, [attendance, sortConfig, searchQuery, selectedBsYear, selectedBsMonth]);
  
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
              <TableHead>Schedule</TableHead>
              <TableHead>Actual</TableHead>
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
                <TableCell>{record.onDuty} - {record.offDuty}</TableCell>
                <TableCell>{record.clockIn} - {record.clockOut}</TableCell>
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
          <div className="flex flex-col sm:flex-row gap-2 items-center">
              <Label>Filter by month:</Label>
              <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Select Year (BS)" />
                  </SelectTrigger>
                  <SelectContent>
                      {availableYears.map(year => (
                          <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
              <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={!selectedBsYear}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Select Month (BS)" />
                  </SelectTrigger>
                  <SelectContent>
                      {availableMonths.map(month => (
                          <SelectItem key={month} value={month}>{nepaliMonths[parseInt(month, 10) - 1]}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>
      )}

      {renderContent()}
    </div>
  );
}
