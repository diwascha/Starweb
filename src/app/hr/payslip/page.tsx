

'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, Payroll } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Printer, FileDown, View, Search, MoreHorizontal } from 'lucide-react';
import NepaliDate from 'nepali-date-converter';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onPayrollUpdate, getPayrollYears } from '@/services/payroll-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

const nepaliMonths = [
    { value: 0, name: "Baishakh" }, { value: 1, name: "Jestha" }, { value: 2, name: "Ashadh" },
    { value: 3, name: "Shrawan" }, { value: 4, name: "Bhadra" }, { value: 5, name: "Ashwin" },
    { value: 6, name: "Kartik" }, { value: 7, name: "Mangsir" }, { value: 8, name: "Poush" },
    { value: 9, name: "Magh" }, { value: 10, name: "Falgun" }, { value: 11, name: "Chaitra" }
];

export default function PayslipPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [allPayroll, setAllPayroll] = useState<Payroll[]>([]);
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubPayroll = onPayrollUpdate(setAllPayroll);
        
        getPayrollYears().then(years => {
            setBsYears(years);
            if (years.length > 0 && selectedBsYear === '') {
                const currentNepaliDate = new NepaliDate();
                const currentYear = currentNepaliDate.getYear();
                if (years.includes(currentYear)) {
                    setSelectedBsYear(String(currentYear));
                    setSelectedBsMonth(String(currentNepaliDate.getMonth()));
                } else {
                    setSelectedBsYear(String(years[0]));
                    setSelectedBsMonth('0');
                }
            }
        });

        return () => {
            unsubEmployees();
            unsubPayroll();
        }
    }, [allPayroll, selectedBsYear]);

    const filteredPayroll = useMemo(() => {
        if (!selectedBsYear || !selectedBsMonth) return [];
        const year = parseInt(selectedBsYear);
        const month = parseInt(selectedBsMonth);
        
        let filtered = allPayroll.filter(p => p.bsYear === year && p.bsMonth === month);

        if (searchQuery) {
            filtered = filtered.filter(p => p.employeeName.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        return filtered;
    }, [allPayroll, selectedBsYear, selectedBsMonth, searchQuery]);

    const openPrintWindow = (employeeId?: string) => {
        if (!selectedBsYear || !selectedBsMonth) return;
        const url = `/hr/payslip/${employeeId}?year=${selectedBsYear}&month=${selectedBsMonth}`;
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
            printWindow.onload = () => {
                setTimeout(() => {
                    printWindow.print();
                }, 1000);
            };
        }
    };

    const handlePrintAll = () => {
        toast({ title: "Printing All", description: "Preparing all payslips for printing..." });
        filteredPayroll?.forEach((p, index) => {
            setTimeout(() => {
                openPrintWindow(p.employeeId);
            }, index * 2000);
        });
    };

    const handleExportAll = () => {
        toast({ title: "Feature Coming Soon", description: "Bulk PDF export is under development." });
    }

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">View Payslips</h1>
                <p className="text-muted-foreground">Select a period to view and print imported employee payslips.</p>
            </header>
            
             <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1.5">
                            <CardTitle>Select Period</CardTitle>
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
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {filteredPayroll.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="space-y-1.5">
                                <CardTitle>Payslips for {nepaliMonths[parseInt(selectedBsMonth)]?.name}, {selectedBsYear}</CardTitle>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                 <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Search employee..." className="pl-8 w-full sm:w-auto" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                                </div>
                                <Button variant="outline" onClick={handlePrintAll}>
                                    <Printer className="mr-2 h-4 w-4" /> Print All
                                </Button>
                                <Button variant="outline" onClick={handleExportAll}>
                                    <FileDown className="mr-2 h-4 w-4" /> Export All as PDF
                                </Button>
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
                                {filteredPayroll.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium">{p.employeeName}</TableCell>
                                        <TableCell>{p.netPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => router.push(`/hr/payslip/${p.employeeId}?year=${selectedBsYear}&month=${selectedBsMonth}`)}>
                                                        <View className="mr-2 h-4 w-4" /> View
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => openPrintWindow(p.employeeId)}>
                                                        <Printer className="mr-2 h-4 w-4" /> Print
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => toast({ title: "Feature Coming Soon", description: "PDF export is under development." })}>
                                                        <FileDown className="mr-2 h-4 w-4" /> Export PDF
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
