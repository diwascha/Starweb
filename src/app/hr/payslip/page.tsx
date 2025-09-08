
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Printer, Save, Loader2, View, Search } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '@/hooks/use-auth';
import { onEmployeesUpdate, getEmployee } from '@/services/employee-service';
import { onAttendanceUpdate } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { generatePayrollAndAnalytics, PayrollAndAnalyticsData } from '@/services/payroll-service';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

export default function PayslipPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<any[]>([]);
    const [isClient, setIsClient] = useState(false);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [payrollData, setPayrollData] = useState<Payroll[] | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();

    useEffect(() => {
        setIsClient(true);
        const unsubEmployees = onEmployeesUpdate((employeesData) => {
            const validEmployees = employeesData.filter(e => e.status === 'Working' && !/^\d{2}:\d{2}/.test(e.name) && !/^\w{3} \w{3}/.test(e.name));
            setEmployees(validEmployees);
        });
        const unsubAttendance = onAttendanceUpdate((records) => {
            const validRecords = records.filter(r => r.date && !isNaN(new Date(r.date).getTime()));
            setAttendance(validRecords);
            
            if (validRecords.length > 0) {
                const years = new Set(validRecords.map(r => new NepaliDate(new Date(r.date)).getYear()));
                const sortedYears = Array.from(years).sort((a, b) => b - a);
                setBsYears(sortedYears);
                
                if (!selectedBsYear) {
                    const latestNepaliDate = new NepaliDate(new Date());
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

    const handleGeneratePayslips = () => {
        if (selectedBsYear && selectedBsMonth && employees.length > 0) {
            setIsProcessing(true);
            const { payroll } = generatePayrollAndAnalytics(
                parseInt(selectedBsYear, 10),
                parseInt(selectedBsMonth, 10),
                employees,
                attendance
            );
            setPayrollData(payroll);
            setIsProcessing(false);
        }
    };
    
    const filteredPayroll = useMemo(() => {
        if (!payrollData) return [];
        if (!searchQuery) return payrollData;
        return payrollData.filter(p => p.employeeName.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [payrollData, searchQuery]);

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Generate Payslips</h1>
                <p className="text-muted-foreground">Select a period to generate and view employee payslips.</p>
            </header>
            
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Select Period</CardTitle>
                            <CardDescription>Select a Nepali month and year to generate payslips.</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={selectedBsYear} onValueChange={setSelectedBsYear}>
                                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="Year (BS)" /></SelectTrigger>
                                <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth}>
                                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Month (BS)" /></SelectTrigger>
                                <SelectContent>{nepaliMonths.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                            </Select>
                             <Button onClick={handleGeneratePayslips} disabled={isProcessing || !selectedBsYear || !selectedBsMonth}>
                                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Generate
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {payrollData && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="space-y-1.5">
                                <CardTitle>Generated Payslips</CardTitle>
                                <CardDescription>
                                    Payslips for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}
                                </CardDescription>
                            </div>
                             <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search employee..." className="pl-8" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee Name</TableHead>
                                    <TableHead>Net Payment</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredPayroll.length > 0 ? filteredPayroll.map(p => (
                                    <TableRow key={p.employeeId}>
                                        <TableCell className="font-medium">{p.employeeName}</TableCell>
                                        <TableCell>{p.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => router.push(`/hr/payslip/${p.employeeId}?year=${selectedBsYear}&month=${selectedBsMonth}`)}
                                            >
                                                <View className="mr-2 h-4 w-4" /> View Payslip
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center">No employees found for this period or filter.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
