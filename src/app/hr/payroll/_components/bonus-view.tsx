'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Employee, AttendanceRecord } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { onEmployeesUpdate } from '@/services/employee-service';
import { onAttendanceUpdate, getAttendanceYears } from '@/services/attendance-service';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import NepaliDate from 'nepali-date-converter';
import { Badge } from '@/components/ui/badge';
import { Award, CheckCircle, XCircle } from 'lucide-react';
import { differenceInYears } from 'date-fns';
import { NEPALI_MONTHS } from '@/lib/constants';

const customEmployeeOrder = [
    "Tika Gurung", "Anju Bista", "Madhu Bhandari", "Amrita Lama", "sunil chaudhary",
    "KUMAR SHRESTHA", "Niroj Koirala", "Binod Magar", "SANDEEP CHAUDARY",
    "SANGITA PYAKUREL", "Sunita Gurung"
];

interface BonusCalculationResult {
    employeeId: string;
    employeeName: string;
    joiningDate?: string;
    presentDays: number;
    isEligible: boolean;
    bonusAmount: number;
}

export default function BonusView() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [bsYears, setBsYears] = useState<number[]>([]);
    const [selectedBsYear, setSelectedBsYear] = useState<string>('');
    const [selectedBsMonth, setSelectedBsMonth] = useState<string>('');
    
    const [minPresentDays, setMinPresentDays] = useState<number>(26);
    
    const { toast } = useToast();

    useEffect(() => {
        setIsLoading(true);
        const unsubEmployees = onEmployeesUpdate(setEmployees);
        const unsubAttendance = onAttendanceUpdate(setAttendance);

        return () => {
            unsubEmployees();
            unsubAttendance();
        }
    }, []);
    
    useEffect(() => {
        let isMounted = true;
        getAttendanceYears().then(years => {
            if (isMounted) {
                setBsYears(years);
                if (years.length > 0) {
                    const currentNepaliDate = new NepaliDate();
                    const year = years.includes(currentNepaliDate.getYear()) ? currentNepaliDate.getYear() : years[0];
                    setSelectedBsYear(String(year));
                    setSelectedBsMonth(String(currentNepaliDate.getMonth()));
                }
                setIsLoading(false);
            }
        });
        return () => { isMounted = false; };
    }, [attendance]);


    const bonusData = useMemo((): BonusCalculationResult[] => {
        if (!selectedBsYear || selectedBsMonth === '' || isLoading) {
            return [];
        }

        const year = parseInt(selectedBsYear, 10);
        const month = parseInt(selectedBsMonth, 10);
        const endOfBonusMonthNepali = new NepaliDate(month === 11 ? year + 1 : year, (month + 1) % 12, 1);
        endOfBonusMonthNepali.setDate(endOfBonusMonthNepali.getDate() - 1);
        const endOfBonusMonthAD = endOfBonusMonthNepali.toJsDate();

        const workingEmployees = employees.filter(e => e.status === 'Working');

        const calculatedData = workingEmployees.map(employee => {
            const employeeAttendance = attendance.filter(r => {
                if (r.employeeName !== employee.name) return false;
                try {
                    const nepaliDate = new NepaliDate(new Date(r.date));
                    return nepaliDate.getYear() === year && nepaliDate.getMonth() === month;
                } catch { return false; }
            });

            const qualifyingStatuses = ['Present', 'Public Holiday', 'Saturday', 'EXTRAOK'];
            const presentDays = employeeAttendance.filter(r => qualifyingStatuses.includes(r.status)).length;
            
            let tenureYears = 0;
            if (employee.joiningDate) {
                tenureYears = differenceInYears(endOfBonusMonthAD, new Date(employee.joiningDate));
            }

            const isEligible = tenureYears >= 1 && presentDays >= minPresentDays;
            
            return {
                employeeId: employee.id,
                employeeName: employee.name,
                joiningDate: employee.joiningDate,
                presentDays: presentDays,
                isEligible: isEligible,
                bonusAmount: isEligible ? employee.wageAmount : 0,
            };
        });
        
        calculatedData.sort((a, b) => {
            const indexA = customEmployeeOrder.indexOf(a.employeeName);
            const indexB = customEmployeeOrder.indexOf(b.employeeName);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.employeeName.localeCompare(b.employeeName);
        });

        return calculatedData;
    }, [employees, attendance, selectedBsYear, selectedBsMonth, minPresentDays, isLoading]);

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold tracking-tight">Bonus Calculation</h2>
                    <p className="text-muted-foreground text-xs font-medium">Evaluate eligibility for selected period.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1 shadow-sm h-fit">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <CardTitle className="text-xs uppercase font-black tracking-widest">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                         <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Year (BS)</Label>
                                <Select value={selectedBsYear} onValueChange={setSelectedBsYear} disabled={isLoading || bsYears.length === 0}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>{bsYears.map(year => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Month (BS)</Label>
                                <Select value={selectedBsMonth} onValueChange={setSelectedBsMonth} disabled={isLoading || bsYears.length === 0}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>{NEPALI_MONTHS.map(month => <SelectItem key={month.value} value={String(month.value)}>{month.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Qualifier (Min. Present Days)</Label>
                             <Input type="number" value={minPresentDays} onChange={(e) => setMinPresentDays(Number(e.target.value) || 0)} className="h-9 font-black" />
                        </div>
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[10px] text-blue-800 italic">
                           Rules: 1+ Year Tenure | Full Monthly Base Payout | Threshold: {minPresentDays} Days.
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2 shadow-sm border-gray-100 bg-white">
                    <CardHeader className="py-4 border-b bg-muted/5">
                        <CardTitle className="text-xs uppercase font-black tracking-widest">Eligibility Report</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-muted/30">
                                <TableRow className="h-10 hover:bg-transparent">
                                    <TableHead className="pl-6 font-bold uppercase">Employee Name</TableHead>
                                    <TableHead className="text-center font-bold uppercase">Days</TableHead>
                                    <TableHead className="text-center font-bold uppercase">Eligible</TableHead>
                                    <TableHead className="text-right pr-6 font-bold uppercase">Bonus Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bonusData.length > 0 ? bonusData.map(item => (
                                    <TableRow key={item.employeeId} className="h-12 border-b-gray-100 hover:bg-muted/10 transition-colors">
                                        <TableCell className="pl-6 font-black text-gray-900">{item.employeeName}</TableCell>
                                        <TableCell className="text-center font-medium">{item.presentDays}</TableCell>
                                        <TableCell className="text-center">
                                            {item.isEligible ? 
                                                <Badge variant="outline" className="text-green-600 border-green-600 font-black uppercase text-[8px] h-4">YES</Badge> : 
                                                <Badge variant="outline" className="text-red-500 border-red-100 font-black uppercase text-[8px] h-4">NO</Badge>
                                            }
                                        </TableCell>
                                        <TableCell className="text-right pr-6 font-black text-blue-900">
                                            {item.isEligible ? `Rs. ${item.bonusAmount.toLocaleString()}` : '—'}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground italic">No data matching filters.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
