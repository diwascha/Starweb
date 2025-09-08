
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
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, addAttendanceRecords } from '@/services/attendance-service';
import { getAttendanceBadgeVariant } from '@/lib/utils';

type SortKey = 'date' | 'employeeName' | 'status';
type SortDirection = 'asc' | 'desc';

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'date', direction: 'desc' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);
  const { hasPermission, user } = useAuth();
  
  useEffect(() => {
    setIsClient(true);
    const unsubEmployees = onEmployeesUpdate(setEmployees);
    const unsubAttendance = onAttendanceUpdate(setAttendance);

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
        
        parseAndStoreAttendance(jsonData.slice(1)); // Assuming first row is header
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

    // Reset file input
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
        // Try parsing different common time formats from Excel
        const formats = ['HH:mm:ss', 'h:mm:ss a', 'HH:mm', 'h:mm a'];
        for (const fmt of formats) {
            const parsedTime = parse(time, fmt, new Date());
            if (!isNaN(parsedTime.getTime())) return format(parsedTime, 'HH:mm');
        }
      }
      if (typeof time === 'number') { // Excel time is a fraction of a day
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
            const parsedDate = new Date(dateOnlyString);
            if (!isNaN(parsedDate.getTime())) {
                return parsedDate;
            }
        }
        return null;
    };


  const parseAndStoreAttendance = async (rows: any[][]) => {
    if (!user) {
        toast({ title: 'Error', description: 'You must be logged in to import attendance.', variant: 'destructive' });
        return;
    }
    const newRecords: Omit<AttendanceRecord, 'id'>[] = [];
    const employeeMap = new Map(employees.map(e => [e.name.toLowerCase(), e.name]));
    let skippedRows = 0;
    let nonexistentEmployees = new Set<string>();
    
    rows.forEach((row, index) => {
      if (!row || row.length < 2) {
          skippedRows++;
          return;
      }

      const [name, adDateRaw, onDuty, offDuty, clockIn, clockOut, absentDetails] = row;
      
      const adDate = parseDate(adDateRaw);

      if (!adDate || !name) {
         console.warn(`Skipping row ${index + 2}: Invalid date or name.`);
         skippedRows++;
         return;
      }
      
      const employeeNameFromFile = String(name).trim();
      const employeeNameInDb = employeeMap.get(employeeNameFromFile.toLowerCase());

      if (!employeeNameInDb) {
        console.warn(`Skipping row ${index + 2}: Employee "${employeeNameFromFile}" not found.`);
        nonexistentEmployees.add(employeeNameFromFile);
        skippedRows++;
        return;
      }

      const dateStr = adDate.toISOString();
      const nepaliDate = new NepaliDate(adDate);
      const bsDate = nepaliDate.format('YYYY-MM-DD');
      
      let status: AttendanceRecord['status'] = 'Present';
      if (nepaliDate.getDay() === 6) { // Saturday is 6
          status = 'Saturday';
      } else if (!clockIn) { // If there is no clock-in time, they are absent
          status = 'Absent';
      }
      
      const record: Omit<AttendanceRecord, 'id'> = {
        date: dateStr,
        bsDate,
        employeeName: employeeNameInDb,
        onDuty: parseTime(onDuty),
        offDuty: parseTime(offDuty),
        clockIn: parseTime(clockIn),
        clockOut: parseTime(clockOut),
        status,
        importedBy: user.username,
      };
      newRecords.push(record);
    });
    
    if (newRecords.length > 0) {
        try {
            await addAttendanceRecords(newRecords);
            let description = `${newRecords.length} attendance records imported successfully.`;
            if (skippedRows > 0) {
                description += ` ${skippedRows} rows were skipped.`;
                if (nonexistentEmployees.size > 0) {
                    description += ` Could not find employees: ${Array.from(nonexistentEmployees).join(', ')}.`;
                }
            }
            toast({ title: 'Import Complete', description });
        } catch (error) {
            console.error("Firestore import error:", error);
            toast({ title: 'Error', description: 'Failed to save attendance data to the database.', variant: 'destructive' });
        }
    } else {
        let description = 'No new valid attendance records found to import.';
        if (skippedRows > 0) {
            description += ` ${skippedRows} rows were skipped.`;
            if (nonexistentEmployees.size > 0) {
               description += ` Could not find employees: ${Array.from(nonexistentEmployees).join(', ')}.`;
            }
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
    
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(record =>
        record.employeeName.toLowerCase().includes(lowercasedQuery)
      );
    }

    filtered.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    return filtered;
  }, [attendance, sortConfig, searchQuery]);
  
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
                <TableCell>{record.onDuty} - {record.offDuty}</TableCell>
                <TableCell>{record.clockIn} - {record.clockOut}</TableCell>
                <TableCell><Badge variant={getAttendanceBadgeVariant(record.status)}>{record.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  };
  
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground">Manage and import employee attendance records.</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by employee..."
              className="pl-8 sm:w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasPermission('hr', 'create') && (
            <>
                <Input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls"/>
                <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Import Attendance
                </Button>
            </>
           )}
        </div>
      </header>
      {renderContent()}
    </div>
  );
}
